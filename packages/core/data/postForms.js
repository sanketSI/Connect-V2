// ============================================================
// CREATE-POST FORM SPEC — the four post types, their fields, and their limits.
//
// PM feedback 5: "Add flow of post addition, keep the form same exact as below", with a
// screenshot per type. Those screenshots specify field order, labels, placeholders,
// character ceilings and which fields are required — about thirty facts across four
// forms, and the web and native screens both have to honour every one of them.
//
// So the spec lives HERE rather than being typed twice. A `max: 58` that is 58 on one
// platform and 60 on the other is exactly the kind of drift this repo keeps closing, and
// it is invisible until a manager's offer title is silently truncated on one device.
// The screens render this list; they do not carry their own copy of it.
//
// FIELD KINDS the renderers must handle: text · textarea · image · select · date ·
// datetime · url. Nothing else appears here, so nothing else needs building.
// ============================================================

/**
 * The four call-to-action labels the product itself shows (PDF page 7: Standard → Learn
 * More, Offer → Redeem Offer, Event → Book Now, Testimonial → Read More). Not a guess at
 * Google's full CTA vocabulary — these are the ones this app already uses.
 */
export const POST_CTAS = [
  { id: 'learn_more', label: 'Learn More' },
  { id: 'redeem_offer', label: 'Redeem Offer' },
  { id: 'book_now', label: 'Book Now' },
  { id: 'read_more', label: 'Read More' },
  { id: 'call_now', label: 'Call Now' },
]

/**
 * Where a post's button points. Both are real destinations in this product — the store's
 * listing and its SingleInterface microsite (see micrositeUrl in locations.js).
 */
export const POST_LINK_TYPES = [
  { id: 'outlet', label: 'Outlet Link' },
  { id: 'microsite', label: 'Microsite Link' },
]

/**
 * DECIDED, not transcribed. The screenshots show "Select type" / "Select event type"
 * with the list closed, so there was nothing to copy. These are the offer shapes Indian
 * consumer retail actually runs and that this fixture's own calls already reference —
 * EMI options and exchange enquiries are two of the app's canonical CALL_REASONS, so an
 * Offer post has something real to point at. Swap the labels if the brand's taxonomy
 * differs; the ids are what the code keys on.
 */
export const OFFER_TYPES = [
  { id: 'discount', label: 'Discount' },
  { id: 'cashback', label: 'Cashback' },
  { id: 'exchange', label: 'Exchange offer' },
  { id: 'bundle', label: 'Bundle deal' },
  { id: 'no_cost_emi', label: 'No-cost EMI' },
]

export const EVENT_TYPES = [
  { id: 'launch', label: 'Product launch' },
  { id: 'in_store', label: 'In-store event' },
  { id: 'workshop', label: 'Workshop / demo' },
  { id: 'sale', label: 'Sale' },
]

/** The image rule, printed under every upload zone exactly as the screenshots show it. */
export const POST_IMAGE_HINT = '1 image allowed, Min 15KB, Max 2MB, Min 400px x 400px, jpg / jpeg / png format only'

const scheduleField = {
  key: 'scheduleAt',
  kind: 'datetime',
  label: 'Schedule Post (Optional)',
  hint: 'Leave empty to publish immediately',
  required: false,
}

const imageField = {
  key: 'image',
  kind: 'image',
  label: 'Post Image',
  required: true,
  // NO `hint` here: the renderers print POST_IMAGE_HINT inside the upload zone, which is
  // where the screenshots put it. Setting it here as well printed the rule twice.
  // "Paste URL instead" — the escape hatch the screenshots put beside the label.
  altUrl: true,
}

const ctaField = { key: 'cta', kind: 'select', label: 'Call to Action', required: true, placeholder: 'Select CTA', options: POST_CTAS }

/**
 * THE FOUR TYPES, in the tab order the screenshot shows.
 *
 * TESTIMONIAL had no form supplied, unlike the other three. Its fields follow the pattern
 * the others establish and are now the spec rather than a proposal — see the note on the
 * type itself.
 */
