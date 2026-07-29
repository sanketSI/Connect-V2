// ============================================================
// SESSION — what apps/web/src/App.jsx holds in useState, as a tiny external store.
//
// On web the whole app is one component tree under App.jsx, so `stage`, `store` and the
// signed-in assignment can live in its state. expo-router mounts each route
// independently, so that state has to live OUTSIDE the tree — hence useSyncExternalStore,
// the same primitive core's dataStore already uses for cross-screen reactivity.
//
// The RULES are the web app's, not new ones:
//   • setSessionAssignments() is called BEFORE anything renders — it is the one answer to
//     "which stores are mine", and the tab bar's shape, the roll-up's depth and every
//     scoped selector read it. Skip it and they each go back to guessing from the whole
//     fixture (and a manager sees another branch's calls).
//   • A multi-store number opens on ALL LOCATIONS. Sign-in resolves the store from the
//     number; where there is no single right answer we do not stop and ask, we open the
//     combined view and let the manager narrow from inside the app.
//   • Signing out drops the scope as well as the screen, or the next number to sign in
//     inherits this one's stores.
// ============================================================
import { useSyncExternalStore } from 'react'
import {
  setSessionAssignments, clearSessionAssignments, makeAllLocationsStore,
  defaultSubBrand, makeScopeStore,
} from '@connect/core'

let state = { authed: false, store: null, stores: [], role: 'single' }
const listeners = new Set()

function emit() {
  state = { ...state }
  listeners.forEach(l => l())
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function snapshot() {
  return state
}

/** Read the session from a component. Re-renders on sign-in/out and store switch. */
export function useSession() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Non-reactive read, for guards and event handlers. */
export function currentSession() {
  return state
}

/**
 * Complete a sign-in. `myStores` is everything the number holds; `picked` is the one
 * store when there is exactly one, and null when there are several.
 */
export function signIn(myStores, picked) {
  const all = myStores || []
  // Several outlets: the DEFAULT is the sub-brand with the most locations (the brand-
  // hierarchy rule — Tetley's 500 outrank TCS's 20). The assignment IS the scope, so
  // every selector, badge and roll-up narrows with it.
  const sb = picked ? null : defaultSubBrand(all.map(s => s.id))
  setSessionAssignments(picked ? all.map(s => s.id) : (sb ? sb.ids : all.map(s => s.id)))
  state = {
    authed: true,
    stores: all,
    store: picked || (sb ? makeScopeStore({ label: sb.name, ids: sb.ids }) : makeAllLocationsStore()),
    role: state.role || 'single',
  }
  emit()
}

/** Scope to a tree NODE (brand/sub-brand/state/city) or a single store. */
export function setScope(node) {
  if (node.store) {
    // One location: focus there; the assignment stays the full holding so the
    // switcher can still see every sub-brand.
    setSessionAssignments(state.stores.map(s => s.id))
    state = { ...state, store: node.store }
  } else {
    setSessionAssignments(node.ids)
    state = { ...state, store: makeScopeStore({ label: node.name, ids: node.ids }) }
  }
  emit()
}

/** Switch the branch in session. Scope is unchanged: the number still holds them all. */
export function setStore(store) {
  if (!store) return
  state = { ...state, store }
  emit()
}

/** The demo viewing-role switcher, exactly the web's App.jsx `role` state. */
export function setRole(role) {
  state = { ...state, role }
  emit()
}

export function signOut() {
  clearSessionAssignments()
  state = { authed: false, store: null, stores: [] }
  emit()
}
