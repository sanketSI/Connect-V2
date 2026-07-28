// ============================================================
// ENV SEAM — the one place platform environment reaches core.
//
// Core never reads import.meta.env (Vite) or process.env.EXPO_PUBLIC_* (Expo);
// the app shell injects values at boot, BEFORE any core data module loads:
//
//   web    apps/web/src/main.jsx  → configureEnv({ geminiKeys: import.meta.env.VITE_GEMINI_API_KEYS, … })
//   mobile (Phase 1)              → configureEnv({ geminiKeys: process.env.EXPO_PUBLIC_GEMINI_API_KEYS, … })
//
// AI keys are the exception to "inject it here": the PRODUCTION key is never
// injected at all — it lives on the server behind /api/gemini (aiProxyUrl).
// geminiKeys stays only as a local-dev shortcut for calling Google directly.
//
// Consumers (lib/gemini.js, lib/supabase.js) read through the getters LAZILY —
// at first call, never at module scope — so an unconfigured import can't bake
// in empty values. Unconfigured defaults mean: no AI (written fallbacks), no
// Supabase (seed mode) — the same degraded-gracefully posture as before.
//
// This module must stay a LEAF: no imports, importable without pulling the
// data barrel, safe under plain Node (the seed-SQL generator's environment).
// ============================================================

let geminiKeys = []
let supabaseUrl = ''
let supabaseAnonKey = ''
// Where lib/gemini.js POSTs when no CLIENT key is configured — the normal
// production path (the key lives on the server, see api/gemini.js). Relative by
// default, which is what the web app wants: same origin, no CORS, nothing to
// configure. A native shell has no origin to be relative to, so Expo injects an
// absolute URL here ('https://<deployment>/api/gemini').
let aiProxyUrl = '/api/gemini'

/** 'a,b' or ['a','b'] → ['a','b'] (trimmed, empties dropped). */
function toKeyList(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
  return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Inject platform environment. Call once at boot, before the data barrel loads.
 * Fields left undefined keep their current value, so partial configuration is safe.
 */
export function configureEnv({
  geminiKeys: keys,
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  aiProxyUrl: proxyUrl,
} = {}) {
  if (keys !== undefined) geminiKeys = toKeyList(keys)
  if (url !== undefined) supabaseUrl = String(url ?? '')
  if (anonKey !== undefined) supabaseAnonKey = String(anonKey ?? '')
  // '' explicitly disables the proxy (direct-only / offline); undefined keeps
  // the default, so an app shell that never heard of this field still works.
  if (proxyUrl !== undefined) aiProxyUrl = String(proxyUrl ?? '')
}

/**
 * CLIENT-SIDE Gemini keys — LOCAL DEV ONLY.
 * A value here means the browser calls Google directly, which puts the key in
 * the shipped bundle. Production leaves this empty and lets the server proxy
 * (getAiProxyUrl) hold the key instead. Empty + no reachable proxy = written
 * fallbacks, which is a supported, fully working mode.
 */
export function getGeminiKeys() {
  return geminiKeys
}

/** Server-side AI proxy endpoint ('' = disabled). */
export function getAiProxyUrl() {
  return aiProxyUrl
}

/** Supabase project URL ('' = seed mode). */
export function getSupabaseUrl() {
  return supabaseUrl
}

/** Supabase anon key ('' = seed mode). */
export function getSupabaseAnonKey() {
  return supabaseAnonKey
}
