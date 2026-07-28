// ============================================================
// ANALYTICS SEAM — the pilot's proof that Connect recovers business.
//
// WHY THIS EXISTS: "zero business loss" is a number, not a feeling. A pilot that
// cannot say "37 missed calls, 29 called back inside 8 minutes, ₹4.1L converted"
// has no argument. Every screen already knows those moments as they happen; this
// module is the one place they get recorded.
//
// FOUR RULES, all enforced in code rather than by convention:
//
//   1. OFF BY DEFAULT. With no endpoint configured this module makes ZERO network
//      calls — nothing is queued, nothing is retried, nothing leaves the device.
//      Unconfigured it logs to the console (the development posture); pass
//      `debug: false` to silence it completely.
//   2. NEVER BREAKS THE APP. track() cannot throw into a caller and cannot block a
//      render: every sink runs inside a try/catch, the HTTP sink is fire-and-forget
//      (the promise's rejection is swallowed), and a dead endpoint costs one
//      unresolved request, never a frame.
//   3. A DECLARED SCHEMA. ANALYTICS_EVENTS below is the allowlist: an event name
//      that isn't in it is dropped, and so is any prop the event didn't declare.
//      Telemetry rots by typo ('review_sent' vs 'review_request_sent') and by
//      well-meaning extra props; both die here instead of in the warehouse.
//   4. PRIVACY BY CONSTRUCTION (DPDP Act). Raw phone numbers, customer names,
//      review bodies, note text and transcripts must NEVER be sent. That is not a
//      review-time promise: the sanitiser drops any key whose NAME looks personal
//      (even if a future schema declares it), drops any string that carries a run
//      of 6+ digits or an '@', drops any string longer than 48 chars, drops
//      objects and arrays outright, and drops caller-supplied numbers big enough
//      to be a phone number. Ids and counts survive; people don't.
//
// PLATFORM-NEUTRAL (see the purity rule in index.js): no window, no document, no
// localStorage, no navigator, no import.meta.env. The app shell injects everything
// at boot, exactly like env.js and storage.js:
//
//   web    apps/web/src/main.jsx
//          configureAnalytics({
//            endpoint: import.meta.env.VITE_ANALYTICS_URL,   // '' → nothing is sent
//            debug: import.meta.env.DEV,
//            context: { store_id: …, role: …, language: …, app_version: … },
//          })
//   mobile (Phase 1) the same call with process.env.EXPO_PUBLIC_ANALYTICS_URL.
//
// LEAF MODULE: no imports, so any screen or domain module can pull it in without
// risking an import cycle, and a test can import it under plain Node.
// ============================================================

// ============================================================
// THE SCHEMA — the 8 pilot events and the props each may carry.
//
// Adding an event means adding it HERE first; a name that isn't a key of this
// object is not trackable. Props are snake_case and must stay IDS, ENUMS, COUNTS
// and DURATIONS — never anything a person said or is called.
// ============================================================
export const ANALYTICS_EVENTS = Object.freeze({
  /** App boot. `source` says whether the pilot is on live data or the demo seed. */
  app_opened: ['source', 'role', 'returning', 'language', 'store_count'],

  /** A missed call landed in the dealer's feed — the top of the funnel. */
  missed_call_received: ['call_id', 'customer_id', 'source', 'category', 'value_inr', 'repeat_count', 'spam'],

  /** Dealer started calling that customer back. `minutes_since_miss` IS the pitch. */
  callback_initiated: ['call_id', 'customer_id', 'minutes_since_miss', 'channel', 'from'],

  /** Lead marked converted or lost, with the rupee value it carried. */
  call_outcome_set: ['call_id', 'customer_id', 'outcome', 'value_inr', 'count', 'from'],

  /** A review link was handed off to WhatsApp or SMS. */
  review_request_sent: ['customer_id', 'call_id', 'channel', 'count', 'from', 'ai_draft_used', 'prefilled'],

  /** A reply was published to a review. Time-to-reply + whether the AI draft survived. */
  review_reply_published: ['review_id', 'platform', 'rating', 'minutes_to_reply', 'ai_draft_used', 'edited'],

  /** The on-site verification funnel ended — verified, abandoned, or GPS refused. */
  location_verification_completed: ['location_id', 'result', 'gps_delta_m', 'steps_done', 'photo_exif_match'],

  /** UI language switched. The 18-language argument, measured. */
  language_changed: ['from', 'to', 'from_screen'],
})

/** Event names, for tests and for a caller that wants to enumerate them. */
export const ANALYTICS_EVENT_NAMES = Object.freeze(Object.keys(ANALYTICS_EVENTS))

// ============================================================
// THE SANITISER
// ============================================================

/**
 * Key names that may never carry a value, whatever the schema says. This is the
 * belt to the schema's braces: it catches the future prop nobody reviewed
 * ('customer_name', 'note_text', 'review_body') at the moment it is written.
 *
 * The people-word tokens are matched as plain substrings, deliberately broad. The
 * GEO tokens (lat/lng/coord) are anchored to a field-name boundary — start-of-key or
 * an underscore — because they are short enough to hide inside an innocent, non-PII
 * key: 'platform' contains 'lat', and review_reply_published legitimately carries a
 * 'platform' enum. Anchoring still catches every coordinate-key convention in this
 * codebase ('lat', 'lng', 'stated_lat', 'actual_lng', 'gps_coords', 'latitude') while
 * letting 'platform' through. If you extend the geo set, keep it anchored the same way.
 */
