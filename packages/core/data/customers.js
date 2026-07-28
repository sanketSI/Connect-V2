// Customers domain: the mini-CRM of callers and review recipients, and the notes a
// manager keeps against each one.
import { CUSTOMERS, maskCustomer, PRIMARY_STORE_ID } from '../lib/seedData.js'
import { resolveAt, nowOffsetMs, offsetForInstant } from './format.js'
import { getCurrentUser } from './session.js'
import { liveClient } from '../lib/supabase.js'
import { storage } from '../storage.js'
import { emitChange } from '../events.js'

// ============================================================
// NOTE PERSISTENCE
//
// A note is the one thing on this screen the MANAGER made. Everything else is seed data he
// can lose without noticing; his own words about a customer he just spoke to are not, and
// a prototype that eats them on refresh teaches him not to trust the feature. So notes
// outlive the tab.
//
// The core storage seam (packages/core/storage.js — localStorage on web), behind this
// boundary, the same way session.js persists the returning-user flag and the web i18n
// runtime persists the chosen language. That is the ACTUAL established pattern in
// this codebase — verifyLocation() is documented as persisting but does not: it is a plain
// in-memory Object.assign over the seed and its result dies with the tab, exactly like
// addCustomerNote() did before this change.
//
// TIMING: readStoredNotes() runs at MODULE SCOPE (via the RESOLVED map below), so the
// storage driver must be configured before this module loads — the boot gate in
// apps/web/src/main.jsx guarantees it (configureStorage runs before any core import).
//
// Only manager-written notes are stored. The seeded ones live in the seed and are merged in
// at load, so a seed edit still shows up and a stale copy can never shadow it.
//
// STORED AS ABSOLUTE EPOCH MS, never as an offset — see offsetForInstant() in format.js for
// why an `atOffsetMs` in storage would drift a note later on every reload.
// ============================================================

const NOTES_KEY = 'connect-customer-notes'

