// The analytics seam's guarantees, asserted rather than assumed:
//
//   • the common CONTEXT (store_id, language, role) rides on every event once it is set,
//     which is the whole point of a per-store, multi-language funnel;
//   • the MUTATORS that ARE the funnel — call_outcome_set, review_request_sent,
//     review_reply_published — fire with the schema's props and NOTHING personal;
//   • the PRIVACY SANITISER drops a phone number or a name even when a caller passes one,
//     under an allowed key or not (belt AND braces);
//   • flushAnalytics() delivers the buffered batch — the call the tab-close listener makes;
//   • with no endpoint and debug:false the module is inert — zero network, nothing queued.
//
// A capturing sink stands in for the warehouse; nothing here touches the network.
// resetAnalytics() between tests plus vitest's per-file isolation keep the record
// mutations these drive from leaking into the other suites.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  configureAnalytics, setAnalyticsContext, resetAnalytics,
  track, flushAnalytics, analyticsStats, ANALYTICS_EVENTS,
} from '../analytics.js'
import { setLeadStatus, markReviewLinkSent, getMissedCalls } from '../data/calls.js'
import { postReviewReply, getReviews } from '../data/reviews.js'

/** The envelope fields track() stamps on every payload, on top of the event's own props. */
const ENVELOPE = ['event', 'ts', 'session_id', 'seq', 'store_id', 'role', 'language', 'app_version']

/** Structural PII proof: an event may carry ONLY its schema props + the envelope. Any
 *  personal field would be an extra key, and there can be none. */
function expectOnlySchemaKeys(e) {
  const allowed = new Set([...ENVELOPE, ...ANALYTICS_EVENTS[e.event]])
  for (const k of Object.keys(e)) expect(allowed.has(k), `unexpected key on ${e.event}: ${k}`).toBe(true)
}

/** A sink that records every event synchronously — an endpoint that never leaves the box. */
function capture() {
  const events = []
  const sink = (batch) => { for (const e of batch) events.push(e) }
  sink.immediate = true // per-event, so a test reads it without waiting on a flush
  return { events, sink }
}

let cap
beforeEach(() => {
  resetAnalytics()
  cap = capture()
  configureAnalytics({ sink: cap.sink, debug: false })
})
afterEach(() => resetAnalytics())

describe('context rides on every event once it is set', () => {
  it('attaches store_id, language and role after setAnalyticsContext', () => {
    setAnalyticsContext({ store_id: 'lks-ind', language: 'hi', role: 'single' })
    track('app_opened', { source: 'seed', returning: false })

    const e = cap.events.at(-1)
    expect(e.event).toBe('app_opened')
    expect(e.store_id).toBe('lks-ind')
    expect(e.language).toBe('hi')
    expect(e.role).toBe('single')
    expect(e.source).toBe('seed')
  })

  it('carries null store_id/language before any context is set — useless to slice, honestly so', () => {
    track('app_opened', { source: 'seed' })
    const e = cap.events.at(-1)
    expect(e.store_id).toBeNull()
    expect(e.language).toBeNull()
  })
})

describe('the privacy sanitiser drops anything personal, whatever the caller passes', () => {
  it('strips a phone number and a name — even a phone under an allowed *_id key', () => {
    setAnalyticsContext({ store_id: 'lks-ind', language: 'en' })
    const droppedBefore = analyticsStats().dropped_props

    track('review_request_sent', {
      customer_id: 'cust-231',        // an id (carries letters): survives
      channel: 'whatsapp',            // an enum: survives
      count: 1,                       // a count: survives
      customer_name: 'Rajesh Kumar',  // name-shaped KEY: dropped by the denied-key guard
      phone: '+91 98801 42231',       // phone-shaped KEY: dropped
      call_id: '9880142231',          // ALLOWED key, but the value IS a phone: sanitiser drops it
    })

    const e = cap.events.at(-1)
    expect(e.customer_id).toBe('cust-231')
    expect(e.channel).toBe('whatsapp')
    expect(e.count).toBe(1)
    expect(e).not.toHaveProperty('customer_name')
    expect(e).not.toHaveProperty('phone')
    expect(e).not.toHaveProperty('call_id') // a phone number is not an id — gone
    expectOnlySchemaKeys(e)

    // Three props were actively rejected, and no personal string reached the payload.
    expect(analyticsStats().dropped_props).toBe(droppedBefore + 3)
    const blob = JSON.stringify(e)
    expect(blob).not.toContain('Rajesh')
    expect(blob).not.toContain('9880142231')
  })
})

