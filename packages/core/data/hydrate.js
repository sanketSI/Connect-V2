// ============================================================
// HYDRATION ADAPTER — swaps the seed data for Supabase rows, before the app loads.
//
// THE DESIGN (and why it looks like this):
// Screens read data at MODULE SCOPE (`const MISSED_CALLS = getMissedCalls()`),
// synchronously — the getters can never become async without rewriting every
// screen. So instead of changing how data is READ, we change WHEN modules load:
// src/main.jsx awaits hydrate() BEFORE importing App.jsx, so by the time any
// data module resolves its records, the seed arrays already hold backend rows.
//
// The swap itself is IN PLACE — `arr.splice(0, arr.length, ...mapped)` — because
// every module that already imported a seed array holds a reference to the same
// array object; replacing its CONTENTS is visible to all of them, reassigning
// the binding would be visible to none.
//
// MODES:
//   • No Supabase env injected at boot (packages/core/env.js) → return
//     immediately. Seed mode, byte-for-byte the app's old behavior.
//   • Env present → fetch every table in parallel with a 4-second overall
//     budget. On ANY failure (timeout, network, query error, empty core
//     tables) → console.warn and return WITHOUT touching the arrays: the app
//     boots on seed data exactly as before. All-or-nothing: rows are mapped
//     first and spliced last, so a half-fetched backend can never produce a
//     half-hydrated app.
//
// FIELD MAPPING: snake_case columns → the EXACT camelCase names the app reads,
// including every `*Key` i18n sibling. Timestamps arrive as real instants and
// are mapped to `atMs` (epoch ms) directly; the resolvers in calls.js /
// customers.js / reviews.js prefer an existing `atMs` over resolving
// `atOffsetMs` (their one-line hydration tolerance).
//
// This module deliberately imports ONLY the seed adapter (and, lazily, the
// supabase client) — importing any src/data domain module here would make it
// resolve records BEFORE the splice, defeating the whole design.
//
// ------------------------------------------------------------
// NO RAW PHONE NUMBER EVER REACHES THIS CLIENT (0002_harden_rls.sql)
//
// `dealers.phone` IS the login credential and `customers.phone` is consumer
// PII; both used to be readable by `anon`, which holds a key that ships in the
// bundle. The migration revokes them, so this module can no longer ask for
// them — and, deliberately, no longer needs to:
//
//   • customers  → read from the `customers_public` VIEW. Its `phone` column is
//     already the masked display string; the raw digits stay server-side and
//     hydrated customer records carry NO `phone` key at all.
//   • dealers    → not fetched. The registry comes from the
//     `dealer_store_registry` VIEW (code · location_id · dealer_id ·
//     phone_masked), and "which stores are MINE?" is answered by comparing
//     opaque dealer IDS after one `dealer_for_phone` RPC resolves this build's
//     sign-in number to a dealer id, server-side.
//
// Both reads name their columns explicitly rather than `select('*')`, because
// `customers` now carries a COLUMN-level grant — a star-select would be
// rejected outright and drop the whole deployment silently back to seed data.
// ============================================================
import {
  MISSED_CALLS, CONNECTED_CALLS, IVR_DROPS, CALL_HISTORY,
  CUSTOMERS, REVIEWS, MAPPED_LOCATIONS, STORE_CODE_REGISTRY,
  MEDIA_LIBRARY, POST_TEMPLATES, DEALER_PHONE,
} from '../lib/seedData.js'

/** Overall budget for the parallel fetch — past this the seed wins. */
export const HYDRATE_TIMEOUT_MS = 4000

/**
 * Boot-time entry point (awaited by src/main.jsx before App.jsx is imported).
 * Never throws: any failure logs a warning and leaves seed mode untouched.
 *
 * REPORTS ITS SOURCE: returns `'supabase'` when backend rows were spliced in and
 * `'seed'` otherwise (no env, or any failure/timeout that fell back to seed). This
 * is the honest, RESOLVED source — a configured-but-unreachable backend returns
 * `'seed'`, because that is what the user is actually looking at. main.jsx passes
 * it straight into the `app_opened` event.
 */