export const POST_TYPES = [
  {
    id: 'standard',
    label: 'Standard Post',
    fields: [
      { key: 'caption', kind: 'textarea', label: 'Post Caption', required: true, max: 1500, placeholder: 'Write your post content here...' },
      imageField,
      ctaField,
      { key: 'linkType', kind: 'select', label: 'Link Type', required: true, placeholder: 'Outlet Link', options: POST_LINK_TYPES },
      scheduleField,
    ],
  },
  {
    id: 'offer',
    label: 'Offer Post',
    fields: [
      { key: 'offerType', kind: 'select', label: 'Offer Type', required: true, placeholder: 'Select type', options: OFFER_TYPES },
      { key: 'couponCode', kind: 'text', label: 'Coupon Code (max 50 chars)', required: false, max: 50, placeholder: 'e.g., DIWALI20' },
      { key: 'offerTitle', kind: 'text', label: 'Offer Title (max 58 chars)', required: true, max: 58, placeholder: 'e.g., Mega Festive Sale - Flat 20% Off' },
      imageField,
      { key: 'description', kind: 'textarea', label: 'Description (max 1500 chars)', required: true, max: 1500, placeholder: 'Describe your offer in detail...' },
      { key: 'startDate', kind: 'date', label: 'Start Date', required: true },
      { key: 'endDate', kind: 'date', label: 'End Date', required: true },
      { key: 'redeemUrl', kind: 'url', label: 'Redeem URL', required: true, placeholder: 'https://example.com/offers/code' },
      { key: 'terms', kind: 'textarea', label: 'Terms & Conditions (max 500 chars)', required: false, max: 500, placeholder: 'e.g., Valid only on select models. Cannot be combined with other offers.' },
      ctaField,
      scheduleField,
    ],
  },
  {
    id: 'event',
    label: 'Event Post',
    fields: [
      { key: 'eventType', kind: 'select', label: 'Event Type', required: true, placeholder: 'Select event type', options: EVENT_TYPES },
      imageField,
      { key: 'eventTitle', kind: 'text', label: 'Event Title (max 58 chars)', required: true, max: 58, placeholder: 'e.g., HP Gaming Laptop Launch Event' },
      { key: 'eventDescription', kind: 'textarea', label: 'Event Description (max 1500 chars)', required: true, max: 1500, placeholder: 'Describe your event, what attendees will experience...' },
      { key: 'startDate', kind: 'date', label: 'Start Date', required: true },
      { key: 'endDate', kind: 'date', label: 'End Date', required: true },
      ctaField,
      scheduleField,
    ],
  },
  {
    id: 'testimonial',
    label: 'Testimonial Post',
    fields: [
      // DECIDED. No form was supplied for this tab, so the shape follows the other
      // three: the words, who said them, a picture, a button, a schedule. The two
      // ceilings match their counterparts elsewhere in the spec (1500 for a body, 58
      // for a name-length line) rather than being new numbers.
      { key: 'quote', kind: 'textarea', label: 'Testimonial (max 1500 chars)', required: true, max: 1500, placeholder: 'What did the customer say?' },
      { key: 'customerName', kind: 'text', label: 'Customer Name (max 58 chars)', required: true, max: 58, placeholder: 'e.g., Anand Rao' },
      imageField,
      ctaField,
      scheduleField,
    ],
  },
]

export function getPostType(id) {
  return POST_TYPES.find(p => p.id === id) || POST_TYPES[0]
}

/**
 * Which required fields are still empty, and which have overrun their ceiling.
 *
 * Returns `{ ok, missing: [key], tooLong: [key], invalid: [key] }`. The FORM decides how
 * to present that; this decides what is true. Both platforms call it, so "can I submit
 * this" cannot be answered differently on a phone than in a browser.
 *
 * A date pair is checked here too: an offer that ends before it starts is not a
 * formatting problem the renderer should be left to notice.
 */
export function validatePost(typeId, values = {}) {
  const type = getPostType(typeId)
  const missing = []
  const tooLong = []
  const invalid = []

  for (const f of type.fields) {
    const raw = values[f.key]
    const v = typeof raw === 'string' ? raw.trim() : raw
    if (f.required && !v) { missing.push(f.key); continue }
    if (!v) continue
    if (f.max && String(v).length > f.max) tooLong.push(f.key)
    if (f.kind === 'url' && !/^https?:\/\/\S+$/i.test(String(v))) invalid.push(f.key)
  }

  const hasStart = type.fields.some(f => f.key === 'startDate')
  if (hasStart && values.startDate && values.endDate && String(values.endDate) < String(values.startDate)) {
    invalid.push('endDate')
  }

  return { ok: !missing.length && !tooLong.length && !invalid.length, missing, tooLong, invalid }
}