const DENIED_KEY = /phone|mobile|msisdn|number|contact|name|email|address|body|text|note|comment|transcript|message|otp|token|password|secret|(?:^|_)(?:lat|lng|coord)/i

/** A run of 6+ digits in a label or enum is a phone number, an OTP or a raw id. */
const DIGIT_RUN = /\d{6,}/

/** Enum/id values are short. Anything longer is prose, and prose is somebody's words. */
const MAX_STRING = 48

/** Caller-supplied numbers this big are phone-number-shaped, not metrics. */
const MAX_NUMBER = 1e9

/**
 * '+91 98801 42231', '09880142231', '9880142231' — a 7–15 digit string carrying no
 * letters is a telephone number in every formatting a caller might hand us.
 * Record ids ('cust-231', 'mc-01', a UUID) all carry letters, so they survive.
 */
function looksLikePhone(s) {
  if (/[A-Za-z]/.test(s)) return false
  const digits = s.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

/**
 * One prop value → the value we are willing to send, or undefined to drop it.
 * Only scalars survive: a nested object is an unreviewed payload by definition.
 *
 * `*_id` keys get the phone-shape test instead of the digit-run test: a record id
 * may legitimately contain digits (a UUID does), but must never BE a phone number.
 */
function cleanValue(v, key = '') {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return undefined
    if (Math.abs(v) >= MAX_NUMBER) return undefined      // phone-number-shaped
    return Math.round(v * 100) / 100
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return undefined
    if (s.length > MAX_STRING) return undefined          // prose
    if (s.includes('@')) return undefined                // email
    if (/_id$/.test(key) ? looksLikePhone(s) : DIGIT_RUN.test(s)) return undefined
    return s
  }
  return undefined                                        // objects, arrays, functions
}

/**
 * Props → the subset this event declared, sanitised. Returns the clean object and
 * how many keys were thrown away, so schema rot is visible in analyticsStats()
 * instead of silently shipping.
 */
function cleanProps(event, props) {
  const allowed = ANALYTICS_EVENTS[event] || []
  const out = {}
  let dropped = 0
  for (const [key, raw] of Object.entries(props || {})) {
    if (raw === undefined || raw === null) continue       // "not applicable", not a violation
    if (!allowed.includes(key) || DENIED_KEY.test(key)) { dropped++; continue }
    const value = cleanValue(raw, key)
    if (value === undefined) { dropped++; continue }
    out[key] = value
  }
  return { props: out, dropped }
}

// ============================================================
// SINKS
//
// A sink is `(batch) => void`, batch being an array of events. Set
// `sink.immediate = true` and it is called per event as it happens (what the dev
// console wants); anything else is buffered and delivered in batches (what a
// network endpoint wants).
// ============================================================

/** Dev sink: one line per event, so a developer can watch the funnel in devtools. */
function consoleSink(batch) {
  for (const e of batch) console.log('[analytics]', e.event, e)
}
consoleSink.immediate = true

/**
 * The one real sink that needs no dependency: POST `{ events: [...] }` to a
 * configured URL. Fire-and-forget by design — nothing awaits it, a rejection is
 * swallowed, and a 500 or an unreachable host costs the user nothing. `keepalive`
 * lets the last batch survive a tab closing where it is supported, and is ignored
 * where it isn't.
 */
export function httpSink(endpoint, fetchImpl) {
  return function post(batch) {
    const f = fetchImpl || (typeof fetch === 'function' ? fetch : null)
    if (!f || !batch.length) return
    try {
      const p = f(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      })
      if (p && typeof p.then === 'function') {
        p.then(
          () => { stats.sent += batch.length },
          () => { stats.failed += batch.length },
        )
      }
    } catch {
      stats.failed += batch.length      // a sink that throws must not reach the caller
    }
  }
}

// ============================================================
// STATE
// ============================================================

const DEFAULTS = {
  sink: null,        // (batch) => void — overrides everything below
  endpoint: '',      // '' → no HTTP sink → no network calls, ever
  fetchImpl: null,   // injectable for tests; defaults to the platform's fetch
  debug: undefined,  // true → also log · false → silence · unset → log (dev posture)
  enabled: true,     // master kill switch
  batchSize: 20,     // flush once this many events are queued
  flushMs: 15000,    // …or this long after the first queued event
}

let config = { ...DEFAULTS }

let context = {
  store_id: null,
  role: null,
  language: null,
  app_version: 'dev',
}

