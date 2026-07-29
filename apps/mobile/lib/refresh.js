// PULL TO REFRESH — the web ScreenScroll's onRefresh contract, shared by every tab:
// the data layer is in-memory, so "refresh" means RE-DERIVE — emitChange() bumps the
// version every selector reads (useDataVersion). The short hold is not theatre: a
// spinner that vanishes in the same frame reads as a control that did nothing.
import { emitChange } from '@connect/core/events.js'

export async function refreshDerived() {
  emitChange()
  await new Promise(r => setTimeout(r, 450))
}
