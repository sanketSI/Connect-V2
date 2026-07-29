// Realistic seed data for the SingleInterface "Zero Business Loss" prototype.
//
// ------------------------------------------------------------
// i18n CONTRACT — read before adding a record
//
// This file is the raw-data adapter behind src/data. Screens read it once at import
// time (`const MISSED_CALLS = getMissedCalls()` at module scope), so NOTHING here may
// be translated in place: an i18next.t() call at this layer would freeze at boot and
// never follow a language switch. The rules that fall out of that:
//
//  • User-visible PROSE carries a `*Key` sibling holding a catalog key
//    (`intentReason` + `intentReasonKey`). The English field STAYS as the fallback;
//    the UI renders `t(rec.fooKey, { defaultValue: rec.foo })` at render time.
//  • One key per unique English string — repeats share it (`seed.category.smartTv`).
//  • NOT keyed: people's names, store/brand names, masked numbers, review bodies and
//    AI replies (real customer words), and anything a dealer typed. Translating those
//    would be putting words in someone's mouth.
//  • TIMES are offsets (`atOffsetMs`), never strings. src/data resolves them to real
//    timestamps; src/data/format.js renders them via Intl. See the TIME section there.
//  • Values that round-trip into stored profile data (CATEGORY_OPTIONS, attribute
//    options) stay English — they are keys in disguise, compared with `sel.includes(opt)`.
//    Translate them for DISPLAY ONLY via categoryOptionKey()/attributeOptionKey().
// ------------------------------------------------------------

export const PRIMARY_USER = {
  name: 'Rajesh Kumar',
  initials: 'RK',
  role: 'manager', // single-store manager
  phone: '+91 98•••••342',
  store: {
    id: 'lks-ind',
    name: 'Lakshmi Electronics',
    branch: 'Indiranagar',
    city: 'Bangalore',
    address: '127, 100 Feet Road, Indiranagar, Bangalore 560038',
    plusCode: 'XGRX+QF Bangalore, Karnataka',
    hours: 'Mon–Sat · 10:00 AM – 9:30 PM',
    category: 'Consumer Electronics Store',
    brand: 'Lakshmi Electronics',
  },
}

export const CLUSTER_STORES = [
  { id: 'lks-ind', name: 'Lakshmi Electronics', branch: 'Indiranagar', city: 'Bangalore', missed: 7, answered: 14, recovered: 5, recovery: 71 },
  { id: 'lks-kor', name: 'Lakshmi Electronics', branch: 'Koramangala', city: 'Bangalore', missed: 11, answered: 9, recovered: 5, recovery: 45 },
  { id: 'lks-jay', name: 'Lakshmi Electronics', branch: 'Jayanagar', city: 'Bangalore', missed: 6, answered: 13, recovered: 4, recovery: 67 },
]

export const CITY_STORES = [
  { id: 'lks-ind', name: 'Indiranagar', total: 21, missed: 7, answered: 14, recovered: 5, recovery: 71, manager: 'Rajesh Kumar', nps: 62, reviews: 38 },
  { id: 'lks-kor', name: 'Koramangala', total: 20, missed: 11, answered: 9, recovered: 4, recovery: 36, manager: 'Anita Reddy', nps: 41, reviews: 22 },
  { id: 'lks-jay', name: 'Jayanagar', total: 19, missed: 6, answered: 13, recovered: 4, recovery: 67, manager: 'Suresh Iyer', nps: 58, reviews: 31 },
  { id: 'lks-whi', name: 'Whitefield', total: 24, missed: 14, answered: 10, recovered: 5, recovery: 38, manager: 'Priya Nair', nps: 39, reviews: 18 },
  { id: 'lks-hsr', name: 'HSR Layout', total: 17, missed: 5, answered: 12, recovered: 5, recovery: 74, manager: 'Vikram Shetty', nps: 67, reviews: 41 },
]

export const REGIONAL_CITIES = [
  { id: 'blr', name: 'Bangalore', stores: 5, missed: 43, answered: 58, recovered: 23, recovery: 53, head: 'Rajesh Kumar' },
  { id: 'che', name: 'Chennai', stores: 4, missed: 31, answered: 49, recovered: 22, recovery: 71, head: 'Lakshmi Subramanian' },
  { id: 'hyd', name: 'Hyderabad', stores: 6, missed: 52, answered: 71, recovered: 30, recovery: 58, head: 'Naveen Reddy' },
  { id: 'cbe', name: 'Coimbatore', stores: 3, missed: 18, answered: 38, recovered: 13, recovery: 72, head: 'Karthik Raman' },
]

// Source palette — drives the chip color
export const SOURCES = {
  SingleInterface: { label: 'SingleInterface', dot: '#0070FC', text: '#9DC2FF' },
  'Times of India': { label: 'Times of India', dot: '#F97316', text: '#FFB68A' },
  Google: { label: 'Google', dot: '#34A853', text: '#A2E1B0' },
  Facebook: { label: 'Facebook', dot: '#1877F2', text: '#A6C8FF' },
  Justdial: { label: 'Justdial', dot: '#EAB308', text: '#FCD34D' },
}

function maskNumber(last) {
  return `+91 •••••${last}`
}

/**
 * The CRM's privacy-masked display form, DERIVED from the real number: the last three
 * digits, everything else hidden. `+91 9886054775` → `+91 ●●●●● ●●775`.
 *
 * Customer records hold a real `phone` (it is how you actually reach someone) and show
 * this. Deriving rather than storing both is the point: a hand-written `masked` can drift
 * out of step with the number it claims to mask, and then the app is confidently showing
 * the wrong three digits. Here it cannot.
 *
 * Three digits is a deliberate ceiling, not an accident — enough for the dealer to
 * recognise a contact he already knows, not enough to reconstruct the number from the
 * screen. The raw number never renders; it only ever builds a `tel:` / `wa.me` target.
 *
 * EXPORTED so a customer created at runtime derives `masked` through the SAME rule the
 * fixture does — addCustomer() in src/data/customers.js calls this. A second copy of the
 * masking rule is exactly the drift this function exists to prevent, and a hand-rolled
 * one in the mutator would be the first record on the screen showing the wrong digits.
 */
export function maskCustomer(phone) {
  const s = String(phone || '').replace(/\D/g, '')
  return `+91 ●●●●● ●●${s.slice(-3)}`
}

/** Seed offsets are written as "N minutes before now" — the getters resolve them. */
const minsAgo = (m) => -m * 60_000
const hoursAgo = (h) => minsAgo(h * 60)
const daysAgo = (d) => hoursAgo(d * 24)

/**
 * Transcript turns for an ANSWERED call.
 *
 * Each turn is placed `sec` seconds into the call, so it inherits the same
 * "offset before now" convention every other record uses and resolves through the
 * same resolveAt() — no second time system. Written as [speaker, sec, text] triples
 * to keep the seed readable; the emitted shape is { speaker, text, atOffsetMs }.
 */
const turns = (callOffsetMs, rows) =>
  rows.map(([speaker, sec, text]) => ({ speaker, text, atOffsetMs: callOffsetMs + sec * 1000 }))

// Product-interest categories — a small closed set shared by calls, customers and IVR
// drops. One key each, reused wherever the same interest appears.
export const CATEGORY_KEYS = {
  'Air Conditioner': 'seed.category.airConditioner',
  'Smart TV': 'seed.category.smartTv',
  Refrigerator: 'seed.category.refrigerator',
  'Washing Machine': 'seed.category.washingMachine',
  Headphones: 'seed.category.headphones',
  Microwave: 'seed.category.microwave',
  Accessories: 'seed.category.accessories',
  Browse: 'seed.category.browse',
  'Spam?': 'seed.category.spam',
  Service: 'seed.category.service',
}

// ============================================================
// CALL REASONS — WHY the customer rang.
//
// A small CLOSED set, reused across every call record, because the whole point is the
// "why people called" roll-up: an open-ended string would give a bar chart of one-offs.
//
// Where the reason comes from depends on the outcome, and that difference is honest:
//   • ATTENDED calls — read off the call script (the transcript is right there on the
//     record; every reason below is consistent with the words in it).
//   • MISSED calls / IVR drops — nobody spoke, so there is no script. The reason is
//     inferred from the campaign context we DO have (source, ad, product interest,
//     repeat pattern) — the same signal `intentReason` is already built from.
//
// Same shape as CATEGORY_KEYS: the English value is the identity, the key is the display.
// ============================================================
export const CALL_REASON_KEYS = {
  'Price enquiry': 'seed.callReason.priceEnquiry',
  'Stock availability': 'seed.callReason.stockAvailability',
  'EMI options': 'seed.callReason.emiOptions',
  'Delivery delay': 'seed.callReason.deliveryDelay',
  'Installation request': 'seed.callReason.installationRequest',
  'Warranty / service': 'seed.callReason.warrantyService',
  'Spam / unwanted': 'seed.callReason.spam',
}

/** The closed set, in the order a manager would want it listed. */
export const CALL_REASONS = Object.keys(CALL_REASON_KEYS)

// Missed calls — for today, mixed sources, with CLI ("chance to buy") 0-100
export const MISSED_CALLS = [
  {
    id: 'mc-01',
    customerId: 'cust-231',
    masked: maskNumber('231'),
    fullMaskedDisplay: '+91 ●●●●● ●●231',
    minutesAgo: 12,
    time: '11:48 AM',
    atOffsetMs: minsAgo(12),
    source: 'SingleInterface',
    repeats: 3,
    repeatHistory: ['09:34 AM', '10:42 AM', '11:48 AM'],
    repeatHistoryOffsetsMs: [minsAgo(146), minsAgo(78), minsAgo(12)],
    cli: 92,
    intent: 'high',
    intentReason: 'Called 3 times in 2 hours — sounds urgent',
    intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 38000,
    category: 'Air Conditioner',
    categoryKey: 'seed.category.airConditioner',
    // No conversation happened, so there is no tone to read → 'neutral'. See CALL_REASONS.
    sentiment: 'neutral',
    callReason: 'Price enquiry',
    callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open',
    reviewLinkSent: false,
  },
  {
    id: 'mc-02',
    customerId: 'cust-087',
    masked: maskNumber('087'),
    fullMaskedDisplay: '+91 ●●●●● ●●087',
    minutesAgo: 38,
    time: '11:22 AM',
    atOffsetMs: minsAgo(38),
    source: 'Times of India',
    repeats: 1,
    cli: 86,
    intent: 'high',
    intentReason: 'Newspaper offer · called within 4 min of ad',
    intentReasonKey: 'seed.reason.newspaperAd',
    estValue: 52000,
    category: 'Smart TV',
    categoryKey: 'seed.category.smartTv',
    sentiment: 'neutral',
    callReason: 'Stock availability',
    callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'open',
    reviewLinkSent: false,
  },
  {
    id: 'mc-03',
    customerId: 'cust-554',
    masked: maskNumber('554'),
    fullMaskedDisplay: '+91 ●●●●● ●●554',
    minutesAgo: 64,
    time: '10:56 AM',
    atOffsetMs: minsAgo(64),
    source: 'Google',
    repeats: 2,
    repeatHistory: ['Yesterday 6:12 PM', '10:56 AM'],
    repeatHistoryOffsetsMs: [minsAgo(1068), minsAgo(64)],
    cli: 78,
    intent: 'high',
    intentReason: 'Same person called yesterday too',
    intentReasonKey: 'seed.reason.calledYesterdayToo',
    estValue: 21000,
    category: 'Refrigerator',
    categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral',
    callReason: 'EMI options',
    callReasonKey: 'seed.callReason.emiOptions',
    leadStatus: 'open',
    reviewLinkSent: false,
  },
  // Missed, called back, WON — the product's own loop, so the recovery rate on a store
  // card is a real derived number instead of a decorative constant. See data/network.js.
  {
    id: 'mc-04',
    customerId: 'cust-912',
    masked: maskNumber('912'),
    fullMaskedDisplay: '+91 ●●●●● ●●912',
    minutesAgo: 95,
    time: '10:25 AM',
    atOffsetMs: minsAgo(95),
    source: 'SingleInterface',
    repeats: 1,
    cli: 58,
    intent: 'medium',
    intentReason: 'First call · weekday morning',
    intentReasonKey: 'seed.reason.firstCallWeekday',
    estValue: 14000,
    category: 'Washing Machine',
    categoryKey: 'seed.category.washingMachine',
    sentiment: 'neutral',
    callReason: 'Price enquiry',
    callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted',
    reviewLinkSent: false,
  },
  {
    id: 'mc-05',
    customerId: 'cust-446',
    masked: maskNumber('446'),
    fullMaskedDisplay: '+91 ●●●●● ●●446',
    minutesAgo: 142,
    time: '9:38 AM',
    atOffsetMs: minsAgo(142),
    source: 'Facebook',
    repeats: 1,
    cli: 54,
    intent: 'medium',
    intentReason: 'Came from a Facebook offer',
    intentReasonKey: 'seed.reason.facebookOffer',
    estValue: 9500,
    category: 'Headphones',
    categoryKey: 'seed.category.headphones',
    sentiment: 'neutral',
    callReason: 'Stock availability',
    callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'open',
    reviewLinkSent: false,
  },
  {
    id: 'mc-06',
    customerId: 'cust-103',
    masked: maskNumber('103'),
    fullMaskedDisplay: '+91 ●●●●● ●●103',
    minutesAgo: 178,
    time: '9:02 AM',
    atOffsetMs: minsAgo(178),
    source: 'SingleInterface',
    repeats: 1,
    cli: 32,
    intent: 'low',
    intentReason: 'Hung up quickly · just looking around',
    intentReasonKey: 'seed.reason.hungUpQuickly',
    estValue: 4500,
    category: 'Accessories',
    categoryKey: 'seed.category.accessories',
    sentiment: 'neutral',
    callReason: 'Stock availability',
    callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'open',
    reviewLinkSent: false,
  },
  {
    id: 'mc-07',
    customerId: 'cust-770',
    masked: maskNumber('770'),
    fullMaskedDisplay: '+91 ●●●●● ●●770',
    minutesAgo: 215,
    time: '8:25 AM',
    atOffsetMs: minsAgo(215),
    source: 'Justdial',
    repeats: 2,
    repeatHistory: ['Yesterday 7:48 PM', '8:25 AM'],
    repeatHistoryOffsetsMs: [minsAgo(972), minsAgo(215)],
    cli: 64,
    intent: 'medium',
    intentReason: 'Tried Justdial yesterday and again today',
    intentReasonKey: 'seed.reason.justdialRepeat',
    estValue: 17500,
    category: 'Microwave',
    categoryKey: 'seed.category.microwave',
    sentiment: 'neutral',
    callReason: 'Stock availability',
    callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'converted',
    reviewLinkSent: false,
  },
  {
    id: 'mc-08',
    customerId: 'cust-318',
    masked: maskNumber('318'),
    fullMaskedDisplay: '+91 ●●●●● ●●318',
    minutesAgo: 256,
    time: '7:44 AM',
    atOffsetMs: minsAgo(256),
    source: 'Google',
    repeats: 1,
    cli: 38,
    intent: 'low',
    intentReason: 'Early morning · just exploring',
    intentReasonKey: 'seed.reason.earlyMorning',
    estValue: 6800,
    category: 'Browse',
    categoryKey: 'seed.category.browse',
    sentiment: 'neutral',
    callReason: 'Price enquiry',
    callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open',
    reviewLinkSent: false,
  },
  {
    id: 'mc-09',
    customerId: 'cust-602',
    masked: maskNumber('602'),
    fullMaskedDisplay: '+91 ●●●●● ●●602',
    minutesAgo: 311,
    time: '6:49 AM',
    atOffsetMs: minsAgo(311),
    source: 'SingleInterface',
    repeats: 1,
    cli: 12,
    intent: 'low',
    intentReason: 'Looks like spam · auto-flagged',
    intentReasonKey: 'seed.reason.looksLikeSpam',
    estValue: 0,
    category: 'Spam?',
    categoryKey: 'seed.category.spam',
    spam: true,
    sentiment: 'neutral',
    callReason: 'Spam / unwanted',
    callReasonKey: 'seed.callReason.spam',
    // A robocall is never going to convert — the one missed call that is honestly 'lost'.
    leadStatus: 'expired',
    reviewLinkSent: false,
  },

  // ── KORAMANGALA + HSR LAYOUT missed calls (see the note in CUSTOMERS) ────────
  // ---- MYSORE / MUMBAI / PUNE ---------------------------------------------
  // Records for the three stores added for the multi-state roll-up. Without these the
  // state and city levels would sum decorative fields again — the exact drift the
  // network module exists to kill.
  // ---- JAYANAGAR ------------------------------------------------------------
  // The single-store manager's shop. A handful of records so that build opens on a
  // working screen rather than an empty state — one still open, one already won, one
  // that went cold, which is enough for the lifecycle chips to all mean something.
  {
    id: 'mc-jay1', storeId: 'lks-jay', kind: 'missed',
    masked: maskNumber('506'), fullMaskedDisplay: '+91 ●●●●● ●●506',
    minutesAgo: 38, time: '—', atOffsetMs: minsAgo(38),
    source: 'SingleInterface', repeats: 2,
    cli: 74, intent: 'high',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 42000, category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'mc-jay2', storeId: 'lks-jay', kind: 'missed',
    masked: maskNumber('827'), fullMaskedDisplay: '+91 ●●●●● ●●827',
    minutesAgo: 190, time: '—', atOffsetMs: minsAgo(190),
    source: 'SingleInterface', repeats: 1,
    cli: 58, intent: 'medium',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 21000, category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: false,
  },
  {
    id: 'mc-jay3', storeId: 'lks-jay', kind: 'missed',
    masked: maskNumber('193'), fullMaskedDisplay: '+91 ●●●●● ●●193',
    minutesAgo: 400, time: '—', atOffsetMs: minsAgo(400),
    source: 'SingleInterface', repeats: 1,
    cli: 46, intent: 'medium',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 15000, category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'mc-mys1', storeId: 'lks-mys', kind: 'missed',
    masked: maskNumber('341'), fullMaskedDisplay: '+91 ●●●●● ●●341',
    minutesAgo: 62, time: '—', atOffsetMs: minsAgo(62),
    source: 'SingleInterface', repeats: 1,
    cli: 68, intent: 'high',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 34000, category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'mc-mys2', storeId: 'lks-mys', kind: 'missed',
    masked: maskNumber('772'), fullMaskedDisplay: '+91 ●●●●● ●●772',
    minutesAgo: 150, time: '—', atOffsetMs: minsAgo(150),
    source: 'SingleInterface', repeats: 1,
    cli: 51, intent: 'medium',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 18000, category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'mc-mys3', storeId: 'lks-mys', kind: 'missed',
    masked: maskNumber('118'), fullMaskedDisplay: '+91 ●●●●● ●●118',
    minutesAgo: 240, time: '—', atOffsetMs: minsAgo(240),
    source: 'SingleInterface', repeats: 1,
    cli: 73, intent: 'high',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 52000, category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: false,
  },
  {
    id: 'mc-bom1', storeId: 'lks-bom', kind: 'missed',
    masked: maskNumber('214'), fullMaskedDisplay: '+91 ●●●●● ●●214',
    minutesAgo: 25, time: '—', atOffsetMs: minsAgo(25),
    source: 'SingleInterface', repeats: 1,
    cli: 84, intent: 'high',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 72000, category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'mc-bom2', storeId: 'lks-bom', kind: 'missed',
    masked: maskNumber('639'), fullMaskedDisplay: '+91 ●●●●● ●●639',
    minutesAgo: 88, time: '—', atOffsetMs: minsAgo(88),
    source: 'SingleInterface', repeats: 1,
    cli: 77, intent: 'high',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 45000, category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'mc-bom3', storeId: 'lks-bom', kind: 'missed',
    masked: maskNumber('503'), fullMaskedDisplay: '+91 ●●●●● ●●503',
    minutesAgo: 175, time: '—', atOffsetMs: minsAgo(175),
    source: 'SingleInterface', repeats: 1,
    cli: 49, intent: 'medium',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 21000, category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'mc-bom4', storeId: 'lks-bom', kind: 'missed',
    masked: maskNumber('861'), fullMaskedDisplay: '+91 ●●●●● ●●861',
    minutesAgo: 420, time: '—', atOffsetMs: minsAgo(420),
    source: 'SingleInterface', repeats: 1,
    cli: 38, intent: 'low',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 15000, category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'mc-pun1', storeId: 'lks-pun', kind: 'missed',
    masked: maskNumber('190'), fullMaskedDisplay: '+91 ●●●●● ●●190',
    minutesAgo: 48, time: '—', atOffsetMs: minsAgo(48),
    source: 'SingleInterface', repeats: 1,
    cli: 71, intent: 'high',
    intentReason: 'Enquiry from the listing', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 39000, category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: false,
  },
  {
    id: 'mc-k41', storeId: 'lks-kor', customerId: 'cust-k41',
    masked: maskNumber('341'), fullMaskedDisplay: '+91 ●●●●● ●●341',
    minutesAgo: 35, time: '11:50 AM', atOffsetMs: minsAgo(35),
    source: 'SingleInterface', repeats: 2,
    repeatHistory: ['10:05 AM', '11:50 AM'],
    repeatHistoryOffsetsMs: [minsAgo(180), minsAgo(35)],
    cli: 79, intent: 'high',
    intentReason: 'Called twice this morning', intentReasonKey: 'seed.reason.urgentThreeCalls',
    estValue: 46000, category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'mc-k58', storeId: 'lks-kor',
    masked: maskNumber('958'), fullMaskedDisplay: '+91 ●●●●● ●●958',
    minutesAgo: 64, time: '11:21 AM', atOffsetMs: minsAgo(64),
    source: 'Justdial', repeats: 1,
    cli: 61, intent: 'medium',
    intentReason: 'Justdial repeat enquiry', intentReasonKey: 'seed.reason.justdialRepeat',
    estValue: 18000, category: 'Microwave', categoryKey: 'seed.category.microwave',
    sentiment: 'neutral', callReason: 'Stock availability', callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'converted', reviewLinkSent: false,
  },
  {
    id: 'mc-k12', storeId: 'lks-kor',
    masked: maskNumber('712'), fullMaskedDisplay: '+91 ●●●●● ●●712',
    minutesAgo: 112, time: '10:33 AM', atOffsetMs: minsAgo(112),
    source: 'Google', repeats: 1,
    cli: 44, intent: 'low',
    intentReason: 'Hung up quickly', intentReasonKey: 'seed.reason.hungUpQuickly',
    estValue: 9000, category: 'Accessories', categoryKey: 'seed.category.accessories',
    sentiment: 'neutral', callReason: 'Warranty / service', callReasonKey: 'seed.callReason.warrantyService',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'mc-h18', storeId: 'lks-new', customerId: 'cust-h18',
    masked: maskNumber('918'), fullMaskedDisplay: '+91 ●●●●● ●●918',
    minutesAgo: 52, time: '11:33 AM', atOffsetMs: minsAgo(52),
    source: 'Google', repeats: 2,
    repeatHistory: ['9:40 AM', '11:33 AM'],
    repeatHistoryOffsetsMs: [minsAgo(205), minsAgo(52)],
    cli: 71, intent: 'high',
    intentReason: 'Called yesterday too', intentReasonKey: 'seed.reason.calledYesterdayToo',
    estValue: 32000, category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    sentiment: 'neutral', callReason: 'EMI options', callReasonKey: 'seed.callReason.emiOptions',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'mc-h63', storeId: 'lks-new',
    masked: maskNumber('463'), fullMaskedDisplay: '+91 ●●●●● ●●463',
    minutesAgo: 141, time: '10:04 AM', atOffsetMs: minsAgo(141),
    source: 'Facebook', repeats: 1,
    cli: 55, intent: 'medium',
    intentReason: 'Facebook offer click', intentReasonKey: 'seed.reason.facebookOffer',
    estValue: 24000, category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    sentiment: 'neutral', callReason: 'Delivery delay', callReasonKey: 'seed.callReason.deliveryDelay',
    leadStatus: 'open', reviewLinkSent: false,
  },
]