export async function hydrate() {
  // Lazy import so seed mode never downloads the supabase chunk.
  const { supabaseEnabled, initSupabase, setSupabaseLive } = await import('../lib/supabase.js')
  if (!supabaseEnabled()) {
    console.log('[data] source: seed')
    return 'seed'
  }
  try {
    const client = await initSupabase()
    const rows = await hydrateFromSupabase(client, HYDRATE_TIMEOUT_MS)
    // Only now may the mutators write through — the user is looking at DB data.
    setSupabaseLive(true)
    console.log(`[data] source: supabase (${rows} rows)`)
    return 'supabase'
  } catch (err) {
    console.warn('[data] hydration failed — falling back to seed data:', err)
    console.log('[data] source: seed')
    return 'seed'
  }
}

/**
 * Fetch + map + splice against a given client. Exported separately so the
 * timeout/fallback logic is testable under plain Node with a fake client
 * (see the verification notes in the repo task log). Throws on any failure;
 * mutates the seed arrays ONLY on complete success. Returns total rows.
 */
export async function hydrateFromSupabase(client, timeoutMs = HYDRATE_TIMEOUT_MS) {
  // supabase-js resolves { data, error } without throwing — normalize to throw
  // so one rejection anywhere trips the single fallback path.
  const fetchFrom = (relation, columns, ...orderCols) => {
    let q = client.from(relation).select(columns)
    for (const col of orderCols) q = q.order(col, { ascending: true })
    return q.then(({ data, error }) => {
      if (error) throw new Error(`${relation}: ${error.message || error}`)
      return data || []
    })
  }
  // Tables with no PII in them keep the whole row — they hold a TABLE-level
  // grant (0002 section A) and every column is mapped or ignored harmlessly.
  const fetchTable = (table, ...orderCols) => fetchFrom(table, '*', ...orderCols)

  // WHO ARE WE? Resolved server-side, and answered with an opaque dealer id —
  // the number goes out, nothing identifying comes back. This replaces reading
  // `dealers.phone` and comparing strings client-side.
  const fetchDealerId = () => client
    .rpc('dealer_for_phone', { p_phone: DEALER_PHONE })
    .then(({ data, error }) => {
      if (error) throw new Error(`dealer_for_phone: ${error.message || error}`)
      // `returns text` arrives as a scalar; tolerate a single-row array too.
      const id = Array.isArray(data) ? data[0] : data
      return typeof id === 'string' && id ? id : null
    })

  const [
    dealerId, registry, stores, customers, timelineEvents, notes,
    calls, turns, reviews, replies, media, templates,
  ] = await withTimeout(Promise.all([
    fetchDealerId(),
    fetchFrom('dealer_store_registry', REGISTRY_COLUMNS, 'code'),
    fetchTable('stores', 'seq'),
    fetchFrom('customers_public', CUSTOMER_COLUMNS, 'seq'),
    fetchTable('customer_timeline_events', 'customer_id', 'seq'),
    fetchTable('customer_notes', 'at'),
    fetchTable('calls', 'seq'),
    fetchTable('call_transcript_turns', 'call_id', 'turn_index'),
    fetchTable('reviews', 'seq'),
    fetchTable('review_replies', 'at'),
    fetchTable('media_assets', 'seq'),
    fetchTable('post_templates', 'seq'),
  ]), timeoutMs)

  // A reachable-but-unseeded database would splice the app down to nothing —
  // that is a failure, not a dataset.
  if (!stores.length || !customers.length || !calls.length || !reviews.length) {
    throw new Error('core tables are empty — has supabase/seed.sql been run?')
  }
  // No dealer id means no way to say which stores are ours, and a MAPPED_LOCATIONS
  // spliced down to nothing is a signed-in dealer with no shops. Same verdict as
  // an empty table: this is a failure, not a dataset. (The number is never logged.)
  if (!dealerId) {
    throw new Error('no dealer is registered against this build’s sign-in number')
  }

  // ---------- map everything BEFORE touching any seed array ----------
  const turnsByCall = groupBy(turns, 'call_id')
  const eventsByCustomer = groupBy(timelineEvents, 'customer_id')
  const notesByCustomer = groupBy(notes, 'customer_id')
  const repliesByReview = groupBy(replies, 'review_id')

  const mappedCalls = calls.map(mapCall.bind(null, turnsByCall))
  const next = {
    missed: mappedCalls.filter((c) => c._bucket === 'today' && c._outcome === 'missed'),
    connected: mappedCalls.filter((c) => c._bucket === 'today' && c._outcome === 'answered'),
    ivr: mappedCalls.filter((c) => c._bucket === 'today' && c._outcome === 'ivr_drop'),
    history: mappedCalls.filter((c) => c._bucket === 'history'),
    customers: customers.map((c) => mapCustomer(c, eventsByCustomer, notesByCustomer)),
    reviews: reviews.map((r) => mapReview(r, repliesByReview)),
    // Ownership by IDENTITY: an opaque id the server resolved, compared to the
    // id the store row already carries. No phone number is involved on either side.
    locations: stores.filter((s) => s.dealer_id === dealerId).map(mapLocation),
    // The registry is deliberately WIDER than MAPPED_LOCATIONS — it must hold
    // other dealers' codes or 'notMapped' could never fire (session.js). What it
    // no longer holds is anybody's number: `mine` is the ownership verdict
    // computed above, `phoneMasked` is display-only and already masked by the view.
    registry: registry.map((r) => ({
      code: r.code,
      locationId: r.location_id,
      dealerId: r.dealer_id,
      mine: r.dealer_id === dealerId,
      phoneMasked: r.phone_masked,
    })),
    media: media.map(mapMedia),
    templates: templates.map(mapTemplate),
  }
  for (const c of mappedCalls) { delete c._bucket; delete c._outcome }

  // ---------- commit: replace contents in place, keep array identity ----------
  MISSED_CALLS.splice(0, MISSED_CALLS.length, ...next.missed)
  CONNECTED_CALLS.splice(0, CONNECTED_CALLS.length, ...next.connected)
  IVR_DROPS.splice(0, IVR_DROPS.length, ...next.ivr)
  CALL_HISTORY.splice(0, CALL_HISTORY.length, ...next.history)
  CUSTOMERS.splice(0, CUSTOMERS.length, ...next.customers)
  REVIEWS.splice(0, REVIEWS.length, ...next.reviews)
  MAPPED_LOCATIONS.splice(0, MAPPED_LOCATIONS.length, ...next.locations)
  STORE_CODE_REGISTRY.splice(0, STORE_CODE_REGISTRY.length, ...next.registry)
  MEDIA_LIBRARY.splice(0, MEDIA_LIBRARY.length, ...next.media)
  POST_TEMPLATES.splice(0, POST_TEMPLATES.length, ...next.templates)

  return registry.length + stores.length + customers.length + timelineEvents.length +
    notes.length + calls.length + turns.length + reviews.length + replies.length +
    media.length + templates.length
}

