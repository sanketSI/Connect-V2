// ============================================================
// NOTIFICATIONS — the bell feed, DERIVED not stored.
//
// The smart part is that there is no separate notification table to drift out of
// sync with reality. A notification is just a pending "zero business loss" action
// the dealer has not resolved yet, read straight off the SAME canonical selectors
// that drive the tab badges:
//
//   • an OPEN missed call        (getMissedCalls, leadStatus === 'open')
//   • an UNREPLIED review        (filterReviews, status 'unreplied')
//   • a store that FAILS its geo/address check (locationNeedsVerification)
//
// So the feed self-heals: call the lead back (setLeadStatus) or post the reply
// (postReviewReply) and the item is gone on the next read — no "mark done", no
// stale row. The only thing we persist is which ids the dealer has SEEN, so the
// unread badge can go quiet without the underlying action being done.
//
// PRIORITY is the second half of "smart": a hot lead about to be lost and an angry
// 1-star review sort above everything (priority 0, `urgent`), so the bell answers
// "what will cost me money if I ignore it" first.
//
// PURE like every core module: no window/localStorage — read-state goes through
// the storage seam; reactivity through emitChange(). Content that is NOT keyed
// (masked numbers, reviewer names, review text) rides as plain fields; everything
// the UI must translate rides as a `*Key` (+ vars), exactly as the rest of core.
// ============================================================
import { storage } from '../storage.js'
import { emitChange } from '../events.js'
import { getMissedCalls } from './calls.js'
import { filterReviews, sentimentForRating, CANONICAL_REVIEW_WINDOW } from './reviews.js'
import { getStoreLocations, locationNeedsVerification, computeLocationFlags } from './locations.js'
import { queryScope, assignedStores } from './assignments.js'

/** The kinds a notification can be — the UI maps these to an icon and accent. */
export const NOTIFICATION_KINDS = Object.freeze(['missed_call', 'review', 'verify'])

// Priority: 0 is "costs money if ignored" and renders under "Needs attention".
const P_URGENT = 0
const P_HIGH = 1
const P_NORMAL = 2

const READ_KEY = 'connect-notif-read'

/** The set of notification ids the dealer has marked seen. Never throws. */
function readSeen() {
  try {
    const raw = storage.getItem(READ_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function writeSeen(set) {
  try { storage.setItem(READ_KEY, JSON.stringify([...set])) } catch { /* storage blocked — badge just won't persist */ }
}

// ── The three feed sources, each a pure map over a canonical selector ─────────

function missedItems(storeId) {
  // getMissedCalls() is the RAW bucket — every store in the fixture, including shops
  // this manager does not hold. Scope it, or the feed hands somebody else's missed
  // calls to whoever is signed in. See queryScope().
  const scope = new Set(queryScope(storeId))
  return getMissedCalls()
    .filter(m => m.leadStatus === 'open' && !m.spam && scope.has(m.storeId))
    .map(m => {
      const hot = m.intent === 'high'
      return {
        id: `missed:${m.id}`,
        kind: 'missed_call',
        priority: hot ? P_URGENT : P_NORMAL,
        atMs: m.atMs ?? null,
        tab: 'vmn',
        storeId: m.storeId,
        titleKey: hot ? 'notif.missedHotTitle' : 'notif.missedTitle',
        ctaKey: 'notif.ctaCallBack',
        // content — not keyed
        masked: m.fullMaskedDisplay || m.masked || null,
        value: m.estValue ?? null,
        cli: Number.isFinite(m.cli) ? m.cli : null,
      }
    })
}

function reviewItems(storeId) {
  return filterReviews({ window: CANONICAL_REVIEW_WINDOW, status: 'unreplied', storeId })
    .map(r => {
      const negative = sentimentForRating(r.rating) === 'negative'
      return {
        id: `review:${r.id}`,
        kind: 'review',
        priority: negative ? P_URGENT : P_NORMAL,
        atMs: r.atMs ?? null,
        tab: 'reviews',
        storeId: r.storeId,
        titleKey: negative ? 'notif.reviewNegTitle' : 'notif.reviewTitle',
        titleVars: { rating: r.rating },
        ctaKey: 'notif.ctaReply',
        // content — not keyed
        name: r.author || null,
        rating: r.rating,
        snippet: (r.body || '').trim() || null,
      }
    })
}

function verifyItems(storeId) {
  // assignedStores(), not every location in the fixture — same reason as above.
  return assignedStores()
    .filter(loc => locationNeedsVerification(loc) && (!storeId || loc.id === storeId))
    .map(loc => {
      const flag = computeLocationFlags(loc)[0]
      return {
        id: `verify:${loc.id}`,
        kind: 'verify',
        priority: P_HIGH,
        atMs: null, // a failed check is a standing condition, not a moment
        tab: 'profile',
        storeId: loc.id,
        titleKey: 'notif.verifyTitle',
        ctaKey: 'notif.ctaVerify',
        // content — not keyed
        name: loc.branch ? `${loc.name} · ${loc.branch}` : loc.name,
        flagKey: flag?.reasonKey || null,
        flagVars: flag?.reasonVars || null,
      }
    })
}

/**
 * The whole feed, newest-and-most-urgent first, each item carrying its `read` flag.
 *
 * Sort: priority ascending (0 = urgent on top), then most recent within a priority.
 * Items without a timestamp (store verification) sort after timed ones in their band.
 */
export function getNotifications(storeId, { kinds } = {}) {
  const seen = readSeen()
  const items = [...missedItems(storeId), ...reviewItems(storeId), ...verifyItems(storeId)]
    // A build without a feature must not be told about it. `verify` has no flow in the
    // launch scope, so a notification asking for it would be a dead end with a badge on
    // it. The CALLER decides which kinds exist, because the scope flags are a UI concern
    // (lib/features.js) and core has no business reading VITE_SCOPE.
    .filter(n => !kinds || kinds.includes(n.kind))
  items.sort((a, b) =>
    a.priority - b.priority ||
    (b.atMs ?? -Infinity) - (a.atMs ?? -Infinity)
  )
  return items.map(n => ({ ...n, urgent: n.priority === P_URGENT, read: seen.has(n.id) }))
}

/** How many live notifications the dealer has not seen — the bell badge. */
export function unreadNotificationCount(storeId, opts) {
  return getNotifications(storeId, opts).reduce((n, item) => n + (item.read ? 0 : 1), 0)
}

/** Total live notifications, seen or not. */
export function notificationCount(storeId, opts) {
  return getNotifications(storeId, opts).length
}

/**
 * Mark one notification seen (e.g. the dealer tapped it). Persists and pings the
 * change emitter so the bell badge re-derives at once.
 */
export function markNotificationRead(id) {
  if (!id) return
  const seen = readSeen()
  if (seen.has(id)) return
  seen.add(id)
  writeSeen(seen)
  emitChange()
}

/**
 * Mark every CURRENTLY LIVE notification seen — the "Mark all read" action. We add
 * only the ids in the live feed (not whatever historical ids were already stored),
 * so the persisted set cannot grow without bound as items resolve and disappear.
 */
export function markAllNotificationsRead(storeId) {
  const live = getNotifications(storeId)
  if (!live.length) return
  const seen = readSeen()
  let changed = false
  for (const n of live) {
    if (!seen.has(n.id)) { seen.add(n.id); changed = true }
  }
  if (!changed) return
  writeSeen(seen)
  emitChange()
}
