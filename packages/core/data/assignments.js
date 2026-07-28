// ============================================================
// WHAT THIS MANAGER WAS ASSIGNED — and therefore what they see.
//
// "Access all the stores that I have been assigned by my brand admin" had no model
// behind it: `managers` links a person to a DEALER, not to stores, so the demo user saw
// every store because the fixture handed them every store. There was nothing to assign
// and nothing to withhold.
//
// The assignment also decides the SHAPE of the multi-location view, which is the MVP's
// own rule:
//
//   stores in one city      → store level
//   stores in one state     → city level → store level
//   stores in several states → state level → city level → store level
//
// So the depth is DERIVED from what you hold, never configured. A manager with two
// Bangalore shops is not asked to drill through a state with one child, and one with
// shops in two states does not lose the level that separates them.
// ============================================================
import { getStoreLocations } from './locations.js'
import { MANAGER_ASSIGNMENTS } from '../lib/seedData.js'

/** The levels a roll-up can have, outermost first. */
export const ASSIGNMENT_LEVELS = ['state', 'city', 'store']

// ── WHOSE STORES THIS SESSION IS ABOUT ──────────────────────────────────────────────
// Sign-in already resolves a number to the stores it holds; this is where that answer
// goes so the rest of the app reads the SAME set. Before it existed, login counted from
// the code registry and every screen after it counted every location in the fixture —
// "3 stores on this number" one screen, "6 locations" the next, for one manager.
//
// Session-lived on purpose: not persisted, gone with the tab, and cleared on sign-out so
// the next person to sign in cannot inherit the last one's stores.
let SESSION_ASSIGNMENTS = null

/** Scope the session to these store ids. Empty/absent falls back to the fixture owner. */
export function setSessionAssignments(ids) {
  SESSION_ASSIGNMENTS = Array.isArray(ids) && ids.length ? [...ids] : null
}

/** Drop the session scope — call on sign-out. */
export function clearSessionAssignments() {
  SESSION_ASSIGNMENTS = null
}

/**
 * What this session holds. Every function below defaults to it RATHER than to the
 * fixture constant, and reads it per call — a module-level snapshot would freeze the
 * first manager's stores for the life of the tab.
 */
export function currentAssignments() {
  return SESSION_ASSIGNMENTS || MANAGER_ASSIGNMENTS
}

/**
 * The store ids this manager holds.
 *
 * A `'*'` entry means every store on the dealer — how a brand admin grants the whole
 * account without listing it. Unknown ids are dropped rather than carried as ghosts.
 */
export function assignedStoreIds(assignments = currentAssignments()) {
  const all = getStoreLocations().map(l => l.id)
  if (!assignments || assignments.includes('*')) return all
  return assignments.filter(id => all.includes(id))
}

/** The assigned stores themselves, in registry order. */
export function assignedStores(assignments = currentAssignments()) {
  const ids = new Set(assignedStoreIds(assignments))
  return getStoreLocations().filter(l => ids.has(l.id))
}

/**
 * Where the roll-up should START, given what is held.
 *
 * Returns the outermost level that actually separates anything: 'state' only when more
 * than one state is held, 'city' only when more than one city is, otherwise 'store'.
 * A level with a single child is not a level, it is a click.
 */
export function assignmentEntryLevel(assignments = currentAssignments()) {
  const stores = assignedStores(assignments)
  const states = new Set(stores.map(s => s.state).filter(Boolean))
  const cities = new Set(stores.map(s => s.city).filter(Boolean))
  if (states.size > 1) return 'state'
  if (cities.size > 1) return 'city'
  return 'store'
}

/** The levels to walk, from the entry level down to the store. */
export function assignmentLevels(assignments = currentAssignments()) {
  const from = ASSIGNMENT_LEVELS.indexOf(assignmentEntryLevel(assignments))
  return ASSIGNMENT_LEVELS.slice(from)
}

/**
 * Is this a single-store manager?
 *
 * The whole multi-location view — roll-up, drill-down, leaderboards — is for people who
 * hold more than one shop. One shop means there is nothing to compare and nothing to
 * roll up, so the app should not offer the view at all.
 */
export function isMultiLocation(assignments = currentAssignments()) {
  return assignedStoreIds(assignments).length > 1
}