/**
 * Exactly the columns the customer mapper reads, named explicitly because
 * `customers` now holds a COLUMN-level grant (0002 section A) and `select('*')`
 * would be rejected.
 *
 * Read from the `customers_public` VIEW, where `phone` is ALREADY the masked
 * display string (`+91 ●●●●● ●●NNN`) — the raw digits are not grantable to this
 * client at all. `updated_at` (added by 0003) is not read and not granted.
 */
const CUSTOMER_COLUMNS = [
  'id', 'seq', 'name', 'phone', 'cli', 'band', 'value',
  'category', 'category_key', 'ai_guess', 'ai_guess_key',
  'first_seen_label', 'first_seen_at', 'last_seen_label', 'last_seen_at',
  'call_count', 'review_sent', 'reviewed',
].join(',')

/** The whole of `dealer_store_registry` — a view that exists to be read whole. */
const REGISTRY_COLUMNS = ['code', 'location_id', 'dealer_id', 'phone_masked'].join(',')

/** What `masked` says when we hold no number for a customer at all. */
const MASKED_UNKNOWN = '+91 ●●●●● ●●'

// ============================================================
// mappers — snake_case rows → the exact record shapes the app consumes.
// Optional fields are ADDED only when present, so hydrated records have the
// same key-shape as their seed counterparts.
// ============================================================

