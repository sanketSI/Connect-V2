// Calls domain: missed / connected / IVR-drop records, the call-back queue, the unified
// call log with its windowed roll-ups, and win-back selectors. Getters return records
// (swap the source for a real API later); selectors own the business logic that used to
// live in the seed file.
import {
  MISSED_CALLS, CONNECTED_CALLS, IVR_DROPS, CALL_HISTORY,
  CATEGORY_KEYS, CALL_REASON_KEYS, CALL_REASONS, SOURCES, OUTBOUND_AGENT_ENABLED,
  PRIMARY_STORE_ID,
} from '../lib/seedData.js'
import { LEAD_STATUS_IDS } from './leadStatus.js'
import { resolveAt } from './format.js'
import { resolveWindow } from './timeWindow.js'
import { queryScope } from './assignments.js'
import { getCustomerById } from './customers.js'
import { liveClient } from '../lib/supabase.js'
import { emitChange } from '../events.js'
import { track } from '../analytics.js'

// Resolve each record's seed offset into a real `atMs` timestamp. Done once, at module
// load, so every caller shares one array of one set of objects — same identity the
// screens already rely on (`const MISSED_CALLS = getMissedCalls()` at module scope).
// The absolute instant is fixed here; how it READS ("12 minutes ago" vs "12 मिनट पहले")
// is decided at render time by the formatters in format.js.
//
// `*AtMs` (epoch ms), never `at`/`time` — those names still hold the old English display
// strings and must keep rendering until the UI switches over.
//
// ONE OBJECT PER CALL is the load-bearing rule here. getCalls() hands back these very
// objects rather than fresh copies, so setLeadStatus() mutating a record is visible
// through getMissedCalls() and getCalls() alike. Re-wrapping anywhere would fork the
// identity and the mutators would appear to do nothing (cf. locations.js).
// HYDRATION TOLERANCE: rows hydrated from Supabase (src/data/hydrate.js) carry a
// real `atMs` already; seed rows carry a session-relative `atOffsetMs`. Prefer
// the real instant, resolve the offset otherwise — same rule for transcript
// turns and the repeat history below.
const withAt = (rec, kind) => ({
  ...rec,
  atMs: rec.atMs ?? resolveAt(rec.atOffsetMs),
  // WHICH BRANCH TOOK THIS CALL. Explicit on the records written for the other two
  // stores; absent on the originals, which are all the flagship's.
  storeId: rec.storeId ?? PRIMARY_STORE_ID,
  kind,
  // The two-way classification the UI filters on. An IVR drop is MISSED: the caller hung
  // up inside the menu, nobody at the store ever spoke to them. Direction is irrelevant —
  // an outbound call-back that connected was still attended by a human.
  outcome: kind === 'connected' ? 'attended' : 'missed',
  transcript: rec.transcript
    ? rec.transcript.map(turn => ({ ...turn, atMs: turn.atMs ?? resolveAt(turn.atOffsetMs) }))
    : null,
})

const MISSED = MISSED_CALLS.map(m => ({
  ...withAt(m, 'missed'),
  repeatHistoryAtMs: m.repeatHistoryAtMs
    ?? (m.repeatHistoryOffsetsMs ? m.repeatHistoryOffsetsMs.map(o => resolveAt(o)) : undefined),
}))
const CONNECTED = CONNECTED_CALLS.map(c => withAt(c, 'connected'))
const IVR = IVR_DROPS.map(d => withAt(d, 'ivr'))
const HISTORY = CALL_HISTORY.map(h => withAt(h, h.kind))

/**
 * The whole call log — today's three buckets plus the older history — sorted newest first.
 * This is what every windowed selector runs on.
 */
const ALL = [...MISSED, ...CONNECTED, ...IVR, ...HISTORY].sort((a, b) => b.atMs - a.atMs)

// ============================================================
// REFERENCE DATA
// ============================================================

/** The two buckets the call list collapses to. */
export const CALL_OUTCOMES = [
  { id: 'missed', label: 'Missed', labelKey: 'calls.outcomeMissed' },
  { id: 'attended', label: 'Attended', labelKey: 'calls.outcomeAttended' },
]

// The lifecycle moved to leadStatus.js, a leaf both this module and leads.js can import
// without closing a cycle. Re-exported here so existing callers keep working.

