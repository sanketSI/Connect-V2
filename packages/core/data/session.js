// Session / identity / persistence boundary.
// Auth state, the signed-in user, login credentials (mobile + store code), phone masking,
// and the returning-user flag all live here. Persistence goes through the core storage
// seam (packages/core/storage.js — localStorage on web); later it can be a real
// auth/session backend without any screen change.
import {
  PRIMARY_USER, ROLES, LANGUAGES, DEALER_PHONE,
  MAPPED_LOCATIONS, STORE_CODE_REGISTRY, STORE_CODE_PATTERN, STORE_CODE_EXAMPLE,
} from '../lib/seedData.js'
import { liveClient } from '../lib/supabase.js'
import { storage } from '../storage.js'

const RETURNING_KEY = 'connect-returning'

/** Has this dealer logged in before on this device? (drives first-run welcome) */
export function isReturningUser() {
  return !!storage.getItem(RETURNING_KEY)
}

/** Mark the dealer as returning (called once the welcome has been seen). */
export function markReturningUser() {
  storage.setItem(RETURNING_KEY, '1')
}

/** The signed-in user. */
export function getCurrentUser() {
  return PRIMARY_USER
}

/** Anything already carrying a mask glyph has been masked once — see maskPhone(). */
const ALREADY_MASKED = /[•●]/

/**
 * Mask a phone number for privacy display: +91 98•••• ••42
 *
 * IDEMPOTENT. Masking an already-masked string returns it unchanged, because
 * with the raw columns revoked (supabase/migrations/0002_harden_rls.sql) the
 * "number on file" a caller holds may ALREADY be the server's masked form —
 * `dealer_store_registry.phone_masked`. Re-masking that would strip the digits
 * back to the country code and print a confident lie (`+91 91•••• ••42`), so
 * `maskPhone(phoneOnFileFor(code))` stays correct in both modes.
 */
export function maskPhone(p) {
  const raw = String(p || '')
  if (ALREADY_MASKED.test(raw)) return raw
  const s = raw.replace(/\D/g, '')
  if (s.length < 4) return `+91 ${s}`
  return `+91 ${s.slice(0, 2)}•••• ••${s.slice(-2)}`
}

// ============================================================
// STORE CODE
//
// The store code is asked for when requesting access to a store — that is the moment it
// answers a real question ("which store?"). Signing in stays mobile + OTP, and a dealer
// running several outlets picks the outlet afterwards.
//
// The validation is real, and it can really fail. Three distinct outcomes, in the order
// they are checked, because they are three different problems for the user:
//
//   'format'    — not a store code at all (typo, wrong field). Fix the typing.
//   'notFound'  — well-formed, but no such store exists. Wrong code.
//   'notMapped' — a real store, but not one mapped to THIS number. Right code, wrong
//                 account — the case a "does it look like a code?" check would wave through.
//
// The last one is why STORE_CODE_REGISTRY is wider than MAPPED_LOCATIONS: it holds codes
// owned by other dealers (LKS-JAY-04, CRM-KOR-01). Without them nothing could ever be
// rejected as not-yours, and the check would be decoration. Try LKS-IND-01 (ok),
// LKS-JAY-04 (notMapped), LKS-ZZZ-99 (notFound), 'hello' (format).
//
// Codes are `AAA-BBB-NN`: brand, branch, sequence. Case- and space-insensitive on input.
//
// ------------------------------------------------------------
// OWNERSHIP WITHOUT A PHONE NUMBER
//
// `dealers.phone` IS the login credential, so anon must not be able to read it
// (supabase/migrations/0002_harden_rls.sql). That means a registry row from the
// backend carries NO number, and "is this code yours?" cannot be a string
// compare against one. It becomes an IDENTITY question instead — see
// ownerMatches() below for the two row shapes and the three ways it is answered.
//
// The check is not weakened by any of this: LKS-JAY-04 (a real code, another
// dealer's) still fails as 'notMapped' for 9845012342 in every mode.
// ============================================================

/**
 * Opaque dealer ids the SERVER has bound to a number, learned from
 * verify_store_login(). Keyed by the 10 digits the user typed — never stored,
 * never persisted, and gone with the tab.
 */
const KNOWN_OWNERS = new Map()

/**
 * Verdicts the server has already returned for a `CODE|digits` pair, so the
 * synchronous resolver below agrees with the RPC once the RPC has spoken.
 */
const SERVER_VERDICTS = new Map()

