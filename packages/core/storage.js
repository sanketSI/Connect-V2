// ============================================================
// STORAGE SEAM — a synchronous key-value facade with a pluggable driver.
//
// Core persists three small things (returning-user flag, customer notes, and
// later whatever mobile needs) and reads them SYNCHRONOUSLY — customers.js
// even reads at module scope. That sync contract is load-bearing: the getters
// can never go async without rewriting every screen.
//
//   web    apps/web/src/main.jsx injects a localStorage driver at boot,
//          before any core data module is imported.
//   mobile (Phase 1) AsyncStorage/MMKV is async → the driver becomes an
//          in-memory cache pre-loaded during the boot gate and written
//          through on set. Same facade, same sync reads.
//
// Until configureStorage() runs, the default driver is in-memory — under
// plain Node (seed-SQL generator, tests) everything works, nothing persists.
// The facade never throws: a blocked/broken driver degrades to "no storage",
// which every call site already treats as the empty state.
//
// This module must stay a LEAF: no imports, importable without pulling the
// data barrel (boot must configure it before the barrel loads).
// ============================================================

function memoryDriver() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  }
}

let driver = memoryDriver()

/**
 * Swap in a platform driver: `{ getItem(k), setItem(k, v), removeItem?(k) }`,
 * all synchronous, localStorage-shaped. Call once at boot.
 */
export function configureStorage(next) {
  if (next && typeof next.getItem === 'function' && typeof next.setItem === 'function') {
    driver = next
  }
}

/** The sync facade every core module reads/writes through. Never throws. */
export const storage = {
  getItem(key) {
    try { return driver.getItem(key) ?? null } catch { return null }
  },
  setItem(key, value) {
    try { driver.setItem(key, value) } catch {}
  },
  removeItem(key) {
    try { driver.removeItem?.(key) } catch {}
  },
}