/** Call sentiment — the tone the call ended on. */
export const CALL_SENTIMENTS = [
  { id: 'positive', label: 'Positive', labelKey: 'calls.sentimentPositive' },
  { id: 'negative', label: 'Negative', labelKey: 'calls.sentimentNegative' },
  { id: 'neutral', label: 'Neutral', labelKey: 'calls.sentimentNeutral' },
]

// ============================================================
// GETTERS
// ============================================================

/** Today's missed calls (includes spam-flagged; filter with `!m.spam` where needed). */
export function getMissedCalls() {
  return MISSED
}

/** Answered / connected calls with AI summaries and transcripts. */
export function getConnectedCalls() {
  return CONNECTED
}

/** Callers who hung up inside the IVR before connecting. */
export function getIvrDrops() {
  return IVR
}

/**
 * The unified call log: every call, whatever bucket it came from, newest first.
 *
 * Unlike getMissedCalls()/getConnectedCalls() — which mean TODAY and are what the live
 * feed and call-back queue read — this spans the full history and is the one to use with
 * a time window.
 *
 * @param win  anything resolveWindow() takes ('last7', { startMs, endMs }, …). Default: all time.
 * @param opts.outcome     'missed' | 'attended' — the two-way filter.
 * @param opts.includeSpam include robocalls (default false — they are not business calls).
 */
export function getCalls(win = 'all', opts = {}) {
  const { outcome, includeSpam = false, storeId } = opts
  const { startMs, endMs } = resolveWindow(win)
  // No storeId asked for = every store THIS MANAGER HOLDS (the "All locations" view) —
  // not every store in the fixture. See queryScope().
  const scope = new Set(queryScope(storeId))
  return ALL.filter(c => {
    if (c.atMs < startMs || c.atMs > endMs) return false
    if (!includeSpam && c.spam) return false
    if (outcome && c.outcome !== outcome) return false
    if (!scope.has(c.storeId)) return false
    return true
  })
}

/** One call by id, across every bucket. */
export function getCallById(id) {
  return ALL.find(c => c.id === id) || null
}

/** Was this call missed? (missed call or IVR drop — nobody spoke to them) */
export function isMissed(call) {
  return call?.outcome === 'missed'
}

/** Was this call attended? (someone at the store actually talked to them) */
export function isAttended(call) {
  return call?.outcome === 'attended'
}

/**
 * The transcript turns of an ANSWERED call, oldest first. `null` for a missed call —
 * there is no conversation to transcribe.
 * Each turn: `{ speaker: 'customer'|'manager', text, atOffsetMs, atMs }`.
 */
export function getTranscript(callOrId) {
  const call = typeof callOrId === 'string' ? getCallById(callOrId) : callOrId
  return call?.transcript || null
}

/**
 * The stored AUDIO of a call — `{ url, mimeType }` — or null when we hold none.
 *
 * IT IS NULL FOR EVERY RECORD IN THIS SEED, and that is the honest answer rather than a
 * gap. The VMN records calls on the telephony side; what this prototype ships is the
 * TRANSCRIPT of that recording (getTranscript above), not the audio file — no fixture
 * carries a `recordingUrl`, and there is no media backend to fetch one from. So the call
 * detail draws an explicitly unavailable recording row instead of a play button over
 * silence, which is the difference between a demo and a lie.
 *
 * This is the swap point: the day a backend returns a signed audio URL, set
 * `recordingUrl` on the record and every player in the app lights up untouched.
 */
export function callRecording(callOrId) {
  const call = typeof callOrId === 'string' ? getCallById(callOrId) : callOrId
  const url = call?.recordingUrl
  if (typeof url !== 'string' || !url) return null
  return { url, mimeType: call.recordingMimeType || 'audio/mpeg' }
}

// ============================================================
// SELECTORS
// ============================================================

/**
 * How many times this customer and the store have actually been in contact.
 *
 * WHAT COUNTS AS ONE INTERACTION — one recorded contact, from either side:
 *   • every call on the unified log carrying this `customerId`, over the WHOLE history
 *     (not a window: "how well do we know this person" is not a last-24-hours question)
 *   • every RING of a repeat caller, not just the last one. A caller who tried three
 *     times before giving up reached out three times — which is exactly what the row
 *     already tells the manager with "Called 3×".
 *   • every event on that customer's own timeline (`customer_timeline_events`): the
 *     missed/answered/called-back rows, the review link that went out on WhatsApp, the
 *     review that landed.
 *
 * The two sources OVERLAP BY DESIGN — call cc-01 *is* cust-988's 'inbound' timeline row —
 * so they are UNIONED on the instant they happened, never added. Minute granularity: a
 * call and the timeline row describing it are one event written down twice and can drift
 * by seconds once hydrated from a backend, while two genuinely separate contacts inside
 * one minute do not happen on a phone line.
 *
 * NOT counted: the manager's private notes. He wrote those to himself — the customer was
 * never part of it.
 *
 * @returns a count ≥ 0. An unknown customerId yields 0, not a guess.
 */
