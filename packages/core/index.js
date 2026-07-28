// ============================================================
// @connect/core — the platform-neutral heart of Connect.
//
// This package is the data/service layer the EXPO-MIGRATION plan calls "core":
// selectors, mutators, business rules, the seed adapter, the AI + Supabase
// clients, the language registry and the i18n catalogs. Both apps (web today,
// Expo in Phase 1) consume it; neither reaches around it.
//
// THE PURITY RULE: nothing in this package touches window, document,
// localStorage, navigator or import.meta.env. Platform specifics are INJECTED
// at boot through two seams, each importable WITHOUT loading the data barrel
// (so they can be configured before any data module's module-scope code runs):
//
//   @connect/core/env.js      configureEnv({ geminiKeys, supabaseUrl, supabaseAnonKey })
//   @connect/core/storage.js  configureStorage(driver) — localStorage on web,
//                             AsyncStorage/MMKV-backed cache on mobile
//
// This entry point re-exports the data barrel — the ONE boundary screens
// import from, exactly as src/data/index.js was before the split.
// ============================================================
export * from './data/index.js'