/** `{ [customerId]: [{ id, text, atMs, author }] }`. Never throws: storage may be blocked. */
function readStoredNotes() {
  try {
    const raw = storage.getItem(NOTES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Anything could be under this key — another app, an older shape, a half-written value.
    // Treat a bad payload as "no notes" rather than letting it take the screen down.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeStoredNotes(byCustomer) {
  storage.setItem(NOTES_KEY, JSON.stringify(byCustomer))
}

/** Persist one manager-written note, appended to whatever that customer already has. */
function persistNote(customerId, note) {
  const all = readStoredNotes()
  const list = Array.isArray(all[customerId]) ? all[customerId] : []
  all[customerId] = [...list, { id: note.id, text: note.text, atMs: note.atMs, author: note.author }]
  writeStoredNotes(all)
}

/** Stored notes for one customer, rebuilt into live records against THIS session's clock. */
function restoredNotesFor(customerId) {
  const list = readStoredNotes()[customerId]
  if (!Array.isArray(list)) return []
  return list
    .filter(n => n && typeof n.text === 'string' && Number.isFinite(n.atMs))
    .map(n => ({
      id: n.id,
      text: n.text,
      author: n.author,
      atMs: n.atMs,
      atOffsetMs: offsetForInstant(n.atMs), // absolute → this session's offset frame
    }))
}

// ============================================================
// HAND-ENTERED CUSTOMER PERSISTENCE
//
// Same argument as the notes above, and a stronger one: a contact the manager typed in
// himself — name, number, email, address — is the single most expensive thing on this
// screen to re-enter, and a prototype that loses it on refresh is a prototype he stops
// typing into. So added customers outlive the tab, through the same storage seam.
//
// Stored RAW (the four typed fields + who added them + when), never as a rendered record:
// `masked` is DERIVED by maskCustomer() on the way back out, exactly as the seed derives
// it, so a stored mask can never drift from the number it claims to mask. The instant is
// absolute epoch ms for the same reason the notes are — see offsetForInstant() in format.js.
// ============================================================

const ADDED_KEY = 'connect-added-customers'

/** `[{ id, name, phone, email, address, addedBy, atMs }]`. Never throws: storage may be blocked. */
function readStoredCustomers() {
  try {
    const raw = storage.getItem(ADDED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Anything could be under this key — another app, an older shape, a half-written
    // value. Treat a bad payload as "nobody added anyone" rather than taking the CRM down.
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredCustomers(list) {
  storage.setItem(ADDED_KEY, JSON.stringify(list))
}

/** Persist one hand-entered customer, appended to whatever this device already holds. */
function persistCustomer(stored) {
  writeStoredCustomers([...readStoredCustomers(), stored])
}

/**
 * How a customer reached the shop — the CHANNEL. Not to be confused with a call's
 * `source` (google / justdial / …), which is the platform the lead was sourced FROM.
 */
export const CUSTOMER_SOURCES = Object.freeze(['call', 'form', 'walk_in'])

/** The shop owner's hand-set read of buying intent, in the words the CLI bands use. */
export const CUSTOMER_INTENTS = Object.freeze(['hot', 'warm', 'cold'])

/**
 * The source type for a record, derived when it was never recorded.
 *
 * Explicit wins — a hand-entered contact carries its own. Otherwise: anyone the shop
 * typed in walked in or was referred, anyone with call history reached us by phone, and
 * anything left arrived as a form enquiry. Derived rather than stored on the seed so it
 * can never contradict the call history sitting right next to it on the card.
 */
export function customerSourceType(customer) {
  if (!customer) return null
  if (customer.sourceType) return customer.sourceType
  if (customer.addedBy) return 'walk_in'
  if (customer.callCount > 0) return 'call'
  return 'form'
}

/** Catalog key for a source type, so the label localises like every other label. */
export function customerSourceKey(type) {
  return `customers.source_${type || 'form'}`
}

/**
 * A stored row → the live record shape every screen reads.
 *
 * The absences are the point. A contact somebody typed in has no chance-to-buy score, no
 * AI read, no product category and no call history, because nothing has happened with
 * them yet. Those fields are NULL rather than 0/'cold'/'' — a zero score renders as
 * "definitely won't buy", which is a claim we have no basis for. The screens branch on
 * null and say "no score yet" instead.
 */
function toCustomerRecord(s) {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    masked: maskCustomer(s.phone),
    email: s.email ?? null,
    address: s.address ?? null,
    addedBy: s.addedBy ?? null,
    addedAtMs: s.atMs,
    storeId: s.storeId ?? PRIMARY_STORE_ID,
    // How this contact reached the shop (design review 3, item 13). A hand-entered record
    // is a walk-in or a referral by definition — that is exactly what the Add-customer
    // form is for — so it records its own rather than being guessed at later.
    sourceType: s.sourceType ?? 'walk_in',
    // The shop owner's own read of how keen they are (design review 3, item 12). Kept
    // SEPARATE from `cli`: that is an AI score we do not have for a typed-in contact, and
    // dressing a hand-set 'hot' up as a number would invent precision nobody measured.
    intent: s.intent ?? null,
    cli: null,
    band: null,
    value: null,
    category: null,
    categoryKey: null,
    aiGuess: null,
    aiGuessKey: null,
    firstSeenAtMs: s.atMs,
    lastSeenAtMs: s.atMs,
    callCount: 0,
    reviewSent: false,
    reviewed: false,
    timeline: [],
    notes: restoredNotesFor(s.id),
  }
}

/** Every hand-entered customer this device holds, rebuilt against THIS session's clock. */
function restoredCustomers() {
  return readStoredCustomers()
    .filter(s => s && typeof s.id === 'string' && typeof s.name === 'string'
      && isIndianMobile(s.phone) && Number.isFinite(s.atMs))
    .map(toCustomerRecord)
}

// Seed offsets → real timestamps, once at module load (see calls.js for why).
// The resolved field is `*AtMs` and never overwrites the old display string (`entry.at`
// is still "9:34 AM today" until the UI switches over).
//
// As in calls.js, these resolved objects are the ONE copy of each customer: addCustomerNote()
// pushes onto `RESOLVED[i].notes`, and a screen holding the record sees the new note.
// HYDRATION TOLERANCE: rows from Supabase (src/data/hydrate.js) already carry
// real `*AtMs` instants; seed rows carry offsets. Prefer the real instant.
//
// Hand-entered customers are appended after the seed's, and deduped against it by id: on a
// live backend the row addCustomer() wrote comes back through hydration AND out of local
// storage, and the CRM must not show the same person twice.
const RESOLVED = CUSTOMERS.map(c => ({
  ...c,
  // Which branch this customer belongs to — see the note on PRIMARY_STORE_ID.
  storeId: c.storeId ?? PRIMARY_STORE_ID,
  firstSeenAtMs: c.firstSeenAtMs ?? resolveAt(c.firstSeenOffsetMs),
  lastSeenAtMs: c.lastSeenAtMs ?? resolveAt(c.lastSeenOffsetMs),
  timeline: c.timeline.map(e => ({ ...e, atMs: e.atMs ?? resolveAt(e.atOffsetMs) })),
  // Seeded notes, then whatever the manager wrote in an earlier session.
  // The id filter dedupes the hydrated case: a note addCustomerNote() wrote to
  // BOTH the backend and local storage comes back from both on the next boot.
  notes: [
    ...(c.notes || []).map(n => ({ ...n, atMs: n.atMs ?? resolveAt(n.atOffsetMs) })),
    ...restoredNotesFor(c.id).filter(n => !(c.notes || []).some(s => s.id === n.id)),
  ],
}))
RESOLVED.push(...restoredCustomers().filter(r => !RESOLVED.some(c => c.id === r.id)))

/** All customer profiles (callers + review-link recipients). */
export function getCustomers(storeId) {
  return storeId ? RESOLVED.filter(c => c.storeId === storeId) : RESOLVED
}

/** One customer by id. */
export function getCustomerById(id) {
  return RESOLVED.find(c => c.id === id) || null
}

/**
 * The notes a manager recorded against a customer, newest first.
 * Each note: `{ id, text, atOffsetMs, atMs, author }`.
 */
export function getCustomerNotes(customerOrId) {
  const c = typeof customerOrId === 'string' ? getCustomerById(customerOrId) : customerOrId
  return [...(c?.notes || [])].sort((a, b) => b.atMs - a.atMs)
}

/**
 * The raw digits to dial or message this customer on — the ONE door the unmasked number
 * leaves by.
 *
 * Every screen renders `customer.masked`. Nothing renders this. It exists so "Call back"
 * can build a real `tel:` and the review link a real `wa.me`/`sms:` target, which is the
 * difference between a button that works and a button that asks the manager to type a
 * number the CRM is already holding.
 *
 * Routing it through one named function rather than letting screens read `customer.phone`
 * directly is the point: `grep customerDialDigits` is the honest answer to "where does
 * the real number get used?", and it is why the change below took one line.
 *
 * ------------------------------------------------------------
 * WHAT THIS RETURNS ON A LIVE BACKEND: null.
 *
 * `customers.phone` is consumer PII and anon — a key that ships in the bundle — can no
 * longer read it (supabase/migrations/0002_harden_rls.sql). Hydrated records carry the
 * masked form and nothing else, so this finds no digits and says so.
 *
 * WE DID NOT ADD AN RPC THAT HANDS BACK ONE CUSTOMER'S NUMBER ON DEMAND. It would have
 * kept the button working, and it would have re-opened the exact hole: this app has no
 * auth, `customers_public` publishes every customer `id`, and a loop over those ids
 * against such an RPC is the same full dump with a log line attached. A disclosure needs
 * somebody to authorise it, and there is nobody to ask yet. When real auth lands (the
 * STEP 3 block in that migration), the honest version is a server-side click-to-call that
 * BRIDGES the two parties and still never returns digits — and it plugs in here.
 *
 * So the UI degrades truthfully instead: apps/web/src/screens/Customers.jsx already draws
 * a disabled "Call back" and an empty (not pre-filled) review-link field for exactly this
 * case — "we hold no number" — and the masked number keeps rendering everywhere a human
 * reads one. Nothing fabricates a number, and no `tel:` link dials the wrong person.
 *
 * Seed mode is unaffected: the fixture's numbers are nobody's, and the button works.
 *
 * @returns 10 digits, or null when we hold no number.
 */
export function customerDialDigits(customerOrId) {
  const c = typeof customerOrId === 'string' ? getCustomerById(customerOrId) : customerOrId
  const digits = phoneDigits(c?.phone)
  return isIndianMobile(digits) ? digits : null
}

/** Whatever was typed, pasted or stored, reduced to the digits we judge a number on. */
function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Is this a real Indian mobile number? Ten digits, starting 6–9.
 *
 * THE ONE COPY of this rule. It was written twice — inline in customerDialDigits() above,
 * and again as a screen-local helper in apps/web/src/screens/Customers.jsx for the review-
 * link builder — which is two places to disagree about what a valid number is. Both now
 * call this; the screen imports it through the data barrel like everything else.
 *
 * Tolerant of punctuation on the way in (`98450 12342`) because a human typing or pasting
 * a number adds spaces and hyphens. NOT tolerant of a country code: '+919880142231'
 * reduces to twelve digits and is refused rather than silently truncated to something we
 * would then dial. The `[6-9]` head is also what stops a masked string
 * ('+91 ●●●●● ●●775' → '91775') from ever being mistaken for a dialable number.
 */
export function isIndianMobile(value) {
  return /^[6-9]\d{9}$/.test(phoneDigits(value))
}

/**
 * Is this an email address we should accept?
 *
 * Deliberately not RFC 5322: the job is to catch the typo the manager just made
 * ('rajesh@gmail', 'rajesh gmail.com', 'rajesh@@gmail.com'), not to prove the address
 * exists — only sending mail can do that, and pretending otherwise with a 200-character
 * regex is theatre. Requires a local part, a domain, and a ≥2-letter TLD.
 *
 * Kept byte-for-byte diffable with `customers_email_check` in
 * supabase/migrations/0004_customer_contact_fields.sql — the database asserts the same
 * shape for callers that never touch this form.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/
const EMAIL_MAX = 254   // RFC 5321 §4.5.3.1
const NAME_MAX = 120    // same ceiling customer_notes.author carries
const ADDRESS_MAX = 500

export function isEmailAddress(value) {
  const s = String(value ?? '').trim()
  return s.length > 0 && s.length <= EMAIL_MAX && EMAIL_RE.test(s)
}

let noteSeq = 0

/**
 * Append a note to a customer — what the manager jotted down during the conversation.
 *
 * PERSISTS: the note survives a reload (storage seam, see the note store above). Still
 * behind this boundary, so going live means swapping the body for an API call and changing
 * nothing on any screen.
 *
 * The text is whatever the manager typed and is stored verbatim — never keyed, never
 * translated. Author defaults to the signed-in user.
 *
 * @returns the new note, or null if the customer or the text is missing.
 */
export function addCustomerNote(customerId, text, author) {
  const customer = getCustomerById(customerId)
  const body = String(text ?? '').trim()
  if (!customer || !body) return null

  const offset = nowOffsetMs()
  const note = {
    id: `nt-${customerId}-${Date.now().toString(36)}-${noteSeq++}`,
    text: body,
    atOffsetMs: offset,
    atMs: resolveAt(offset),
    author: author || getCurrentUser().name,
  }
  // In-memory first so a screen holding this record re-renders with it, then to storage so
  // the next session still has it. Both, or the note is only half-saved.
  customer.notes.push(note)
  persistNote(customerId, note)
  // Live backend: mirror, fire-and-forget — the local write above stays the
  // synchronous truth. (Same id both sides; the RESOLVED merge dedupes on it.)
  const sb = liveClient()
  if (sb) {
    sb.from('customer_notes').insert({
      id: note.id,
      customer_id: customerId,
      author: note.author,
      body: note.text,
      at: new Date(note.atMs).toISOString(),
    }).throwOnError().then(null, (e) => console.warn('[data] supabase addCustomerNote failed:', e))
  }
  // Pushed onto a shared array in place — invisible to React until we say so.
  emitChange()
  return note
}

// ============================================================
// ADD A CUSTOMER
//
// PM feedback: "Flow of addition new customer is missing. While adding new customer,
// record customer details: NAME, PHONE NUMBER, EMAIL, Address."
//
// Everything else in this CRM arrives because somebody rang the shop. This is the one
// door a record comes in through that the platform did not observe — the walk-in, the
// referral, the number a manager was handed on paper — so it is also the one place the
// data can be wrong in ways nothing downstream will catch. Hence the refusals below.
//
// ------------------------------------------------------------
// WHAT IS REQUIRED, AND WHY THE OTHER TWO ARE NOT
//
//   NAME    required. A record with no name is the ANONYMOUS-CALLER case, and that row
//           is created by the call pipeline, not by a person typing into a form. If you
//           are typing, you know who they are.
//   PHONE   required. The CRM exists to reach people; a contact with no number is a note.
//   EMAIL   optional, validated when present.
//   ADDRESS optional, validated when present.
//
// The last two are optional ON PURPOSE, and it is the more honest reading of the
// feedback: the fields must EXIST and be RECORDED, which they now are. Making them
// mandatory would mean a dealer with a walk-in customer who has no email either cannot
// save the contact at all, or types 'na@na.com' — and a CRM full of na@na.com is worse
// than a CRM with an empty column, because the empty column is legible as "we don't know".
//
// ------------------------------------------------------------
// DUPLICATES ARE BLOCKED, NOT MERGED.
//
// Three reasons, in order of how much they settle it:
//
//  1. THE DATABASE ALREADY DECIDED. 0003_schema_fixes.sql ships
//     `customers_store_phone_uniq` — unique (store_id, phone) where phone is not null.
//     A merge would mean writing a row Postgres will reject, and the write-through below
//     is fire-and-forget, so the rejection would be swallowed: the manager would see a
//     customer on screen that the backend never accepted. Blocking is the only outcome
//     the client and the database agree on.
//  2. A MERGE DESTROYS EVIDENCE. The existing record carries a call history, a score and
//     the manager's own notes. Silently folding a hand-typed name into it overwrites a
//     record the platform observed with one a human half-remembered, and nothing on any
//     screen would say that happened.
//  3. THE REFUSAL IS MORE USEFUL THAN THE MERGE. The manager is told the customer is
//     already in the book and handed the id, so the UI opens the record he actually
//     wanted. That is what he was trying to do.
//
// A LAST-3 COLLISION IS NOT A DUPLICATE. Two different numbers can mask to the same
// '+91 ●●●●● ●●231' — the seed itself holds cust-231 and cust-231b, and the list warns
// about it. The check below compares FULL digits, so those two remain two people.
//
// KNOWN GAP, on a hydrated backend only: hydrated records carry no raw `phone` (0002
// revoked the column), so this check cannot see their numbers and will not catch a
// duplicate of one. The unique index is the backstop there, and it refuses the insert —
// see the write-through's warning below. In seed mode, which is what this build runs,
// the check is exact.
// ============================================================

/** The refusals, built in one place so wording, key and discriminator can never drift. */
const refuse = (reason, error, errorKey, extra) =>
  ({ ok: false, reason, error, errorKey, ...extra })

let addedSeq = 0

/**
 * Create a customer from details a manager typed in.
 *
 * Mutates the in-memory record set FIRST (so a screen holding the list re-renders with
 * the new row), then persists through the storage seam (so it survives the reload), then
 * mirrors to Supabase when a client is live, then emits so every other screen re-reads.
 * Same order, and the same reasoning, as addCustomerNote() above.
 *
 * @param details `{ name, phone, email, address }` — raw, as typed. Trimmed here.
 * @param author  who is adding them; defaults to the signed-in user.
 * @returns `{ ok: true, customer }`
 *        | `{ ok: false, reason, error, errorKey, existingId? }`
 *
 * `reason` is the stable discriminator ('name' | 'phone' | 'email' | 'address' |
 * 'duplicate'); render the message as `t(res.errorKey, { defaultValue: res.error })`,
 * the same contract resolveStoreCode() uses.
 */
export function addCustomer(details = {}, author) {
  const name = String(details.name ?? '').trim()
  const digits = phoneDigits(details.phone)
  const email = String(details.email ?? '').trim()
  const address = String(details.address ?? '').trim()
  // Optional, and only ever one of the three — anything else is dropped rather than
  // stored as a band no screen knows how to render.
  const intent = CUSTOMER_INTENTS.includes(details.intent) ? details.intent : null

  if (!name) {
    return refuse('name', 'Enter the customer’s name.', 'customers.addErrorName')
  }
  if (name.length > NAME_MAX) {
    return refuse('name', `Keep the name under ${NAME_MAX} characters.`, 'customers.addErrorNameLong')
  }
  if (!isIndianMobile(digits)) {
    return refuse('phone', 'Enter a 10-digit mobile number starting 6–9.', 'customers.addErrorPhone')
  }
  if (email && !isEmailAddress(email)) {
    return refuse('email', 'That doesn’t look like an email address — check for a typo.', 'customers.addErrorEmail')
  }
  if (address.length > ADDRESS_MAX) {
    return refuse('address', `Keep the address under ${ADDRESS_MAX} characters.`, 'customers.addErrorAddressLong')
  }

  const existing = RESOLVED.find(c => phoneDigits(c.phone) === digits)
  if (existing) {
    return refuse(
      'duplicate',
      'That number is already in your customer book.',
      'customers.addErrorDuplicate',
      { existingId: existing.id },
    )
  }

  const atMs = Date.now()
  const stored = {
    id: `cust-add-${atMs.toString(36)}-${addedSeq++}`,
    name,
    phone: digits,
    email: email || null,
    address: address || null,
    addedBy: author || getCurrentUser().name,
    // The branch the manager was looking at when they typed it in. Aggregate view has
    // no single branch, so the caller passes one explicitly (see Customers.jsx).
    storeId: details.storeId || PRIMARY_STORE_ID,
    // Typed into the Add-customer form means they walked in or were referred.
    sourceType: 'walk_in',
    intent,
    atMs,
  }
  const customer = toCustomerRecord(stored)

  // In-memory first so a screen holding the list re-renders with it, then to storage so
  // the next session still has it. Both, or the customer is only half-saved.
  RESOLVED.push(customer)
  persistCustomer(stored)

  // Live backend: mirror, fire-and-forget — the local write above stays the synchronous
  // truth. (Same id both sides; the RESOLVED merge at module scope dedupes on it.)
  const sb = liveClient()
  if (sb) {
    sb.from('customers').insert({
      id: customer.id,
      store_id: getCurrentUser().store.id,
      seq: RESOLVED.length,
      name: customer.name,
      phone: stored.phone,
      email: stored.email,
      address: stored.address,
      first_seen_at: new Date(atMs).toISOString(),
      last_seen_at: new Date(atMs).toISOString(),
      added_by: stored.addedBy,
      // NOTHING ELSE. cli / band / value / category / call_count are not in the anon
      // column grant (0004 section C) and a hand-entered contact has no honest value
      // for any of them — supplying one would be inventing a lead.
    }).throwOnError().then(null, (e) => console.warn(
      // The two failures worth telling them apart: 23505 is the unique index in 0003
      // catching a duplicate this client could not see (hydrated rows carry no raw
      // number), anything else is a grant/policy problem in 0004. The local record
      // STAYS either way — throwing away something the manager just typed because a
      // background write failed is the one outcome worse than an out-of-sync backend.
      e?.code === '23505'
        ? '[data] supabase addCustomer rejected: that number already exists at this store'
        : '[data] supabase addCustomer failed:', e,
    ))
  }

  emitChange()
  return { ok: true, customer }
}

/**
 * Was this record typed in by a manager rather than observed by the platform?
 *
 * The screens ask because a hand-entered contact legitimately has no score, no AI read
 * and no history, and must render as "nothing here yet" rather than as a customer whose
 * numbers all happen to be zero.
 */
export function isManuallyAdded(customer) {
  return !!customer?.addedBy
}