/**
 * Does this registry entry belong to the number `digits`?
 *
 * TWO ROW SHAPES, one question:
 *
 *   SEED rows carry `phone` — the fixture in packages/core/lib/seedData.js is
 *   not a database and holds nobody's real mobile, so the direct comparison is
 *   kept exactly as it always was. Seed mode is byte-for-byte unchanged.
 *
 *   HYDRATED rows (packages/core/data/hydrate.js, from the
 *   `dealer_store_registry` view) carry no `phone` at all — only an opaque
 *   `dealerId`, a `mine` flag that hydrate computed by comparing that id to the
 *   dealer id the `dealer_for_phone` RPC resolved server-side, and a
 *   display-only `phoneMasked`. Ownership is an id comparison:
 *
 *     1. a binding the server handed us for THIS number → compare dealer ids;
 *     2. otherwise, this build's own sign-in number (a client-side constant,
 *        never a value read out of the database) against `mine`;
 *     3. otherwise FAIL CLOSED. We genuinely cannot vouch for a number we have
 *        never resolved — verifyStoreLogin() asks the server, and the answer
 *        lands in KNOWN_OWNERS for case 1.
 */
function ownerMatches(entry, digits) {
  if (!digits) return false
  if (entry.phone != null) return entry.phone === digits
  const bound = KNOWN_OWNERS.get(digits)
  if (bound != null) return entry.dealerId != null && entry.dealerId === bound
  return entry.mine === true && digits === DEALER_PHONE
}

/** Whatever the user typed, reduced to the digits we compare on. */
function phoneDigits(phone) {
  return String(phone ?? '').replace(/\D/g, '')
}

/**
 * Clean up whatever the dealer typed: trim, uppercase, drop spaces, and accept a code
 * written without its hyphens ('lksind01' → 'LKS-IND-01'). Does NOT validate — pair with
 * resolveStoreCode(). Returns '' for empty input.
 */
