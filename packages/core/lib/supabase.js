// Thin, env-driven Supabase client.
//
// Enabled ONLY when the boot shell injected both values through the env seam
// (packages/core/env.js): supabase URL + anon key. With either missing the app
// runs in seed mode and this module is inert — the SDK itself is loaded lazily
// (dynamic import) so seed-mode users never download it.
//
// TWO GATES, deliberately:
//   supabaseEnabled() — injected env says a backend is configured. A FUNCTION,
//                       not a module-scope const: core never reads env at import
//                       time, so this module is importable before configureEnv()
//                       runs (plain Node, the seed generator's test harness).
//   liveClient()      — hydration actually SUCCEEDED (data/hydrate.js calls
//                       setSupabaseLive(true) only after the seed arrays were
//                       replaced with backend rows). Mutators write through
//                       liveClient(), so a configured-but-unreachable backend
//                       never receives writes for data the user isn't seeing.
import { getSupabaseUrl, getSupabaseAnonKey } from '../env.js'

/** Is a backend configured? Read lazily from the injected env, never cached. */
export function supabaseEnabled() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey())
}

let client = null
let live = false

/** Create (once) and return the client, or null when env is absent. */
export async function initSupabase() {
  if (!supabaseEnabled()) return null
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    // No auth session: the app is anon-only (see the RLS demo posture in
    // supabase/migrations/0001_init.sql).
    client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), { auth: { persistSession: false } })
  }
  return client
}

/** Flip the "hydration succeeded" gate — called by src/data/hydrate.js only. */
export function setSupabaseLive(v) {
  live = !!v
}

/**
 * The client the MUTATORS write through: non-null only when the app is
 * actually showing backend data. In seed mode (or after a hydration
 * failure/timeout) this is null and mutators stay purely local.
 */
export function liveClient() {
  return live ? client : null
}