export const CONNECTED_CALLS = [
  {
    id: 'cc-01',
    customerId: 'cust-988',
    masked: maskNumber('988'),
    time: '12:14 PM',
    minutesAgo: 6,
    atOffsetMs: minsAgo(6),
    source: 'SingleInterface',
    direction: 'inbound',
    duration: '4m 32s',
    sentiment: 'positive',
    mood: 'happy',
    cli: 88,
    summary: 'Asked about Samsung 1.5T inverter AC. Wants EMI option. Will visit Friday between 5–7 PM.',
    summaryKey: 'seed.summary.samsungAcEmi',
    highlights: ['Wants Samsung 1.5T AC', 'Needs EMI', 'Coming Friday 5–7 PM'],
    nextStep: 'follow-up',
    nextStepLabel: 'Follow up Fri 4 PM',
    nextStepLabelKey: 'seed.nextStep.followUpFri',
    tag: 'important',
    callReason: 'EMI options',
    callReasonKey: 'seed.callReason.emiOptions',
    leadStatus: 'open',
    reviewLinkSent: false,
    // Transcripts are a record of what two people actually said — customer words and the
    // manager's own words. Never keyed, for the same reason review bodies aren't.
    transcript: turns(minsAgo(6), [
      ['manager', 0, 'Lakshmi Electronics, Indiranagar. Good afternoon, how can I help you?'],
      ['customer', 8, 'Hi. I saw you have the Samsung 1.5 ton inverter AC. What is the price on that right now?'],
      ['manager', 18, 'The 1.5 ton inverter 3-star is ₹38,000 including standard installation. The 5-star one is ₹44,500.'],
      ['customer', 34, 'That is a bit more than I planned. Do you have EMI on it?'],
      ['manager', 48, 'Yes — no-cost EMI for six months on most cards. On the 3-star that comes to about ₹6,350 a month.'],
      ['customer', 72, 'Okay, that is manageable. Is it in stock? I need it installed this week, the old one has completely died.'],
      ['manager', 96, 'We have three units. If you book by Friday we can install Saturday morning.'],
      ['customer', 130, 'Perfect. I will come Friday evening, around 5 or 6, after work. Can you keep one aside?'],
      ['manager', 165, 'Of course. I will note it down — Samsung 1.5 ton inverter, 3-star, held till Friday. May I have a name?'],
      ['customer', 205, 'I will call from this number when I start out. Keep it ready, that is all.'],
      ['manager', 250, 'Will do. See you Friday, sir.'],
    ]),
  },
  {
    id: 'cc-02',
    customerId: 'cust-445',
    masked: maskNumber('445'),
    time: '11:02 AM',
    minutesAgo: 78,
    atOffsetMs: minsAgo(78),
    source: 'Times of India',
    direction: 'outbound',
    duration: '2m 11s',
    sentiment: 'positive',
    mood: 'happy',
    cli: 81,
    summary: 'Called back TOI ad lead. Wants 55" LG OLED. Sent catalog on WhatsApp. Visit Saturday morning.',
    summaryKey: 'seed.summary.lgOledCatalog',
    highlights: ['LG 55" OLED', 'Catalog sent on WhatsApp', 'Visit Sat morning'],
    nextStep: 'follow-up',
    nextStepLabel: 'Send catalog · already done',
    nextStepLabelKey: 'seed.nextStep.catalogSent',
    tag: 'important',
    callReason: 'Price enquiry',
    callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open',
    reviewLinkSent: false,
    transcript: turns(minsAgo(78), [
      ['manager', 0, 'Hello, am I speaking with the caller who rang about the Times of India offer? This is Rajesh from Lakshmi Electronics.'],
      ['customer', 9, 'Yes, yes. I called in the morning but nobody picked up.'],
      ['manager', 16, 'Apologies for that — we were with customers. You were asking about the 55-inch LG?'],
      ['customer', 24, 'Correct. The OLED one in the advertisement. Is that price genuine?'],
      ['manager', 32, 'It is. ₹1,09,990 for the C-series 55-inch OLED, and that includes wall mounting.'],
      ['customer', 45, 'And the older model? My brother said there is a cheaper one.'],
      ['manager', 53, 'There is a 2023 panel at ₹94,000. Honestly, for the difference I would suggest the newer one — better panel and three-year warranty.'],
      ['customer', 70, 'Can you send me the details? I will show my wife.'],
      ['manager', 76, 'I will WhatsApp the catalogue to this number right now.'],
      ['customer', 84, 'Good. We will come Saturday morning to see it in person.'],
      ['manager', 92, 'Saturday works. Come before noon, the showroom is quieter then.'],
      ['customer', 108, 'Done. Thank you.'],
    ]),
  },
  {
    id: 'cc-03',
    customerId: 'cust-231b',
    masked: maskNumber('231'),
    time: '10:48 AM',
    minutesAgo: 92,
    atOffsetMs: minsAgo(92),
    source: 'Google',
    direction: 'inbound',
    duration: '3m 58s',
    sentiment: 'neutral',
    mood: 'okay',
    cli: 56,
    summary: 'Looking for a double-door fridge under ₹40K. Comparing brands. Will decide next week.',
    summaryKey: 'seed.summary.fridgeComparing',
    highlights: ['Budget ₹40K', 'Comparing brands', 'Decision next week'],
    nextStep: 'follow-up',
    nextStepLabel: 'Follow up Mon morning',
    nextStepLabelKey: 'seed.nextStep.followUpMon',
    callReason: 'Price enquiry',
    callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open',
    reviewLinkSent: false,
    transcript: turns(minsAgo(92), [
      ['manager', 0, 'Lakshmi Electronics, good morning.'],
      ['customer', 5, 'Hi. Do you have double-door refrigerators under 40,000?'],
      ['manager', 12, 'Several. Whirlpool, Samsung and LG all have 240 to 265 litre models in that range.'],
      ['customer', 22, 'Which one would you say is best? I am comparing online also.'],
      ['manager', 30, 'Depends on usage. The LG at ₹38,500 has the better compressor warranty — ten years. The Samsung at ₹36,000 is more energy efficient.'],
      ['customer', 62, 'Online I am seeing the LG for ₹36,900.'],
      ['manager', 78, 'That is possible, but that price usually excludes installation and the old-fridge exchange. With exchange we can come to ₹34,000.'],
      ['customer', 120, 'Okay. I need to discuss with my family first.'],
      ['manager', 150, 'Take your time. Shall I hold the exchange quote for a week?'],
      ['customer', 180, 'Yes, do that. I will decide by next week.'],
      ['manager', 210, 'I will note it down. Thank you for calling.'],
    ]),
  },
  {
    id: 'cc-04',
    customerId: 'cust-019',
    masked: maskNumber('019'),
    time: '10:11 AM',
    minutesAgo: 129,
    atOffsetMs: minsAgo(129),
    source: 'SingleInterface',
    direction: 'outbound',
    duration: '1m 04s',
    sentiment: 'negative',
    mood: 'bad',
    cli: 28,
    summary: 'Upset about delayed AC install from last month. Promised service desk callback within 24h.',
    summaryKey: 'seed.summary.acInstallDelay',
    highlights: ['Warranty issue', 'Service delayed', 'Escalated to service desk'],
    nextStep: 'important',
    nextStepLabel: 'Service follow-up · escalated',
    nextStepLabelKey: 'seed.nextStep.serviceEscalated',
    tag: 'important',
    callReason: 'Warranty / service',
    callReasonKey: 'seed.callReason.warrantyService',
    // A service complaint, not a lead — but leadStatus is a closed set, and nothing here
    // is won or lost yet.
    leadStatus: 'open',
    // Deliberately false: you do not ask a customer for a Google review mid-complaint.
    reviewLinkSent: false,
    transcript: turns(minsAgo(129), [
      ['manager', 0, 'Good morning sir, Rajesh calling from Lakshmi Electronics about your air conditioner service.'],
      ['customer', 7, 'Finally. Do you know how many times I have called? Three weeks now.'],
      ['manager', 14, 'I understand, and I am sorry. I can see the installation was booked on the 12th.'],
      ['customer', 22, 'Booked, yes. Nobody came. Twice they said today, today. I took leave from office for nothing.'],
      ['manager', 33, 'That should not have happened. I am escalating this to the service desk myself today.'],
      ['customer', 41, 'That is what the last person also said.'],
      ['manager', 46, 'This time I am giving you my word — someone will call you within 24 hours with a fixed slot. If they do not, call this number and ask for me directly.'],
      ['customer', 58, 'Fine. But this is the last time I am waiting.'],
    ]),
  },
  {
    id: 'cc-05',
    customerId: 'cust-512',
    masked: maskNumber('512'),
    time: '9:34 AM',
    minutesAgo: 166,
    atOffsetMs: minsAgo(166),
    source: 'Facebook',
    direction: 'inbound',
    duration: '1m 47s',
    sentiment: 'positive',
    mood: 'happy',
    cli: 68,
    summary: 'Young buyer asked about Sony WH-1000XM5 headphones, wanted student discount. Visiting this weekend.',
    summaryKey: 'seed.summary.sonyHeadphones',
    highlights: ['Sony WH-1000XM5', 'Festive offer shared', 'Weekend visit'],
    nextStep: 'follow-up',
    nextStepLabel: 'Follow up Sat noon',
    nextStepLabelKey: 'seed.nextStep.followUpSat',
    callReason: 'Price enquiry',
    callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open',
    // Matches CUSTOMERS cust-512: reviewSent true, reviewed false (link sent, no review yet).
    reviewLinkSent: true,
    transcript: turns(minsAgo(166), [
      ['manager', 0, 'Lakshmi Electronics, good morning.'],
      ['customer', 4, 'Hello! Do you have the Sony WH-1000XM5 headphones?'],
      ['manager', 11, 'We do, in black and silver. ₹26,990.'],
      ['customer', 18, 'Oh. Amazon has it for around 24.'],
      ['manager', 24, 'During sale periods, yes. We are at ₹24,990 this month with the festive offer — and you get the store warranty and can test them before buying.'],
      ['customer', 38, 'That is actually good. Do you have any student discount? I have a college ID.'],
      ['manager', 47, 'Bring the ID and I will see what I can do on the accessories — a case or a stand.'],
      ['customer', 56, 'Nice. I will come this weekend to try them.'],
      ['manager', 62, 'Please do. Ask for Rajesh at the audio counter.'],
      ['customer', 78, 'Thank you!'],
    ]),
  },
  {
    id: 'cc-06',
    // No customerId, deliberately. This is a robocall — there is no person on the other end
    // and no CRM record to point at. It used to claim 'cust-806', which resolved to nothing.
    masked: maskNumber('806'),
    time: '8:52 AM',
    minutesAgo: 208,
    atOffsetMs: minsAgo(208),
    source: 'Google',
    direction: 'inbound',
    duration: '0m 18s',
    sentiment: 'neutral',
    mood: 'okay',
    cli: 6,
    summary: 'Robotic voice · auto-marketing · almost certainly spam.',
    summaryKey: 'seed.summary.roboticSpam',
    highlights: ['Spam pattern auto-flagged'],
    nextStep: 'spam',
    nextStepLabel: 'Marked as spam',
    nextStepLabelKey: 'seed.nextStep.markedSpam',
    tag: 'spam',
    spam: true,
    callReason: 'Spam / unwanted',
    callReasonKey: 'seed.callReason.spam',
    leadStatus: 'expired',
    reviewLinkSent: false,
    transcript: turns(minsAgo(208), [
      ['customer', 0, 'Congratulations! Your number has been selected for a pre-approved personal loan of up to ten lakh rupees. Press one to speak to—'],
      ['manager', 11, 'Not interested.'],
    ]),
  },
  {
    id: 'cc-07',
    customerId: 'cust-775',
    masked: maskNumber('775'),
    time: 'Yesterday 7:14 PM',
    minutesAgo: 1080,
    atOffsetMs: minsAgo(1080),
    source: 'SingleInterface',
    direction: 'outbound',
    duration: '5m 21s',
    sentiment: 'positive',
    mood: 'happy',
    cli: 95,
    summary: 'Sale done! LG washing machine ₹32,500. Delivery scheduled Saturday 10 AM.',
    summaryKey: 'seed.summary.saleClosedWasher',
    highlights: ['Sale closed ₹32,500', 'Saturday 10 AM delivery'],
    nextStep: 'important',
    nextStepLabel: 'Delivery confirmed',
    nextStepLabelKey: 'seed.nextStep.deliveryConfirmed',
    tag: 'important',
    callReason: 'Price enquiry',
    callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted',
    // Matches CUSTOMERS cust-775: link sent 8:02 PM, 5★ review landed next morning.
    reviewLinkSent: true,
    transcript: turns(minsAgo(1080), [
      ['manager', 0, 'Good evening, is this Anand sir? Rajesh from Lakshmi Electronics — you called earlier this evening.'],
      ['customer', 8, 'Yes! I called around quarter to seven, the shop line was busy.'],
      ['manager', 15, 'Sorry about that, evenings get hectic. You were looking at washing machines?'],
      ['customer', 22, 'Yes, front load. Around 7 kg. My wife wants the LG one she saw at her sister’s place.'],
      ['manager', 33, 'The LG 7kg front load — good machine. We have it at ₹32,500 with the inverter motor, ten year warranty on the motor.'],
      ['customer', 48, 'Her sister paid 34-something last year I think.'],
      ['manager', 55, 'Prices came down after the new model came in. Same machine, current stock.'],
      ['customer', 88, 'Okay. And delivery? We are in HAL 2nd stage.'],
      ['manager', 120, 'Free delivery there. If you confirm today I can put you on Saturday’s route — 10 AM slot.'],
      ['customer', 150, 'Saturday morning is perfect, we are home.'],
      ['manager', 180, 'Shall I book it then? ₹32,500, delivery Saturday 10 AM, installation same day.'],
      ['customer', 220, 'Yes, book it. I will pay on delivery — card is fine?'],
      ['manager', 250, 'Card, UPI, whatever is convenient. I will send the confirmation on WhatsApp.'],
      ['customer', 290, 'Very good. Thank you Rajesh.'],
      ['manager', 305, 'Thank you sir, see you Saturday.'],
    ]),
  },

  // ── KORAMANGALA + HSR LAYOUT answered calls (see the note in CUSTOMERS) ──────
  {
    id: 'cc-mys4', storeId: 'lks-mys',
    masked: maskNumber('905'), time: '—', minutesAgo: 90, atOffsetMs: minsAgo(90),
    source: 'SingleInterface', direction: 'inbound', duration: '3m 42s',
    sentiment: 'positive', mood: 'happy', cli: 60,
    summary: 'Compared two TVs and bought the 43-inch. Paid by card.',
    highlights: [], nextStep: 'none',
    callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: true,
  },
  {
    id: 'cc-mys5', storeId: 'lks-mys',
    masked: maskNumber('447'), time: '—', minutesAgo: 135, atOffsetMs: minsAgo(135),
    source: 'SingleInterface', direction: 'inbound', duration: '1m 18s',
    sentiment: 'neutral', mood: 'neutral', cli: 44,
    summary: 'Asked about AC servicing rates. Said he would come in on the weekend.',
    highlights: [], nextStep: 'none',
    callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'cc-bom5', storeId: 'lks-bom',
    masked: maskNumber('327'), time: '—', minutesAgo: 180, atOffsetMs: minsAgo(180),
    source: 'SingleInterface', direction: 'inbound', duration: '4m 05s',
    sentiment: 'positive', mood: 'happy', cli: 66,
    summary: 'Wanted the 55-inch on exchange. Deal closed at the counter.',
    highlights: [], nextStep: 'none',
    callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: true,
  },
  {
    id: 'cc-pun2', storeId: 'lks-pun',
    masked: maskNumber('558'), time: '—', minutesAgo: 225, atOffsetMs: minsAgo(225),
    source: 'SingleInterface', direction: 'inbound', duration: '2m 51s',
    sentiment: 'positive', mood: 'happy', cli: 63,
    summary: 'Booked a 7 kg washing machine for same-day install.',
    highlights: [], nextStep: 'none',
    callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: true,
  },
  {
    id: 'cc-pun3', storeId: 'lks-pun',
    masked: maskNumber('742'), time: '—', minutesAgo: 270, atOffsetMs: minsAgo(270),
    source: 'SingleInterface', direction: 'inbound', duration: '2m 07s',
    sentiment: 'neutral', mood: 'neutral', cli: 55,
    summary: 'Enquired about a TV wall mount and price match.',
    highlights: [], nextStep: 'none',
    callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'cc-pun4', storeId: 'lks-pun',
    masked: maskNumber('416'), time: '—', minutesAgo: 315, atOffsetMs: minsAgo(315),
    source: 'SingleInterface', direction: 'inbound', duration: '0m 58s',
    sentiment: 'neutral', mood: 'neutral', cli: 47,
    summary: 'Asked opening hours and whether the AC model was in stock.',
    highlights: [], nextStep: 'none',
    callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'cc-k77', storeId: 'lks-kor', customerId: 'cust-k77',
    masked: maskNumber('877'), time: '11:02 AM', minutesAgo: 83, atOffsetMs: minsAgo(83),
    source: 'Justdial', direction: 'inbound', duration: '3m 10s',
    sentiment: 'positive', mood: 'happy', cli: 64,
    summary: 'Compared two washing machines, settled on the 7 kg front-load. Sale closed at the counter.',
    summaryKey: 'seed.summary.saleClosedWasher',
    highlights: ['7 kg front-load', 'Paid at counter'],
    nextStep: 'delivery', nextStepLabel: 'Delivery confirmed', nextStepLabelKey: 'seed.nextStep.deliveryConfirmed',
    tag: 'important',
    callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: true,
    transcript: turns(minsAgo(83), [
      ['manager', 0, 'Lakshmi Electronics, Koramangala. How can I help?'],
      ['customer', 7, 'I want a washing machine, front load. What do you have under thirty thousand?'],
      ['manager', 19, 'The 7 kg front-load is ₹27,500 with installation. There is a 6.5 kg at ₹23,000 as well.'],
      ['customer', 41, 'Is the 7 kg in stock today? I can come across now.'],
      ['manager', 58, 'Yes, two units on the floor. Come in, I will keep one aside.'],
      ['customer', 74, 'Coming in ten minutes.'],
    ]),
  },
  {
    id: 'cc-h52', storeId: 'lks-new', customerId: 'cust-h52',
    masked: maskNumber('252'), time: '10:48 AM', minutesAgo: 97, atOffsetMs: minsAgo(97),
    source: 'SingleInterface', direction: 'inbound', duration: '2m 45s',
    sentiment: 'neutral', mood: 'neutral', cli: 58,
    summary: 'Wanted a microwave installation slot this week. Booked for Saturday morning.',
    summaryKey: 'seed.summary.acInstallDelay',
    highlights: ['Installation this week', 'Saturday morning slot'],
    nextStep: 'follow-up', nextStepLabel: 'Follow up Sat', nextStepLabelKey: 'seed.nextStep.followUpSat',
    tag: 'normal',
    callReason: 'Installation request', callReasonKey: 'seed.callReason.installationRequest',
    leadStatus: 'open', reviewLinkSent: false,
    transcript: turns(minsAgo(97), [
      ['manager', 0, 'Lakshmi Electronics, HSR Layout. Good morning.'],
      ['customer', 6, 'I bought a microwave last week. When can someone install it?'],
      ['manager', 16, 'We can do Saturday morning, between 10 and 12. Does that work?'],
      ['customer', 33, 'Saturday is fine. Please call before coming.'],
      ['manager', 47, 'Noted. Saturday 10 to 12, with a call first.'],
    ]),
  },
]

