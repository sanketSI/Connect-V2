// Content domain: media library, upload compliance, and post templates.
//
// The Grow habit-loop (streak, checklist) and the nearby-rank / Competitor AI snapshot
// were removed here in the scope-1 cut, together with the Grow tab and Home's rank and
// checklist cards. Removed exports: getGrowStreak, getGrowChecklist, getNearbyRank.
import {
  MEDIA_LIBRARY, UPLOAD_SAMPLES, POST_TEMPLATES,
  COMPETITOR_BRANDS, NON_BRAND_NAME_SIGNALS, PRIMARY_STORE_ID,
} from '../lib/seedData.js'

// ============================================================
// COMPLIANCE RULES — what we can say about a picture, and on what evidence.
//
// EVERY rule below reads a NAME. Not one of them looks at pixels. That single fact is the
// boundary of this feature and it is why the sheet that renders these results says so out
// loud: we cannot recognise a face, we cannot recognise a logo, and we cannot recognise a
// competitor's shelf in a photo called IMG_4471.jpg. What we CAN do is notice when the
// name itself gives the game away, which — for selfies, forwards, screenshots and files
// literally named after another shop — it very often does.
//
// (Size and sharpness ARE measured off the real decoded picture, but that happens in
// ManageMedia.jsx where the pixels are, and only for images we actually hold.)
//
// `type` is the discriminator, not decoration:
//   'quality'    — it may well be your store, but Google won't take it like this.
//   'competitor' — the name says this belongs to another business.
//   'nonBrand'   — the name says this isn't the shop at all.
//
// Each rule carries `reasonVars` where the sentence quotes live evidence, exactly as
// computeLocationFlags() does in locations.js: the UI renders
// `t(res.reasonKey, { ...res.reasonVars, defaultValue: res.reason })` so the matched term
// is interpolated into the TRANSLATED sentence instead of stranding English inside it.
// ============================================================

const COMPLIANCE_RULES = [
  {
    id: 'selfie', type: 'quality', match: ['selfie'],
    reason: 'Selfies aren’t allowed — upload the storefront or products, not people.',
    reasonKey: 'seed.compliance.selfie',
  },
  {
    id: 'blur', type: 'quality', match: ['blur'],
    reason: 'Too blurry to meet listing quality standards. Retake in good light.',
    reasonKey: 'seed.compliance.blur',
  },
  {
    id: 'screenshot', type: 'quality', match: ['screenshot'],
    reason: 'Screenshots aren’t accepted — use an original store photo.',
    reasonKey: 'seed.compliance.screenshot',
  },
  {
    id: 'whatsapp', type: 'quality', match: ['whatsapp'],
    reason: 'Forwarded/low-resolution images are rejected — upload a fresh capture.',
    reasonKey: 'seed.compliance.whatsapp',
  },
  // The two the PM asked for (19.5), as far as a name can honestly carry them.
  {
    id: 'competitor', type: 'competitor', match: COMPETITOR_BRANDS,
    reason: 'This file is named after {{term}} — a different business. Only pictures of your own store belong on your listing.',
    reasonKey: 'seed.compliance.competitor',
  },
  {
    id: 'nonBrand', type: 'nonBrand', match: NON_BRAND_NAME_SIGNALS,
    reason: 'The file name says “{{term}}” — this doesn’t look like your store or your products.',
    reasonKey: 'seed.compliance.nonBrand',
  },
]

/**
 * Fold a file name down to something matchable: lower case, and every separator a camera,
 * a phone or a person might use collapsed to a single space.
 *
 * 'Croma_Koramangala_offer_board.jpg' → 'croma koramangala offer board jpg'
 *
 * Without this, 'stock photo' would never match `stock_photo_tv.jpg` and the multi-word
 * competitor names ('Reliance Digital') would never match anything at all.
 */
const normalizeName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The first rule this name trips, with the term that tripped it — or null. */
function matchRule(nameOrHint) {
  const n = normalizeName(nameOrHint)
  if (!n) return null
  for (const rule of COMPLIANCE_RULES) {
    const term = rule.match.find(m => n.includes(normalizeName(m)))
    if (term) return { rule, term }
  }
  return null
}

/** Current media library (cover + gallery photos). */
export function getMediaLibrary(storeId) {
  return storeId
    ? MEDIA_LIBRARY.filter(m => (m.storeId ?? PRIMARY_STORE_ID) === storeId)
    : MEDIA_LIBRARY
}

/** Sample files for the upload-compliance simulation. */
export function getUploadSamples() {
  return UPLOAD_SAMPLES
}

/**
 * Post templates for the composer — the four Nova types: Standard, Offer, Event,
 * Testimonial. Each carries `nameKey`/`headlineKey`/`ctaKey` beside its English value:
 * render `t(tpl.nameKey, { defaultValue: tpl.name })`.
 */
export function getPostTemplates() {
  return POST_TEMPLATES
}

/**
 * Validate an upload at the point of upload, and any image already on the listing.
 *
 * Returns `{ ok: true }`, or:
 *   `{ ok: false, rule, type, term, reason, reasonKey, reasonVars }`
 *
 * Render the reason as `t(res.reasonKey, { ...res.reasonVars, defaultValue: res.reason })`.
 *
 * `ok: true` means NOTHING TRIPPED A NAME RULE. It does not mean the picture is of your
 * store — we never saw the picture. Callers that present this to a human must not round it
 * up to "approved"; see the SIP sheet, which says exactly this to the owner.
 */
export function checkCompliance(nameOrHint) {
  const hit = matchRule(nameOrHint)
  if (!hit) return { ok: true }
  const { rule, term } = hit
  return {
    ok: false,
    rule: rule.id,
    type: rule.type,
    term,
    reason: rule.reason.replace('{{term}}', term),
    reasonKey: rule.reasonKey,
    reasonVars: { term },
  }
}

/**
 * What the name check can and cannot catch, read off the rules themselves rather than
 * retyped in the UI.
 *
 * This exists so the honesty statement on screen cannot drift away from the code. Add a
 * rule type here and the sheet's claim widens with it; delete the competitor rules and the
 * sheet stops claiming competitors — automatically. A disclaimer maintained by hand in JSX
 * is a disclaimer that goes stale the first time someone edits the list.
 */
export function complianceCapability() {
  const types = new Set(COMPLIANCE_RULES.map(r => r.type))
  return {
    types: [...types],
    competitors: types.has('competitor'),
    nonBrand: types.has('nonBrand'),
    competitorCount: COMPETITOR_BRANDS.length,
    // The permanent ceiling, not a to-do: none of this reads pixels, so none of it can be
    // fixed by adding more rules. Only a real vision model moves these, and we do not have
    // one on the client.
    readsPixels: false,
    recognisesFaces: false,
    recognisesLogos: false,
  }
}

// Reference data re-exported through the boundary — the SIP sheet names the competitor
// list it actually matched against instead of asserting a number.
export { COMPETITOR_BRANDS, NON_BRAND_NAME_SIGNALS }
