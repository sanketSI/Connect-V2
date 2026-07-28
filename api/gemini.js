// ============================================================
// /api/gemini — server-side AI proxy (Vercel Node serverless function).
//
// WHY THIS EXISTS
// The client used to call Google's Generative Language API directly with the
// key in the URL query string, which meant the key shipped inside the JS bundle
// (any visitor could read it in DevTools) and travelled in a URL — logged by
// every proxy and analytics hop in between. This function moves the call
// server-side so the key never leaves the server:
//
//   browser → POST /api/gemini (no secret) → Google (key in a request HEADER)
//
// ENV (Vercel → Project Settings → Environment Variables):
//   GEMINI_API_KEYS   comma-separated list of keys. NO `VITE_` PREFIX — that
//                     prefix is exactly what makes Vite inline a value into the
//                     browser bundle. Anything named GEMINI_API_KEYS stays on
//                     the server. `GEMINI_API_KEY` (singular) is accepted too.
// Unset → 503 { error: 'ai_unconfigured' } and every caller renders the written
// fallback it already carries. The app never breaks on a missing key.
//
// CONTRACT
//   POST { prompt, system?, temperature?, maxOutputTokens? } → 200 { text }
//   any failure                                             → 4xx/5xx { error }
// The client (packages/core/lib/gemini.js) treats ANY non-200 (or a malformed
// 200) as "use the fallback", so error shapes stay deliberately opaque: no
// upstream body, no key, no stack ever reaches the response.
// ============================================================

const MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash']
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// ---- limits (abuse + cost control) -------------------------------------
const MAX_BODY_BYTES = 16 * 1024 // whole JSON envelope
const MAX_PROMPT_BYTES = 8 * 1024 // the prompt itself
const MAX_SYSTEM_BYTES = 4 * 1024 // the system instruction
const MAX_OUTPUT_TOKENS_CEILING = 1024 // HARD ceiling — a caller cannot exceed it
const DEFAULT_MAX_OUTPUT_TOKENS = 600 // matches the client default
const MAX_UPSTREAM_ATTEMPTS = 4 // keys × models, bounded so latency stays sane
// Under Vercel's default 10s function budget: abort upstream first so we can
// still return a clean JSON error instead of the platform's 504 HTML.
const UPSTREAM_TIMEOUT_MS = 9000

// ---- rate limit --------------------------------------------------------
// PER-INSTANCE AND THEREFORE BEST-EFFORT. Serverless runs N isolated instances
// and this Map lives in one instance's memory: a caller spread across cold
// starts effectively gets N × MAX_REQUESTS. It exists to blunt a single hot
// loop / one tab hammering the endpoint, NOT as a security control. For a real
// limit, move the counter to Upstash/Redis or Vercel's WAF rate limiting —
// that is the documented upgrade path, deliberately not built here.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_MAX_TRACKED_IPS = 5000 // bound the Map so it can't grow unbounded
const hits = new Map() // ip → number[] (request timestamps inside the window)