// ============================================================
// CALL HISTORY — the older call log, behind today.
//
// MISSED_CALLS / CONNECTED_CALLS / IVR_DROPS above are TODAY's calls, and the screens
// that read them ("today's missed calls", the live feed, the call-back queue) mean today.
// Back-filling them with a year of history would silently break that promise, so older
// calls live here instead and are unioned in by getCalls() — the windowed selectors see
// the whole log, the today-getters stay today.
//
// Discriminated by `kind`; the fields match the array a record would have lived in.
// No frozen `time` string on purpose: nothing renders these except the new selectors,
// which resolve `atOffsetMs` → `atMs` and format at render time.
//
// The spread is deliberate — it is what makes the windows differ from each other:
//   last 7d · last 30d · previous month (June: the 32d/40d rows are in it but NOT in
//   last 30d) · last 90d · last 365d.
// ============================================================
export const CALL_HISTORY = [
  // ---- inside last 7 days ----
  {
    id: 'ch-01', kind: 'missed', masked: maskNumber('184'), atOffsetMs: daysAgo(2),
    source: 'Google', cli: 71, intent: 'high', estValue: 34000,
    category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'ch-02', kind: 'connected', masked: maskNumber('627'), atOffsetMs: hoursAgo(45),
    source: 'SingleInterface', direction: 'inbound', duration: '3m 12s', cli: 84,
    estValue: 61000, category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    sentiment: 'positive', callReason: 'EMI options', callReasonKey: 'seed.callReason.emiOptions',
    leadStatus: 'converted', reviewLinkSent: true,
    transcript: turns(hoursAgo(45), [
      ['manager', 0, 'Lakshmi Electronics, good evening.'],
      ['customer', 4, 'I want to know about EMI on the 65-inch Sony. The one for around 1,20,000.'],
      ['manager', 13, 'No-cost EMI is available up to nine months on HDFC and ICICI cards. Nine months works out to about ₹13,300.'],
      ['customer', 40, 'And if I pay full?'],
      ['manager', 50, 'Full payment I can do ₹1,17,500 and throw in the wall mount.'],
      ['customer', 90, 'Done. I will come tomorrow with my card.'],
      ['manager', 120, 'I will keep one aside for you.'],
    ]),
  },
  {
    id: 'ch-03', kind: 'missed', masked: maskNumber('390'), atOffsetMs: daysAgo(3),
    source: 'Justdial', cli: 44, intent: 'medium', estValue: 19000,
    category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral', callReason: 'Stock availability', callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'ch-04', kind: 'connected', customerId: 'cust-208', masked: maskNumber('208'), atOffsetMs: daysAgo(4),
    source: 'SingleInterface', direction: 'inbound', duration: '2m 44s', cli: 22,
    estValue: 0, category: 'Service', categoryKey: 'seed.category.service',
    sentiment: 'negative', callReason: 'Delivery delay', callReasonKey: 'seed.callReason.deliveryDelay',
    leadStatus: 'open', reviewLinkSent: false,
    transcript: turns(daysAgo(4), [
      ['customer', 0, 'My washing machine was supposed to come Tuesday. It is Thursday.'],
      ['manager', 6, 'Let me check the docket. I am sorry, sir — I can see the vehicle broke down on the Tuesday route.'],
      ['customer', 20, 'Nobody informed me. I waited the whole day.'],
      ['manager', 28, 'You are right, we should have called. I can get it to you tomorrow morning first slot, and I will waive the installation charge.'],
      ['customer', 55, 'Tomorrow morning definitely?'],
      ['manager', 62, 'Definitely. I am putting it as first delivery, and I will call you myself when the vehicle leaves.'],
      ['customer', 130, 'Okay then.'],
    ]),
  },
  {
    id: 'ch-05', kind: 'missed', masked: maskNumber('741'), atOffsetMs: daysAgo(5),
    source: 'Facebook', cli: 39, intent: 'low', estValue: 11000,
    category: 'Microwave', categoryKey: 'seed.category.microwave',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'ch-06', kind: 'connected', masked: maskNumber('053'), atOffsetMs: daysAgo(6),
    source: 'Google', direction: 'inbound', duration: '4m 05s', cli: 76,
    estValue: 41000, category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'positive', callReason: 'Installation request', callReasonKey: 'seed.callReason.installationRequest',
    leadStatus: 'converted', reviewLinkSent: true,
    transcript: turns(daysAgo(6), [
      ['customer', 0, 'I bought a split AC from you last week. When can you install?'],
      ['manager', 5, 'Let me pull up the bill. Yes — the Voltas 1.5 ton. Installation team can come Sunday morning.'],
      ['customer', 22, 'Sunday is good. Do I need to buy the copper pipe separately?'],
      ['manager', 35, 'Standard three metres is included. Beyond that it is ₹450 a metre — the technician will measure and tell you before starting.'],
      ['customer', 70, 'Fine. What time Sunday?'],
      ['manager', 95, 'Between 9 and 11. He will call before coming.'],
      ['customer', 180, 'Thank you, that is very helpful.'],
    ]),
  },
  // ---- inside last 30 days ----
  {
    id: 'ch-07', kind: 'missed', masked: maskNumber('466'), atOffsetMs: daysAgo(9),
    source: 'Times of India', cli: 68, intent: 'medium', estValue: 48000,
    category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'ch-08', kind: 'connected', masked: maskNumber('815'), atOffsetMs: daysAgo(12),
    source: 'Facebook', direction: 'inbound', duration: '1m 20s', cli: 31,
    estValue: 8000, category: 'Headphones', categoryKey: 'seed.category.headphones',
    sentiment: 'neutral', callReason: 'Stock availability', callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'expired', reviewLinkSent: false,
    transcript: turns(daysAgo(12), [
      ['customer', 0, 'Do you have the boAt Rockerz 550?'],
      ['manager', 4, 'That particular model we stopped stocking. We have the 551 and the JBL equivalent.'],
      ['customer', 14, 'No, I want the 550 only. My friend has it.'],
      ['manager', 22, 'I can order it, takes about four days.'],
      ['customer', 40, 'Four days is too long, I will check elsewhere.'],
      ['manager', 48, 'Understood. If you change your mind, do call.'],
    ]),
  },
  {
    id: 'ch-09', kind: 'missed', masked: maskNumber('900'), atOffsetMs: daysAgo(14),
    source: 'SingleInterface', cli: 8, intent: 'low', estValue: 0,
    category: 'Spam?', categoryKey: 'seed.category.spam', spam: true,
    sentiment: 'neutral', callReason: 'Spam / unwanted', callReasonKey: 'seed.callReason.spam',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'ch-10', kind: 'connected', customerId: 'cust-372', masked: maskNumber('372'), atOffsetMs: daysAgo(18),
    source: 'Google', direction: 'outbound', duration: '3m 38s', cli: 26,
    estValue: 0, category: 'Service', categoryKey: 'seed.category.service',
    sentiment: 'negative', callReason: 'Warranty / service', callReasonKey: 'seed.callReason.warrantyService',
    leadStatus: 'open', reviewLinkSent: false,
    transcript: turns(daysAgo(18), [
      ['manager', 0, 'Sir, calling about the refrigerator complaint you registered.'],
      ['customer', 5, 'Yes. It is still not cooling properly. Second technician also came and went.'],
      ['manager', 16, 'The compressor is under warranty for ten years, so any replacement is free. What did the technician write?'],
      ['customer', 34, 'He said gas. But he said gas last time also and charged me 1,800.'],
      ['manager', 48, 'You should not have been charged if it is a warranty repair. Send me that receipt on WhatsApp and I will get it refunded.'],
      ['customer', 80, 'I will send. But please send a senior person this time.'],
      ['manager', 120, 'I will request the area service manager directly.'],
    ]),
  },
  {
    id: 'ch-11', kind: 'missed', masked: maskNumber('529'), atOffsetMs: daysAgo(20),
    source: 'SingleInterface', cli: 62, intent: 'medium', estValue: 36000,
    category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'neutral', callReason: 'EMI options', callReasonKey: 'seed.callReason.emiOptions',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'ch-12', kind: 'connected', masked: maskNumber('118'), atOffsetMs: daysAgo(25),
    source: 'Times of India', direction: 'outbound', duration: '6m 02s', cli: 91,
    estValue: 88000, category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    sentiment: 'positive', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: true,
    transcript: turns(daysAgo(25), [
      ['manager', 0, 'Good afternoon, calling back regarding your enquiry on the Samsung QLED.'],
      ['customer', 7, 'Yes, the 65-inch. What is your best price?'],
      ['manager', 14, 'Listed at ₹92,000. For you, ₹88,000 with the soundbar bundled.'],
      ['customer', 45, 'Croma quoted 89 without soundbar.'],
      ['manager', 60, 'Then take ours — same panel, and the soundbar alone is worth 12,000.'],
      ['customer', 150, 'Alright. Can you deliver this Sunday?'],
      ['manager', 200, 'Sunday afternoon, and the installation team comes with it.'],
      ['customer', 300, 'Book it.'],
    ]),
  },
  // ---- previous calendar month, but OUTSIDE last 30 days ----
  {
    id: 'ch-13', kind: 'missed', masked: maskNumber('677'), atOffsetMs: daysAgo(32),
    source: 'Justdial', cli: 49, intent: 'medium', estValue: 23000,
    category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    sentiment: 'neutral', callReason: 'Stock availability', callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'ch-14', kind: 'connected', masked: maskNumber('245'), atOffsetMs: daysAgo(40),
    source: 'SingleInterface', direction: 'inbound', duration: '2m 58s', cli: 73,
    estValue: 39000, category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'positive', callReason: 'Installation request', callReasonKey: 'seed.callReason.installationRequest',
    leadStatus: 'converted', reviewLinkSent: false,
    transcript: turns(daysAgo(40), [
      ['customer', 0, 'Summer is starting, I need an AC installed before the heat.'],
      ['manager', 6, 'Which size? Room dimensions?'],
      ['customer', 12, 'Bedroom, about 12 by 12.'],
      ['manager', 20, 'One ton is enough for that. The Daikin at ₹39,000 is what I would recommend — quiet, and their service is reliable here.'],
      ['customer', 60, 'Installation included?'],
      ['manager', 70, 'Included. We can do it this week.'],
      ['customer', 140, 'Let us do it.'],
    ]),
  },
  // ---- inside last 90 days ----
  {
    id: 'ch-15', kind: 'missed', masked: maskNumber('832'), atOffsetMs: daysAgo(55),
    source: 'Google', cli: 41, intent: 'low', estValue: 13000,
    category: 'Microwave', categoryKey: 'seed.category.microwave',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  {
    id: 'ch-16', kind: 'connected', masked: maskNumber('960'), atOffsetMs: daysAgo(70),
    source: 'Google', direction: 'inbound', duration: '1m 52s', cli: 18,
    estValue: 2500, category: 'Accessories', categoryKey: 'seed.category.accessories',
    sentiment: 'neutral', callReason: 'Warranty / service', callReasonKey: 'seed.callReason.warrantyService',
    leadStatus: 'expired', reviewLinkSent: false,
    transcript: turns(daysAgo(70), [
      ['customer', 0, 'The remote for the TV I bought from you stopped working. Is it in warranty?'],
      ['manager', 6, 'Remotes are covered for one year. When did you buy?'],
      ['customer', 14, 'Two years back I think.'],
      ['manager', 20, 'Then it would be a paid replacement — around ₹700 for the original, or ₹250 for a universal one.'],
      ['customer', 55, 'I will think about it.'],
    ]),
  },
  {
    id: 'ch-17', kind: 'missed', masked: maskNumber('301'), atOffsetMs: daysAgo(88),
    source: 'SingleInterface', cli: 34, intent: 'low', estValue: 0,
    category: 'Service', categoryKey: 'seed.category.service',
    sentiment: 'neutral', callReason: 'Delivery delay', callReasonKey: 'seed.callReason.deliveryDelay',
    leadStatus: 'expired', reviewLinkSent: false,
  },
  // ---- inside last 365 days ----
  {
    id: 'ch-18', kind: 'connected', masked: maskNumber('487'), atOffsetMs: daysAgo(140),
    source: 'Times of India', direction: 'inbound', duration: '5m 44s', cli: 87,
    estValue: 54000, category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'positive', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'converted', reviewLinkSent: true,
    transcript: turns(daysAgo(140), [
      ['customer', 0, 'I saw your Republic Day advertisement. Two ACs, what is the offer?'],
      ['manager', 8, 'On two units we can do 10 percent off the second one, plus free installation on both.'],
      ['customer', 40, 'Both 1.5 ton, same model.'],
      ['manager', 55, 'Then ₹54,000 for the pair, installed.'],
      ['customer', 200, 'That is fair. My wife will come tomorrow to finalise.'],
      ['manager', 300, 'I will keep the quote noted under this number.'],
    ]),
  },
  {
    id: 'ch-19', kind: 'missed', masked: maskNumber('712'), atOffsetMs: daysAgo(250),
    source: 'Facebook', cli: 52, intent: 'medium', estValue: 27000,
    category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    sentiment: 'neutral', callReason: 'EMI options', callReasonKey: 'seed.callReason.emiOptions',
    leadStatus: 'expired', reviewLinkSent: false,
  },
]

// CUSTOMER PROFILES — mini-CRM. Every caller and every review-link recipient lives here.
//
// Timeline entries default to a wall-clock render ("yesterday · 6:48 pm"). The two that
// were only ever vague — 'Last month', 'Last week' — carry atPrecision:'relative' so the
// UI renders them with relativeTime() instead of inventing a clock time they never had.
//
// `notes` are what the manager typed during or after a conversation. Like anything a
// dealer typed, they are NEVER keyed — translating a manager's own note would be putting
// words in his mouth. Appended at runtime via addCustomerNote().
//
// PHONE vs MASKED. Every record holds a real `phone` — the number the store would actually
// dial — and `masked` is DERIVED from it by maskCustomer(), never written by hand. The UI
// renders `masked` and only `masked`; `phone` exists so "Call back" and the review link can
// address a real handset instead of asking the manager to re-type a number we already hold.
// See customerDialDigits() in src/data/customers.js — that is the only door the raw number
// leaves by.
//
// `name: null` means we genuinely do not know who rang — an anonymous caller off an ad.
// It does NOT mean "anonymous forever": a customer with a purchase and a service history on
// file is a person this store knows by name (see cust-019), and pretending otherwise would
// be its own small lie.
export const CUSTOMERS = [
  // ---- FORM AND WALK-IN LEADS ----------------------------------------------
  // The MVP wants leads from all three sources. Every seeded customer until now was
  // call-sourced (customerSourceType() reads callCount > 0), so "form" and "walk-in"
  // were shapes the code could describe and the fixture could not produce.
  //
  // These carry an explicit `leadStatus` in the new vocabulary: a form nobody has rung
  // is 'missed' in the sense that matters — the shop has not answered it — and someone
  // standing at the counter has by definition been contacted.
  {
    id: 'lead-frm-01',
    storeId: 'lks-ind',
    name: 'Nikhil Barve',
    phone: '9845066120',
    masked: maskCustomer('9845066120'),
    sourceType: 'form',
    leadStatus: 'missed',
    cli: 74, band: 'warm', value: 54000,
    category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    firstSeen: 'Today · 11:12 AM', firstSeenOffsetMs: minsAgo(96),
    lastSeen: '1 hour ago', lastSeenOffsetMs: minsAgo(96),
    callCount: 0, reviewSent: false, reviewed: false,
    timeline: [], notes: [],
  },
  {
    id: 'lead-frm-02',
    storeId: 'lks-kor',
    name: 'Shreya Pai',
    phone: '9845077431',
    masked: maskCustomer('9845077431'),
    sourceType: 'form',
    leadStatus: 'contacted',
    cli: 61, band: 'warm', value: 22000,
    category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    firstSeen: 'Yesterday · 4:20 PM', firstSeenOffsetMs: minsAgo(1180),
    lastSeen: 'yesterday', lastSeenOffsetMs: minsAgo(1100),
    callCount: 0, reviewSent: false, reviewed: false,
    timeline: [], notes: [],
  },
  {
    id: 'lead-wlk-01',
    storeId: 'lks-ind',
    name: 'Farhan Sheikh',
    phone: '9845031907',
    masked: maskCustomer('9845031907'),
    sourceType: 'walk_in',
    addedBy: 'Rajesh Kumar',
    leadStatus: 'converted',
    cli: 88, band: 'hot', value: 96000,
    category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    firstSeen: 'Today · 12:05 PM', firstSeenOffsetMs: minsAgo(63),
    lastSeen: '1 hour ago', lastSeenOffsetMs: minsAgo(63),
    callCount: 0, reviewSent: false, reviewed: false,
    timeline: [], notes: [],
  },
  {
    id: 'lead-wlk-02',
    storeId: 'lks-new',
    name: 'Meghana Rao',
    phone: '9845090255',
    masked: maskCustomer('9845090255'),
    sourceType: 'walk_in',
    addedBy: 'Vikram Shetty',
    leadStatus: 'review_requested',
    cli: 79, band: 'warm', value: 31000,
    category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    firstSeen: 'Yesterday · 6:40 PM', firstSeenOffsetMs: minsAgo(1040),
    lastSeen: 'yesterday', lastSeenOffsetMs: minsAgo(1040),
    callCount: 0, reviewSent: true, reviewed: false,
    timeline: [], notes: [],
  },
  {
    id: 'lead-frm-03',
    storeId: 'lks-kor',
    name: 'Aditya Ghosh',
    phone: '9845018844',
    masked: maskCustomer('9845018844'),
    sourceType: 'form',
    leadStatus: 'expired',
    cli: 44, band: 'cold', value: 15000,
    category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    firstSeen: '5 days ago', firstSeenOffsetMs: minsAgo(7300),
    lastSeen: '5 days ago', lastSeenOffsetMs: minsAgo(7300),
    callCount: 0, reviewSent: false, reviewed: false,
    timeline: [], notes: [],
  },
  {
    id: 'cust-231',
    name: null, // unknown identity — masked
    phone: '9880142231',
    masked: maskCustomer('9880142231'),
    cli: 92,
    band: 'hot',
    value: 38000,
    category: 'Air Conditioner',
    categoryKey: 'seed.category.airConditioner',
    aiGuess: 'Lives near the store · weekday daytime caller · likely a homeowner ready to buy · prefers EMI',
    aiGuessKey: 'seed.aiGuess.nearbyHomeownerEmi',
    firstSeen: 'Today · 9:34 AM',
    firstSeenOffsetMs: minsAgo(146),
    lastSeen: '12 min ago',
    lastSeenOffsetMs: minsAgo(12),
    callCount: 3,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'missed', at: '9:34 AM today', atOffsetMs: minsAgo(146), detail: 'First missed call via SingleInterface', detailKey: 'seed.timeline.firstMissedSi' },
      { type: 'missed', at: '10:42 AM today', atOffsetMs: minsAgo(78), detail: 'Second missed call · same number', detailKey: 'seed.timeline.secondMissedSameNumber' },
      { type: 'missed', at: '11:48 AM today', atOffsetMs: minsAgo(12), detail: 'Third missed call · still trying', detailKey: 'seed.timeline.thirdMissedStillTrying' },
    ],
    notes: [
      { id: 'nt-231-1', text: 'Rang three times before noon, never got through. Try him before 7 PM — likely calling on his commute.', atOffsetMs: minsAgo(10), author: 'Rajesh Kumar' },
    ],
  },
  {
    id: 'cust-087',
    name: null,
    phone: '7899310087',
    masked: maskCustomer('7899310087'),
    cli: 86,
    band: 'hot',
    value: 52000,
    category: 'Smart TV',
    categoryKey: 'seed.category.smartTv',
    aiGuess: 'Saw the Times of India ad · called within 4 min · high purchase intent',
    aiGuessKey: 'seed.aiGuess.toiAdHighIntent',
    firstSeen: 'Today · 11:22 AM',
    firstSeenOffsetMs: minsAgo(38),
    lastSeen: '38 min ago',
    lastSeenOffsetMs: minsAgo(38),
    callCount: 1,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'missed', at: '11:22 AM today', atOffsetMs: minsAgo(38), detail: 'Missed call · Times of India campaign', detailKey: 'seed.timeline.missedToiCampaign' },
    ],
    notes: [],
  },
  {
    id: 'cust-988',
    name: null,
    phone: '9845236988',
    masked: maskCustomer('9845236988'),
    cli: 88,
    band: 'hot',
    value: 45000,
    category: 'Air Conditioner',
    categoryKey: 'seed.category.airConditioner',
    aiGuess: 'Repeat shopper · prefers Samsung · happy in conversation · wants EMI',
    aiGuessKey: 'seed.aiGuess.repeatSamsungEmi',
    firstSeen: 'Today · 12:14 PM',
    firstSeenOffsetMs: minsAgo(6),
    lastSeen: '6 min ago',
    lastSeenOffsetMs: minsAgo(6),
    callCount: 1,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'inbound', at: '12:14 PM today', atOffsetMs: minsAgo(6), detail: 'Answered call · 4m 32s · Samsung AC enquiry', detailKey: 'seed.timeline.answeredSamsungAc' },
    ],
    notes: [
      { id: 'nt-988-1', text: 'Samsung 1.5T inverter 3-star held aside till Friday. Wants 6-month no-cost EMI. Old AC dead, so he is in a hurry — do not lose this one.', atOffsetMs: minsAgo(4), author: 'Rajesh Kumar' },
    ],
  },
  {
    id: 'cust-775',
    name: 'Anand Rao',
    phone: '9886054775',
    masked: maskCustomer('9886054775'),
    cli: 95,
    band: 'hot',
    value: 32500,
    category: 'Washing Machine',
    categoryKey: 'seed.category.washingMachine',
    aiGuess: 'Repeat customer · already bought once · loyal · brings family along',
    aiGuessKey: 'seed.aiGuess.loyalRepeatFamily',
    firstSeen: 'Yesterday 6:48 PM',
    firstSeenOffsetMs: minsAgo(1106),
    lastSeen: 'Yesterday 7:14 PM',
    lastSeenOffsetMs: minsAgo(1080),
    callCount: 1,
    reviewSent: true,
    reviewed: true,
    timeline: [
      { type: 'missed', at: 'Yesterday 6:48 PM', atOffsetMs: minsAgo(1106), detail: 'Missed call · SingleInterface', detailKey: 'seed.timeline.missedSi' },
      { type: 'outbound', at: 'Yesterday 7:14 PM', atOffsetMs: minsAgo(1080), detail: 'Called back · 5m 21s · sale closed ₹32,500', detailKey: 'seed.timeline.calledBackSaleClosed' },
      { type: 'review-sent', at: 'Yesterday 8:02 PM', atOffsetMs: minsAgo(1032), detail: 'Review link sent on WhatsApp', detailKey: 'seed.timeline.reviewLinkSent' },
      { type: 'review-landed', at: 'Today 9:18 AM', atOffsetMs: minsAgo(236), detail: '5★ review on Google', detailKey: 'seed.timeline.reviewLandedGoogle' },
    ],
    notes: [
      { id: 'nt-775-1', text: 'LG 7kg front load booked, ₹32,500, paying on delivery by card. HAL 2nd stage — free delivery zone.', atOffsetMs: minsAgo(1074), author: 'Rajesh Kumar' },
      { id: 'nt-775-2', text: 'Delivery Saturday 10 AM confirmed on WhatsApp. Second purchase from us — wife’s sister is also a customer.', atOffsetMs: minsAgo(1030), author: 'Rajesh Kumar' },
    ],
  },
  {
    id: 'cust-554',
    name: null,
    phone: '9740118554',
    masked: maskCustomer('9740118554'),
    cli: 78,
    band: 'hot',
    value: 21000,
    category: 'Refrigerator',
    categoryKey: 'seed.category.refrigerator',
    aiGuess: 'Returning caller · came back next day · serious about buying',
    aiGuessKey: 'seed.aiGuess.returningNextDay',
    firstSeen: 'Yesterday 6:12 PM',
    firstSeenOffsetMs: minsAgo(1068),
    lastSeen: '64 min ago',
    lastSeenOffsetMs: minsAgo(64),
    callCount: 2,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'missed', at: 'Yesterday 6:12 PM', atOffsetMs: minsAgo(1068), detail: 'Missed call · Google', detailKey: 'seed.timeline.missedGoogle' },
      { type: 'missed', at: '10:56 AM today', atOffsetMs: minsAgo(64), detail: 'Tried again · still not picked', detailKey: 'seed.timeline.triedAgainNotPicked' },
    ],
    notes: [],
  },
  {
    id: 'cust-019',
    // NAMED, unlike the anonymous ad-callers above, and for a reason we can point at: this
    // man bought a ₹42,000 AC from this store last month and has an open service ticket on
    // it. A shop knows the name on a bill it raised. It is also what makes the rv-07 link
    // below legible rather than a coincidence — see the REVIEWS header.
    name: 'Prakash Menon',
    phone: '9448027019',
    masked: maskCustomer('9448027019'),
    cli: 28,
    band: 'cold',
    value: 0,
    category: 'Service',
    categoryKey: 'seed.category.service',
    aiGuess: 'Upset existing customer · warranty service complaint · needs care',
    aiGuessKey: 'seed.aiGuess.upsetWarranty',
    firstSeen: 'Last month',
    firstSeenOffsetMs: daysAgo(32),
    lastSeen: '2h ago',
    lastSeenOffsetMs: hoursAgo(2),
    callCount: 4,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'inbound', at: 'Last month · 14 Dec', atOffsetMs: daysAgo(32), atPrecision: 'relative', detail: 'Bought AC ₹42,000', detailKey: 'seed.timeline.boughtAc' },
      { type: 'inbound', at: 'Last week', atOffsetMs: daysAgo(8), atPrecision: 'relative', detail: 'First service complaint', detailKey: 'seed.timeline.firstServiceComplaint' },
      { type: 'outbound', at: '10:11 AM today', atOffsetMs: minsAgo(129), detail: 'Called back · 1m 04s · escalated to service', detailKey: 'seed.timeline.calledBackEscalated' },
    ],
    notes: [
      { id: 'nt-019-1', text: 'Install booked 12th, team never turned up — twice. He took leave both days. I promised a service-desk call within 24h with a fixed slot. My name is on this now, follow it up myself.', atOffsetMs: minsAgo(125), author: 'Rajesh Kumar' },
      { id: 'nt-019-2', text: 'Do NOT send a review link to this number until the install is actually done.', atOffsetMs: minsAgo(120), author: 'Rajesh Kumar' },
    ],
  },
  {
    id: 'cust-445',
    name: null,
    phone: '9663380445',
    masked: maskCustomer('9663380445'),
    cli: 81,
    band: 'hot',
    value: 110000,
    category: 'Smart TV',
    categoryKey: 'seed.category.smartTv',
    aiGuess: 'Premium buyer · 55" OLED interest · social-ad warmed · weekend shopper',
    aiGuessKey: 'seed.aiGuess.premiumOledWeekend',
    firstSeen: 'Today · 10:24 AM',
    firstSeenOffsetMs: minsAgo(116),
    lastSeen: '78 min ago',
    lastSeenOffsetMs: minsAgo(78),
    callCount: 2,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'missed', at: '10:24 AM today', atOffsetMs: minsAgo(116), detail: 'Missed call · Times of India', detailKey: 'seed.timeline.missedToi' },
      { type: 'outbound', at: '11:02 AM today', atOffsetMs: minsAgo(78), detail: 'Called back · 2m 11s · catalog sent on WhatsApp', detailKey: 'seed.timeline.calledBackCatalogSent' },
    ],
    notes: [
      { id: 'nt-445-1', text: 'LG C-series 55" OLED, catalogue sent on WhatsApp. Deciding with his wife, coming Saturday before noon. Was comparing with the 2023 panel — hold the ₹1,09,990 price.', atOffsetMs: minsAgo(74), author: 'Rajesh Kumar' },
    ],
  },
  {
    id: 'cust-512',
    name: 'Divya K.',
    phone: '8095471512',
    masked: maskCustomer('8095471512'),
    cli: 68,
    band: 'warm',
    value: 24000,
    category: 'Headphones',
    categoryKey: 'seed.category.headphones',
    aiGuess: 'Younger buyer · price-sensitive · Facebook offer brought her in',
    aiGuessKey: 'seed.aiGuess.youngPriceSensitive',
    firstSeen: 'Today · 9:34 AM',
    firstSeenOffsetMs: minsAgo(166),
    lastSeen: '166 min ago',
    lastSeenOffsetMs: minsAgo(166),
    callCount: 1,
    reviewSent: true,
    reviewed: false,
    timeline: [
      { type: 'inbound', at: '9:34 AM today', atOffsetMs: minsAgo(166), detail: 'Answered call · 1m 47s · Sony WH-1000XM5', detailKey: 'seed.timeline.answeredSony' },
      { type: 'review-sent', at: '10:12 AM today', atOffsetMs: minsAgo(128), detail: 'Review link sent on WhatsApp', detailKey: 'seed.timeline.reviewLinkSent' },
    ],
    notes: [
      { id: 'nt-512-1', text: 'Sony WH-1000XM5, quoted festive ₹24,990. Has a college ID — promised a case or stand as a sweetener, not a cash discount. Coming this weekend, ask for me at audio counter.', atOffsetMs: minsAgo(160), author: 'Rajesh Kumar' },
    ],
  },
  // ------------------------------------------------------------
  // The three records below back call rows that already claimed a customer and had none.
  // Each is derived from its own call — the score, the category and the value are copied
  // off the record, the timeline is the call itself, and nothing is asserted that the
  // transcript does not already say out loud.
  //
  // They are here because this file's own contract at the top of CUSTOMERS says every
  // caller lives here, and cc-03 / ch-04 / ch-10 pointed at ids that resolved to null —
  // so the notes composer silently vanished on exactly the calls that most needed it.
  // `notes: []` on all three is deliberate: the manager made promises on these calls and
  // wrote none of them down. That absence IS the feature's argument.
  // ------------------------------------------------------------
  {
    // cc-03. Note the number: it ends 231, the same three digits as cust-231 — and it is a
    // different person on a different handset. That is why cc-03 always carried its own id.
    // Last-three is a display convenience, never an identity; anything that joins on it is
    // wrong, and this row is the seed's standing proof.
    id: 'cust-231b',
    name: null,
    phone: '9739260231',
    masked: maskCustomer('9739260231'),
    cli: 56,
    band: 'warm',
    value: 34000,
    category: 'Refrigerator',
    categoryKey: 'seed.category.refrigerator',
    aiGuess: 'Comparing with online prices · wants the exchange quote held · deciding with family',
    aiGuessKey: 'seed.aiGuess.comparingExchangeFamily',
    firstSeen: 'Today · 10:48 AM',
    firstSeenOffsetMs: minsAgo(92),
    lastSeen: '92 min ago',
    lastSeenOffsetMs: minsAgo(92),
    callCount: 1,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'inbound', at: '10:48 AM today', atOffsetMs: minsAgo(92), detail: 'Answered call · 3m 58s · double-door fridge under ₹40K', detailKey: 'seed.timeline.answeredFridgeComparing' },
    ],
    notes: [],
  },
  {
    // ch-04, four days ago. The manager pulled up his docket on the call, so the store
    // holds his record and his name — he is not an anonymous caller.
    id: 'cust-208',
    name: 'Nagaraj B.',
    phone: '9611472208',
    masked: maskCustomer('9611472208'),
    cli: 22,
    band: 'cold',
    // Zero like cust-019: the machine is already sold, this call is service. Nothing new
    // is on the table, so booking a value here would inflate the pipeline with a complaint.
    value: 0,
    category: 'Service',
    categoryKey: 'seed.category.service',
    aiGuess: 'Already bought · delivery missed twice · wants a date he can trust',
    aiGuessKey: 'seed.aiGuess.deliveryMissedTrust',
    firstSeen: '4 days ago',
    firstSeenOffsetMs: daysAgo(4),
    lastSeen: '4 days ago',
    lastSeenOffsetMs: daysAgo(4),
    callCount: 1,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'inbound', at: '4 days ago', atOffsetMs: daysAgo(4), atPrecision: 'relative', detail: 'Answered call · 2m 44s · chasing a late washing-machine delivery', detailKey: 'seed.timeline.answeredDeliveryChase' },
    ],
    notes: [],
  },
  {
    // ch-10, eighteen days ago. "The refrigerator complaint you registered" — a ticket in
    // our own system, so again a customer this store knows.
    id: 'cust-372',
    name: 'Imran Qureshi',
    phone: '9900863372',
    masked: maskCustomer('9900863372'),
    cli: 26,
    band: 'cold',
    value: 0,
    category: 'Service',
    categoryKey: 'seed.category.service',
    aiGuess: 'Charged for a warranty repair by mistake · refund promised · wants a senior technician',
    aiGuessKey: 'seed.aiGuess.warrantyOverchargedRefund',
    firstSeen: '18 days ago',
    firstSeenOffsetMs: daysAgo(18),
    lastSeen: '18 days ago',
    lastSeenOffsetMs: daysAgo(18),
    callCount: 1,
    reviewSent: false,
    reviewed: false,
    timeline: [
      { type: 'outbound', at: '18 days ago', atOffsetMs: daysAgo(18), atPrecision: 'relative', detail: 'Called back · 3m 38s · refrigerator still not cooling', detailKey: 'seed.timeline.calledBackFridgeComplaint' },
    ],
    notes: [],
  },

  // ── KORAMANGALA + HSR LAYOUT ────────────────────────────────────────────────
  // The other two branches, so "All locations" is genuinely additive rather than the
  // flagship's data relabelled. Every record below carries an explicit storeId; the
  // originals above carry none and resolve to the primary store (see PRIMARY_STORE_ID
  // in data/customers.js). A customer belongs to ONE store and their calls and reviews
  // inherit it — the join is what makes "which location?" answerable at all.
  {
    id: 'cust-k41', storeId: 'lks-kor', name: 'Meera Iyer', phone: '9845067341',
    masked: maskCustomer('9845067341'), cli: 79, band: 'hot', value: 46000,
    category: 'Refrigerator', categoryKey: 'seed.category.refrigerator',
    aiGuess: 'Returning customer · asked to be called back the next day',
    aiGuessKey: 'seed.aiGuess.returningNextDay',
    firstSeen: 'Today · 10:05 AM', firstSeenOffsetMs: minsAgo(180),
    lastSeen: '35 min ago', lastSeenOffsetMs: minsAgo(35),
    callCount: 2, reviewSent: false, reviewed: false,
    timeline: [
      { type: 'missed', at: '10:05 AM today', atOffsetMs: minsAgo(180), detail: 'Missed call via SingleInterface', detailKey: 'seed.timeline.missedSi' },
      { type: 'missed', at: '11:50 AM today', atOffsetMs: minsAgo(35), detail: 'Tried again, not picked', detailKey: 'seed.timeline.triedAgainNotPicked' },
    ],
    notes: [],
  },
  {
    id: 'cust-k77', storeId: 'lks-kor', name: null, phone: '9740228877',
    masked: maskCustomer('9740228877'), cli: 64, band: 'warm', value: 21000,
    category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    aiGuess: 'Price-sensitive · young buyer comparing brands',
    aiGuessKey: 'seed.aiGuess.youngPriceSensitive',
    firstSeen: 'Today · 11:02 AM', firstSeenOffsetMs: minsAgo(83),
    lastSeen: '83 min ago', lastSeenOffsetMs: minsAgo(83),
    callCount: 1, reviewSent: true, reviewed: false,
    timeline: [
      { type: 'answered', at: '11:02 AM today', atOffsetMs: minsAgo(83), detail: 'Answered · compared washer models', detailKey: 'seed.timeline.answeredSamsungAc' },
      { type: 'review', at: '11:20 AM today', atOffsetMs: minsAgo(65), detail: 'Review link sent on WhatsApp', detailKey: 'seed.timeline.reviewLinkSent' },
    ],
    notes: [],
  },
  {
    id: 'cust-h18', storeId: 'lks-new', name: 'Farhan Qureshi', phone: '9611440918',
    masked: maskCustomer('9611440918'), cli: 71, band: 'warm', value: 32000,
    category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    aiGuess: 'Loyal repeat family · bought here before',
    aiGuessKey: 'seed.aiGuess.loyalRepeatFamily',
    firstSeen: 'Today · 9:40 AM', firstSeenOffsetMs: minsAgo(205),
    lastSeen: '52 min ago', lastSeenOffsetMs: minsAgo(52),
    callCount: 2, reviewSent: false, reviewed: false,
    timeline: [
      { type: 'missed', at: '9:40 AM today', atOffsetMs: minsAgo(205), detail: 'Missed call via Google', detailKey: 'seed.timeline.missedGoogle' },
      { type: 'missed', at: '11:33 AM today', atOffsetMs: minsAgo(52), detail: 'Tried again, not picked', detailKey: 'seed.timeline.triedAgainNotPicked' },
    ],
    notes: [],
  },
  {
    id: 'cust-h52', storeId: 'lks-new', name: null, phone: '9535071252',
    masked: maskCustomer('9535071252'), cli: 58, band: 'warm', value: 12000,
    category: 'Microwave', categoryKey: 'seed.category.microwave',
    aiGuess: 'Called about an installation slot the same week',
    aiGuessKey: 'seed.aiGuess.returningNextDay',
    firstSeen: 'Today · 10:48 AM', firstSeenOffsetMs: minsAgo(97),
    lastSeen: '97 min ago', lastSeenOffsetMs: minsAgo(97),
    callCount: 1, reviewSent: false, reviewed: false,
    timeline: [
      { type: 'answered', at: '10:48 AM today', atOffsetMs: minsAgo(97), detail: 'Answered · installation slot booked', detailKey: 'seed.timeline.answeredSony' },
    ],
    notes: [],
  },
]

