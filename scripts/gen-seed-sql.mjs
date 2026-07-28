#!/usr/bin/env node
// ============================================================
// gen-seed-sql.mjs — generates supabase/seed.sql FROM the real seed data.
//
//   node scripts/gen-seed-sql.mjs
//
// The app's demo dataset lives in packages/core/lib/seedData.js (pure data, no
// browser imports — which is what makes this direct import possible). This script
// is the single source of truth for the SQL seed: never hand-edit seed.sql, edit
// the seed data and re-run this.
//
// TIME: seed records carry relative offsets (`atOffsetMs`, negative = past).
// They are emitted as `now() + ((<ms>) || ' milliseconds')::interval`, so the
// demo data is always fresh relative to WHEN THE SEED IS RUN — re-run seed.sql
// and "12 minutes ago" is 12 minutes ago again. Transcript turns are the one
// exception: they are stored as an offset INTO their call (a stable fact that
// never ages); packages/core/data/hydrate.js adds them back onto the call's timestamp.
//
// Output is deterministic: same seed data in, byte-identical SQL out.
// ============================================================
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRIMARY_USER, DEALER_PHONE, STORE_CODE_REGISTRY, MAPPED_LOCATIONS,
  MISSED_CALLS, CONNECTED_CALLS, IVR_DROPS, CALL_HISTORY,
  CUSTOMERS, REVIEWS, REVIEW_LEADERBOARD, MEDIA_LIBRARY, POST_TEMPLATES,
} from '../packages/core/lib/seedData.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'supabase', 'seed.sql')

// The one store every call / customer / review / media record belongs to —
// the demo runs entirely inside the primary Indiranagar store.
const PRIMARY_STORE_ID = PRIMARY_USER.store.id // 'lks-ind'

// ---------------- SQL literal helpers ----------------

