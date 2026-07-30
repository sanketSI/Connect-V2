// Locations domain: the dealer's mapped stores, hierarchy roll-ups, geo helpers,
// and the location-verification logic (address consistency + lat-long drift).
import {
  MAPPED_LOCATIONS, CLUSTER_STORES, CITY_STORES, REGIONAL_CITIES,
  LAST_LOGIN, LAST_LOGIN_OFFSET_MS, MISSED_CALLS, REVIEWS,
} from '../lib/seedData.js'
import { resolveAt } from './format.js'
import { liveClient } from '../lib/supabase.js'
import { emitChange } from '../events.js'

// Locations are resolved IN PLACE, unlike the other domains: verifyLocation() mutates
// these records and callers hold on to them, so the array and its object identities
// have to survive. Adding a field is safe; re-wrapping them would not be.
for (const loc of MAPPED_LOCATIONS) {
  if (loc.addedAtOffsetMs != null) loc.addedAtMs = resolveAt(loc.addedAtOffsetMs)
}

/** When the dealer last signed in, as a real timestamp. */
export function getLastLogin() {
  return resolveAt(LAST_LOGIN_OFFSET_MS)
}

// Minimal pincode → city/state lookup used for address-consistency checks.
const PINCODE_DB = {
  '560038': { city: 'Bangalore', state: 'Karnataka' },
  '560034': { city: 'Bangalore', state: 'Karnataka' },
  '560102': { city: 'Bangalore', state: 'Karnataka' },
  '201301': { city: 'Noida, Gautam Buddha Nagar', state: 'Uttar Pradesh' },
}

/** Stores mapped to the signed-in dealer's number. */
export function getStoreLocations() {
  return MAPPED_LOCATIONS
}

/** Cluster-owner roll-up (3 Bangalore stores). */
export function getClusterStores() {
  return CLUSTER_STORES
}

/** City-manager roll-up (per-store rows). */
export function getCityStores() {
  return CITY_STORES
}

/** Regional roll-up (per-city rows). */
export function getRegionalCities() {
  return REGIONAL_CITIES
}

/** Haversine distance in metres between {lat,lng} points. */
export function metersBetween(a, b) {
  if (!a || !b) return 0
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)))
}

/**
 * Verification flags for a location (address-consistency + lat-long drift > 20 m).
 *
 * Each flag carries `reasonKey` + `reasonVars` alongside the English `reason`. The
 * sentence is built from live values (pincode, city, drift in metres), so it can't be a
 * plain key — the UI renders `t(f.reasonKey, { ...f.reasonVars, defaultValue: f.reason })`
 * and i18next interpolates the numbers into the translated sentence.
 */
export function computeLocationFlags(loc) {
  const flags = []
  const pin = PINCODE_DB[loc.pincode]
  if (pin && loc.state && pin.state.toLowerCase() !== loc.state.toLowerCase()) {
    flags.push({
      type: 'address',
      reason: `Pincode ${loc.pincode} belongs to ${pin.city}, ${pin.state} — not ${loc.city}, ${loc.state}.`,
      reasonKey: 'seed.verify.pincodeMismatch',
      reasonVars: {
        pincode: loc.pincode, pinCity: pin.city, pinState: pin.state,
        city: loc.city, state: loc.state,
      },
    })
  }
  const drift = metersBetween(loc.stated, loc.actual)
  if (drift > 20) {
    flags.push({
      type: 'latlng',
      reason: `Stated address sits ~${drift} m from the actual storefront (limit 20 m).`,
      reasonKey: 'seed.verify.latlngDrift',
      reasonVars: { drift, limit: 20 },
    })
  }
  return flags
}

/**
 * THE LISTING'S STANDING WITH GOOGLE — three states a dealer can actually be in
 * (design review 3, item 1), not the binary green dot this screen used to show.
 */
export const GOOGLE_STATUSES = Object.freeze(['verified', 'verification_required', 'suspended'])

/**
 * Which one this store is in.
 *
 * Explicit wins — a real GBP sync would set `googleStatus` directly. Otherwise a
 * suspended listing says so, an open address/geo flag means Google still wants it
 * verified, and anything else is live and verified. DERIVED rather than stored so it can
 * never contradict the verification flags the Verify screen is acting on.
 */