function rateLimited(ip) {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  // Opportunistic sweep: drop every ip whose window has fully expired.
  if (hits.size > RATE_LIMIT_MAX_TRACKED_IPS) {
    for (const [key, stamps] of hits) {
      if (!stamps.length || stamps[stamps.length - 1] <= cutoff) hits.delete(key)
    }
  }
  const recent = (hits.get(ip) || []).filter((t) => t > cutoff)
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    hits.set(ip, recent)
    return Math.ceil((recent[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)
  }
  recent.push(now)
  hits.set(ip, recent)
  return 0
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

/** Keys live ONLY here. Never logged, never returned, never in a URL. */
function apiKeys() {
  const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || ''
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const bytes = (s) => Buffer.byteLength(String(s ?? ''), 'utf8')

/** Parse the JSON body, refusing anything oversized BEFORE it is buffered. */
async function readJsonBody(req) {
  // The Vercel Node runtime pre-parses application/json; fall back to the raw
  // stream so this also runs under `vercel dev`, plain Node and any test rig.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {}
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_BODY_BYTES) throw Object.assign(new Error(), { tooLarge: true })
    return req.body.length ? JSON.parse(req.body.toString('utf8')) : {}
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error(), { tooLarge: true })
    chunks.push(chunk)
  }
  if (!size) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** One upstream attempt. Throws on anything that isn't usable text. */
async function callGoogle(model, key, body, signal) {
  const upstream = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Header, not `?key=` — keeps the secret out of URLs and access logs.
      'x-goog-api-key': key,
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!upstream.ok) {
    // Status only. The upstream body is never forwarded or logged: it can echo
    // request details and we will not risk leaking anything from it.
    throw Object.assign(new Error(`upstream ${upstream.status}`), { status: upstream.status })
  }
  const json = await upstream.json()
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  if (!text.trim()) throw new Error('empty candidate')
  return text.trim()
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  // No CORS headers, on purpose: this proxy is for THIS origin's pages only.
  // A cross-origin browser caller gets blocked by the absent ACAO header.

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { error: 'method_not_allowed' })
  }

  // Same-origin guard. Browsers always attach Origin to a cross-origin POST, so
  // a mismatch is a foreign site using us as a free AI relay. A missing Origin
  // (curl, server-to-server) is allowed through — the rate limit covers it.
  const origin = req.headers.origin
  if (origin) {
    let originHost = ''
    try { originHost = new URL(origin).host } catch { originHost = '' }
    if (originHost && req.headers.host && originHost !== req.headers.host) {
      return send(res, 403, { error: 'forbidden_origin' })
    }
  }

  const declared = Number(req.headers['content-length'] || 0)
  if (declared > MAX_BODY_BYTES) return send(res, 413, { error: 'payload_too_large' })

  const retryAfter = rateLimited(clientIp(req))
  if (retryAfter) {
    res.setHeader('Retry-After', String(retryAfter))
    return send(res, 429, { error: 'rate_limited' })
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (err) {
    if (err?.tooLarge) return send(res, 413, { error: 'payload_too_large' })
    return send(res, 400, { error: 'invalid_json' })
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
  const system = typeof body?.system === 'string' ? body.system : ''
  if (!prompt.trim()) return send(res, 400, { error: 'missing_prompt' })
  if (bytes(prompt) > MAX_PROMPT_BYTES) return send(res, 413, { error: 'prompt_too_large' })
  if (bytes(system) > MAX_SYSTEM_BYTES) return send(res, 413, { error: 'system_too_large' })

  // Clamp, never trust: temperature into Google's valid range, output tokens
  // under a hard ceiling so one caller cannot run up the bill.
  const rawTemp = Number(body?.temperature)
  const temperature = Number.isFinite(rawTemp) ? Math.min(2, Math.max(0, rawTemp)) : 0.7
  const rawTokens = Number(body?.maxOutputTokens)
  const maxOutputTokens = Math.min(
    MAX_OUTPUT_TOKENS_CEILING,
    Math.max(16, Number.isFinite(rawTokens) ? Math.floor(rawTokens) : DEFAULT_MAX_OUTPUT_TOKENS),
  )

  const keys = apiKeys()
  if (!keys.length) {
    // Not an error the user should see: every caller has a written fallback.
    // 503 tells the client "configured off", which it backs off from for longer
    // than a transient failure.
    return send(res, 503, { error: 'ai_unconfigured' })
  }

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens, topP: 0.95 },
  }
  if (system) payload.systemInstruction = { parts: [{ text: system }] }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  let lastStatus = 0
  try {
    let attempts = 0
    for (const key of keys) {
      for (const model of MODELS) {
        if (attempts++ >= MAX_UPSTREAM_ATTEMPTS) break
        try {
          const text = await callGoogle(model, key, payload, controller.signal)
          return send(res, 200, { text })
        } catch (err) {
          lastStatus = err?.status || lastStatus
          // Log the SHAPE of the failure only — never the key, never the body.
          console.warn(`[api/gemini] ${model} attempt failed (status ${err?.status || 'n/a'})`)
          if (controller.signal.aborted) break
        }
      }
      if (controller.signal.aborted) break
    }
    // Pass through the two statuses the client can act on; everything else is
    // an opaque 502 so upstream detail never reaches the browser.
    if (lastStatus === 429) {
      res.setHeader('Retry-After', '30')
      return send(res, 429, { error: 'rate_limited' })
    }
    return send(res, 502, { error: 'upstream_failed' })
  } catch {
    return send(res, 502, { error: 'upstream_failed' })
  } finally {
    clearTimeout(timer)
  }
}