/** timestamptz string → epoch ms (null-safe). */
const T = (v) => (v == null ? null : Date.parse(v))

function groupBy(rows, key) {
  const m = new Map()
  for (const r of rows) {
    const list = m.get(r[key])
    if (list) list.push(r)
    else m.set(r[key], [r])
  }
  return m
}

function mapCall(turnsByCall, r) {
  const atMs = T(r.at)
  const out = {
    id: r.id,
    atMs,
    masked: r.masked,
    source: r.source,
    cli: r.cli,
    estValue: r.est_value,
    category: r.category,
    categoryKey: r.category_key,
    sentiment: r.sentiment,
    callReason: r.call_reason,
    callReasonKey: r.call_reason_key,
    leadStatus: r.lead_status,
    reviewLinkSent: r.review_link_sent,
    // internal routing only — stripped before the splice
    _bucket: r.bucket,
    _outcome: r.outcome,
  }
  if (r.customer_id != null) out.customerId = r.customer_id
  if (r.spam) out.spam = true
  if (r.time_label != null) out.time = r.time_label
  if (r.minutes_ago != null) out.minutesAgo = r.minutes_ago
  if (r.full_masked_display != null) out.fullMaskedDisplay = r.full_masked_display
  if (r.repeats != null) out.repeats = r.repeats
  if (r.repeat_history_labels != null) out.repeatHistory = r.repeat_history_labels
  if (r.repeat_history_at != null) out.repeatHistoryAtMs = r.repeat_history_at.map(T)
  if (r.intent != null) out.intent = r.intent
  if (r.intent_reason != null) {
    out.intentReason = r.intent_reason
    out.intentReasonKey = r.intent_reason_key
  }
  if (r.direction != null) out.direction = r.direction
  if (r.duration != null) out.duration = r.duration
  if (r.mood != null) out.mood = r.mood
  if (r.summary != null) {
    out.summary = r.summary
    out.summaryKey = r.summary_key
  }
  if (r.highlights != null) out.highlights = r.highlights
  if (r.next_step != null) out.nextStep = r.next_step
  if (r.next_step_label != null) {
    out.nextStepLabel = r.next_step_label
    out.nextStepLabelKey = r.next_step_label_key
  }
  if (r.tag != null) out.tag = r.tag
  // IVR-drop fields: `reason` here is why they DROPPED, not why they called —
  // the deliberate name clash the seed documents on IVR_DROPS.
  if (r.ivr_stage != null) {
    out.stage = r.ivr_stage
    out.stageKey = r.ivr_stage_key
  }
  if (r.ivr_dropped_at_label != null) {
    out.droppedAt = r.ivr_dropped_at_label
    out.droppedAtKey = r.ivr_dropped_at_key
  }
  if (r.ivr_dropped_after_sec != null) out.droppedAfterSec = r.ivr_dropped_after_sec
  if (r.ivr_drop_reason != null) {
    out.reason = r.ivr_drop_reason
    out.reasonKey = r.ivr_drop_reason_key
  }
  // Transcript turns: at_offset_ms is the position INTO the call.
  const callTurns = turnsByCall.get(r.id)
  if (callTurns) {
    out.transcript = callTurns.map((t) => ({
      speaker: t.speaker,
      text: t.body,
      atMs: atMs + t.at_offset_ms,
    }))
  }
  // History rows carry the discriminator getCalls() unions on.
  if (r.bucket === 'history') out.kind = r.outcome === 'answered' ? 'connected' : 'missed'
  return out
}