export function googleStatusOf(loc) {
  if (!loc) return null
  if (loc.googleStatus && GOOGLE_STATUSES.includes(loc.googleStatus)) return loc.googleStatus
  if (loc.suspended) return 'suspended'
  return locationNeedsVerification(loc) ? 'verification_required' : 'verified'
}

/**
 * The public Google listing.
 *
 * We hold no Place ID in this prototype, so the honest link is a maps search for the
 * store's own name and address — it lands on the listing without pretending we stored a
 * canonical URL we never had.
 */
export function googleProfileUrl(loc) {
  if (!loc) return null
  const q = [loc.name, loc.branch, loc.address, loc.pincode].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** The store's SingleInterface microsite, keyed by the store code on its signage. */
export function micrositeUrl(loc) {
  const code = typeof loc === 'string' ? loc : (loc?.storeCode || loc?.id)
  if (!code) return null
  return `https://si.link/s/${String(code).toUpperCase()}`
}

/**
 * "ALL LOCATIONS" — the synthetic selection behind the cumulative view (feedback
 * round 4). Deliberately carries NO name/branch fields: every screen prints its label
 * through t('stores.allLocations'), and every fallback written for a missing store
 * field keeps behaving. `aggregate: true` is the one discriminator screens branch on.
 */
export const AGGREGATE_STORE_ID = 'all'
export function makeAllLocationsStore() {
  return { id: AGGREGATE_STORE_ID, aggregate: true }
}

// ============================================================
// THE BRAND HIERARCHY — Brand → sub-brand → state → city → store.
//
// A parent brand holds sub-brands (Tata holds Tanishq and Tetley; here Lakshmi Group
// holds Lakshmi Electronics and Lakshmi Digital), and a session can be scoped to ANY
// node of that tree. The scope MECHANISM is unchanged: setSessionAssignments() remains
// the one authority on which stores are in play, so every selector, badge and roll-up
// follows a scope change without knowing the tree exists. What these helpers add is
// the vocabulary for choosing the subset.
//
// `subBrand` is a field on the location, falling back to the store name — a location
// file that has never heard of sub-brands keeps working, as one sub-brand per name.
// ============================================================

/** The parent brand over every sub-brand. A proper noun, never translated.
    The spec's own example, verbatim: TATA holds Tata Motors and Tetley; the sub-brand
    with the most locations (Tetley) is the default a fresh session opens on. */
export const BRAND_NAME = 'TATA'

export function subBrandOf(loc) {
  return loc?.subBrand || loc?.name
}

/**
 * The sub-brands across `storeIds`, LARGEST FIRST — the order IS the default rule: a
 * fresh session opens on subBrands(ids)[0]. `storeIds` is required rather than
 * defaulting to the session assignment: assignments.js imports this module, so reading
 * it back would be a cycle — and the tree is honestly a pure function of the set.
 */
export function subBrands(storeIds) {
  const ids = storeIds || []
  const locs = getStoreLocations().filter(l => ids.includes(l.id))
  const by = new Map()
  for (const l of locs) {
    const key = subBrandOf(l)
    if (!by.has(key)) by.set(key, { name: key, ids: [] })
    by.get(key).ids.push(l.id)
  }
  return [...by.values()]
    .map(b => ({ ...b, count: b.ids.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The default scope for a fresh session: the sub-brand with the most locations. */
export function defaultSubBrand(storeIds) {
  return subBrands(storeIds)[0] || null
}

/**
 * An aggregate store for a scope NODE (sub-brand / state / city). Same discriminator
 * screens already branch on (`aggregate: true`); `label` is what the switcher pill
 * prints, `ids` what the selection covers. Selectors never read either — they read
 * the assignment, which the caller sets alongside this.
 */
export function makeScopeStore({ label, ids }) {
  return { id: AGGREGATE_STORE_ID, aggregate: true, label, ids }
}

/**
 * THE WHOLE TREE, FLATTENED FOR A DROPDOWN — Brand → sub-brand → state → city → store
 * as one indented list, every row selectable. This replaced the level-by-level drill:
 * with a holding this size, walking four levels to reach a shop was four taps of
 * ceremony for a list that fits on one screen. Selecting any row scopes to that node,
 * which AUTO-SELECTS its ancestors by construction — a city's ids are a subset of its
 * state's, so "Bangalore" cannot be chosen without Karnataka being true of it.
 */
export function brandTree(storeIds) {
  const rows = [{ level: 'brand', name: BRAND_NAME, ids: [...(storeIds || [])], depth: 0 }]
  for (const sb of subBrands(storeIds)) {
    rows.push({ level: 'subBrand', name: sb.name, ids: sb.ids, depth: 1 })
    for (const st of scopeChildren(storeIds, { subBrand: sb.name })) {
      rows.push({ level: 'state', name: st.name, ids: st.ids, depth: 2 })
      for (const ci of scopeChildren(storeIds, { subBrand: sb.name, state: st.name })) {
        rows.push({ level: 'city', name: ci.name, ids: ci.ids, depth: 3 })
        for (const lf of scopeChildren(storeIds, { subBrand: sb.name, state: st.name, city: ci.name })) {
          rows.push({ level: 'store', name: lf.name, ids: lf.ids, depth: 4, store: lf.store })
        }
      }
    }
  }
  return rows
}

/**
 * The children of a node in the drill, with per-child store counts. `path` is
 * { subBrand?, state?, city? } — whichever keys are present narrow the set.
 */
export function scopeChildren(storeIds, path = {}) {
  const ids = storeIds || []
  let locs = getStoreLocations().filter(l => ids.includes(l.id))
  if (path.subBrand) locs = locs.filter(l => subBrandOf(l) === path.subBrand)
  if (!path.state) {
    const by = new Map()
    for (const l of locs) {
      if (!by.has(l.state)) by.set(l.state, [])
      by.get(l.state).push(l.id)
    }
    return [...by.entries()].map(([name, list]) => ({ level: 'state', name, ids: list, count: list.length }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }
  locs = locs.filter(l => l.state === path.state)
  if (!path.city) {
    const by = new Map()
    for (const l of locs) {
      if (!by.has(l.city)) by.set(l.city, [])
      by.get(l.city).push(l.id)
    }
    return [...by.entries()].map(([name, list]) => ({ level: 'city', name, ids: list, count: list.length }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }
  locs = locs.filter(l => l.city === path.city)
  return locs.map(l => ({ level: 'store', name: l.branch, ids: [l.id], count: 1, store: l }))
}

/**
 * The branch name for a storeId — what a location badge prints.
 *
 * Branch alone ("Koramangala"), not "Lakshmi Electronics — Koramangala": every store in
 * a dealer's list shares the brand, so repeating it on every row is noise that pushes the
 * one distinguishing word off the edge. Unknown id → null, and the badge renders nothing
 * rather than an empty pill.
 */
export function storeLabelOf(storeId) {
  if (!storeId) return null
  const loc = MAPPED_LOCATIONS.find(l => l.id === storeId)
  return loc ? (loc.branch || loc.name || null) : null
}

/** Whether a location has any open verification flag (cleared once verified on-site). */
export function locationNeedsVerification(loc) {
  // The synthetic "All locations" selection is not a place — nothing to verify.
  if (!loc || loc.aggregate) return false
  if (loc.verified) return false
  return computeLocationFlags(loc).length > 0
}

/** Persist a location's verification result. In-memory seed update as before;
 *  with a live Supabase backend the same patch is also written through
 *  (fire-and-forget), so verification genuinely survives a reload there. */
export function verifyLocation(id, patch = {}) {
  const loc = MAPPED_LOCATIONS.find(l => l.id === id)
  if (loc) Object.assign(loc, patch, { verified: true })
  const sb = liveClient()
  if (loc && sb) {
    const row = { verified: true, verified_at: new Date().toISOString() }
    if (patch.address != null) row.address = patch.address
    if (patch.pincode != null) row.pincode = patch.pincode
    if (patch.city != null) row.city = patch.city
    if (patch.state != null) row.state = patch.state
    if (patch.landmark != null) row.landmark = patch.landmark
    if (patch.stated) { row.stated_lat = patch.stated.lat; row.stated_lng = patch.stated.lng }
    if (patch.actual) { row.actual_lat = patch.actual.lat; row.actual_lng = patch.actual.lng }
    sb.from('stores').update(row).eq('id', id)
      .throwOnError().then(null, (e) => console.warn('[data] supabase verifyLocation failed:', e))
  }
  // Object.assign'd in place — the store card, the switcher and Home all hold
  // this same record and none of them would notice on their own.
  if (loc) emitChange()
  return loc
}

// Real Open Location Code (Google Plus Code) alphabet.
const OLC_ALPHABET = '23456789CFGHJMPQRVWX'

// Encode a lat/lng into a full 10-digit Open Location Code, e.g. "7J4VXGRX+QF".
// Faithful to Google's reference algorithm (integer math to avoid FP drift).
function encodeOLC(latitude, longitude) {
  const ENC = 20, SEP = 8, GRID_LEN = 5, GCOLS = 4, GROWS = 5
  const FINAL_LAT = 8000 * Math.pow(GROWS, GRID_LEN)  // 20^3 * 5^5 = 25,000,000
  const FINAL_LNG = 8000 * Math.pow(GCOLS, GRID_LEN)  // 20^3 * 4^5 =  8,192,000

  let lat = Math.min(90, Math.max(-90, latitude))
  let lng = ((longitude + 180) % 360 + 360) % 360 - 180   // normalize to [-180, 180)
  if (lat === 90) lat -= 1e-6

  let latVal = Math.floor(Math.round((lat + 90) * FINAL_LAT * 1e6) / 1e6)
  let lngVal = Math.floor(Math.round((lng + 180) * FINAL_LNG * 1e6) / 1e6)

  // Collapse the 5 grid-refinement digits — we emit the 10-digit pair code.
  latVal = Math.floor(latVal / Math.pow(GROWS, GRID_LEN))
  lngVal = Math.floor(lngVal / Math.pow(GCOLS, GRID_LEN))

  let code = ''
  for (let i = 0; i < 5; i++) {
    code = OLC_ALPHABET[lngVal % ENC] + code
    code = OLC_ALPHABET[latVal % ENC] + code
    latVal = Math.floor(latVal / ENC)
    lngVal = Math.floor(lngVal / ENC)
  }
  return code.slice(0, SEP) + '+' + code.slice(SEP)
}

/** Google Plus Code for a lat/long. Returns the short form + locality
 *  (e.g. "XGRX+QF Bengaluru, Karnataka") — a genuine, Maps-resolvable code. */
export function makePlusCode(lat, lng, locality) {
  if (lat == null || lng == null) return ''
  const full = encodeOLC(lat, lng)
  const short = full.length > 4 ? full.slice(4) : full
  return locality ? `${short} ${locality}` : short
}

/**
 * "What you missed since last login" summary for a store.
 *
 * The review count is bounded by the last-login instant, not by the whole seed: the
 * review history now runs back a year, and "since last login" has to mean since last
 * login or the card is just lying. (Missed calls needed no bound — MISSED_CALLS is
 * today's calls by construction, all of them after the last sign-in.)
 */
export function sinceLastLogin(store) {
  const since = resolveAt(LAST_LOGIN_OFFSET_MS)
  const missed = MISSED_CALLS.filter(m => !m.spam).length
  const negativeReviews = REVIEWS.filter(r => r.rating <= 2 && resolveAt(r.atOffsetMs) >= since).length
  const health = store?.health ?? 82
  const healthPrev = store?.healthPrev ?? 86
  return {
    missedCalls: missed,
    negativeReviews,
    health,
    healthDelta: health - healthPrev,
  }
}

// STORE_LATLNG / NEARBY_LATLNGS were removed with the nearby-competitor card (scope 1 cut).
// `health`/`healthDelta` above survive only because Home.jsx still calls sinceLastLogin().

export { LAST_LOGIN }