export function customerInteractionCount(customerId) {
  if (!customerId) return 0
  const minute = ms => Math.round(ms / 60000)
  const instants = new Set()
  for (const c of ALL) {
    if (c.customerId !== customerId) continue
    if (Number.isFinite(c.atMs)) instants.add(minute(c.atMs))
    for (const at of c.repeatHistoryAtMs || []) {
      if (Number.isFinite(at)) instants.add(minute(at))
    }
  }
  for (const e of getCustomerById(customerId)?.timeline || []) {
    if (Number.isFinite(e.atMs)) instants.add(minute(e.atMs))
  }
  return instants.size
}

/**
 * The interaction count to print on ONE call's detail, or `null` when the call carries no
 * `customerId` — an anonymous caller we hold no CRM record for.
 *
 * NULL, NOT 1. "1 interaction" on a caller we cannot join to anything is a number read off
 * the row you are already looking at, dressed up as history. The screen shows nothing.
 */
export function interactionCountForCall(callOrId) {
  const call = typeof callOrId === 'string' ? getCallById(callOrId) : callOrId
  if (!call?.customerId) return null
  return customerInteractionCount(call.customerId)
}

/** Total recoverable value across non-spam missed calls (today). */
export function totalRecoverable(storeId) {
  const scope = new Set(queryScope(storeId))
  return MISSED.filter(m => !m.spam && scope.has(m.storeId))
    .reduce((s, m) => s + m.estValue, 0)
}

/** Count of high-intent missed callers (today). */
export function highIntentCount(storeId) {
  const scope = new Set(queryScope(storeId))
  return MISSED.filter(m => m.intent === 'high' && scope.has(m.storeId)).length
}

/** High-intent missed callers queued for a call-back, ranked by chance-to-buy. */
export function callbackQueue(storeId) {
  return MISSED
    .filter(m => !m.spam && m.intent !== 'low' && new Set(queryScope(storeId)).has(m.storeId))
    .sort((a, b) => b.cli - a.cli)
}

/**
 * Call counts for a window — total / missed / answered.
 * Defaults to the last 24 hours, which is the headline a manager opens the app for.
 *
 * Spam is excluded by default: "you got 22 calls" should not be padded with robocalls.
 * Pass `{ includeSpam: true }` for the raw switchboard number.
 */
export function callCounts(win = 'last24h', opts = {}) {
  const calls = getCalls(win, { includeSpam: opts.includeSpam ?? false, storeId: opts.storeId })
  const missed = calls.filter(isMissed).length
  return { total: calls.length, missed, answered: calls.length - missed }
}

// ============================================================
// THE CANONICAL MISSED-CALL COUNT
//
// One definition, one window, for every surface that prints "missed" — the tab badge,
// Home, the sign-in interstitial, the Calls KPI card. This exists because five surfaces
// once showed five different numbers for the same store in one session (7 / 8 / 8 / 11 /
// 11): each was computing its own count over its own window off its own array.
//
// THE DEFINITION, in words, because the number is meaningless without it:
//
//   A MISSED CALL is a call nobody at the store spoke to. That is a ringing call that was
//   never picked up OR a caller who hung up inside the phone menu (an IVR drop) — the
//   business lost the customer either way, which is the entire premise of this product.
//   Robocalls are not business calls, so spam is excluded. `outcome === 'missed'` on the
//   resolved record is exactly this rule and getCalls() already applies the spam one.
//
//   STILL OPEN means the lead has not been marked converted or lost. A missed call that
//   was dealt with is not something the app should keep nagging about, which is what a
//   badge is for.
//
//   THE WINDOW is the last 24 hours (DEFAULT_CALL_WINDOW) — the question a store owner
//   actually opens the app with, and the window the Calls screen already opens on.
//
// Anything printing one of these numbers must ALSO name the window on screen. The pair of
// rules is the point: same definition everywhere, and said out loud wherever it appears.
// ============================================================

/** The window every "missed calls" count on every screen is measured over. */
export const CANONICAL_MISSED_WINDOW = 'last24h'