function mapCustomer(r, eventsByCustomer, notesByCustomer) {
  return {
    id: r.id,
    name: r.name,
    // NO `phone`. `customers_public.phone` is the mask, not the number, and the
    // number itself is not readable by this client. Seed records still carry
    // real digits (a fixture, nobody's actual mobile); hydrated ones do not, so
    // customerDialDigits() returns null and the call-back button renders as the
    // disabled control the screen already draws for "we hold no number".
    masked: r.phone || MASKED_UNKNOWN,
    cli: r.cli,
    band: r.band,
    value: r.value,
    category: r.category,
    categoryKey: r.category_key,
    aiGuess: r.ai_guess,
    aiGuessKey: r.ai_guess_key,
    firstSeen: r.first_seen_label,
    firstSeenAtMs: T(r.first_seen_at),
    lastSeen: r.last_seen_label,
    lastSeenAtMs: T(r.last_seen_at),
    callCount: r.call_count,
    reviewSent: r.review_sent,
    reviewed: r.reviewed,
    timeline: (eventsByCustomer.get(r.id) || []).map((e) => {
      const entry = { type: e.type, at: e.at_label, atMs: T(e.at), detail: e.detail, detailKey: e.detail_key }
      if (e.at_precision != null) entry.atPrecision = e.at_precision
      return entry
    }),
    notes: (notesByCustomer.get(r.id) || []).map((n) => ({
      id: n.id,
      text: n.body,
      atMs: T(n.at),
      author: n.author,
    })),
  }
}

function mapReview(r, repliesByReview) {
  const atMs = T(r.at)
  const out = {
    id: r.id,
    customer: r.author_name,
    rating: r.rating,
    time: r.time_label,
    atMs,
    // sinceLastLogin() (locations.js) reads the raw REVIEWS array through
    // resolveAt(atOffsetMs); give it an offset in this session's frame. The
    // few-ms skew vs SESSION_START is irrelevant at its hour granularity.
    atOffsetMs: atMs - Date.now(),
    platform: r.platform,
    body: r.body,
    tags: r.tags || [],
    replies: (repliesByReview.get(r.id) || []).map((rep) => ({
      id: rep.id,
      platform: rep.platform,
      atMs: T(rep.at),
      author: rep.author,
      deleted: rep.deleted,
      deletedAtMs: T(rep.deleted_at),
      text: rep.body,
    })),
  }
  if (r.customer_id != null) out.customerId = r.customer_id
  if (r.priority) out.priority = true
  if (r.removed_from_google) {
    out.removed = true
    out.removedAtMs = T(r.removed_at)
  }
  if (r.edited) {
    out.edited = true
    out.editedAtMs = T(r.edited_at)
    out.previousRating = r.previous_rating
  }
  return out
}

function mapLocation(s) {
  const out = {
    id: s.id,
    storeCode: s.store_code,
    name: s.name,
    branch: s.branch,
    city: s.city,
    address: s.address,
    pincode: s.pincode,
    state: s.state,
    stated: { lat: s.stated_lat, lng: s.stated_lng },
    actual: { lat: s.actual_lat, lng: s.actual_lng },
    landmark: s.landmark ?? '',
    missed: s.missed_count,
    answered: s.answered_count,
    recovered: s.recovered_count,
    recovery: s.recovery_pct,
    health: s.health,
    healthPrev: s.health_prev,
    reviews: s.reviews_count,
    rating: s.rating == null ? null : Number(s.rating),
    verified: s.verified,
  }
  if (s.is_primary) out.primary = true
  if (s.added_ago != null) out.addedAgo = s.added_ago
  if (s.added_ago_key != null) out.addedAgoKey = s.added_ago_key
  if (s.added_at != null) out.addedAtMs = T(s.added_at)
  return out
}

function mapMedia(m) {
  const out = { id: m.id, kind: m.kind, label: m.label }
  if (m.label_key != null) out.labelKey = m.label_key // absent = file name, render verbatim
  if (m.tag != null) out.tag = m.tag
  if (m.tag_key != null) out.tagKey = m.tag_key
  if (m.src != null) out.src = m.src
  return out
}

function mapTemplate(t) {
  return {
    id: t.id,
    name: t.name,
    nameKey: t.name_key,
    icon: t.icon,
    accent: t.accent,
    headline: t.headline,
    headlineKey: t.headline_key,
    cta: t.cta,
    ctaKey: t.cta_key,
  }
}

/** Reject after `ms` — the underlying fetches keep running but their result is
 *  discarded; by then the app has already committed to seed data. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}