/** Per-session, per-device. Random enough to group a session, useless as an identity. */
function newSessionId() {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

let sessionId = newSessionId()
let seq = 0
let buffer = []
let timer = null

/** Bounded: a dead endpoint must cost memory that stops growing, not a tab. */
const MAX_BUFFER = 200

let stats = { tracked: 0, dropped_props: 0, rejected_events: 0, buffered: 0, sent: 0, failed: 0, dropped_events: 0 }

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Inject platform configuration. Call once at boot, before the tree renders.
 * Fields left undefined keep their current value, so partial configuration is safe.
 *
 *   configureAnalytics({ endpoint: VITE_ANALYTICS_URL, debug: DEV, context: {…} })
 */
export function configureAnalytics(next = {}) {
  const { context: ctx, ...rest } = next
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && k in DEFAULTS) config[k] = v
  }
  config.endpoint = String(config.endpoint || '').trim()
  if (ctx) setAnalyticsContext(ctx)
  return { ...config }
}

/**
 * Update the common context attached to every event — the store the dealer is in,
 * their role, the UI language, the build. Call it again whenever one changes (the
 * language switch does exactly this alongside its own event).
 */
export function setAnalyticsContext(patch = {}) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in context)) continue
    const clean = cleanValue(v, k)
    context[k] = clean === undefined ? context[k] : clean
  }
  return { ...context }
}

/** Is anything actually listening? (no endpoint, no sink, debug:false → false) */
export function analyticsEnabled() {
  return config.enabled && resolveSinks().length > 0
}

/** Counters — for tests, and for a QA answer to "did that tap record?". */
export function analyticsStats() {
  return { ...stats, buffered: buffer.length, session_id: sessionId }
}

/** Test-only: forget configuration, context, buffer and counters. */
export function resetAnalytics() {
  if (timer) { clearTimeout(timer); timer = null }
  config = { ...DEFAULTS }
  context = { store_id: null, role: null, language: null, app_version: 'dev' }
  buffer = []
  seq = 0
  sessionId = newSessionId()
  stats = { tracked: 0, dropped_props: 0, rejected_events: 0, buffered: 0, sent: 0, failed: 0, dropped_events: 0 }
}

// ============================================================
// DELIVERY
// ============================================================

function resolveSinks() {
  const out = []
  if (typeof config.sink === 'function') out.push(config.sink)
  else if (config.endpoint) out.push(httpSink(config.endpoint, config.fetchImpl))
  // Unconfigured (no sink, no endpoint) is a development posture: log, send nothing.
  const noRealSink = out.length === 0
  if (config.debug === true || (noRealSink && config.debug !== false)) out.push(consoleSink)
  return out
}

function safeDeliver(sink, batch) {
  try {
    sink(batch)
  } catch {
    stats.failed += batch.length      // rule 2: a broken sink is never the caller's problem
  }
}

function schedule() {
  if (timer || !config.flushMs) return
  timer = setTimeout(() => { timer = null; flushAnalytics() }, config.flushMs)
  // Node: a pending flush must not hold a test script open.
  if (timer && typeof timer.unref === 'function') timer.unref()
}

/**
 * Deliver whatever is queued right now. The shell should call this when the app
 * goes to the background or the tab hides — the one moment a batch would be lost.
 * Never throws; returns how many events went out.
 */
export function flushAnalytics() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!buffer.length) return 0
  const batch = buffer
  buffer = []
  const sinks = resolveSinks().filter(s => s.immediate !== true)
  for (const sink of sinks) safeDeliver(sink, batch)
  return batch.length
}

// ============================================================
// THE ONE CALL SCREENS MAKE
// ============================================================

/**
 * Record a product event.
 *
 *   track('review_request_sent', { customer_id: c.id, channel: 'whatsapp' })
 *
 * Validates the name against ANALYTICS_EVENTS, keeps only the props that event
 * declared, sanitises every value (see the sanitiser above), attaches the common
 * context, and hands the result to the configured sink(s). Synchronous, cheap, and
 * incapable of throwing — a call site never needs a try/catch or an await.
 *
 * @returns true if the event was accepted (false = unknown name, or telemetry off).
 */
export function track(event, props) {
  try {
    if (!config.enabled) return false
    if (typeof event !== 'string' || !Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, event)) {
      stats.rejected_events++
      if (config.debug === true) console.warn('[analytics] unknown event dropped:', event)
      return false
    }

    const { props: clean, dropped } = cleanProps(event, props)
    if (dropped) {
      stats.dropped_props += dropped
      if (config.debug === true) console.warn(`[analytics] ${event}: ${dropped} prop(s) dropped by the schema/privacy filter`)
    }

    const payload = {
      event,
      ts: Date.now(),
      session_id: sessionId,
      seq: ++seq,
      store_id: context.store_id,
      role: context.role,
      language: context.language,
      app_version: context.app_version,
      ...clean,
    }
    stats.tracked++

    const sinks = resolveSinks()
    if (!sinks.length) return false                       // telemetry off: nothing queues
    let batched = false
    for (const sink of sinks) {
      if (sink.immediate === true) safeDeliver(sink, [payload])
      else batched = true
    }
    if (batched) {
      buffer.push(payload)
      if (buffer.length > MAX_BUFFER) { buffer.shift(); stats.dropped_events++ }
      if (buffer.length >= config.batchSize) flushAnalytics()
      else schedule()
    }
    return true
  } catch {
    return false                                          // rule 2, last line of defence
  }
}