// ============================================================
// REVIEWS
//
// `body` and reply `text` are deliberately NOT keyed — a real customer's words and our
// published answer to them, not UI copy. Only `time` is localisable.
//
// `time` is the LEGACY frozen English string the current Reviews screen still renders.
// New records carry it only so the inbox does not go blank mid-migration; `atOffsetMs`
// is the real data. Once the UI renders dayClock(atMs), delete every `time` here.
//
// Fields that drive the Nova filter set:
//   body: null        → a star-only review ("rating type: without text")
//   removed           → taken down from Google; hidden unless "show removed" is on
//   edited            → the customer changed it after posting; previousRating is what it was
//   tags              → REVIEW_TAGS ids (a closed set, so the catalog carries the copy)
//   replies[]         → the reply HISTORY, including replies we later deleted
//   customerId        → the CRM record this reviewer IS. See below.
//
// NOT seeded, derived instead (see src/data/reviews.js): sentiment (from rating),
// `responded` and `aiReply` (from `replies`) — one source of truth per fact.
//
// ------------------------------------------------------------
// customerId — WHO WROTE THIS, and why we think so
//
// Google hands us a display name and a star. It does not hand us a phone number, so there
// is no automatic join from a review to a caller: `customerId` is a claim, and it is only
// set where the claim survives being questioned. TWO of twenty-one are set. The other
// nineteen are left null on purpose — most people who review a shop never rang it, and a
// screen that guessed at the rest would be inventing the very fact the manager is asking
// it for.
//
// The bar a link has to clear: the name matches a customer we hold a name for, AND the
// customer's own history independently corroborates what the review says. Name alone is
// not enough — "Divya" is not an identity.
//
//   rv-07 → cust-019   The review says "called four times about my AC installation" and
//                      "very poor after-sales". cust-019 has callCount 4, bought a ₹42,000
//                      AC last month, has an open install ticket with two no-shows against
//                      it, and cc-04 (today) is Rajesh escalating exactly that. Four
//                      independent facts agree. This is the one negative review a call can
//                      reach, and it is reachable because the story is genuinely his.
//   rv-06 → cust-775   'Anand Rao' matches, and his record already says a 5★ Google review
//                      landed (`reviewed: true`) after the link we sent him. See the note
//                      on rv-06 for the timestamp that had to be reconciled to make those
//                      two records stop contradicting each other.
//
// DELIBERATELY NOT LINKED, though it looks tempting:
//   rv-05 'Divya Krishnamurthy' vs cust-512 'Divya K.'. The name nearly fits and nothing
//   else does: cust-512 is `reviewed: false`, her interest is headphones, and the review is
//   a Justdial post about a microwave for the reviewer's mother that predates cust-512's
//   first contact with this store. Linking on the strength of a first name would put a
//   review in the wrong person's mouth and mark a customer as reviewed who never was.
//   rv-04 / rv-15 are negative and about AC installation and a washing machine — the right
//   SHAPE to be one of our callers, and we hold no record that says they are.
// ------------------------------------------------------------
// ============================================================

