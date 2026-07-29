// Cross-screen reactivity, the same way apps/web does it: core's dataStore bumps a
// version whenever any mutator commits (markNotificationRead, updateLeadStatus, …), and
// subscribing screens re-derive from the mutated-in-place records. Without this, marking
// a notification read would not clear the bell badge until the next unrelated render.
import { useSyncExternalStore } from 'react'
import { dataStore } from '@connect/core'

export function useDataVersion() {
  return useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot, dataStore.getSnapshot)
}
