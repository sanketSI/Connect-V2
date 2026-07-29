// ============================================================
// THE STORAGE DRIVER FOR NATIVE — sharp edge #3 in EXPO-MIGRATION.md, solved.
//
// THE PROBLEM. Core reads persisted state SYNCHRONOUSLY and cannot stop:
// packages/core/data/customers.js reads at module scope, so by the time any screen
// renders the answer must already be in hand. AsyncStorage is a promise API. The two
// cannot meet at the call site.
//
// THE SHAPE OF THE FIX (named in packages/core/storage.js's own header): an in-memory
// cache is PRE-LOADED during the boot gate, before a single data module is imported,
// and every set() writes through to AsyncStorage in the background. Reads then answer
// from memory — synchronously — and the async layer never appears above this file.
//
// WHY A KEY PREFIX SCAN AND NOT getAllKeys ALONE. We hydrate only Connect's own keys
// (`si-` / `connect-`). Expo Go is a shared sandbox: other projects opened in the same
// app write to the same AsyncStorage namespace, and pulling their keys into core's
// cache would be both wasteful and a data-bleed between unrelated apps.
//
// FAILURE POSTURE, matching the facade above it: a broken or empty store degrades to
// "no storage", which every call site already treats as the empty state. Boot must
// never be blocked by persistence — a dealer with a corrupt cache still gets an app.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIXES = ['si-', 'connect-']

/** The synchronous mirror core reads from. Populated by preloadStorage(). */
const cache = new Map()

function ours(key) {
  return PREFIXES.some(p => key.startsWith(p))
}

/**
 * Load Connect's persisted keys into memory. MUST be awaited in the boot gate before
 * any core data module is imported. Resolves to the number of keys restored.
 */
export async function preloadStorage() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(ours)
    if (!keys.length) return 0
    const pairs = await AsyncStorage.multiGet(keys)
    for (const [k, v] of pairs) {
      if (v != null) cache.set(k, v)
    }
    return cache.size
  } catch (err) {
    // Degrade to empty, never throw: the app opens with no remembered state, which is
    // exactly the first-run experience and is always safe.
    console.warn('[storage] preload failed, continuing with an empty cache:', err?.message || err)
    return 0
  }
}

/**
 * The driver handed to configureStorage(). Synchronous in, promise-free out —
 * writes are fire-and-forget so a slow disk can never stall a render.
 */
export const nativeStorageDriver = {
  getItem: (key) => (cache.has(key) ? cache.get(key) : null),

  setItem: (key, value) => {
    const v = String(value)
    cache.set(key, v)                       // visible to the next sync read immediately
    AsyncStorage.setItem(key, v).catch(() => {}) // durability, off the render path
  },

  removeItem: (key) => {
    cache.delete(key)
    AsyncStorage.removeItem(key).catch(() => {})
  },
}