// Where a REPLY gets published. Scope 1 ships GBP only; the rest are where historical
// replies were made and stay read-only until their integration lands.
export const PUBLISHING_PLATFORMS = [
  { id: 'gbp', label: 'Google Business Profile', short: 'GBP', labelKey: 'seed.platform.gbp', publishable: true },
  { id: 'justdial', label: 'Justdial', short: 'JD', labelKey: 'seed.platform.justdial', publishable: false },
  { id: 'facebook', label: 'Facebook', short: 'FB', labelKey: 'seed.platform.facebook', publishable: false },
]

// Review topic tags. Closed set → ids on the record, copy in the catalog.
export const REVIEW_TAGS = [
  { id: 'staff', label: 'Staff', labelKey: 'seed.reviewTag.staff' },
  { id: 'pricing', label: 'Pricing', labelKey: 'seed.reviewTag.pricing' },
  { id: 'delivery', label: 'Delivery', labelKey: 'seed.reviewTag.delivery' },
  { id: 'installation', label: 'Installation', labelKey: 'seed.reviewTag.installation' },
  { id: 'service', label: 'Service', labelKey: 'seed.reviewTag.service' },
  { id: 'productQuality', label: 'Product quality', labelKey: 'seed.reviewTag.productQuality' },
  { id: 'storeExperience', label: 'Store experience', labelKey: 'seed.reviewTag.storeExperience' },
]

