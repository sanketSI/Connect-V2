import { useSyncExternalStore } from 'react'
import { dataStore } from '@connect/core/events.js'

// ============================================================
// useDataVersion — the React half of packages/core/events.js.
//
// Core is framework-free by contract, so it exports the STORE SHAPE
// (`subscribe` + `getSnapshot`) and the hook lives here, in the app.
//
// Why a version number rather than the data itself: the mutators change shared
// objects IN PLACE (deliberately — see the identity note in core/data/calls.js),
// so `useSyncExternalStore(subscribe, getMissedCalls)` would hand React the same
// array reference every time and it would bail out of the render. A monotonic
// integer is a snapshot that actually changes, and every selector behind it is a
// cheap synchronous read over in-memory arrays.
//
// Usage: read it, then compute. The read is what subscribes the component.
//
//   const v = useDataVersion()
//   const open = useMemo(() => getMissedCalls().filter(isOpen).length, [v])
//
// useSyncExternalStore, not useState + useEffect: it is tear-free under
// concurrent rendering and it re-reads on subscribe, so a mutation that lands
// between first render and effect-attach cannot be missed.
// ============================================================

/** The current data version — changes whenever a core mutator commits. */
export function useDataVersion() {
  return useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot, dataStore.getSnapshot)
}

export default useDataVersion
