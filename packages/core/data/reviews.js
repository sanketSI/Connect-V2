// Reviews domain: the review inbox with its reply history, the team leaderboard, the
// listing metrics, and the Nova filter set.
import {
  REVIEWS, REVIEW_LEADERBOARD, REVIEW_AI_COST, REVIEW_TAGS, PUBLISHING_PLATFORMS,
  PRIMARY_STORE_ID,
} from '../lib/seedData.js'
import { resolveAt, offsetForInstant } from './format.js'
import { queryScope } from './assignments.js'
import { resolveWindow, previousWindow, windowDays } from './timeWindow.js'
import { getCurrentUser } from './session.js'
import { liveClient } from '../lib/supabase.js'
import { storage } from '../storage.js'
import { emitChange } from '../events.js'
import { track } from '../analytics.js'

// ============================================================
// DERIVED FIELDS — one source of truth per fact.
//
// A review's `body` and our replies are the real words of a real exchange — content, not
// UI copy, never keyed. What IS derived here:
//
//   sentiment  ← rating. Deliberately arithmetic, not sentiment analysis: 4–5 positive,
//                3 neutral, 1–2 negative. The star is the customer's own verdict, so
//                deriving from it is honest and explains itself on screen. (A "5★ but the
//                text complains" review would be misread — that is the known trade-off,
//                and the alternative is inventing an NLP score we do not have.)
//   hasText    ← a body with actual words in it.
//   responded  ← any reply that is still live.
//   aiReply    ← the latest live reply's text. LEGACY: `responded`/`aiReply` exist because
//                Reviews.jsx reads them; `replies` is the real model. Both are computed
//                from `replies` so they cannot drift out of sync.
//   repliedAtMs ← when the FIRST reply went out (even if later deleted — we did answer).
// ============================================================

const SENTIMENT_BY_RATING = { 5: 'positive', 4: 'positive', 3: 'neutral', 2: 'negative', 1: 'negative' }

/** Sentiment for a rating: 4–5 positive, 3 neutral, 1–2 negative. */
export function sentimentForRating(rating) {
  return SENTIMENT_BY_RATING[rating] || 'neutral'
}

const wordCount = (body) => (body ? String(body).trim().split(/\s+/).filter(Boolean).length : 0)

/**
 * The three fields derived from a reply list — `responded` / `aiReply` / `repliedAtMs`
 * (see the DERIVED FIELDS note above). ONE function, used both when a review is first
 * resolved and after postReviewReply() appends to it, so the mirrors can never be
 * recomputed one way in one place and another way in the other.
 *
 * @param replies  oldest first, `atMs` already resolved.
 */
function replyMirrors(replies) {
  const live = replies.filter(rep => !rep.deleted)
  return {
    responded: live.length > 0,
    aiReply: live.length ? live[live.length - 1].text : null,
    repliedAtMs: replies.length ? replies[0].atMs : null,
  }
}

// ============================================================
// REPLY PERSISTENCE
//
// A public reply is the one thing on this screen the MANAGER wrote and PUBLISHED. Losing
// it on a tab switch (which is what a component-state overlay did) teaches him the reply
// never went out — so it lives here, exactly the way addCustomerNote() keeps his notes:
// the core storage seam (packages/core/storage.js — localStorage on web), behind this
// boundary, plus a fire-and-forget write-through when a live backend is configured.
//
// TIMING: readStoredReplies() runs at MODULE SCOPE (via the RESOLVED map below), so the
// storage driver must be configured before this module loads — the boot gate in
// apps/web/src/main.jsx guarantees it (configureStorage runs before any core import).
//
// Only manager-posted replies are stored. Seeded ones live in the seed and are merged in
// at load, so a seed edit still shows up and a stale copy can never shadow it.
//
// STORED AS ABSOLUTE EPOCH MS, never as an offset — see offsetForInstant() in format.js
// for why an `atOffsetMs` in storage would drift a reply later on every reload.
// ============================================================

const REPLIES_KEY = 'connect-review-replies'

