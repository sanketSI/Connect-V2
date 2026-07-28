// Business-profile domain: the Google-Business-Profile-style record, its field
// catalogs, and profile-strength scoring.
//
// The AI token wallet was removed here in the scope-1 cut, along with the tokens sheet.
// Removed export: getAITokens (and the AI_TOKENS seed it read).
import {
  BUSINESS_PROFILE, GBP_FIELDS, CATEGORY_OPTIONS, ATTRIBUTE_GROUPS, DAYS, STORE_TEAM, MAPPED_LOCATIONS,
} from '../lib/seedData.js'

/** The full editable business profile (about / contact / location / hours / attributes). */
export function getBusinessProfile(storeId) {
  if (!storeId) return BUSINESS_PROFILE
  const loc = MAPPED_LOCATIONS.find(l => l.id === storeId)
  if (!loc) return BUSINESS_PROFILE
  // A Google listing is per BRANCH. What genuinely differs between them is the identity
  // and the address — the categories, description, hours and attributes are the brand's
  // and are shared. So the per-store profile is the shared template with the branch's
  // OWN facts merged over it, taken from the location record the Verify screen edits,
  // rather than three hand-copied profiles that would drift apart on the first edit.
  return {
    ...BUSINESS_PROFILE,
    storeId,
    about: { ...BUSINESS_PROFILE.about, name: `${loc.name} — ${loc.branch}` },
    location: {
      ...BUSINESS_PROFILE.location,
      address: [loc.address, loc.state, loc.pincode].filter(Boolean).join(', '),
    },
  }
}

/** The roster at one branch — staff belong to a shop floor, not to the account. */
export function getStoreTeam(storeId) {
  return STORE_TEAM[storeId] || []
}

/** Every branch's roster, for the All-locations view: `[{ storeId, branch, members }]`. */
export function getAllStoreTeams() {
  return MAPPED_LOCATIONS.map(l => ({
    storeId: l.id,
    branch: l.branch,
    members: STORE_TEAM[l.id] || [],
  }))
}

// ============================================================
// DISPLAY-ONLY translation for round-tripping option values
//
// CATEGORY_OPTIONS and ATTRIBUTE_GROUPS[].options are not just labels — the picked
// English string is what gets STORED on the profile and what every check compares
// against (`sel.includes(opt)`, `primaryCategory === opt`). Translate the stored value
// and a Hindi dealer's saved "Delivery" would stop matching the catalog's "Delivery".
//
// So we never translate the value. We derive a stable key FROM it, and the UI renders
// `t(categoryOptionKey(opt), { defaultValue: opt })` while still comparing on `opt`.
// Display and identity stay separate — the key is a view of the value, not a rename.
// ============================================================

/**
 * 'Air Conditioning Store' → 'airConditioningStore'; 'Wi-Fi' → 'wiFi'; 'UPI' → 'upi'.
 * One rule, no special cases: split on anything that isn't a letter or digit, lowercase
 * the first word, capitalise the rest. Same input always gives the same key, so the
 * catalog and the UI agree without a lookup table to keep in sync.
 */
function slugify(value) {
  const words = String(value || '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')   // punctuation → separator: "Wheelchair-accessible" → 2 words
    .trim()
    .split(/\s+/)
  if (!words[0]) return ''
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
}

/** Display key for a CATEGORY_OPTIONS value. Pair with `{ defaultValue: opt }`. */
export function categoryOptionKey(option) {
  return `seed.categoryOption.${slugify(option)}`
}

/** Display key for an ATTRIBUTE_GROUPS[].options value. Pair with `{ defaultValue: opt }`. */
export function attributeOptionKey(option) {
  return `seed.attributeOption.${slugify(option)}`
}

/** Profile strength 0–100 across the key GBP fields. */
export function profileCompleteness(p) {
  if (!p) return 0
  const a = p.about, c = p.contact, l = p.location, h = p.hours, at = p.attributes || {}
  const checks = [
    !!a.name, !!a.primaryCategory, (a.secondaryCategories || []).length > 0,
    !!a.description, !!a.openingDate,
    !!c.phone, !!c.website, !!c.chat, !!c.menuLink,
    !!l.address, (l.serviceArea || []).length > 0,
    Object.values(h.main || {}).some(v => v && v !== 'Closed'),
    (at.payments || []).length > 0, (at.service || []).length > 0,
    (at.accessibility || []).length > 0, (at.parking || []).length > 0,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

// Field catalogs re-exported through the boundary.
export { GBP_FIELDS, CATEGORY_OPTIONS, ATTRIBUTE_GROUPS, DAYS }