describe('the funnel mutators fire the right event, with ids/enums/durations only', () => {
  it('setLeadStatus → call_outcome_set, tagged with the store', () => {
    setAnalyticsContext({ store_id: 'lks-ind', language: 'en' })
    const call = getMissedCalls().find(c => !c.spam)

    setLeadStatus(call.id, 'converted')

    const e = cap.events.find(x => x.event === 'call_outcome_set')
    expect(e).toBeTruthy()
    expect(e.call_id).toBe(call.id)
    expect(e.outcome).toBe('converted')
    expect(e.store_id).toBe('lks-ind')
    expect(e.value_inr === null || typeof e.value_inr === 'number').toBe(true)
    expectOnlySchemaKeys(e)                       // no masked number, no name — structurally impossible
    expect(JSON.stringify(e)).not.toMatch(/[●•]/) // and no mask glyph slipped through a value
  })

  it('markReviewLinkSent → review_request_sent, per call, carrying the channel', () => {
    setAnalyticsContext({ store_id: 'lks-ind', language: 'ta' })
    const call = getMissedCalls().find(c => !c.spam)

    markReviewLinkSent(call.id, true, { channel: 'whatsapp' })

    const e = cap.events.find(x => x.event === 'review_request_sent')
    expect(e).toBeTruthy()
    expect(e.call_id).toBe(call.id)
    expect(e.channel).toBe('whatsapp')
    expect(e.from).toBe('calls')
    expect(e.count).toBe(1)
    expect(e.language).toBe('ta')
    expectOnlySchemaKeys(e)
  })

  it('un-setting the review flag is a correction, not a send — no event', () => {
    const call = getMissedCalls().find(c => !c.spam)
    markReviewLinkSent(call.id, false)
    expect(cap.events.some(x => x.event === 'review_request_sent')).toBe(false)
  })

  it('postReviewReply → review_reply_published with platform, rating and minutes_to_reply — never the text', () => {
    setAnalyticsContext({ store_id: 'lks-ind', language: 'en' })
    const review = getReviews()[0]

    postReviewReply(review.id, { body: 'Thank you so much for the kind words!', platform: 'gbp' })

    const e = cap.events.find(x => x.event === 'review_reply_published')
    expect(e).toBeTruthy()
    expect(e.review_id).toBe(review.id)
    expect(e.platform).toBe('gbp')
    expect(typeof e.rating).toBe('number')
    expect(typeof e.minutes_to_reply).toBe('number')
    expectOnlySchemaKeys(e)
    expect(JSON.stringify(e)).not.toContain('Thank you') // the reply body never leaves the module
  })
})

describe('delivery guarantees', () => {
  it('flushAnalytics delivers the buffered batch — what the tab-close listener calls', () => {
    resetAnalytics()
    const batches = []
    const sink = (batch) => batches.push(batch) // NOT immediate → buffered until flushed
    configureAnalytics({ sink, debug: false, batchSize: 50 })

    track('app_opened', { source: 'seed' })
    track('language_changed', { from: 'en', to: 'hi' })
    expect(batches).toHaveLength(0)               // batch not full — nothing delivered yet

    const n = flushAnalytics()
    expect(n).toBe(2)
    expect(batches).toHaveLength(1)
    expect(batches[0].map(e => e.event)).toEqual(['app_opened', 'language_changed'])
  })

  it('is inert with no endpoint and debug:false — nothing queues, nothing sends', () => {
    resetAnalytics()
    configureAnalytics({ debug: false }) // no sink, no endpoint → no listener at all
    expect(track('app_opened', { source: 'seed' })).toBe(false)
    expect(flushAnalytics()).toBe(0)
    expect(analyticsStats().buffered).toBe(0)
  })
})