/**
 * Missed calls in the canonical window — ringing misses plus IVR drops, spam excluded.
 * This is the number the Calls screen's KPI card and its Missed segment print.
 */
export function missedCount(win = CANONICAL_MISSED_WINDOW) {
  return getCalls(win, { outcome: 'missed' }).length
}

/**
 * Missed calls in the canonical window that are STILL OPEN — the tab-badge number, and
 * what Home's triage row counts. Marking a lead converted or lost drops it from here
 * (and from the badge) without changing missedCount(), which is why any screen showing
 * both has to reconcile them out loud.
 */
export function openMissedCount(win = CANONICAL_MISSED_WINDOW, storeId) {
  return getCalls(win, { outcome: 'missed', storeId }).filter(c => c.leadStatus === 'open').length
}

/**
 * WHY THIS CUSTOMER LAST RANG — the calling reason for a person, not a window.
 *
 * The lead card has to show five facts and this is the fifth. It was only available to
 * callers that already held a call record (the store drill-down), so the same card
 * rendered four facts on the Customers screen and five on the drill-down. Deriving it
 * from the customer id here means every surface gets it and none of them has to know
 * how to find a call.
 *
 * The MOST RECENT call that actually carries a reason — an older call that recorded one
 * is better than the newest call that did not, because "no reason" is an absence rather
 * than a fact that supersedes.
 *
 * @returns `{ reason, reasonKey }`, or null when this person has no call with a reason.
 */
export function callReasonForCustomer(customerId) {
  if (!customerId) return null
  const hit = getCalls('all', { includeSpam: false })
    .filter(c => c.customerId === customerId && c.callReason)
    .sort((a, b) => (b.atMs || 0) - (a.atMs || 0))[0]
  return hit ? { reason: hit.callReason, reasonKey: hit.callReasonKey } : null
}

/**
 * Why people called, over a window: `[{ reason, reasonKey, count, share }]`, biggest first.
 *
 * `share` is a percentage of the calls counted (0–100), ready for formatPercent().
 * Reasons with no calls in the window are dropped, not zero-filled — an empty bar is
 * noise on a phone screen. Spam is excluded by default; it is not a reason anyone called.
 * Ties break on the CALL_REASONS order so the chart does not reshuffle between renders.
 */
export function callingReasons(win = 'last24h', opts = {}) {
  const calls = getCalls(win, { includeSpam: opts.includeSpam ?? false, storeId: opts.storeId })
  const counts = new Map()
  for (const c of calls) {
    if (!c.callReason) continue
    counts.set(c.callReason, (counts.get(c.callReason) || 0) + 1)
  }
  const total = [...counts.values()].reduce((s, n) => s + n, 0)
  return [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      reasonKey: CALL_REASON_KEYS[reason],
      count,
      share: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || CALL_REASONS.indexOf(a.reason) - CALL_REASONS.indexOf(b.reason))
}

/**
 * Missed opportunities = missed calls + IVR drops (both lost, both win-back-able).
 * Two shapes flattened into one row: carry each side's `*Key` through, or the merged
 * row would be the one place the catalog keys get dropped and English leaks back in.
 */
export function missedOpportunities(storeId) {
  const missed = MISSED.filter(m => !m.spam && (!storeId || m.storeId === storeId)).map(m => ({
    key: `m-${m.id}`, kind: 'missed', masked: m.fullMaskedDisplay || m.masked, time: m.time,
    atMs: m.atMs, minutesAgo: m.minutesAgo, source: m.source,
    category: m.category, categoryKey: m.categoryKey, estValue: m.estValue,
    cli: m.cli, reason: m.intentReason, reasonKey: m.intentReasonKey, repeats: m.repeats,
    callReason: m.callReason, callReasonKey: m.callReasonKey,
    leadStatus: m.leadStatus, reviewLinkSent: m.reviewLinkSent,
  }))
  const ivr = IVR.filter(d => !storeId || d.storeId === storeId).map(d => ({
    key: `i-${d.id}`, kind: 'ivr', masked: d.masked, time: d.time, atMs: d.atMs,
    minutesAgo: d.minutesAgo, source: d.source,
    category: d.category, categoryKey: d.categoryKey, estValue: d.estValue, cli: null,
    reason: d.reason, reasonKey: d.reasonKey,
    stage: d.stage, stageKey: d.stageKey,
    droppedAt: d.droppedAt, droppedAtKey: d.droppedAtKey, droppedAfterSec: d.droppedAfterSec,
    callReason: d.callReason, callReasonKey: d.callReasonKey,
    leadStatus: d.leadStatus, reviewLinkSent: d.reviewLinkSent,
  }))
  return [...missed, ...ivr].sort((a, b) => (b.estValue || 0) - (a.estValue || 0))
}

