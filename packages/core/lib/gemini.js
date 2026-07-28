// Gemini client with graceful fallback.
//
// TWO TRANSPORTS, one behaviour:
//
//   PROXY  (default, and the ONLY production path)
//     POST { prompt, system, temperature, maxOutputTokens } → /api/gemini
//     (packages/core/env.js → getAiProxyUrl()). The API key lives in the
//     server's GEMINI_API_KEYS and never reaches the browser.
//
//   DIRECT (local dev convenience ONLY)
//     Used only when VITE_GEMINI_API_KEYS is explicitly set, which injects keys
//     through configureEnv(). This calls Google straight from the browser, so
//     the key IS in the bundle — never set that variable in a deployment.
//
// Either transport failing is not an error the user sees: every askAI() caller
// passes a written `fallback` and gets it back. The UI always feels intelligent.
//
// Nothing is read at module scope — the transport is resolved LAZILY on the
// first geminiGenerate() call, so this module is importable before
// configureEnv() runs (plain Node, test harnesses) without baking in an empty
// key list or a stale proxy URL.
import { getGeminiKeys, getAiProxyUrl } from '../env.js'

const MODEL = 'gemini-2.5-flash'
const REQUEST_TIMEOUT_MS = 12000

// ------------------------------------------------------------------
// Failure state — a COOLDOWN, not a latch.
//
// This used to be a one-way `liveOk = false`: a single flaky request (a dropped
// wifi packet on a train) killed AI for the entire session until the user
// reloaded. Now a failure only parks live calls for a while, and the window
// grows with consecutive failures, so we recover on our own without hammering a
// backend that is genuinely down.
//   transient failure : 30s → 1m → 2m → 4m → 5m (capped)
//   "no key server-side" (HTTP 503 ai_unconfigured): 10 min — it is a config
//   state, not an outage, and retrying it every 30s is pure noise.
// ------------------------------------------------------------------
const COOLDOWN_STEPS_MS = [30_000, 60_000, 120_000, 240_000, 300_000]
const UNCONFIGURED_COOLDOWN_MS = 600_000

let liveOk = null // null = never tried · true = last call succeeded · false = last call failed
let consecutiveFailures = 0
let retryAfterMs = 0 // epoch ms; live calls are skipped until then

function noteSuccess() {
  liveOk = true
  consecutiveFailures = 0
  retryAfterMs = 0
}

function noteFailure({ unconfigured = false } = {}) {
  liveOk = false
  const wait = unconfigured
    ? UNCONFIGURED_COOLDOWN_MS
    : COOLDOWN_STEPS_MS[Math.min(consecutiveFailures, COOLDOWN_STEPS_MS.length - 1)]
  consecutiveFailures += 1
  retryAfterMs = Date.now() + wait
}

/** True while a previous failure's cooldown is still running. */
function coolingDown() {
  return retryAfterMs > Date.now()
}

// ------------------------------------------------------------------
// transports
// ------------------------------------------------------------------

let directEndpoints = null // built on first use; each key is tried against both model endpoints
function resolveDirectEndpoints() {
  if (directEndpoints) return directEndpoints
  // Say it out loud, once. A key reachable from this module is a key that was
  // inlined into the JS bundle by Vite and can be read by any visitor.
  console.warn(
    '[ai] DIRECT mode: VITE_GEMINI_API_KEYS is set, so a Gemini key is embedded in this bundle ' +
    'and readable by anyone. Local development only — deployments must leave it unset and use ' +
    'the server proxy (GEMINI_API_KEYS on the server, see api/gemini.js).',
  )
  directEndpoints = getGeminiKeys().flatMap((k) => [
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${k}`,
  ])
  return directEndpoints
}

async function tryEndpoint(url, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  if (!text) throw new Error('Empty response')
  return text.trim()
}

/**
 * POST to the server proxy. Throws on any failure; the thrown error carries
 * `unconfigured` when the server told us it holds no key (503), so the caller
 * can back off for longer.
 */
async function tryProxy(url, payload, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    // 503 = the deployment has no GEMINI_API_KEYS set. 404/405 = no proxy
    // deployed at all (e.g. the Vite dev server, which serves no /api routes).
    err.unconfigured = res.status === 503 || res.status === 404 || res.status === 405
    throw err
  }
  // A dev server's SPA fallback can answer 200 with HTML — insist on JSON
  // rather than letting res.json() throw an opaque parse error.
  const type = res.headers.get('content-type') || ''
  if (!type.includes('application/json')) {
    throw Object.assign(new Error('Non-JSON response'), { unconfigured: true })
  }
  const json = await res.json()
  const text = typeof json?.text === 'string' ? json.text.trim() : ''
  if (!text) throw new Error('Empty response')
  return text
}

export async function geminiGenerate(prompt, { system = '', temperature = 0.7, fallback = '', maxOutputTokens = 600 } = {}) {
  // Fast path: a recent failure is still cooling down.
  if (coolingDown()) return fallback

  const keys = getGeminiKeys()
  const proxyUrl = getAiProxyUrl()
  // No client key AND no proxy configured → nothing to call, ever. Park it on
  // the long cooldown instead of retrying a call we know cannot exist.
  if (!keys.length && !proxyUrl) {
    noteFailure({ unconfigured: true })
    return fallback
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    if (keys.length) {
      // DIRECT (dev): key in the browser, exactly as before.
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens, topP: 0.95 },
      }
      if (system) body.systemInstruction = { parts: [{ text: system }] }
      for (const url of resolveDirectEndpoints()) {
        try {
          const out = await tryEndpoint(url, body, controller.signal)
          noteSuccess()
          return out
        } catch {
          continue // try the next key/model
        }
      }
      noteFailure()
      return fallback
    }

    // PROXY (production): no secret in this payload.
    try {
      const out = await tryProxy(proxyUrl, { prompt, system, temperature, maxOutputTokens }, controller.signal)
      noteSuccess()
      return out
    } catch (e) {
      noteFailure({ unconfigured: !!e?.unconfigured })
      return fallback
    }
  } catch {
    noteFailure()
    return fallback
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Whether the live AI backend answered successfully on its last attempt. */
export function isGeminiLive() {
  return liveOk === true
}

/**
 * Test/diagnostic seam: forget the failure cooldown so the next call tries live
 * again immediately. Not used by the UI — a session recovers on its own.
 */
export function resetGeminiBackoff() {
  consecutiveFailures = 0
  retryAfterMs = 0
}

// Convenience: streamed-feel typewriter for a generated string (the API itself
// is non-streaming for simplicity, but we render the result with a typewriter).
export function typewriter(text, onUpdate, { speed = 14, jitter = 8 } = {}) {
  let i = 0
  let cancelled = false
  function tick() {
    if (cancelled) return
    i = Math.min(text.length, i + 1 + Math.floor(Math.random() * 3))
    onUpdate(text.slice(0, i))
    if (i < text.length) {
      setTimeout(tick, speed + Math.random() * jitter)
    }
  }
  tick()
  return () => { cancelled = true }
}