export function normalizeStoreCode(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[\s_]/g, '')
  if (!raw) return ''
  if (raw.includes('-')) return raw
  // Un-hyphenated but otherwise well-formed → put the hyphens back rather than reject it.
  const m = raw.match(/^([A-Z]{3})([A-Z]{3})(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw
}

/** Is this a well-formed store code? Shape only — says nothing about whether it exists. */
export function isValidStoreCodeFormat(code) {
  return STORE_CODE_PATTERN.test(normalizeStoreCode(code))
}

/** The store a code points at, or null. Ignores who it belongs to — see resolveStoreCode(). */
export function getStoreByCode(code) {
  const entry = STORE_CODE_REGISTRY.find(e => e.code === normalizeStoreCode(code))
  if (!entry) return null
  return MAPPED_LOCATIONS.find(l => l.id === entry.locationId) || null
}

/** The store codes mapped to a phone number (all three outlets, for the signed-in dealer). */
export function storeCodesFor(phone) {
  const digits = phoneDigits(phone)
  return STORE_CODE_REGISTRY.filter(e => ownerMatches(e, digits)).map(e => e.code)
}

/**
 * Every store code the registry knows, across all dealers.
 *
 * Access requests are not scoped to one dealer — the point of asking is that the store
 * isn't yours yet — so the request sheet needs the whole set to tell "still typing" from
 * "no such store". Returns codes only; ownership stays behind resolveStoreCode().
 */
export function allStoreCodes() {
  return STORE_CODE_REGISTRY.map(e => e.code)
}

/**
 * The mobile number currently registered against a store code, or null.
 *
 * This is what "current number on file" means on the access-request sheet: the person
 * asking has, by definition, not signed in, so the only thing that can name the number
 * on file is the store they name.
 *
 * Returns THE MOST PRECISE FORM THIS CLIENT IS ALLOWED TO HOLD — the fixture's raw
 * digits in seed mode, and the server's already-masked string when hydrated, because
 * the backend no longer hands a raw dealer number to anyone. Every caller runs the
 * result through maskPhone() either way (that is the documented contract, and
 * maskPhone is idempotent precisely so both forms come out right); we never show a
 * whole number to someone unauthenticated.
 */
export function phoneOnFileFor(code) {
  const entry = STORE_CODE_REGISTRY.find(e => e.code === normalizeStoreCode(code))
  if (!entry) return null
  return entry.phone || entry.phoneMasked || null
}

// The three refusals, built in one place so the sync resolver and the server-backed
// one below can never drift apart in wording, key or discriminator.
const badFormat = (code) => ({
  ok: false, code, reason: 'format',
  error: `Store codes look like ${STORE_CODE_EXAMPLE}.`,
  errorKey: 'login.storeCodeFormatError',
})
const notFound = (code) => ({
  ok: false, code, reason: 'notFound',
  error: 'We can’t find a store with that code. Check it against your store signage.',
  errorKey: 'login.storeCodeNotFoundError',
})
const notMapped = (code) => ({
  ok: false, code, reason: 'notMapped',
  error: 'That store isn’t mapped to this mobile number. Ask your admin for access.',
  errorKey: 'login.storeCodeNotMappedError',
})

/**
 * Resolve a store code to a store, optionally checking it belongs to a phone number.
 *
 * SYNCHRONOUS by contract — the sign-in screen calls this on every keystroke to
 * decide whether the CTA lights up. When a backend is live, verifyStoreLogin()
 * below is the authoritative check; the verdicts it collects are consulted here,
 * so the two can never disagree once the server has answered.
 *
 * @param code    what the dealer typed — normalised for you.
 * @param opts.phone  if given, the code must be mapped to this number.
 * @returns { ok: true, code, store }
 *        | { ok: false, code, reason, error, errorKey }
 *
 * `reason` is the stable discriminator ('format' | 'notFound' | 'notMapped'); render the
 * message as `t(res.errorKey, { defaultValue: res.error })`.
 */
export function resolveStoreCode(code, opts = {}) {
  const normalized = normalizeStoreCode(code)

  if (!STORE_CODE_PATTERN.test(normalized)) return badFormat(normalized)

  const entry = STORE_CODE_REGISTRY.find(e => e.code === normalized)
  if (!entry) return notFound(normalized)

  if (opts.phone != null) {
    const digits = phoneDigits(opts.phone)
    // A verdict the server already gave for this exact pair outranks anything we
    // can work out locally; otherwise ask the registry (see ownerMatches).
    const verdict = SERVER_VERDICTS.get(`${normalized}|${digits}`)
    const owned = verdict !== undefined ? verdict === 'ok' : ownerMatches(entry, digits)
    if (!owned) return notMapped(normalized)
  }

  const store = MAPPED_LOCATIONS.find(l => l.id === entry.locationId)
  // Registry knows the code but we hold no record for the store — a real backend would
  // 404 here too. Honest 'notFound' rather than a half-empty session.
  if (!store) return notFound(normalized)

  return { ok: true, code: normalized, store }
}

/**
 * Verify a sign-in ON THE SERVER — the authoritative version of resolveStoreCode().
 *
 * WHY IT EXISTS. The dealer phone is the login credential, so the client can no
 * longer hold one to compare against (supabase/migrations/0002_harden_rls.sql).
 * The question "does this store code belong to this number?" therefore belongs
 * where the number lives: `verify_store_login(code, phone)` answers it with the
 * same three discriminators the screens already branch on, and hands back an
 * opaque dealer id plus a MASKED number on file — never digits.
 *
 * SEED MODE IS UNTOUCHED. With no Supabase env injected there is no client, and
 * this is exactly resolveStoreCode() — the app signs in offline, zero env vars,
 * identical outcomes. The same fallback covers an RPC that errors or is missing:
 * a login screen that cannot reach its backend must still be able to refuse a
 * code it knows is wrong.
 *
 * Two side effects, both deliberate and both in-memory only:
 *   • an 'ok' teaches KNOWN_OWNERS which dealer id this number is, so the
 *     synchronous resolver can answer for that number afterwards;
 *   • every definitive verdict is remembered for resolveStoreCode().
 *
 * @returns the same shape as resolveStoreCode(), plus `phoneOnFileMasked` on a
 *          'notMapped' the server answered (the access-request sheet's one honest
 *          use for it — it is already masked, render it as-is).
 */
export async function verifyStoreLogin(code, phone) {
  const normalized = normalizeStoreCode(code)
  const digits = phoneDigits(phone)
  const local = () => resolveStoreCode(normalized, digits ? { phone: digits } : {})

  // Shape is the client's own question and the server has no better answer for
  // it — keep 'format' first, and don't spend a round trip on a typo.
  if (!STORE_CODE_PATTERN.test(normalized)) return badFormat(normalized)

  const sb = liveClient()
  if (!sb) return local()

  try {
    const { data, error } = await sb.rpc('verify_store_login', {
      p_store_code: normalized,
      p_phone: digits,
    })
    if (error) throw new Error(error.message || String(error))
    const row = Array.isArray(data) ? data[0] : data
    if (!row || !row.status) throw new Error('verify_store_login returned no verdict')

    if (digits) SERVER_VERDICTS.set(`${normalized}|${digits}`, row.status)
    if (row.status === 'ok' && row.dealer_id && digits) KNOWN_OWNERS.set(digits, row.dealer_id)

    if (row.status === 'notFound') return notFound(normalized)
    if (row.status === 'notMapped') {
      return { ...notMapped(normalized), phoneOnFileMasked: row.phone_on_file_masked ?? null }
    }
    const store = MAPPED_LOCATIONS.find(l => l.id === row.location_id)
    // The server says it is ours, but this session holds no record for it — the
    // same half-empty-session case resolveStoreCode() refuses.
    if (!store) return notFound(normalized)
    return { ok: true, code: normalized, store }
  } catch (err) {
    console.warn('[data] verify_store_login failed — falling back to the local registry:', err)
    return local()
  }
}

// Reference data re-exported through the boundary.
export { ROLES, LANGUAGES, DEALER_PHONE, STORE_CODE_EXAMPLE, STORE_CODE_PATTERN }