// ============================================================
// LIST SELECTION — window + outcome + filters.
//
// The ONE predicate the Calls screen runs everywhere it prints a number: the KPI card,
// the segment badges and the list itself. It lived in the Calls list screen until a
// second screen needed it, at which point a view file was exporting domain rules to
// another view file. It is business logic — thresholds, filter semantics, spam rules —
// so it belongs behind this boundary, where React Native can reuse it unchanged.
// ============================================================

/**
 * No filter applied. `outcome` is NOT in here — that is the segmented control, and it is
 * the data layer's job (getCalls) rather than a field filter.
 * Named like DEFAULT_REVIEW_FILTERS: this barrel is shared, so filters carry their domain.
 */
export const DEFAULT_CALL_FILTERS = {
  // Only ever meaningful in the All-locations view — a single-store session is already
  // scoped by the store it is in, and the sheet hides this group there.
  storeId: 'all',
  sentiment: 'all',
  leadStatus: 'all',
  reason: 'all',
  source: 'all',
  band: 'all',
}

/**
 * Chance-to-buy band for a score — the same thresholds the pill colours paint with, so
 * the "Hot" filter and the "Hot" tag can never disagree. `null` when the record carries
 * no score (IVR drops don't): absent is not "cold".
 */
export function leadBandOf(score) {
  if (score == null) return null
  return score >= 75 ? 'hot' : score >= 55 ? 'warm' : score >= 35 ? 'cool' : 'cold'
}

/** The chance-to-buy bands, in the order a filter should list them. */
export const LEAD_BANDS = [
  { id: 'hot', label: 'Hot', labelKey: 'common.hot' },
  { id: 'warm', label: 'Warm', labelKey: 'common.warm' },
  { id: 'cool', label: 'Cool', labelKey: 'common.cool' },
  { id: 'cold', label: 'Cold', labelKey: 'common.cold' },
]

/**
 * The calls a window + outcome + filter set resolves to, newest first.
 *
 * Window and outcome are getCalls' job (it also drops spam — a robocall is not a business
 * call). The rest are filters over fields every record carries.
 */
export function selectCalls(win, outcome, f = DEFAULT_CALL_FILTERS, storeId) {
  return getCalls(win, { outcome, storeId }).filter(c => (
    (f.sentiment === 'all' || c.sentiment === f.sentiment) &&
    (f.leadStatus === 'all' || c.leadStatus === f.leadStatus) &&
    (f.reason === 'all' || c.callReason === f.reason) &&
    (f.source === 'all' || c.source === f.source) &&
    (f.band === 'all' || leadBandOf(c.cli) === f.band)
  ))
}

// ============================================================
// MUTATORS
//
// Session-scoped seed updates, the same way verifyLocation() persists today — swap the
// bodies for API calls behind this boundary to go live. They mutate the resolved records
// in place (see the identity note at the top), so a screen holding a row sees the change.
//
// Every one takes a single id or an array of ids: the bulk actions are the same code path
// as the single one, so they cannot drift apart.
// ============================================================

// TOP OF FUNNEL — `missed_call_received` fires HERE, from the live-feed ingestion path:
// the future addMissedCall(row) that a VMN webhook (or a poll of new `calls` rows) calls
// when a fresh missed call lands, splicing it onto MISSED. It is deliberately NOT wired in
// this seed build — the seed's missed calls are static fixtures resolved once at module
// load, so there is no arrival to observe, and firing it on render would be a lie (it would
// count re-renders, not calls). When ingestion goes live, emit it right after the splice:
//   track('missed_call_received', { call_id, customer_id, source, category, value_inr, repeat_count, spam })

const asIds = (ids) => (Array.isArray(ids) ? ids : [ids])

const VALID_LEAD_STATUSES = new Set(LEAD_STATUS_IDS)

/**
 * Set lead status on one call or many.
 * @param ids     a call id, or an array of them
 * @param status  'open' | 'converted' | 'expired'
 * @returns the updated call records (ids that matched nothing are skipped)
 */