/** `{ [reviewId]: [{ id, platform, text, author, atMs }] }`. Never throws: storage may be blocked. */
function readStoredReplies() {
  try {
    const raw = storage.getItem(REPLIES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Anything could be under this key — another app, an older shape, a half-written
    // value. Treat a bad payload as "no replies" rather than losing the screen to it.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist one posted reply, appended to whatever that review already has. */
function persistReply(reviewId, reply) {
  const all = readStoredReplies()
  const list = Array.isArray(all[reviewId]) ? all[reviewId] : []
  all[reviewId] = [...list, {
    id: reply.id, platform: reply.platform, text: reply.text, author: reply.author, atMs: reply.atMs,
  }]
  storage.setItem(REPLIES_KEY, JSON.stringify(all))
}

/**
 * Rewrite one stored reply in place — the edit path. A SEEDED reply has no stored row
 * yet, so this creates one rather than silently no-opping: without that the edit would
 * survive until reload and then vanish back to the seed text.
 */
function persistReplyPatch(reviewId, replyId, patch) {
  const all = readStoredReplies()
  const list = Array.isArray(all[reviewId]) ? all[reviewId] : []
  const i = list.findIndex(rep => rep && rep.id === replyId)
  all[reviewId] = i === -1 ? [...list, { id: replyId, ...patch }] : list.map((rep, k) => (k === i ? { ...rep, ...patch } : rep))
  storage.setItem(REPLIES_KEY, JSON.stringify(all))
}

/** Stored replies for one review, rebuilt into live records against THIS session's clock. */
function restoredRepliesFor(reviewId) {
  const list = readStoredReplies()[reviewId]
  if (!Array.isArray(list)) return []
  return list
    .filter(rep => rep && typeof rep.text === 'string' && Number.isFinite(rep.atMs))
    .map(rep => ({
      id: rep.id,
      platform: rep.platform,
      text: rep.text,
      author: rep.author,
      atMs: rep.atMs,
      atOffsetMs: offsetForInstant(rep.atMs), // absolute → this session's offset frame
      // Read from storage, NOT hardcoded false. A retraction that came back un-deleted
      // on the next reload would be the app quietly re-publishing something the manager
      // took down — the one direction this must never fail in.
      deleted: !!rep.deleted,
      deletedAtMs: Number.isFinite(rep.deletedAtMs) ? rep.deletedAtMs : null,
    }))
}

// HYDRATION TOLERANCE (throughout): rows from Supabase (src/data/hydrate.js)
// already carry real `*AtMs` instants; seed rows carry offsets. Prefer the
// real instant, resolve the offset otherwise.
function resolveReview(r) {
  const seeded = r.replies || []
  // Seeded/hydrated replies, then whatever the manager posted in an earlier session.
  // The id filter dedupes the hydrated case: a reply postReviewReply() wrote to BOTH
  // the backend and local storage comes back from both on the next boot.
  const replies = [
    ...seeded,
    ...restoredRepliesFor(r.id).filter(rep => !seeded.some(s => s.id === rep.id)),
  ].map(rep => ({
    ...rep,
    atMs: rep.atMs ?? resolveAt(rep.atOffsetMs),
    deletedAtMs: rep.deletedAtMs ?? (rep.deletedAtOffsetMs != null ? resolveAt(rep.deletedAtOffsetMs) : null),
  })).sort((a, b) => a.atMs - b.atMs)

  const words = wordCount(r.body)

  return {
    ...r,
    atMs: r.atMs ?? resolveAt(r.atOffsetMs),
    editedAtMs: r.editedAtMs ?? (r.editedAtOffsetMs != null ? resolveAt(r.editedAtOffsetMs) : null),
    removedAtMs: r.removedAtMs ?? (r.removedAtOffsetMs != null ? resolveAt(r.removedAtOffsetMs) : null),
    replies,
    sentiment: sentimentForRating(r.rating),
    words,
    hasText: words > 0,
    tags: r.tags || [],
    removed: !!r.removed,
    edited: !!r.edited,
    // Legacy mirrors — see the note above.
    ...replyMirrors(replies),
  }
}

// Newest first, once, so every caller shares one order and one set of objects.
//
// ONE OBJECT PER REVIEW is load-bearing here, exactly as in calls.js: getReviews() and
// filterReviews() hand back these very objects rather than copies, so postReviewReply()
// mutating a record is visible through every selector at once. Re-wrapping anywhere would
// fork the identity and the mutator would appear to do nothing.
const RESOLVED = REVIEWS.map(r => ({ ...resolveReview(r), storeId: r.storeId ?? PRIMARY_STORE_ID }))
  .sort((a, b) => b.atMs - a.atMs)

// ============================================================
// FILTER OPTION CATALOGS — what the UI renders its chips from.
// ============================================================

export const REVIEW_SENTIMENTS = [
  { id: 'all', label: 'All', labelKey: 'reviews.sentimentAll' },
  { id: 'positive', label: 'Positive', labelKey: 'reviews.sentimentPositive' },
  { id: 'neutral', label: 'Neutral', labelKey: 'reviews.sentimentNeutral' },
  { id: 'negative', label: 'Negative', labelKey: 'reviews.sentimentNegative' },
]

export const REVIEW_RATING_TYPES = [
  { id: 'both', label: 'Both', labelKey: 'reviews.ratingTypeBoth' },
  { id: 'withText', label: 'Rating with text', labelKey: 'reviews.ratingTypeWithText' },
  { id: 'withoutText', label: 'Rating without text', labelKey: 'reviews.ratingTypeWithoutText' },
]

export const REVIEW_STATUSES = [
  { id: 'both', label: 'Both', labelKey: 'reviews.statusBoth' },
  { id: 'replied', label: 'Replied', labelKey: 'reviews.statusReplied' },
  { id: 'unreplied', label: 'Unreplied', labelKey: 'reviews.statusUnreplied' },
]

/** The defaults a fresh filter panel should open on. */
export const DEFAULT_REVIEW_FILTERS = {
  window: 'last30',
  rating: { min: 1, max: 5 },
  sentiment: 'all',
  ratingType: 'both',
  status: 'both',
  showRemoved: false,
  editedOnly: false,
  tags: [],
}

// ============================================================
// GETTERS
// ============================================================

/**
 * The reviews on the live listing, newest first.
 *
 * Excludes reviews Google has REMOVED, deliberately: a taken-down review is not on your
 * listing, and an inbox that shows it is telling the dealer something untrue. Same default
 * as filterReviews({ showRemoved: false }) and newReviewsCount(), so the inbox, the
 * filters and the counters all agree on what "your reviews" means.
 *
 * For the removed ones — the "show removed from Google" toggle — use
 * `filterReviews({ showRemoved: true })`. getReviewById() still finds them either way.
 */
export function getReviews() {
  return RESOLVED.filter(r => !r.removed)
}

/** One review by id, with its full reply history. Finds removed reviews too. */
export function getReviewById(id) {
  return RESOLVED.find(r => r.id === id) || null
}

/**
 * The reply history of a review, oldest first — including replies we DELETED.
 * Each entry: `{ id, platform, text, author, atMs, deleted, deletedAtMs }`.
 * `platform` is a PUBLISHING_PLATFORMS id — where the reply was published.
 */
export function getReviewReplies(reviewOrId) {
  const review = typeof reviewOrId === 'string' ? getReviewById(reviewOrId) : reviewOrId
  return review?.replies || []
}

// ============================================================
// THE CUSTOMER JOIN — "does this caller have a negative review?"
//
// Google gives us a display name and a star, never a phone number, so a review does not
// come with a caller attached. `customerId` on a review is therefore a CLAIM someone made
// deliberately, record by record, and the seed spells out the evidence for each one (see
// the customerId note in the REVIEWS header). Two of twenty-one carry it.
//
// The selectors below join on that id and on NOTHING else. In particular they do not fall
// back to matching names, or to the last three digits of a number, when the id is absent —
// a near-miss would attach a stranger's one-star review to a customer's record, on screen,
// as fact. An unlinked review is silently not this customer's, which is the truth: we do
// not know who wrote it.
//
// So a `null` from negativeReviewFor() means "no review we can PROVE is theirs", not "this
// customer is happy" — and the call detail is careful to say the former.
// ============================================================

/**
 * The reviews we can prove this customer wrote, newest first.
 *
 * Live listing only, deliberately: a review Google removed is not on your listing, so it
 * cannot be the negative review a manager is about to be ambushed by. Same rule getReviews()
 * already applies — see its note.
 *
 * @param customerOrId  a customer record or its id.
 * @returns [] for an unknown customer, and for the many customers who simply never reviewed.
 */
export function getReviewsForCustomer(customerOrId) {
  const id = typeof customerOrId === 'string' ? customerOrId : customerOrId?.id
  if (!id) return []
  return RESOLVED.filter(r => r.customerId === id && !r.removed)
}

/**
 * This customer's worst live negative review (1–2★), or null.
 *
 * "Worst, then newest" is the order a manager needs: if someone left a 1★ and a 2★, the
 * 1★ is the one about to cost the store the next walk-in. Returns the whole review — the
 * caller wants to SHOW it (stars, words, when), not just know a boolean.
 *
 * null is the common and correct answer. Read it as "nothing we can attribute to them",
 * never as "no complaints".
 */
export function negativeReviewFor(customerOrId) {
  const negatives = getReviewsForCustomer(customerOrId).filter(r => r.sentiment === 'negative')
  if (!negatives.length) return null
  return negatives.sort((a, b) => a.rating - b.rating || b.atMs - a.atMs)[0]
}

/** Team review leaderboard (brand / cluster views). */
export function getReviewLeaderboard() {
  return REVIEW_LEADERBOARD
}

/** Count of reviews still awaiting a reply, ALL TIME (live listing only). */
export function newReviewsCount(storeId) {
  const scope = new Set(queryScope(storeId))
  return RESOLVED.filter(r => !r.responded && !r.removed && scope.has(r.storeId)).length
}

// ============================================================
// THE CANONICAL "WAITING FOR A REPLY" COUNT
//
// Same job as openMissedCount() in calls.js, and it exists for the same reason: four
// surfaces once printed four different numbers for the same fact in one session (Home
// said 4, the tab badge said 2, the AI summary said ten, the response-time tile implied
// ten). See the long note in calls.js for the two rules.
//
// THE DEFINITION: a review is WAITING FOR A REPLY when it is live on the listing and
// carries no reply we have not since deleted. `responded` is that fact, derived once in
// replyMirrors() from the reply list, so it cannot drift. Reviews Google has REMOVED are
// excluded — a review that is not on your listing is not waiting for anything, which is
// the rule getReviews() and filterReviews() already apply.
//
// THE WINDOW is the last 30 days — DEFAULT_REVIEW_FILTERS.window, i.e. what the Reviews
// screen opens on. A badge has no room to name its window, so the badge has to mean what
// the screen behind it shows.
// ============================================================

/** The window every "waiting for a reply" count on every screen is measured over. */
export const CANONICAL_REVIEW_WINDOW = DEFAULT_REVIEW_FILTERS.window

/** Reviews live on the listing with no reply posted, over the canonical window. */
export function reviewsWaitingCount(win = CANONICAL_REVIEW_WINDOW, storeId) {
  return filterReviews({ window: win, status: 'unreplied', storeId }).length
}

/** Can a reply be published to this platform today? Scope 1: GBP only. */
export function canPublishReply(platformId) {
  return !!PUBLISHING_PLATFORMS.find(p => p.id === platformId)?.publishable
}

/** Catalog entry for a REVIEW_TAGS id — render `t(tag.labelKey, { defaultValue: tag.label })`. */
export function reviewTag(id) {
  return REVIEW_TAGS.find(t => t.id === id)
}

// ============================================================
// THE REVIEW LINK — one shape, one code, for every surface that asks for a review.
//
// `si.link/r/<CODE>` is the short-link the app already hands to customers (the WhatsApp
// / SMS builder on the Customers screen). It is short enough to read off a printed QR
// card, and short enough that the QR itself stays a coarse, phone-scannable grid.
//
// The CODE is FNV-1a over the link's subject → six base36 characters. Deterministic on
// purpose: the same store gets the same link every time, so a QR printed and stuck to
// the counter in January still resolves in December, and a landed review can be
// attributed back to where it was scanned.
//
// TWO SUBJECTS, ONE FORMAT:
//   storeReviewLink('lks-ind')     the counter/QR link — anyone in the shop.
//   reviewLinkFor(customer)        one named customer, seeded `store:customer`.
//
// The per-customer builder still lives in apps/web/src/screens/Customers.jsx and holds
// its own copy of this hash. It should import reviewLinkCode() from here — same
// algorithm, same output — but that file is being edited elsewhere right now, so the
// canonical implementation lands here first.
// ============================================================

/** FNV-1a → six base36 chars. The code half of a `si.link/r/…` review link. */
export function reviewLinkCode(subject) {
  const seed = String(subject ?? '')
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).toUpperCase().padStart(6, '0').slice(-6)
}

/**
 * This store's public review link — what the counter QR encodes.
 *
 * @param storeOrId  a store record or a MAPPED_LOCATIONS id.
 * @returns the full https URL, or null when we were handed no store (so a caller
 *          cannot print a QR that encodes the string "undefined").
 */
export function storeReviewLink(storeOrId) {
  const id = typeof storeOrId === 'string' ? storeOrId : storeOrId?.id
  if (!id) return null
  return `https://si.link/r/${reviewLinkCode(id)}`
}

// ============================================================
// FILTERING
// ============================================================

/**
 * The Nova filter set, in one call. Every key is optional; omit one and it does not filter.
 *
 * @param f.window      time window — anything resolveWindow() takes. Default: all time.
 * @param f.rating      { min, max } or [min, max], 1–5 inclusive.
 * @param f.sentiment   'all' | 'positive' | 'neutral' | 'negative'
 * @param f.ratingType  'both' | 'withText' | 'withoutText'
 * @param f.status      'both' | 'replied' | 'unreplied'
 * @param f.showRemoved include reviews Google took down. DEFAULT FALSE — a removed review
 *                      is not on your listing, so counting it by default would overstate
 *                      every metric on the screen.
 * @param f.editedOnly  only reviews the customer edited after posting.
 * @param f.tags        REVIEW_TAGS ids — matches a review carrying ANY of them.
 * @returns reviews, newest first.
 */
/**
 * Edit a reply that has already gone out (PM feedback 9).
 *
 * Keeps the reply's ID, AUTHOR, PLATFORM AND ORIGINAL TIME. A correction is not a second
 * reply: replies are ordered by `atMs` and `repliedAtMs` is the moment the customer was
 * first answered, so re-stamping an edit would move the review in the list and overstate
 * how slowly it was handled — the metric this screen is judged on.
 *
 * An empty body is a no-op, not a retraction. Taking a public reply down is a separate,
 * deliberate action (deleteReviewReply) and must not be reachable by a stray backspace.
 *
 * @returns the updated reply, or null if it could not be found.
 */
export function updateReviewReply(reviewId, replyId, body) {
  const review = getReviewById(reviewId)
  const text = String(body ?? '').trim()
  if (!review || !text || !replyId) return null

  const reply = (review.replies || []).find(rep => rep.id === replyId)
  if (!reply || reply.deleted) return null
  if (reply.text === text) return reply

  reply.text = text
  Object.assign(review, replyMirrors(review.replies))
  persistReplyPatch(reviewId, replyId, {
    platform: reply.platform, text, author: reply.author, atMs: reply.atMs, deleted: false,
  })

  const sb = liveClient()
  if (sb) {
    sb.from('review_replies').update({ body: text }).eq('id', replyId)
      .throwOnError().then(null, (e) => console.warn('[data] supabase updateReviewReply failed:', e))
  }
  emitChange()
  return reply
}

/**
 * Take a published reply down (PM feedback 9).
 *
 * A SOFT delete: the row stays, flagged, because `repliedAtMs` must keep saying the
 * customer WAS answered at the time they were — we did reply, and later retracted it.
 * replyMirrors() already filters deleted replies out of `responded` and `aiReply`, so
 * the review correctly returns to the unanswered queue without rewriting history.
 *
 * NOT MIRRORED TO SUPABASE, deliberately, and for the reason postReviewReply already
 * documents for the same column: `deleted` is not in the anon grant (migration 0002)
 * because retracting a public reply is a moderation action, not a client write. Sending
 * it would fail permission-denied. Local + storage is the honest extent of it here.
 *
 * @returns the deleted reply, or null if it could not be found.
 */
export function deleteReviewReply(reviewId, replyId) {
  const review = getReviewById(reviewId)
  if (!review || !replyId) return null

  const reply = (review.replies || []).find(rep => rep.id === replyId)
  if (!reply || reply.deleted) return null

  const atMs = Date.now()
  reply.deleted = true
  reply.deletedAtMs = atMs
  Object.assign(review, replyMirrors(review.replies))
  persistReplyPatch(reviewId, replyId, {
    platform: reply.platform, text: reply.text, author: reply.author, atMs: reply.atMs,
    deleted: true, deletedAtMs: atMs,
  })

  emitChange()
  return reply
}

export function filterReviews(f = {}) {
  const {
    window: win = 'all', rating, sentiment = 'all', ratingType = 'both',
    status = 'both', showRemoved = false, editedOnly = false, tags = [], storeId,
  } = f

  const { startMs, endMs } = resolveWindow(win)
  const min = Array.isArray(rating) ? rating[0] : rating?.min ?? 1
  const max = Array.isArray(rating) ? rating[1] : rating?.max ?? 5
  const scope = new Set(queryScope(storeId))

  return RESOLVED.filter(r => {
    // No storeId asked for = every store THIS MANAGER HOLDS — see queryScope().
    if (!scope.has(r.storeId)) return false
    if (r.atMs < startMs || r.atMs > endMs) return false
    if (!showRemoved && r.removed) return false
    if (r.rating < min || r.rating > max) return false
    if (sentiment !== 'all' && r.sentiment !== sentiment) return false
    if (ratingType === 'withText' && !r.hasText) return false
    if (ratingType === 'withoutText' && r.hasText) return false
    if (status === 'replied' && !r.responded) return false
    if (status === 'unreplied' && r.responded) return false
    if (editedOnly && !r.edited) return false
    if (tags.length && !tags.some(t => r.tags.includes(t))) return false
    return true
  }).sort((a, b) => b.atMs - a.atMs)
}

// ============================================================
// METRICS
// ============================================================

const median = (nums) => {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * The listing metrics, over the same filter object filterReviews() takes.
 *
 * Passing filters (not just a window) is deliberate: the numbers should describe what the
 * dealer is looking at. `reviewMetrics({ window: 'last7' })` is the common case.
 *
 * How each is defined — these are conventions, not laws, so they are spelled out:
 *
 *  • total       — reviews in the filtered set.
 *  • avgRating   — mean of their stars, 1 decimal. null when the set is empty (never 0 —
 *                  "0.0★" would read as terrible rather than as no data).
 *  • richness    — how much the reviews actually SAY. Two numbers: `withTextPct`, the
 *                  share carrying any words at all, and `score`, the share that are
 *                  SUBSTANTIVE (>= RICH_WORD_MIN words — enough to name a product, a
 *                  person or a problem, which is what makes a review persuasive to the
 *                  next shopper and useful to us). `avgWords` is the raw input. A wall of
 *                  bare 5★ taps scores 0 richness, which is the honest read.
 *  • velocity    — how fast reviews are arriving: `perWeek` (the headline), `perDay`, plus
 *                  `prevCount`/`changePct` against the immediately preceding window of the
 *                  same length, because "12 reviews" only means something next to last
 *                  month's 8. Undefined for all-time (no "before" to compare with).
 *  • responseTime— how long WE take to reply: from the review landing to our FIRST reply
 *                  going out (a reply we later deleted still counts — we did answer).
 *                  `medianMs` is the headline (one holiday-week outlier should not move
 *                  it), `meanMs` alongside it. Only replied reviews count, so unreplied
 *                  ones are reported separately rather than silently scored as instant.
 *
 * All durations are ms — the UI formats them.
 */
export const RICH_WORD_MIN = 12

export function reviewMetrics(filters = { window: 'last30' }) {
  const set = filterReviews(filters)
  const win = filters.window ?? 'all'

  const total = set.length
  const avgRating = total ? Math.round((set.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10 : null

  // Richness
  const withText = set.filter(r => r.hasText)
  const rich = set.filter(r => r.words >= RICH_WORD_MIN)
  const richness = {
    score: total ? Math.round((rich.length / total) * 100) : 0,
    withTextPct: total ? Math.round((withText.length / total) * 100) : 0,
    withTextCount: withText.length,
    withoutTextCount: total - withText.length,
    richCount: rich.length,
    avgWords: total ? Math.round(set.reduce((s, r) => s + r.words, 0) / total) : 0,
    wordMin: RICH_WORD_MIN,
  }

  // Velocity
  const days = windowDays(win)
  const prevWin = previousWindow(win)
  const prevCount = prevWin ? filterReviews({ ...filters, window: prevWin }).length : null
  const velocity = {
    count: total,
    perDay: Number.isFinite(days) && days > 0 ? Math.round((total / days) * 100) / 100 : null,
    perWeek: Number.isFinite(days) && days > 0 ? Math.round((total / days) * 7 * 10) / 10 : null,
    prevCount,
    changePct: prevCount ? Math.round(((total - prevCount) / prevCount) * 100) : null,
  }

  // Response time
  const replied = set.filter(r => r.repliedAtMs != null)
  const lags = replied.map(r => r.repliedAtMs - r.atMs)
  const responseTime = {
    medianMs: median(lags),
    meanMs: lags.length ? Math.round(lags.reduce((s, n) => s + n, 0) / lags.length) : null,
    repliedCount: replied.length,
    unrepliedCount: total - set.filter(r => r.responded).length,
  }

  return { total, avgRating, richness, velocity, responseTime }
}

// ============================================================
// MUTATORS
//
// Same contract as calls.js / customers.js: mutate the ONE shared record in place (see the
// identity note on RESOLVED), persist behind this boundary, mirror to the live backend
// fire-and-forget, then emitChange() so every screen holding a derived count re-reads.
// Going live means swapping the body for an API call and changing nothing on any screen.
// ============================================================

let replySeq = 0

/**
 * Publish a reply to a review — the manager's public answer, as posted.
 *
 * PERSISTS: the reply survives a tab switch AND a reload (storage seam, see the reply
 * store above). It is a real record on the review from the moment this returns, so
 * filterReviews({ status: 'replied' }) and reviewMetrics() both count it immediately —
 * unlike the component-state overlay this replaced, where a reply vanished with the tab.
 *
 * The text is whatever was published and is stored verbatim — never keyed, never
 * translated. Author defaults to the signed-in user.
 *
 * @param reviewId        the review being answered.
 * @param body            the reply text.
 * @param platform        PUBLISHING_PLATFORMS id to publish to. Must be publishable —
 *                        an unpublishable one is a caller bug (the composer is already
 *                        gated on canPublishReply), so it throws rather than silently
 *                        recording a reply that never went anywhere.
 * @param author          defaults to the signed-in user's name.
 * @returns the new reply, or null if the review or the text is missing.
 */
export function postReviewReply(reviewId, { body, platform, author } = {}) {
  const review = getReviewById(reviewId)
  const text = String(body ?? '').trim()
  if (!review || !text) return null
  if (!canPublishReply(platform)) {
    throw new Error(`postReviewReply: cannot publish a reply to platform "${platform}"`)
  }

  const atMs = Date.now()
  const reply = {
    id: `rp-${reviewId}-${atMs.toString(36)}-${replySeq++}`,
    platform,
    text,
    author: author || getCurrentUser().name,
    atMs,
    atOffsetMs: offsetForInstant(atMs),
    deleted: false,
    deletedAtMs: null,
  }

  // In place, so a screen holding this record sees it; then re-derive the mirrors from
  // the SAME helper resolveReview() uses, so `responded` / `aiReply` / `repliedAtMs`
  // cannot drift out of sync with `replies`.
  review.replies.push(reply)
  review.replies.sort((a, b) => a.atMs - b.atMs)
  Object.assign(review, replyMirrors(review.replies))

  // Then to storage, so the next session still has it. Both, or the reply is half-saved.
  persistReply(reviewId, reply)

  // Live backend: mirror, fire-and-forget — the local write above stays the synchronous
  // truth. (Same id both sides; the resolveReview() merge dedupes on it.)
  const sb = liveClient()
  if (sb) {
    sb.from('review_replies').insert({
      id: reply.id,
      review_id: reviewId,
      platform: reply.platform,
      body: reply.text,
      author: reply.author,
      at: new Date(reply.atMs).toISOString(),
      // `deleted` is intentionally NOT sent: the column defaults false (0001) and is
      // not in the anon INSERT grant (0002) — retracting a reply is a moderation
      // action, not a client write. Sending it would fail permission-denied.
    }).throwOnError().then(null, (e) => console.warn('[data] supabase postReviewReply failed:', e))
  }

  // A public reply went out — time-to-reply is the metric this screen is judged on, so
  // it is recorded HERE, in the mutator, no matter which surface posted it. IDS, ENUMS
  // and DURATIONS only: review id, platform, the star rating, and how long the review
  // waited. NEVER the reply text or the author — the sanitiser would strip them anyway,
  // which is the point of enforcing privacy in the module. `ai_draft_used` / `edited`
  // are not known at this seam (the composer that holds them does not pass them), so
  // they are left off rather than guessed.
  track('review_reply_published', {
    review_id: reviewId,
    platform: reply.platform,
    rating: review.rating ?? null,
    minutes_to_reply: Number.isFinite(review.atMs) ? Math.round((atMs - review.atMs) / 60000) : undefined,
  })

  // Pushed onto a shared array in place — invisible to React until we say so.
  emitChange()
  return reply
}

// Reference data re-exported through the boundary.
export { REVIEW_TAGS, PUBLISHING_PLATFORMS }

// AI token cost of an AI-authored review reply.
// SCOPE 1 REMOVAL, BLOCKED: the token ledger is gone, but Reviews.jsx still imports this
// through the boundary. Delete it here and in the seed once that screen stops using it.
export { REVIEW_AI_COST }