/** Single-quoted string literal with '' escaping. */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Any scalar → SQL literal (null/undefined → NULL). */
function lit(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number in seed: ${v}`)
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return q(v)
}

/** Relative offset (ms, negative = past) → now()-anchored timestamptz expression. */
const ts = (offsetMs) => (offsetMs === null || offsetMs === undefined)
  ? 'null'
  : `now() + ((${offsetMs}) || ' milliseconds')::interval`

/** text[] literal. */
const textArr = (arr) => (arr && arr.length)
  ? `array[${arr.map(q).join(', ')}]::text[]`
  : `'{}'::text[]`

/** timestamptz[] literal from an array of offsets. */
const tsArr = (offsets) => (offsets && offsets.length)
  ? `array[${offsets.map(ts).join(', ')}]::timestamptz[]`
  : null

/** Multi-row INSERT statement. */
function insert(table, cols, rows) {
  if (!rows.length) return `-- ${table}: no rows\n`
  const head = `insert into ${table} (${cols.join(', ')}) values`
  const body = rows.map((r) => `  (${r.join(', ')})`).join(',\n')
  return `${head}\n${body};\n`
}

// ---------------- dealers ----------------
// One primary dealer + the two foreign owners the store-code registry implies
// (their existence is what makes the login's "notMapped" rejection real).
const FOREIGN_PHONES = [...new Set(
  STORE_CODE_REGISTRY.map((e) => e.phone).filter((p) => p !== DEALER_PHONE),
)]
const DEALERS = [
  { id: 'dlr-01', phone: DEALER_PHONE, name: `Lakshmi Electronics (${PRIMARY_USER.name})` },
  // Same brand code prefix, different owner (LKS-JAY-04) / another business (CRM-KOR-01).
  { id: 'dlr-02', phone: FOREIGN_PHONES[0], name: 'Lakshmi Electronics (Jayanagar owner)' },
  { id: 'dlr-03', phone: FOREIGN_PHONES[1], name: 'CRM Departmental Stores' },
]
const dealerIdByPhone = new Map(DEALERS.map((d) => [d.phone, d.id]))

// ---------------- stores ----------------
// The registry is the full store list; MAPPED_LOCATIONS carries the rich record
// for the primary dealer's three. Foreign stores get minimal rows (the registry
// only ever needs their code + owner).
const locById = new Map(MAPPED_LOCATIONS.map((l) => [l.id, l]))
const FOREIGN_STORE_STUBS = {
  'lks-jay': { name: 'Lakshmi Electronics', branch: 'Jayanagar', city: 'Bangalore' },
  'crm-kor': { name: 'CRM Departmental Stores', branch: 'Koramangala', city: 'Bangalore' },
}
const storeRows = STORE_CODE_REGISTRY.map((entry, i) => {
  const loc = locById.get(entry.locationId)
  const stub = FOREIGN_STORE_STUBS[entry.locationId] || {}
  return [
    lit(entry.locationId),                             // id
    lit(dealerIdByPhone.get(entry.phone)),             // dealer_id
    lit(entry.code),                                   // store_code
    i + 1,                                             // seq (registry order)
    lit(loc?.name ?? stub.name ?? entry.locationId),   // name
    lit(loc?.branch ?? stub.branch ?? null),
    lit(loc?.city ?? stub.city ?? null),
    lit(loc?.address ?? null),
    lit(loc?.pincode ?? null),
    lit(loc?.state ?? null),
    lit(loc?.landmark ?? null),
    lit(loc?.stated?.lat ?? null), lit(loc?.stated?.lng ?? null),
    lit(loc?.actual?.lat ?? null), lit(loc?.actual?.lng ?? null),
    lit(loc?.rating ?? null),
    lit(loc?.reviews ?? null),
    lit(!!loc?.verified),
    loc?.verified ? 'now()' : 'null',                  // verified_at
    lit(loc?.missed ?? null), lit(loc?.answered ?? null),
    lit(loc?.recovered ?? null), lit(loc?.recovery ?? null),
    lit(loc?.health ?? null), lit(loc?.healthPrev ?? null),
    lit(!!loc?.primary),
    lit(loc?.addedAgo ?? null), lit(loc?.addedAgoKey ?? null),
    ts(loc?.addedAtOffsetMs ?? null),
  ]
})
const STORE_COLS = [
  'id', 'dealer_id', 'store_code', 'seq', 'name', 'branch', 'city', 'address',
  'pincode', 'state', 'landmark', 'stated_lat', 'stated_lng', 'actual_lat', 'actual_lng',
  'rating', 'reviews_count', 'verified', 'verified_at',
  'missed_count', 'answered_count', 'recovered_count', 'recovery_pct',
  'health', 'health_prev', 'is_primary', 'added_ago', 'added_ago_key', 'added_at',
]

// ---------------- managers ----------------
// The leaderboard names are the dealer's team; PRIMARY_USER supplies the role
// and (masked) phone for the signed-in manager.
const managerRows = REVIEW_LEADERBOARD.map((m) => [
  lit(m.id), lit('dlr-01'), lit(m.name), lit(m.initials),
  lit(m.name === PRIMARY_USER.name ? PRIMARY_USER.role : null),
  lit(m.name === PRIMARY_USER.name ? PRIMARY_USER.phone : null),
])

// ---------------- customers (+ timeline + notes) ----------------
const customerIds = new Set(CUSTOMERS.map((c) => c.id))

const customerRows = CUSTOMERS.map((c, i) => [
  lit(c.id), lit(PRIMARY_STORE_ID), i + 1,
  lit(c.name), lit(c.phone), lit(c.cli), lit(c.band), lit(c.value),
  lit(c.category), lit(c.categoryKey), lit(c.aiGuess), lit(c.aiGuessKey),
  lit(c.firstSeen), ts(c.firstSeenOffsetMs),
  lit(c.lastSeen), ts(c.lastSeenOffsetMs),
  lit(c.callCount), lit(!!c.reviewSent), lit(!!c.reviewed),
])
const CUSTOMER_COLS = [
  'id', 'store_id', 'seq', 'name', 'phone', 'cli', 'band', 'value',
  'category', 'category_key', 'ai_guess', 'ai_guess_key',
  'first_seen_label', 'first_seen_at', 'last_seen_label', 'last_seen_at',
  'call_count', 'review_sent', 'reviewed',
]

const timelineRows = CUSTOMERS.flatMap((c) =>
  (c.timeline || []).map((e, i) => [
    lit(c.id), i + 1, lit(e.type), lit(e.at), ts(e.atOffsetMs),
    lit(e.atPrecision ?? null), lit(e.detail), lit(e.detailKey),
  ]))

const noteRows = CUSTOMERS.flatMap((c) =>
  (c.notes || []).map((n) => [
    lit(n.id), lit(c.id), lit(n.author), lit(n.text), ts(n.atOffsetMs),
  ]))

// ---------------- calls (+ transcript turns) ----------------
const CALL_COLS = [
  'id', 'store_id', 'customer_id', 'seq', 'bucket', 'outcome', 'spam', 'at',
  'masked', 'full_masked_display', 'time_label', 'minutes_ago', 'source',
  'duration', 'direction', 'cli', 'est_value', 'category', 'category_key',
  'intent', 'intent_reason', 'intent_reason_key', 'repeats',
  'repeat_history_labels', 'repeat_history_at',
  'sentiment', 'mood', 'call_reason', 'call_reason_key',
  'lead_status', 'review_link_sent', 'summary', 'summary_key', 'highlights',
  'next_step', 'next_step_label', 'next_step_label_key', 'tag',
  'ivr_stage', 'ivr_stage_key', 'ivr_dropped_at_label', 'ivr_dropped_at_key',
  'ivr_dropped_after_sec', 'ivr_drop_reason', 'ivr_drop_reason_key',
]

const nulledCustomerRefs = []
/** A call's customer_id, or NULL when the seed references a CRM id it never
 *  defined (getCustomerById() already resolves those to null in the app). */
function callCustomerId(rec) {
  if (!rec.customerId) return 'null'
  if (!customerIds.has(rec.customerId)) {
    nulledCustomerRefs.push(`${rec.id} → ${rec.customerId}`)
    return 'null'
  }
  return lit(rec.customerId)
}

function callRow(rec, seq, bucket, outcome) {
  return [
    lit(rec.id), lit(PRIMARY_STORE_ID), callCustomerId(rec), seq,
    lit(bucket), lit(outcome), lit(!!rec.spam), ts(rec.atOffsetMs),
    lit(rec.masked ?? null), lit(rec.fullMaskedDisplay ?? null),
    lit(rec.time ?? null), lit(rec.minutesAgo ?? null), lit(rec.source ?? null),
    lit(rec.duration ?? null), lit(rec.direction ?? null),
    lit(rec.cli ?? null), lit(rec.estValue ?? null),
    lit(rec.category ?? null), lit(rec.categoryKey ?? null),
    lit(rec.intent ?? null), lit(rec.intentReason ?? null), lit(rec.intentReasonKey ?? null),
    lit(rec.repeats ?? null),
    rec.repeatHistory ? textArr(rec.repeatHistory) : 'null',
    tsArr(rec.repeatHistoryOffsetsMs) ?? 'null',
    lit(rec.sentiment ?? 'neutral'), lit(rec.mood ?? null),
    lit(rec.callReason ?? null), lit(rec.callReasonKey ?? null),
    lit(rec.leadStatus ?? 'open'), lit(!!rec.reviewLinkSent),
    lit(rec.summary ?? null), lit(rec.summaryKey ?? null),
    rec.highlights ? textArr(rec.highlights) : 'null',
    lit(rec.nextStep ?? null), lit(rec.nextStepLabel ?? null), lit(rec.nextStepLabelKey ?? null),
    lit(rec.tag ?? null),
    // IVR-drop fields — note: on an IVR drop, `reason` is why they DROPPED
    // (distinct from callReason, why they CALLED). Same as the seed.
    lit(rec.stage ?? null), lit(rec.stageKey ?? null),
    lit(rec.droppedAt ?? null), lit(rec.droppedAtKey ?? null),
    lit(rec.droppedAfterSec ?? null),
    lit(bucket === 'today' && outcome === 'ivr_drop' ? rec.reason ?? null : null),
    lit(bucket === 'today' && outcome === 'ivr_drop' ? rec.reasonKey ?? null : null),
  ]
}

let callSeq = 0
const callRows = [
  ...MISSED_CALLS.map((c) => callRow(c, ++callSeq, 'today', 'missed')),
  ...CONNECTED_CALLS.map((c) => callRow(c, ++callSeq, 'today', 'answered')),
  ...IVR_DROPS.map((c) => callRow(c, ++callSeq, 'today', 'ivr_drop')),
  ...CALL_HISTORY.map((c) => callRow(c, ++callSeq, 'history', c.kind === 'connected' ? 'answered' : 'missed')),
]

// Transcript turns: stored as offset INTO the call (turn.atOffsetMs is
// call-offset + seconds-in; subtracting the call offset recovers the stable
// "N ms into the conversation" number).
const turnRows = [...CONNECTED_CALLS, ...CALL_HISTORY].flatMap((call) =>
  (call.transcript || []).map((turn, i) => [
    lit(call.id), i + 1, lit(turn.speaker), lit(turn.text),
    turn.atOffsetMs - call.atOffsetMs,
  ]))

// ---------------- reviews (+ replies) ----------------
const reviewRows = REVIEWS.map((r, i) => [
  lit(r.id), lit(PRIMARY_STORE_ID), r.customerId ? lit(r.customerId) : 'null', i + 1,
  lit(r.customer), lit(r.rating), lit(r.body ?? null), lit(r.platform),
  ts(r.atOffsetMs), lit(r.time ?? null),
  lit(!!r.priority), lit(!!r.removed), ts(r.removedAtOffsetMs ?? null),
  lit(!!r.edited), ts(r.editedAtOffsetMs ?? null), lit(r.previousRating ?? null),
  textArr(r.tags || []),
])
const REVIEW_COLS = [
  'id', 'store_id', 'customer_id', 'seq', 'author_name', 'rating', 'body',
  'platform', 'at', 'time_label', 'priority', 'removed_from_google', 'removed_at',
  'edited', 'edited_at', 'previous_rating', 'tags',
]

const replyRows = REVIEWS.flatMap((r) =>
  (r.replies || []).map((rep) => [
    lit(rep.id), lit(r.id), lit(rep.platform), lit(rep.text), lit(rep.author),
    ts(rep.atOffsetMs), lit(!!rep.deleted), ts(rep.deletedAtOffsetMs ?? null),
  ]))

// ---------------- media + templates ----------------
const mediaRows = MEDIA_LIBRARY.map((m, i) => [
  lit(m.id), lit(PRIMARY_STORE_ID), i + 1, lit(m.kind), lit(m.label),
  lit(m.labelKey ?? null), lit(m.tag ?? null), lit(m.tagKey ?? null),
  lit(m.src ?? null),
])

const templateRows = POST_TEMPLATES.map((t, i) => [
  lit(t.id), i + 1, lit(t.id.replace(/^pt-/, '')), lit(t.name), lit(t.nameKey),
  lit(t.icon), lit(t.accent), lit(t.headline), lit(t.headlineKey),
  lit(t.cta), lit(t.ctaKey),
])

// ---------------- assemble ----------------
const counts = {
  dealers: DEALERS.length,
  stores: storeRows.length,
  managers: managerRows.length,
  customers: customerRows.length,
  customer_timeline_events: timelineRows.length,
  customer_notes: noteRows.length,
  calls: callRows.length,
  call_transcript_turns: turnRows.length,
  reviews: reviewRows.length,
  review_replies: replyRows.length,
  media_assets: mediaRows.length,
  post_templates: templateRows.length,
  access_requests: 0,
}

const sql = `-- ============================================================
-- supabase/seed.sql — GENERATED by scripts/gen-seed-sql.mjs. DO NOT HAND-EDIT.
--
--   node scripts/gen-seed-sql.mjs
--
-- Generated from packages/core/lib/seedData.js. All timestamps are now()-relative
-- intervals, so the demo data is always fresh as of the moment this file runs.
-- Re-run it any time the demo has gone stale.
--
-- Idempotent: truncates every app table first (restart identity, cascade).
-- ============================================================
begin;

truncate table
  access_requests, post_templates, media_assets, review_replies, reviews,
  call_transcript_turns, calls, customer_notes, customer_timeline_events,
  customers, managers, stores, dealers
restart identity cascade;

-- ---------------- dealers ----------------
${insert('dealers', ['id', 'phone', 'name'], DEALERS.map((d) => [lit(d.id), lit(d.phone), lit(d.name)]))}
-- ---------------- stores (the store-code registry; rich rows for the primary dealer's three) ----------------
${insert('stores', STORE_COLS, storeRows)}
-- ---------------- managers ----------------
${insert('managers', ['id', 'dealer_id', 'name', 'initials', 'role', 'phone'], managerRows)}
-- ---------------- customers ----------------
${insert('customers', CUSTOMER_COLS, customerRows)}
-- ---------------- customer timeline ----------------
${insert('customer_timeline_events', ['customer_id', 'seq', 'type', 'at_label', 'at', 'at_precision', 'detail', 'detail_key'], timelineRows)}
-- ---------------- customer notes ----------------
${insert('customer_notes', ['id', 'customer_id', 'author', 'body', 'at'], noteRows)}
-- ---------------- calls (today's three buckets + history) ----------------
-- Seed customerIds with no CRM record are NULLed (app behavior identical):
${nulledCustomerRefs.map((s) => `--   ${s}`).join('\n')}
${insert('calls', CALL_COLS, callRows)}
-- ---------------- call transcript turns ----------------
${insert('call_transcript_turns', ['call_id', 'turn_index', 'speaker', 'body', 'at_offset_ms'], turnRows)}
-- ---------------- reviews ----------------
${insert('reviews', REVIEW_COLS, reviewRows)}
-- ---------------- review replies (history, including deleted ones) ----------------
${insert('review_replies', ['id', 'review_id', 'platform', 'body', 'author', 'at', 'deleted', 'deleted_at'], replyRows)}
-- ---------------- media assets ----------------
${insert('media_assets', ['id', 'store_id', 'seq', 'kind', 'label', 'label_key', 'tag', 'tag_key', 'src'], mediaRows)}
-- ---------------- post templates ----------------
${insert('post_templates', ['id', 'seq', 'type', 'name', 'name_key', 'icon', 'accent', 'headline', 'headline_key', 'cta', 'cta_key'], templateRows)}
commit;

-- ============================================================
-- SANITY CHECK — expected row counts (from the seed arrays at generation time):
--
${Object.entries(counts).map(([t, n]) => `--   ${t.padEnd(26)} ${n}`).join('\n')}
--
-- Verify with:
--   select 'dealers' t, count(*) from dealers
${Object.keys(counts).slice(1).map((t) => `--   union all select '${t}', count(*) from ${t}`).join('\n')}
--   ;
-- ============================================================
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, sql)

console.log(`wrote ${OUT}`)
console.log('row counts:')
for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(26)} ${n}`)
if (nulledCustomerRefs.length) {
  console.log(`nulled dangling customer refs (${nulledCustomerRefs.length}):`)
  for (const s of nulledCustomerRefs) console.log(`  ${s}`)
}