export function setLeadStatus(ids, status) {
  if (!VALID_LEAD_STATUSES.has(status)) {
    throw new Error(`setLeadStatus: invalid status "${status}"`)
  }
  const updated = []
  for (const id of asIds(ids)) {
    const call = getCallById(id)
    if (!call) continue
    call.leadStatus = status
    updated.push(call)
  }
  // Live backend: mirror the change, fire-and-forget — the in-memory update
  // above stays the synchronous truth the UI re-renders from.
  const sb = liveClient()
  if (sb && updated.length) {
    sb.from('calls').update({ lead_status: status }).in('id', updated.map(c => c.id))
      .throwOnError().then(null, (e) => console.warn('[data] supabase setLeadStatus failed:', e))
  }
  // The hero metric of the whole product: a missed call that became business.
  // Fired HERE rather than at a screen so it cannot be missed by whichever
  // surface set the status (the call sheet, or a bulk action over a selection).
  for (const call of updated) {
    track('call_outcome_set', {
      call_id: call.id,
      customer_id: call.customerId ?? null,
      outcome: status,
      value_inr: call.estValue ?? null,
      count: updated.length,
      from: updated.length > 1 ? 'bulk' : 'detail',
    })
  }
  // The records changed in place, which React cannot see — tell every screen
  // holding a derived count (the VMN badge, Home's roll-ups) to re-read.
  if (updated.length) emitChange()
  return updated
}

/**
 * Mark the review link as sent (or un-sent) on one call or many — the WhatsApp
 * review-link blast, applied to a selection.
 *
 * @param ids          a call id, or an array of them
 * @param sent         true = link handed off · false = correction (un-set the flag)
 * @param opts.channel where it went ('whatsapp' | 'sms'), when the caller knows it —
 *                     the one fact this mutator can't derive from the record.
 * @param opts.from    entry point override; defaults to bulk/single on the calls path.
 * @returns the updated call records
 */
export function markReviewLinkSent(ids, sent = true, { channel = null, from } = {}) {
  const updated = []
  for (const id of asIds(ids)) {
    const call = getCallById(id)
    if (!call) continue
    call.reviewLinkSent = !!sent
    updated.push(call)
  }
  // Live backend: mirror, fire-and-forget (see setLeadStatus).
  const sb = liveClient()
  if (sb && updated.length) {
    sb.from('calls').update({ review_link_sent: !!sent }).in('id', updated.map(c => c.id))
      .throwOnError().then(null, (e) => console.warn('[data] supabase markReviewLinkSent failed:', e))
  }
  // A review request handed off — fired HERE, in the mutator, so it records no matter
  // which surface triggered it: the single-card CTA, the bulk "Review request" action,
  // or the detail sheet all call through here (cf. call_outcome_set in setLeadStatus).
  // Only on an actual SEND — un-setting the flag is a correction, not a hand-off. The
  // Customers screen sends per-CUSTOMER (no call id) and does NOT route through this
  // mutator, so it keeps its own review_request_sent call site; the two never overlap.
  if (sent) {
    for (const call of updated) {
      track('review_request_sent', {
        customer_id: call.customerId ?? null,
        call_id: call.id,
        channel,
        count: updated.length,
        from: from ?? (updated.length > 1 ? 'bulk' : 'calls'),
      })
    }
  }
  if (updated.length) emitChange() // see setLeadStatus
  return updated
}

// ============================================================

/**
 * Catalog key for a product-interest category ('Air Conditioner' → seed.category.airConditioner).
 *
 * Every record already carries its own `categoryKey`, so reach for this only when a
 * category is synthesised outside the data layer — e.g. the simulated live call in
 * CallsTab. Returns undefined for an unknown category; pair with `{ defaultValue }`.
 */
export function categoryKeyFor(category) {
  return CATEGORY_KEYS[category]
}

/** Catalog key for a call reason ('Price enquiry' → seed.callReason.priceEnquiry). */
export function callReasonKeyFor(reason) {
  return CALL_REASON_KEYS[reason]
}

/**
 * CALL INSIGHTS (Interaction AI) — the paid add-on that reads WHY someone called off the
 * call script.
 *
 * A BRAND-level entitlement, so it is a flag here rather than a field on a store. With it
 * off there is no reason data at all: `callingReasons()` would have nothing to roll up,
 * and the Calls screen says so plainly instead of drawing an empty chart or leaving a gap
 * a dealer reads as a bug (design review 3, item 7). Flip to false to see that state.
 */
export const CALL_INSIGHTS_ENABLED = true

// Reference data + feature flags re-exported through the boundary.
export { SOURCES, OUTBOUND_AGENT_ENABLED, CALL_REASONS, CALL_REASON_KEYS }
