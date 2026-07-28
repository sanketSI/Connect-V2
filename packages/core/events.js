// ============================================================
// CHANGE EMITTER — the "something in the data layer moved" signal.
//
// THE BUG THIS EXISTS TO FIX: the mutators (setLeadStatus, markReviewLinkSent,
// addCustomerNote, verifyLocation) mutate the ONE shared record object every
// screen holds — that identity is deliberate and load-bearing (see the note at
// the top of data/calls.js). But a mutation in place is invisible to React: the
// screen that fired it re-renders because it also called setState, and every
// OTHER screen keeps showing the stale number until something unrelated forces
// a render. Marking a lead "converted" on the calls tab left the tab-bar badge
// counting it as open.
//
// So: mutate in place (identity preserved), then bump a version number that any
// view can subscribe to. Nothing here knows what changed — a monotonic counter
// is enough, because every selector is a cheap synchronous read over in-memory
// arrays. Coarse and correct beats fine-grained and wrong.
//
// REACT-FREE BY CONTRACT. Core must import from no framework (see index.js's
// purity rule), so this exports the useSyncExternalStore STORE SHAPE
// (`subscribe` + `getSnapshot`) and the hook lives in the app:
// apps/web/src/lib/useDataVersion.js is three lines over `dataStore`.
//
// This module must stay a LEAF — no imports — so any domain module can pull it
// in without risking an import cycle.
// ============================================================

/**
 * Monotonically increasing. Starts at 0 and only ever goes up, so
 * `getSnapshot()` is a valid useSyncExternalStore snapshot: two reads returning
 * the same number genuinely mean nothing changed in between.
 */
let version = 0

const listeners = new Set()

/**
 * Listen for data-layer mutations.
 *
 * @param fn  called with the new version after every emitChange().
 * @returns   the unsubscribe function (call it in a cleanup).
 */
export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * Bump the version and notify every subscriber. Called by the mutators AFTER
 * they have finished mutating, so a listener that re-reads the data during the
 * callback sees the new state, never a half-applied one.
 *
 * A throwing listener must not take the mutation down with it (the mutator has
 * already committed, and one broken screen is not a reason to lose the write),
 * so each callback is isolated. Iterating a copy makes subscribing or
 * unsubscribing from inside a listener safe.
 *
 * @returns the new version.
 */
export function emitChange() {
  version += 1
  for (const fn of [...listeners]) {
    try {
      fn(version)
    } catch (err) {
      console.error('[events] subscriber threw:', err)
    }
  }
  return version
}

/** The current data version. Same value for as long as nothing mutates. */
export function getSnapshot() {
  return version
}

/** How many listeners are attached — for leak assertions in tests. */
export function listenerCount() {
  return listeners.size
}

/**
 * The store shape useSyncExternalStore takes, ready to spread:
 *
 *   useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot)
 *
 * Bound methods, so it survives destructuring.
 */
export const dataStore = {
  subscribe,
  getSnapshot,
}