export const REVIEWS = [
  {
    id: 'rv-01',
    customer: 'Arjun Mehta',
    rating: 5,
    time: '2h ago',
    atOffsetMs: hoursAgo(2),
    platform: 'Google',
    body: 'Best electronics store in Indiranagar. Rajesh sir patiently helped me pick a TV under budget. Free delivery too!',
    tags: ['staff', 'pricing', 'delivery'],
    replies: [],
  },
  {
    id: 'rv-02',
    customer: 'Sneha Pillai',
    rating: 5,
    time: '5h ago',
    atOffsetMs: hoursAgo(5),
    platform: 'Google',
    body: 'Bought a Samsung fridge — staff explained EMI clearly, no hidden charges. Highly recommended.',
    tags: ['staff', 'pricing'],
    replies: [],
  },
  {
    id: 'rv-07',
    customer: 'Prakash Menon',
    // The link the call detail reads. See the customerId note in the header for the four
    // facts that back it. cust-019's own name comes from the AC bill this store raised.
    customerId: 'cust-019',
    rating: 1,
    time: '8h ago',
    atOffsetMs: hoursAgo(8),
    platform: 'Google',
    body: 'Called four times about my AC installation. Nobody picks up the phone. Very poor after-sales.',
    tags: ['service', 'installation'],
    replies: [],
    priority: true,
  },
  {
    id: 'rv-08',
    customer: 'Nithya Balan',
    rating: 5,
    time: '11h ago',
    atOffsetMs: hoursAgo(11),
    platform: 'Google',
    // Star-only — no words at all. This is what "rating without text" looks like.
    body: null,
    tags: [],
    replies: [],
  },
  {
    id: 'rv-03',
    customer: 'Mohammed Faiz',
    rating: 4,
    time: 'Yesterday',
    atOffsetMs: hoursAgo(26),
    platform: 'Google',
    body: 'Good selection and pricing. Only minor issue was delivery slot — promised 10 AM, actually came at 1 PM. Otherwise great.',
    tags: ['delivery', 'pricing'],
    replies: [],
  },
  {
    id: 'rv-04',
    customer: 'Karthik N.',
    rating: 2,
    time: 'Yesterday',
    atOffsetMs: hoursAgo(30),
    platform: 'Google',
    body: 'Air conditioner installation was delayed by 3 days. Had to follow up multiple times. Product is fine but service needs to improve.',
    tags: ['service', 'installation'],
    replies: [],
    priority: true,
  },
  {
    id: 'rv-09',
    customer: 'Ramesh Gowda',
    rating: 3,
    time: 'Yesterday',
    atOffsetMs: hoursAgo(40),
    platform: 'Google',
    body: 'Prices are okay, nothing special. Staff was busy with other customers.',
    tags: ['pricing', 'staff'],
    replies: [],
  },
  {
    id: 'rv-05',
    customer: 'Divya Krishnamurthy',
    rating: 5,
    time: '2 days ago',
    atOffsetMs: hoursAgo(50),
    platform: 'Justdial',
    body: 'Bought my mom a microwave. Demo was thorough and store team installed it the same day. Lovely experience.',
    tags: ['staff', 'installation', 'storeExperience'],
    // Replied on Justdial, back when that integration existed. Scope 1 cannot publish
    // here any more — the history stays visible, the reply box does not.
    replies: [
      {
        id: 'rp-05-1', platform: 'justdial', atOffsetMs: hoursAgo(46), author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Thank you so much, Divya! It means a lot that we could make this special for your mom. Looking forward to serving you again. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-10',
    customer: 'Suhas Kamath',
    rating: 4,
    time: '2 days ago',
    atOffsetMs: hoursAgo(58),
    platform: 'Google',
    body: 'Updating my review — the service manager called and sorted out the gas refill at no charge. Took a while but they did make it right.',
    tags: ['service', 'staff'],
    // The one that turned around: 2★ complaint, we fixed it, he raised it himself.
    edited: true,
    editedAtOffsetMs: hoursAgo(58),
    previousRating: 2,
    replies: [
      {
        id: 'rp-10-1', platform: 'gbp', atOffsetMs: hoursAgo(55), author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Thank you for updating this, Suhas — and for your patience while we got to the bottom of it. The refill should hold now; if anything changes, call the store and ask for me directly. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-06',
    customer: 'Anand Rao',
    customerId: 'cust-775',
    rating: 5,
    // TIMESTAMP RECONCILED (was hoursAgo(74), "3 days ago"). cust-775's own timeline says
    // the review link went out yesterday 8:02 PM and a 5★ Google review landed today at
    // 9:18 AM — minsAgo(236). This IS that review: same person, same star, same platform.
    // At 3 days old it would have predated both the link and his first ever contact with
    // the store, so the two records could not both be true and the link would have been a
    // fiction. Moved to the instant his record already says it arrived; the reply follows
    // it rather than preceding it by two days.
    //
    // The body reads as praise for a LAPTOP while his purchase here was a washing machine,
    // and that is not a contradiction — it is the point. A Google review is of the shop,
    // not of a SKU. His aiGuess says "already bought once" and nt-775-2 calls the washing
    // machine his "Second purchase from us": the laptop was the first visit. He bought
    // again, got our link, and wrote about the man who helped him the first time.
    time: '4h ago',
    atOffsetMs: minsAgo(236),
    platform: 'Google',
    body: 'Honest pricing, no upselling pressure. Vikram on the floor was very knowledgeable about laptops.',
    tags: ['staff', 'pricing'],
    replies: [
      {
        id: 'rp-06-1', platform: 'gbp', atOffsetMs: minsAgo(180), author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Thank you, Anand! We will pass on the kind words to Vikram. Enjoy your new laptop, and do come back any time you need accessories. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-11',
    customer: 'Meera Iyer',
    rating: 5,
    time: '5 days ago',
    atOffsetMs: hoursAgo(118),
    platform: 'Google',
    body: 'Delivery came exactly in the promised slot and the installation boy cleaned up after himself. Small thing, but rare.',
    tags: ['delivery', 'installation'],
    replies: [
      {
        id: 'rp-11-1', platform: 'gbp', atOffsetMs: hoursAgo(116), author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Thank you, Meera — we will make sure the delivery team hears this. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-12',
    customer: 'Joseph Thomas',
    rating: 4,
    time: '7 days ago',
    atOffsetMs: daysAgo(7),
    platform: 'Google',
    body: null,
    tags: [],
    replies: [],
  },
  {
    id: 'rv-13',
    customer: 'Deals Hub',
    rating: 1,
    time: '9 days ago',
    atOffsetMs: daysAgo(9),
    platform: 'Google',
    body: 'Worst shop, everything overpriced, go to our store in Koramangala instead for genuine rates, call 98xxxxxx.',
    tags: [],
    // Reported as a competitor posting spam; Google took it down. Our reply went with it.
    removed: true,
    removedAtOffsetMs: daysAgo(7),
    replies: [
      {
        id: 'rp-13-1', platform: 'gbp', atOffsetMs: daysAgo(9) + 20 * 3600e3, author: 'Rajesh Kumar', deleted: true, deletedAtOffsetMs: daysAgo(7),
        text: 'We have no record of a purchase against this name and this review appears to advertise another business. We have reported it to Google. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-14',
    customer: 'Shalini Rao',
    rating: 5,
    time: '12 days ago',
    atOffsetMs: daysAgo(12),
    platform: 'Google',
    body: 'Second appliance I have bought here. They remember you, and that counts for something.',
    tags: ['staff', 'storeExperience'],
    // Reply history with a mistake in it: a generic first reply, deleted, then a real one.
    replies: [
      {
        id: 'rp-14-1', platform: 'gbp', atOffsetMs: daysAgo(12) + 3600e3, author: 'Rajesh Kumar', deleted: true, deletedAtOffsetMs: daysAgo(12) + 28 * 3600e3,
        text: 'Thank you for your feedback. — Team Lakshmi Electronics, Indiranagar',
      },
      {
        id: 'rp-14-2', platform: 'gbp', atOffsetMs: daysAgo(12) + 30 * 3600e3, author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Shalini, thank you — and yes, we do remember! Thank you for coming back to us a second time. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-15',
    customer: 'Vinod Shetty',
    rating: 2,
    time: '16 days ago',
    atOffsetMs: daysAgo(16),
    platform: 'Google',
    body: 'Washing machine developed a noise in two weeks. Service visit took five days to arrange.',
    tags: ['service', 'productQuality'],
    replies: [],
  },
  {
    id: 'rv-16',
    customer: 'Fatima Sheikh',
    rating: 5,
    time: '21 days ago',
    atOffsetMs: daysAgo(21),
    platform: 'Google',
    body: 'Very patient staff. I asked the same questions three times and nobody made me feel stupid.',
    tags: ['staff'],
    replies: [
      {
        id: 'rp-16-1', platform: 'gbp', atOffsetMs: daysAgo(21) + 8 * 3600e3, author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Thank you, Fatima — questions are what we are here for. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-17',
    customer: 'Girish Hegde',
    rating: 4,
    time: '26 days ago',
    atOffsetMs: daysAgo(26),
    platform: 'Google',
    body: null,
    tags: [],
    replies: [],
  },
  {
    id: 'rv-18',
    customer: 'Aparna Desai',
    rating: 5,
    time: 'Last month',
    atOffsetMs: daysAgo(34),
    platform: 'Google',
    body: 'Got a better price here than the online sale, and they matched the exchange value on my old TV.',
    tags: ['pricing'],
    replies: [
      {
        id: 'rp-18-1', platform: 'gbp', atOffsetMs: daysAgo(34) + 26 * 3600e3, author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Thank you, Aparna! Do bring the old TV documents when you visit next — we can process the exchange credit then. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-19',
    customer: 'Sanjay Bhatt',
    rating: 3,
    time: 'Last month',
    atOffsetMs: daysAgo(45),
    platform: 'Google',
    body: 'Decent store. Parking is a nightmare on 100 Feet Road though.',
    tags: ['storeExperience'],
    replies: [],
  },
  {
    id: 'rv-20',
    customer: 'Lakshmi Narayan',
    rating: 5,
    time: '2 months ago',
    atOffsetMs: daysAgo(62),
    platform: 'Google',
    body: 'Been buying from this shop since it opened. Never had a reason to go anywhere else.',
    tags: ['storeExperience', 'staff'],
    replies: [
      {
        id: 'rp-20-1', platform: 'gbp', atOffsetMs: daysAgo(62) + 5 * 3600e3, author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Thank you for staying with us all these years. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },
  {
    id: 'rv-21',
    customer: 'Harish Kulkarni',
    rating: 4,
    time: '4 months ago',
    atOffsetMs: daysAgo(110),
    platform: 'Google',
    body: 'Good store, fair prices. Wish they stocked more of the premium audio brands.',
    tags: ['pricing', 'productQuality'],
    replies: [
      {
        id: 'rp-21-1', platform: 'gbp', atOffsetMs: daysAgo(110) + 12 * 3600e3, author: 'Rajesh Kumar', deleted: false, deletedAtOffsetMs: null,
        text: 'Noted, Harish — we are expanding the audio section this year. Do come and take a look. — Team Lakshmi Electronics, Indiranagar',
      },
    ],
  },

  // ── KORAMANGALA + HSR LAYOUT reviews (see the note in CUSTOMERS) ────────────
  { id: 'rv-my1', storeId: 'lks-mys', customer: 'Girish Hegde', rating: 5, time: '5h ago', atOffsetMs: hoursAgo(5), platform: 'Google',
    body: 'Mysore Road store had the model in stock and installed it next morning.', tags: ['delivery'], replies: [] },
  { id: 'rv-my2', storeId: 'lks-mys', customer: 'Latha Prakash', rating: 2, time: '2d ago', atOffsetMs: daysAgo(2), platform: 'Google',
    body: 'Billing counter was unmanned for a long time. Products are fine.', tags: ['staff'], replies: [] },
  { id: 'rv-my3', storeId: 'lks-mys', customer: 'Anil Kamath', rating: 4, time: '4d ago', atOffsetMs: daysAgo(4), platform: 'Justdial',
    body: 'Fair prices, staff knew the specs well.', tags: ['pricing', 'staff'], replies: [] },
  { id: 'rv-bm1', storeId: 'lks-bom', customer: 'Rohit Salvi', rating: 1, time: '3h ago', atOffsetMs: hoursAgo(3), platform: 'Google',
    body: 'Nobody picks up the phone. Went in person and was told to come back later.', tags: ['staff'], replies: [] },
  { id: 'rv-bm2', storeId: 'lks-bom', customer: 'Sneha Kulkarni', rating: 2, time: '1d ago', atOffsetMs: daysAgo(1), platform: 'Google',
    body: 'Delivery was three days late and no one called to say so.', tags: ['delivery'], replies: [] },
  { id: 'rv-bm3', storeId: 'lks-bom', customer: 'Imtiaz Shaikh', rating: 4, time: '3d ago', atOffsetMs: daysAgo(3), platform: 'Google',
    body: 'Good stock at Andheri. Exchange offer was honoured without fuss.', tags: ['pricing'], replies: [] },
  { id: 'rv-bm4', storeId: 'lks-bom', customer: 'Devika Nair', rating: 2, time: '5d ago', atOffsetMs: daysAgo(5), platform: 'Justdial',
    body: 'Store was crowded and the AC demo unit was not working.', tags: ['staff'], replies: [] },
  { id: 'rv-pn1', storeId: 'lks-pun', customer: 'Kedar Joshi', rating: 5, time: '8h ago', atOffsetMs: hoursAgo(8), platform: 'Google',
    body: 'Baner store called back within minutes of my enquiry. Rare these days.', tags: ['staff'], replies: [] },
  { id: 'rv-pn2', storeId: 'lks-pun', customer: 'Manasi Deshpande', rating: 5, time: '2d ago', atOffsetMs: daysAgo(2), platform: 'Google',
    body: 'Installed the washing machine same day and explained the warranty properly.', tags: ['delivery'], replies: [] },
  { id: 'rv-pn3', storeId: 'lks-pun', customer: 'Sameer Patil', rating: 3, time: '6d ago', atOffsetMs: daysAgo(6), platform: 'Google',
    body: 'Prices slightly higher than online but they price-matched on asking.', tags: ['pricing'], replies: [] },
  { id: 'rv-k1', storeId: 'lks-kor', customer: 'Meera Iyer', rating: 5, time: '4h ago', atOffsetMs: hoursAgo(4), platform: 'Google',
    body: 'Koramangala branch had the fridge I wanted in stock. Quick billing, no pushy upselling.', tags: ['staff', 'pricing'], replies: [] },
  { id: 'rv-k2', storeId: 'lks-kor', customer: 'Sandeep Rao', rating: 2, time: '1d ago', atOffsetMs: daysAgo(1), platform: 'Google',
    body: 'Waited twenty minutes at the counter and nobody attended. Stock was fine but service was slow.', tags: ['staff'], replies: [] },
  { id: 'rv-k3', storeId: 'lks-kor', customer: 'Nisha Verma', rating: 4, time: '3d ago', atOffsetMs: daysAgo(3), platform: 'Justdial',
    body: 'Good range of washing machines. Delivery came a day later than promised.', tags: ['delivery'], replies: [] },
  { id: 'rv-h1', storeId: 'lks-new', customer: 'Farhan Qureshi', rating: 5, time: '6h ago', atOffsetMs: hoursAgo(6), platform: 'Google',
    body: 'HSR Layout store is new but very well run. Installed my TV the same evening.', tags: ['delivery', 'staff'], replies: [] },
  { id: 'rv-h2', storeId: 'lks-new', customer: 'Ritu Malhotra', rating: 3, time: '2d ago', atOffsetMs: daysAgo(2), platform: 'Google',
    body: 'Decent prices but the store is hard to find, signage is small.', tags: ['pricing'], replies: [] },
]

export const REVIEW_LEADERBOARD = [
  { id: 'u1', name: 'Rajesh Kumar', initials: 'RK', generated: 42, landed: 31, avgRating: 4.7 },
  { id: 'u2', name: 'Vikram Shetty', initials: 'VS', generated: 38, landed: 27, avgRating: 4.6 },
  { id: 'u3', name: 'Priya Nair', initials: 'PN', generated: 29, landed: 18, avgRating: 4.4 },
]

// Only the field LABELS are UI copy. The `value`s are this dealer's own listing data
// (name, address, hours, phone) and stay as typed — except `category`, which is a
// CATEGORY_OPTIONS value: render it through categoryOptionKey() for display.
export const GBP_FIELDS = [
  { key: 'name', label: 'Business name', labelKey: 'seed.gbp.name', value: 'Lakshmi Electronics' },
  { key: 'address', label: 'Address', labelKey: 'seed.gbp.address', value: '127, 100 Feet Road, Indiranagar, Bangalore 560038' },
  { key: 'plusCode', label: 'Plus Code (lat-long)', labelKey: 'seed.gbp.plusCode', value: 'XGRX+QF Bangalore, Karnataka' },
  { key: 'hours', label: 'Business hours', labelKey: 'seed.gbp.hours', value: 'Mon–Sat · 10:00 AM – 9:30 PM' },
  { key: 'phone', label: 'Phone (VMN)', labelKey: 'seed.gbp.phone', value: '+91 80 4567 ••••' },
  { key: 'category', label: 'Primary category', labelKey: 'seed.gbp.category', value: 'Consumer Electronics Store' },
  { key: 'services', label: 'Services', labelKey: 'seed.gbp.services', value: 'In-store · Home delivery · Installation · EMI · Trade-in' },
]

// ============================================================
// POST TEMPLATES — the four Nova post types.
//
// Replaces the old campaign-flavoured four (Weekend Offer / New Arrival / EMI Highlight /
// Festive) with Nova's actual taxonomy: Standard, Offer, Event, Testimonial.
//
// Shape is unchanged (`*Key` sibling + English fallback), and the ids are NEW on purpose.
// CreatePostSheet maps old ids → old catalog keys in a local TPL_KEYS table; unknown ids
// fall through to `item.name`, so these render as correct English today and localise the
// moment that screen switches to `t(item.nameKey, { defaultValue: item.name })`.
// Reusing pt-1..pt-4 would instead have printed "Weekend Offer" on the Standard tile.
//
// `icon` is a lucide name resolved by the composer's iconMap. Standard/Offer/Event hit
// icons already in that map; Testimonial's MessageSquareQuote needs adding to it and
// falls back to Sparkles until then.
// ============================================================
export const POST_TEMPLATES = [
  { id: 'pt-standard', name: 'Standard', nameKey: 'seed.post.nameStandard', icon: 'Sparkles', accent: '#0070FC', headline: 'What’s New', headlineKey: 'seed.post.headlineStandard', cta: 'Learn More', ctaKey: 'seed.post.ctaStandard' },
  { id: 'pt-offer', name: 'Offer', nameKey: 'seed.post.nameOffer', icon: 'Wallet', accent: '#16A34A', headline: 'Special Offer', headlineKey: 'seed.post.headlineOffer', cta: 'Redeem Offer', ctaKey: 'seed.post.ctaOffer' },
  { id: 'pt-event', name: 'Event', nameKey: 'seed.post.nameEvent', icon: 'PartyPopper', accent: '#F97316', headline: 'You’re Invited', headlineKey: 'seed.post.headlineEvent', cta: 'Book Now', ctaKey: 'seed.post.ctaEvent' },
  { id: 'pt-testimonial', name: 'Testimonial', nameKey: 'seed.post.nameTestimonial', icon: 'MessageSquareQuote', accent: '#0E0071', headline: 'Customer Story', headlineKey: 'seed.post.headlineTestimonial', cta: 'Read More', ctaKey: 'seed.post.ctaTestimonial' },
]

// GROW_STREAK / GROW_CHECKLIST / NEARBY_RANK / STORE_LATLNG / NEARBY_LATLNGS were removed
// with the Grow tab, the health-score card and the nearby-competitor card (scope 1 cut).
// Their last consumers (Grow.jsx, Home.jsx's rank + checklist cards) are gone.

// ============== LANGUAGES ==============
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', flag: '🇮🇳' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', flag: '🇮🇳' },
  { code: 'id', label: 'Bahasa', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', label: 'Thai', native: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'es', label: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Portuguese', native: 'Português', flag: '🇵🇹' },
]

// `desc` is keyed whole even though it embeds place/brand names ("Bangalore · 5 stores").
// That follows the catalog's existing precedent (grow.taskBeatLeader ships "Beat Reliance
// Digital by 4 reviews" translated in every language): translators keep the proper noun
// and translate the frame around it.
export const ROLES = [
  { id: 'single', label: 'Single Store', labelKey: 'seed.role.single', desc: 'Owner / Manager · Lakshmi Electronics, Indiranagar', descKey: 'seed.role.singleDesc' },
  { id: 'cluster', label: 'Cluster Owner', labelKey: 'seed.role.cluster', desc: '3 Bangalore stores roll-up', descKey: 'seed.role.clusterDesc' },
  { id: 'city', label: 'City Manager', labelKey: 'seed.role.city', desc: 'Bangalore · 5 stores', descKey: 'seed.role.cityDesc' },
  { id: 'regional', label: 'Regional Manager', labelKey: 'seed.role.regional', desc: 'South India · 4 cities', descKey: 'seed.role.regionalDesc' },
  { id: 'state', label: 'State Manager', labelKey: 'seed.role.state', desc: 'Karnataka · 8 cities', descKey: 'seed.role.stateDesc' },
  { id: 'head', label: 'Distribution Head', labelKey: 'seed.role.head', desc: 'PAN India view', descKey: 'seed.role.headDesc' },
]

// NOTE: business-logic selectors (rupees, totalRecoverable, computeLocationFlags,
// missedOpportunities, checkCompliance, …) now live in the src/data/* domain
// modules. This file is the raw seed data only — the adapter behind src/data.

// ============================================================
// CONNECT REVAMP — Feature seed data
// ============================================================

// -------- Feature 1: Multi-Location Dealer Login --------
// One dealer phone number resolves to MULTIPLE mapped store locations.
export const DEALER_PHONE = '9845012342'

/**
 * A DEMO / QA SIGN-IN, aliased to the flagship dealer above.
 *
 * Ten nines is a number nobody has to look up mid-demo. It is not a seventh dealer and
 * owns nothing of its own: session.js folds it onto DEALER_PHONE at the point where what
 * was typed becomes the digits we compare on, so it resolves to exactly the same six
 * shops and every downstream screen is the flagship's.
 *
 * Ten digits because that is what a mobile number is here — Login refuses anything else
 * (`phone.length === 10`), so a nine-digit form of this could never reach the button.
 */
export const DEMO_PHONE = '9999999999'

/**
 * A DIFFERENT manager, holding exactly one shop.
 *
 * The launch build changes shape for someone with a single store — no roll-up tab, three
 * tabs instead of four — and none of that was reachable while the fixture knew only one
 * manager who held everything. Signing in on this number is how that build gets seen.
 */
export const JAYANAGAR_PHONE = '9845077777'

// -------- Login: store code --------
// Login now takes a STORE CODE alongside the mobile number, so a dealer who runs several
// outlets lands directly in the right one.
//
// The registry is deliberately WIDER than MAPPED_LOCATIONS: 'CRM-KOR-01' is a real,
// well-formed code that belongs to a different dealer's phone. Without a row like that,
// "is this code yours?" could never fail, and the check would be theatre — every
// well-formed code would resolve. See resolveStoreCode() in src/data/session.js.
export const STORE_CODE_PATTERN = /^[A-Z]{3}-[A-Z]{3}-\d{2}$/
export const STORE_CODE_EXAMPLE = 'LKS-IND-01'

// THE REGISTRY IS THE ANSWER TO "WHICH STORES ARE MINE" — so it has to list all of
// them. Mysore, Andheri and Baner were added to MAPPED_LOCATIONS for the multi-state
// roll-up but never registered against the owner's number, so sign-in resolved three
// stores while every screen after it showed six. Same dealer, two counts, one screen
// apart. The codes were already on the locations; only these rows were missing.
export const STORE_CODE_REGISTRY = [
  { code: 'LKS-IND-01', locationId: 'lks-ind', phone: DEALER_PHONE },
  { code: 'LKS-KOR-02', locationId: 'lks-kor', phone: DEALER_PHONE },
  { code: 'LKS-HSR-03', locationId: 'lks-new', phone: DEALER_PHONE },
  { code: 'LKS-MYS-04', locationId: 'lks-mys', phone: DEALER_PHONE },
  { code: 'LKS-BOM-05', locationId: 'lks-bom', phone: DEALER_PHONE },
  { code: 'LKS-PUN-06', locationId: 'lks-pun', phone: DEALER_PHONE },
  // Same brand code prefix, different owner — a valid code this dealer may not use.
  // Jayanagar is a REAL store now (see MAPPED_LOCATIONS): one shop, one manager, which
  // is what makes the single-location build something you can sign into and see rather
  // than a branch nobody can reach.
  { code: 'LKS-JAY-04', locationId: 'lks-jay', phone: JAYANAGAR_PHONE },
  // Another business entirely. No location behind it on purpose: it exists so the
  // access-request sheet can tell "a real code that is not yours" from "no such code".
  { code: 'CRM-KOR-01', locationId: 'crm-kor', phone: '9845088888' },
]

// Locations mapped to DEALER_PHONE. The dealer runs all three on one number.
/**
 * THE FLAGSHIP. Records written before multi-store attribution existed carry no
 * storeId, and they are all this store's — so the domain layer resolves a missing
 * storeId to this id rather than leaving records unattributed. Declared HERE, in the
 * leaf, so calls/reviews/customers can read it without importing locations.js (which
 * would close a cycle: the rollups below import them).
 */
export const PRIMARY_STORE_ID = 'lks-ind'

// What the brand admin (NOVA user management) granted this manager. '*' means the
// whole dealer — how an admin grants an account without listing every shop. Narrow it
// to a subset and the multi-location view reshapes itself: assignments.js derives the
// roll-up depth from what is held, so ['lks-ind','lks-kor'] drills straight to stores
// while the default spans two states and drills state → city → store.
// The FLAGSHIP dealer's six, named rather than '*'. '*' meant "every location in the
// fixture", which was the same set only for as long as the fixture held exactly one
// manager's stores — the moment Jayanagar arrived for the single-store build, '*' would
// have handed the owner someone else's shop and quietly added it to every roll-up.
// This is only the fallback: a real session's assignment comes from the number that
// signed in — see setSessionAssignments() in data/assignments.js.
export const MANAGER_ASSIGNMENTS = ['lks-ind', 'lks-kor', 'lks-new', 'lks-mys', 'lks-bom', 'lks-pun']

export const MAPPED_LOCATIONS = [
  {
    id: 'lks-ind', storeCode: 'LKS-IND-01', name: 'Lakshmi Electronics', subBrand: 'Tetley', branch: 'Indiranagar', city: 'Bangalore',
    address: '127, 100 Feet Road, Indiranagar, Bangalore', pincode: '560038', state: 'Karnataka',
    stated: { lat: 12.9719, lng: 77.6412 }, actual: { lat: 12.9719, lng: 77.6412 },
    landmark: 'Opposite Sony Centre',
    missed: 7, answered: 14, recovered: 5, recovery: 71, health: 82, healthPrev: 86,
    reviews: 38, rating: 4.6, primary: true, verified: true,
    addedAgo: 'Original store', addedAgoKey: 'seed.location.addedOriginal',
  },
  {
    id: 'lks-kor', storeCode: 'LKS-KOR-02', name: 'Lakshmi Electronics', subBrand: 'Tetley', branch: 'Koramangala', city: 'Bangalore',
    address: '80 Feet Road, 4th Block, Koramangala, Bangalore', pincode: '560034', state: 'Karnataka',
    // Pin drifts ~210 m from the true storefront → lat-long check fails.
    stated: { lat: 12.9352, lng: 77.6245 }, actual: { lat: 12.9366, lng: 77.6260 },
    landmark: 'Near Forum Mall',
    missed: 11, answered: 9, recovered: 5, recovery: 45, health: 61, healthPrev: 66,
    reviews: 22, rating: 4.5, verified: false,
    addedAgo: 'Added 2 weeks ago', addedAgoKey: 'seed.location.addedWhen', addedAtOffsetMs: daysAgo(14),
  },
  {
    id: 'lks-new', storeCode: 'LKS-HSR-03', name: 'Lakshmi Electronics', subBrand: 'Tetley', branch: 'HSR Layout', city: 'Bangalore',
    // Data-entry error on a recently added store, kept where it is actually CHECKED:
    // pincode 201301 is Noida/UP, not Bangalore/Karnataka, so the verification flow
    // still flags it. The city and state are the truth now — as 'Bandra, Haryana' this
    // store invented a whole state in the multi-location roll-up, which reads every
    // store's city and state to build State → City → Store.
    address: 'Sector 27, HSR Layout, Bangalore', pincode: '201301', state: 'Karnataka',
    stated: { lat: 12.9116, lng: 77.6389 }, actual: { lat: 12.9101, lng: 77.6377 },
    landmark: '',
    missed: 5, answered: 12, recovered: 5, recovery: 74, health: 48, healthPrev: 51,
    reviews: 18, rating: 4.4, verified: false,
    addedAgo: 'Added 3 days ago', addedAgoKey: 'seed.location.addedWhen', addedAtOffsetMs: daysAgo(3),
  },
  // ---- MULTI-STATE ---------------------------------------------------------
  // The MVP's roll-up depends on the SHAPE of what a manager is assigned: one city
  // drills to stores, one state drills city → store, several states drill
  // state → city → store. Until now every store was in Bangalore, so two of those
  // three shapes could not be produced at all — the state level was decorative rows
  // in the seed rather than stores with records behind them.
  //
  // Karnataka now has Bangalore (3) + Mysore (1); Maharashtra has Mumbai + Pune.
  // Six stores, four cities, two states, every roll-up derived from real records.
  {
    id: 'lks-mys', storeCode: 'LKS-MYS-04', name: 'Lakshmi Electronics', subBrand: 'Tetley', branch: 'Mysore Road', city: 'Mysore',
    address: '14, Sayyaji Rao Road, Mysore', pincode: '570001', state: 'Karnataka',
    stated: { lat: 12.3052, lng: 76.6552 }, actual: { lat: 12.3052, lng: 76.6552 },
    landmark: 'Near Devaraja Market',
    missed: 6, answered: 9, recovered: 3, recovery: 50, health: 70, healthPrev: 68,
    reviews: 19, rating: 4.3, verified: true,
    addedAgo: 'Added 1 month ago', addedAgoKey: 'seed.location.addedWhen', addedAtOffsetMs: daysAgo(31),
  },
  {
    id: 'lks-bom', storeCode: 'LKS-BOM-05', name: 'Lakshmi Electronics', subBrand: 'Tata Motors', branch: 'Andheri West', city: 'Mumbai',
    address: 'Link Road, Andheri West, Mumbai', pincode: '400053', state: 'Maharashtra',
    stated: { lat: 19.1364, lng: 72.8296 }, actual: { lat: 19.1364, lng: 72.8296 },
    landmark: 'Beside Infiniti Mall',
    missed: 13, answered: 7, recovered: 2, recovery: 15, health: 54, healthPrev: 60,
    reviews: 27, rating: 3.9, verified: true,
    addedAgo: 'Added 3 weeks ago', addedAgoKey: 'seed.location.addedWhen', addedAtOffsetMs: daysAgo(21),
  },
  {
    id: 'lks-pun', storeCode: 'LKS-PUN-06', name: 'Lakshmi Electronics', subBrand: 'Tata Motors', branch: 'Baner', city: 'Pune',
    address: 'Baner Road, Pune', pincode: '411045', state: 'Maharashtra',
    stated: { lat: 18.5590, lng: 73.7868 }, actual: { lat: 18.5590, lng: 73.7868 },
    landmark: 'Opposite Balewadi Stadium',
    missed: 4, answered: 12, recovered: 3, recovery: 75, health: 79, healthPrev: 75,
    reviews: 15, rating: 4.7, verified: true,
    addedAgo: 'Added 6 weeks ago', addedAgoKey: 'seed.location.addedWhen', addedAtOffsetMs: daysAgo(44),
  },
  // NOT the flagship dealer's. Jayanagar belongs to JAYANAGAR_PHONE, and it is here so
  // there is a real single-store manager to sign in as. It stays out of every roll-up
  // for the six above because those are scoped to the assignment now, not to "every
  // location in the fixture" — see assignments.js.
  {
    id: 'lks-jay', storeCode: 'LKS-JAY-04', name: 'Lakshmi Electronics', subBrand: 'Tetley', branch: 'Jayanagar', city: 'Bangalore',
    address: '11th Main, 4th Block, Jayanagar, Bangalore', pincode: '560011', state: 'Karnataka',
    stated: { lat: 12.9299, lng: 77.5827 }, actual: { lat: 12.9299, lng: 77.5827 },
    landmark: 'Near Cool Joint',
    missed: 3, answered: 6, recovered: 2, recovery: 67, health: 74, healthPrev: 71,
    reviews: 9, rating: 4.4, primary: true, verified: true,
    addedAgo: 'Added 3 weeks ago', addedAgoKey: 'seed.location.addedWhen', addedAtOffsetMs: daysAgo(21),
  },
]

// -------- Feature 2: Home — "What you missed since last login" --------
// LAST_LOGIN keeps its frozen English for the current UI; getLastLogin() resolves the
// offset to a real timestamp for the localised render.
export const LAST_LOGIN = 'Yesterday · 7:42 PM'
export const LAST_LOGIN_OFFSET_MS = minsAgo(978)

// -------- Feature 3: VMN — IVR drop calls ("Missed opportunities") --------
// Callers who hung up inside the IVR before reaching the store — no VMN connect.
// An IVR drop is a MISSED call by any honest reading: nobody at the store ever spoke to
// them. Hence no transcript, sentiment 'neutral', and outcome 'missed' (see src/data/calls.js).
//
// NOTE the field name clash, kept on purpose: on an IVR drop `reason`/`reasonKey` is why
// they DROPPED ("Hung up while choosing language"), which is not why they CALLED. The
// latter is `callReason`, the same field every other call carries.
export const IVR_DROPS = [
  {
    id: 'ivr-01', masked: '+91 •••••231', minutesAgo: 22, time: '11:38 AM', atOffsetMs: minsAgo(22),
    source: 'SingleInterface', stage: 'Language menu', stageKey: 'seed.ivr.stageLanguageMenu',
    droppedAt: 'After 8s', droppedAtKey: 'seed.ivr.droppedAfterSeconds', droppedAfterSec: 8,
    reason: 'Hung up while choosing language', reasonKey: 'seed.ivr.reasonChoosingLanguage',
    estValue: 26000, category: 'Air Conditioner', categoryKey: 'seed.category.airConditioner',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'ivr-02', masked: '+91 •••••409', minutesAgo: 51, time: '11:09 AM', atOffsetMs: minsAgo(51),
    source: 'Google', stage: 'Ring — no pickup', stageKey: 'seed.ivr.stageRingNoPickup',
    droppedAt: 'After 30s', droppedAtKey: 'seed.ivr.droppedAfterSeconds', droppedAfterSec: 30,
    reason: 'IVR rang out, store did not connect', reasonKey: 'seed.ivr.reasonRangOut',
    estValue: 15000, category: 'Washing Machine', categoryKey: 'seed.category.washingMachine',
    sentiment: 'neutral', callReason: 'Stock availability', callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'open', reviewLinkSent: false,
  },
  {
    id: 'ivr-03', masked: '+91 •••••662', minutesAgo: 88, time: '10:32 AM', atOffsetMs: minsAgo(88),
    source: 'Times of India', stage: 'Store options menu', stageKey: 'seed.ivr.stageStoreOptions',
    droppedAt: 'After 14s', droppedAtKey: 'seed.ivr.droppedAfterSeconds', droppedAfterSec: 14,
    reason: 'Dropped before selecting a store', reasonKey: 'seed.ivr.reasonBeforeStorePick',
    estValue: 41000, category: 'Smart TV', categoryKey: 'seed.category.smartTv',
    sentiment: 'neutral', callReason: 'Price enquiry', callReasonKey: 'seed.callReason.priceEnquiry',
    leadStatus: 'open', reviewLinkSent: false,
  },

  // ── KORAMANGALA (see the note in CUSTOMERS) ─────────────────────────────────
  {
    id: 'ivr-k29', storeId: 'lks-kor', masked: '+91 •••••529', minutesAgo: 73, time: '11:12 AM', atOffsetMs: minsAgo(73),
    source: 'Google', stage: 'Store options', stageKey: 'seed.ivr.stageStoreOptions',
    droppedAt: 'After 12s', droppedAtKey: 'seed.ivr.droppedAfterSeconds', droppedAfterSec: 12,
    reason: 'Hung up before picking a store', reasonKey: 'seed.ivr.reasonBeforeStorePick',
    estValue: 14000, category: 'Headphones', categoryKey: 'seed.category.headphones',
    sentiment: 'neutral', callReason: 'Stock availability', callReasonKey: 'seed.callReason.stockAvailability',
    leadStatus: 'open', reviewLinkSent: false,
  },
]

// -------- Feature 5: Media Management --------
//
// COMPETITOR / OTHER-BUSINESS NAMES.
//
// The only thing Smart Image Protection can honestly do about a competitor's picture is
// notice that the FILE IS NAMED AFTER ONE. We cannot see inside the image — no logo
// detection, no scene recognition, nothing that would catch a Croma shelf saved as
// IMG_4471.jpg. This list is what makes the name check possible, and its limits are stated
// on the SIP sheet rather than hidden behind it.
//
// Where the names come from — every one is a business this store is already recorded as
// competing with, not a list we imagined:
//   • 'Croma'      — ch-12, the customer's own words: "Croma quoted 89 without soundbar."
//   • 'Amazon'     — cc-05: "Amazon has it for around 24."
//   • 'Deals Hub'  — rv-13, a competitor caught posting a fake review pushing their
//                    Koramangala shop.
//   • the rest are the national chains an Indiranagar electronics store sits against.
//
// Matching is substring, so entries must be distinctive enough that no genuine photo of
// THIS store could ever contain one. That rules out short or generic words. Cased for
// display — the reason we show names the brand we actually matched.
export const COMPETITOR_BRANDS = [
  'Croma', 'Amazon', 'Flipkart', 'Reliance Digital', 'Vijay Sales',
  'Sargam Electronics', 'Girias', 'Pai International', 'Deals Hub',
]

// Signals that a picture is of something personal or off-topic rather than this business.
// Again: FILE NAMES only. A photo of someone's wedding named 'IMG_2291.jpg' passes this
// check, and that is why the sheet tells the owner the scan cannot replace their eye.
//
// This list is SHORT on purpose, and the words on it are long and specific. Flagging is
// not a suggestion — it queues a picture for deletion from Google — so a false positive
// costs the owner a real photograph of his own shop. Every candidate was tested against
// that: 'pet' would eat `carpet_section.jpg`; 'holiday' would eat `holiday_offer_display.jpg`;
// 'family' would eat `family_pack_offer.jpg`; 'ad' would eat almost everything. All four
// were dropped for it. When in doubt the term does not go on the list — a competitor photo
// that slips through costs a conversation, a deleted storefront photo costs the listing.
export const NON_BRAND_NAME_SIGNALS = [
  'wedding', 'birthday', 'vacation', 'picnic', 'meme',
  'wallpaper', 'shutterstock', 'istock', 'getty images', 'stock photo',
]

// The pictures on this location's Google listing.
//
// A real listing is not four tidy curated shots. It is the owner's own photos PLUS
// whatever got pushed onto it over two years from a phone gallery, a WhatsApp forward or
// a staff member's camera roll — which is the entire reason Smart Image Protection exists.
// So the seed holds both, and the difference is visible in the shape of the record:
//
//   • Curated entries carry `label` + `labelKey` — our copy, translated for display.
//   • Entries that arrived as FILES carry a real file name and NO labelKey. A file name is
//     never translated; it must render exactly as it is, in every language.
//
// There is no `ok` flag any more. There used to be one, `ok: true` on all four, and
// nothing read it — which was lucky, because a stored verdict is a second source of truth
// that drifts away from the scan the moment a rule changes. Whether an image is compliant
// is now answered by checkCompliance() and by measuring the picture, every time it is
// asked. See checkCompliance() in src/data/content.js.
// Listing media is PER STORE — one Google listing, one set of photos. The originals
// carry no storeId and resolve to the flagship (see PRIMARY_STORE_ID); the two branches
// below have their own smaller sets, which is what a newer branch actually looks like.
export const MEDIA_LIBRARY = [
  { id: 'mm-k1', storeId: 'lks-kor', kind: 'cover', label: 'Storefront', labelKey: 'seed.media.storefront', tag: 'Cover photo', tagKey: 'seed.media.coverPhoto' },
  { id: 'mm-k2', storeId: 'lks-kor', kind: 'photo', label: 'Billing counter', labelKey: 'seed.media.billingCounter' },
  { id: 'mm-h1', storeId: 'lks-new', kind: 'cover', label: 'Storefront', labelKey: 'seed.media.storefront', tag: 'Cover photo', tagKey: 'seed.media.coverPhoto' },
  { id: 'mm-h2', storeId: 'lks-new', kind: 'photo', label: 'TV zone', labelKey: 'seed.media.tvZone' },
  { id: 'mm-cover', kind: 'cover', label: 'Storefront', labelKey: 'seed.media.storefront', tag: 'Cover photo', tagKey: 'seed.media.coverPhoto' },
  { id: 'mm-01', kind: 'photo', label: 'AC display wall', labelKey: 'seed.media.acDisplayWall' },
  { id: 'mm-02', kind: 'photo', label: 'Billing counter', labelKey: 'seed.media.billingCounter' },
  { id: 'mm-03', kind: 'photo', label: 'TV zone', labelKey: 'seed.media.tvZone' },
  // Staff Diwali selfie, uploaded from someone's phone. Caught by the selfie rule.
  { id: 'mm-04', kind: 'photo', label: 'selfie_with_team_diwali.jpg' },
  // Somebody photographed a rival's offer board to compare prices and it ended up on our
  // own listing. Caught by name, because the name says 'Croma'.
  { id: 'mm-05', kind: 'photo', label: 'Croma_Koramangala_offer_board.jpg' },
  // A forward, twice-compressed. Caught by the WhatsApp rule.
  { id: 'mm-06', kind: 'photo', label: 'WhatsApp Image 2026-06-28 at 7.14.02 PM.jpeg' },
  // A family function. Nothing to do with the shop. Caught by name.
  { id: 'mm-07', kind: 'photo', label: 'cousin_wedding_reception.jpg' },
  // THE HONEST ONE. A camera-roll name that says nothing at all. It PASSES the scan, and
  // it should: we hold no pixels for it and the name gives us nothing. If this seed had
  // only catchable entries, the scan would look infallible and the sheet's warning that a
  // picture with a meaningless name still needs the owner's eye would read as boilerplate.
  // It isn't. This is the picture that gets through.
  { id: 'mm-08', kind: 'photo', label: 'IMG_20260612_113045.jpg' },
]

// Upload compliance simulation. A "sample" carries a hint of why it may be rejected.
// `label` is a FILE NAME, not UI copy — deliberately unkeyed, it must render verbatim.
export const UPLOAD_SAMPLES = [
  { id: 'up-1', label: 'Storefront_new.jpg', hint: 'clean', preview: 'store' },
  { id: 'up-2', label: 'selfie_atshop.jpg', hint: 'selfie', preview: 'selfie' },
  { id: 'up-3', label: 'IMG_blur_2291.jpg', hint: 'blur', preview: 'blur' },
  { id: 'up-4', label: 'products_shelf.jpg', hint: 'clean', preview: 'shelf' },
  { id: 'up-5', label: 'WhatsApp_fwd.jpg', hint: 'whatsapp', preview: 'lowres' },
]

// ============================================================
// GOOGLE BUSINESS PROFILE — full editor (generic, business-agnostic)
// Structure mirrors GBP so any business can manage/add/edit/delete
// every information field. Seeded with the app's own store.
// ============================================================
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Category catalog for the picker (search + select). Generic across retail.
// Same rule as ATTRIBUTE_GROUPS.options: these values are STORED on the profile and
// compared by string equality, so they stay English. categoryOptionKey() derives a
// display key from each value — translate what the dealer reads, not what we store.
export const CATEGORY_OPTIONS = [
  'Consumer Electronics Store', 'Home Appliance Store', 'Air Conditioning Store',
  'Mobile Phone Store', 'Computer Store', 'Electronics Repair Shop', 'Television Store',
  'Camera Store', 'Audio Visual Equipment Store', 'Retail Store', 'Supermarket',
  'Grocery Store', 'Furniture Store', 'Hardware Store', 'Gift Shop', 'Restaurant',
]

// "From the business" attribute groups. Each group carries a toggle catalog;
// dealers can also add a custom value. options:[] => free-text add only.
// `label` is UI copy and carries a key. `options` are NOT: they round-trip into
// BUSINESS_PROFILE.attributes and are compared with sel.includes(opt), so the stored
// value must stay the English string. Render them via attributeOptionKey() — display
// only, compare on the raw value. labelKey reuses the keys the editor already ships.
export const ATTRIBUTE_GROUPS = [
  { key: 'service', label: 'Service options', labelKey: 'profile.bpAttrService', options: ['In-store shopping', 'In-store pickup', 'Delivery', 'Same-day delivery', 'On-site services'] },
  { key: 'accessibility', label: 'Accessibility', labelKey: 'profile.bpAttrAccessibility', options: ['Wheelchair-accessible entrance', 'Wheelchair-accessible parking', 'Wheelchair-accessible restroom', 'Assistive hearing loop'] },
  { key: 'amenities', label: 'Amenities', labelKey: 'profile.bpAttrAmenities', options: ['Wi-Fi', 'Free Wi-Fi', 'Restroom', 'Air-conditioned'] },
  { key: 'payments', label: 'Payments', labelKey: 'profile.bpAttrPayments', options: ['UPI', 'Credit cards', 'Debit cards', 'NFC mobile payments', 'Cheques', 'No-cost EMI', 'Cash only'] },
  { key: 'parking', label: 'Parking', labelKey: 'profile.bpAttrParking', options: ['Free street parking', 'Free parking lot', 'Paid parking lot', 'Valet parking'] },
  { key: 'offerings', label: 'Offerings', labelKey: 'profile.bpAttrOfferings', options: ['Installation', 'Assembly service', 'Repair services', 'Trade-in', 'Extended warranty'] },
  { key: 'highlights', label: 'Highlights', labelKey: 'profile.bpAttrHighlights', options: ['Locally owned', 'Women-led', 'Veteran-led'] },
  { key: 'planning', label: 'Planning', labelKey: 'profile.bpAttrPlanning', options: ['Quick visit', 'Appointment required'] },
  { key: 'crowd', label: 'Crowd', labelKey: 'profile.bpAttrCrowd', options: ['Family-friendly', 'Good for kids'] },
  { key: 'children', label: 'Children', labelKey: 'profile.bpAttrChildren', options: ['Good for kids', 'Has changing table(s)'] },
  { key: 'pets', label: 'Pets', labelKey: 'profile.bpAttrPets', options: ['Pet-friendly'] },
  { key: 'identity', label: 'From the business', labelKey: 'profile.bpAttrIdentity', options: ['Identifies as women-owned', 'Identifies as veteran-owned', 'Small business'] },
]

/**
 * WHO WORKS AT WHICH BRANCH. Staff belong to a shop floor, not to a company account —
 * the team sheet was a single hard-coded list in the Profile screen, which meant every
 * branch appeared to be run by the same three people. Roles reuse the catalog keys the
 * sheet already renders; names are content and stay unkeyed, like reviewer names.
 */
export const STORE_TEAM = {
  'lks-ind': [
    { name: 'Rajesh Kumar', roleKey: 'profile.teamRolePrimaryAdmin', initials: 'RK', color: '#0070FC' },
    { name: 'Priya Nair', roleKey: 'profile.teamRoleServiceDesk', initials: 'PN', color: '#22D38B' },
  ],
  'lks-kor': [
    { name: 'Anita Reddy', roleKey: 'profile.teamRolePrimaryAdmin', initials: 'AR', color: '#0070FC' },
    { name: 'Imran Sheikh', roleKey: 'profile.teamRoleSalesFloor', initials: 'IS', color: '#0070FC' },
  ],
  // Vikram Shetty, not Suresh Iyer: the city table already named him HSR Layout's
  // manager, and Suresh Iyer runs Jayanagar. One person, one shop floor.
  'lks-new': [
    { name: 'Vikram Shetty', roleKey: 'profile.teamRolePrimaryAdmin', initials: 'VS', color: '#0070FC' },
    { name: 'Divya Menon', roleKey: 'profile.teamRoleServiceDesk', initials: 'DM', color: '#22D38B' },
  ],
}

export const BUSINESS_PROFILE = {
  about: {
    name: 'Lakshmi Electronics',
    primaryCategory: 'Consumer Electronics Store',
    secondaryCategories: ['Home Appliance Store', 'Air Conditioning Store'],
    description: 'Lakshmi Electronics is a neighbourhood consumer-electronics store offering televisions, air conditioners, home appliances and accessories — with no-cost EMI, home delivery and same-day installation.',
    openingDate: 'April 2016',
  },
  contact: {
    phone: '+91 80 4567 ••••',
    chat: 'https://wa.me/918045670000',
    website: 'https://lakshmielectronics.example/indiranagar',
    menuLink: null,
  },
  location: {
    address: '127, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
    serviceArea: ['Indiranagar', 'Domlur', 'CV Raman Nagar'],
  },
  hours: {
    status: 'Open with main hours',
    main: {
      Monday: '10:00–21:30', Tuesday: '10:00–21:30', Wednesday: '10:00–21:30',
      Thursday: '10:00–21:30', Friday: '10:00–21:30', Saturday: '10:00–21:30', Sunday: 'Closed',
    },
    more: [
      {
        label: 'Delivery',
        hours: {
          Monday: '10:00–18:00', Tuesday: '10:00–18:00', Wednesday: '10:00–18:00',
          Thursday: '10:00–18:00', Friday: '10:00–18:00', Saturday: 'Not set', Sunday: 'Not set',
        },
      },
    ],
    special: [],
  },
  // keyed by ATTRIBUTE_GROUPS[].key — selected values per group
  attributes: {
    service: ['In-store shopping', 'Delivery', 'On-site services'],
    accessibility: ['Wheelchair-accessible entrance'],
    amenities: [],
    payments: ['UPI', 'Debit cards', 'No-cost EMI'],
    parking: ['Free street parking', 'Free parking lot'],
    offerings: ['Installation', 'Trade-in'],
    highlights: ['Locally owned'],
    planning: [],
    crowd: [],
    children: [],
    pets: [],
    identity: [],
  },
}

// ============================================================
// GOOGLE BUSINESS PROFILE INSIGHTS — discovery, engagement and leads
//
// The six numbers Google reports for a listing: how many people SAW the profile, and
// what they then DID with it (call, directions, website). Selector: getStoreInsights()
// in packages/core/data/insights.js.
//
// WHY A DAILY SERIES AND NOT SIX TOTALS. Every windowed selector in this app takes the
// same window argument (see timeWindow.js) and every headline is compared against the
// preceding window of the same length. Six frozen totals could answer exactly one
// question ("last 30 days") and would have to fake the "vs previous period" delta. A
// day-by-day series answers any window honestly, and both invariants the panel promises
//
//     actionRate  = totalActions / profileViews
//     totalActions = clickToCall + storeVisits + websiteVisits
//
// then hold by ARITHMETIC over whatever range is asked for, rather than by three
// hand-tuned numbers agreeing until someone edits one of them.
//
// SIZED FOR ONE STORE, NOT A BRAND. A single electronics showroom is a few thousand
// profile views a month — roughly 90–130 a day at the flagship, fewer at the newer
// outlets. (Brand-level dashboards quote millions; that figure across one shop would be
// nonsense, and a manager would stop believing the panel on sight.) Action rates land
// around 6–9%, and calls outnumber direction requests, which outnumber website taps —
// the shape of a high-consideration purchase people phone about first.
//
// DETERMINISTIC. The wobble is a hash of store + metric + day, never Math.random(), so
// the panel shows the same numbers on every render, every reload and every test run.
// Each metric carries its own 30-day trend, which is why the six deltas differ from one
// another instead of all reading like one growth rate applied six times.
// ============================================================

/** How much history the series holds. 760 days ⇒ even 'last365' has a full previous year. */
export const STORE_INSIGHT_DAYS = 760

/**
 * Per store: the CURRENT daily average of each metric, and its 30-day trend.
 *
 * `base` is today's expected value per day; `trend` is the fraction that metric has
 * grown over the last 30 days (negative = declining), applied backwards through the
 * series so the recent end is the busy end.
 *
 * The trend SATURATES after STORE_INSIGHT_TREND_DAYS — see insightSeries(). A store
 * growing 11% a month does not grow 11% a month for two years; compounding it that far
 * would say the shop was a twelfth its present size in 2024, and every long-window
 * comparison would read as a triple-digit boom.
 */
export const STORE_INSIGHT_BASELINES = [
  {
    // Flagship: verified, 4.6★, the busiest of the three.
    storeId: 'lks-ind',
    base: { profileViews: 128, clickToCall: 5.0, storeVisits: 3.9, websiteVisits: 2.6 },
    trend: { profileViews: 0.06, clickToCall: 0.11, storeVisits: 0.04, websiteVisits: -0.03 },
  },
  {
    // Koramangala: fewer reviews, weaker health score, softer discovery.
    storeId: 'lks-kor',
    base: { profileViews: 96, clickToCall: 3.1, storeVisits: 2.4, websiteVisits: 1.7 },
    trend: { profileViews: 0.02, clickToCall: 0.05, storeVisits: -0.06, websiteVisits: 0.09 },
  },
  {
    // Added weeks ago and still unverified — small numbers, but climbing fast.
    storeId: 'lks-new',
    base: { profileViews: 54, clickToCall: 1.5, storeVisits: 1.1, websiteVisits: 0.7 },
    trend: { profileViews: 0.21, clickToCall: 0.18, storeVisits: 0.26, websiteVisits: 0.12 },
  },
]

/**
 * FNV-1a + murmur3 finalizer over a short string → a stable fraction in [0,1).
 * Same seed, same number, forever.
 *
 * THE FINALIZER IS NOT DECORATION. Our seeds differ only in their last character or
 * two ('…:clickToCall:28' vs '…:29'), and FNV-1a is one multiply away from its output
 * by then — the top bits barely move, so raw FNV clusters badly on this input family
 * (a 30-day run averaged 0.24 where it should average 0.50, i.e. a metric silently
 * running a quarter under its stated baseline). fmix32 avalanches those bits and the
 * same 30-day runs average 0.50 ± 0.05 across every store and metric.
 */
function insightNoise(seed) {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** How far back a trend keeps running before the series flattens out. */
export const STORE_INSIGHT_TREND_DAYS = 90

/**
 * One store's daily series, newest day first.
 *
 * Each row sits at "d days and 12 hours ago" — MIDDAY of that day rather than on the
 * hour boundary — so a rolling window can never half-include a day: 'last7' picks up
 * exactly days 0–6, and its previous window exactly days 7–13.
 *
 * The level d days ago is `base / (1 + trend · d/30)`, with d capped at
 * STORE_INSIGHT_TREND_DAYS. Over the last 30 days that is exactly the stated trend
 * (which is what "vs previous 30 days" reads); past the cap the series is flat, so a
 * year-long comparison shows the recent quarter's movement rather than two years of
 * compound interest.
 */
function insightSeries({ storeId, base, trend }) {
  const days = []
  for (let d = 0; d < STORE_INSIGHT_DAYS; d++) {
    const row = { dayOffsetMs: hoursAgo(d * 24 + 12) }
    // A mild weekly rhythm on top of the trend — weekends run hotter for retail.
    const week = 1 + 0.18 * Math.cos((2 * Math.PI * d) / 7)
    const back = Math.min(d, STORE_INSIGHT_TREND_DAYS) / 30
    for (const metric of ['profileViews', 'clickToCall', 'storeVisits', 'websiteVisits']) {
      // Floored so a steep decline can never divide through zero into a negative level.
      const decay = 1 / Math.max(0.25, 1 + trend[metric] * back)
      const jitter = 0.82 + 0.36 * insightNoise(`${storeId}:${metric}:${d}`)
      row[metric] = Math.max(0, Math.round(base[metric] * decay * week * jitter))
    }
    days.push(row)
  }
  return days
}

/** `{ [storeId]: [{ dayOffsetMs, profileViews, clickToCall, storeVisits, websiteVisits }] }`. */
export const STORE_INSIGHTS = Object.fromEntries(
  STORE_INSIGHT_BASELINES.map(b => [b.storeId, insightSeries(b)]),
)

// ============================================================
// REFINEMENTS
// ============================================================

// -------- Voice Outbound Agent (upsell → Nova admin) --------
// Whether the AI Voice Outbound Agent is enabled at this location. Default OFF for the
// demo so the store manager sees the "Request for this location" upsell → routed to Nova admin.
export const OUTBOUND_AGENT_ENABLED = false

// -------- AI token ledger: REMOVED (scope 1 cut) --------
// AI_TOKENS (balance / allotment / costs / ledger) is gone along with the tokens sheet.
//
// REVIEW_AI_COST is the last survivor and only because src/screens/Reviews.jsx still
// imports it through the data boundary (3 usages: the "costs N tokens" label, the
// reply-posted toast, and the AI reply button). Removing it now is a hard Rollup error,
// so it stays until that screen drops it — then delete this constant, the re-export in
// src/data/reviews.js, and the line in src/data/index.js.
export const REVIEW_AI_COST = 15

// makePlusCode() and profileCompleteness() moved to src/data/locations.js and src/data/profile.js.
