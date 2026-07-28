// hydrate.js — the Supabase → seed swap that runs before the app tree loads.
//
// This file deliberately imports ONLY seedData + hydrate, never a data domain
// module: importing calls.js/reviews.js here would resolve their records at
// import time (before the splice), which is the exact ordering bug the hydration
// design exists to avoid.
//
// The last describe() MUTATES the seed arrays. Vitest isolates module state per
// test FILE, so that damage is contained here — but keep it last within the file.
import { describe, it, expect } from 'vitest'
import { hydrate, hydrateFromSupabase, HYDRATE_TIMEOUT_MS } from '../data/hydrate.js'
import {
  MISSED_CALLS, CONNECTED_CALLS, IVR_DROPS, CALL_HISTORY,
  CUSTOMERS, REVIEWS, MAPPED_LOCATIONS, STORE_CODE_REGISTRY,
  MEDIA_LIBRARY, POST_TEMPLATES, DEALER_PHONE,
} from '../lib/seedData.js'

const DEALER_ID = 'dl-1'

const EMPTY_TABLES = {
  dealer_store_registry: [], stores: [], customers_public: [],
  customer_timeline_events: [], customer_notes: [],
  calls: [], call_transcript_turns: [], reviews: [], review_replies: [],
  media_assets: [], post_templates: [],
}

/**
 * A supabase-js-shaped fake: `from(t).select(cols).order(c, {})` returning a
 * thenable that resolves `{ data, error }` — never throwing, exactly like the
 * real SDK, which is why hydrate has to normalise errors into rejections itself.
 *
 * `rpc()` is the same shape. `dealer_for_phone` returns a scalar, exactly as a
 * PostgREST `returns text` function does.
 */
function fakeClient(tables, { hang = false, errorOn = null, dealerId = DEALER_ID } = {}) {
  const calls = []
  const selects = {}
  const rpcs = []
  const settle = (name, payload) => ({
    then: (onOk, onErr) => {
      if (hang) return new Promise(() => {}) // never settles
      const bad = errorOn === name
        ? { data: null, error: { message: 'permission denied' } }
        : payload
      return Promise.resolve(bad).then(onOk, onErr)
    },
  })
  const client = {
    calls,
    selects,
    rpcs,
    from(table) {
      calls.push(table)
      const q = {
        select: (cols) => { selects[table] = cols; return q },
        order: () => q,
        ...settle(table, { data: tables[table] ?? [], error: null }),
      }
      return q
    },
    rpc(fn, args) {
      rpcs.push({ fn, args })
      return settle(fn, { data: dealerId, error: null })
    },
  }
  return client
}

describe('hydrate() in seed mode', () => {
  it('is a no-op when no Supabase env was injected — the seed survives, and it reports source: seed', async () => {
    const before = MISSED_CALLS.length
    // Reports its RESOLVED source so main.jsx can pass it to app_opened (see hydrate.js).
    await expect(hydrate()).resolves.toBe('seed')
    expect(MISSED_CALLS.length).toBe(before)
    expect(REVIEWS.length).toBeGreaterThan(0)
  })
})

describe('the timeout path — a slow backend must not hold the app hostage', () => {
  it('rejects within the budget when the fetch never resolves', async () => {
    const started = Date.now()
    await expect(hydrateFromSupabase(fakeClient(EMPTY_TABLES, { hang: true }), 120))
      .rejects.toThrow(/timed out after 120ms/)
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(100)
    expect(elapsed).toBeLessThan(2000)
  })

  it('leaves every seed array untouched when it times out', async () => {
    const before = [MISSED_CALLS.length, REVIEWS.length, CUSTOMERS.length, MAPPED_LOCATIONS.length]
    await expect(hydrateFromSupabase(fakeClient(EMPTY_TABLES, { hang: true }), 60)).rejects.toThrow()
    expect([MISSED_CALLS.length, REVIEWS.length, CUSTOMERS.length, MAPPED_LOCATIONS.length]).toEqual(before)
  })

  it('ships a 4-second default budget', () => {
    expect(HYDRATE_TIMEOUT_MS).toBe(4000)
  })
})

describe('failure guards', () => {
  it('a reachable-but-unseeded database is a FAILURE, not a dataset', async () => {
    await expect(hydrateFromSupabase(fakeClient(EMPTY_TABLES), 1000))
      .rejects.toThrow(/core tables are empty/)
    expect(MISSED_CALLS.length).toBeGreaterThan(0) // seed intact
  })

  it('turns a query error into a rejection naming the table', async () => {
    await expect(hydrateFromSupabase(fakeClient(EMPTY_TABLES, { errorOn: 'reviews' }), 1000))
      .rejects.toThrow(/reviews: permission denied/)
  })

  it('a failing identity RPC is a rejection like any other', async () => {
    await expect(hydrateFromSupabase(fakeClient(EMPTY_TABLES, { errorOn: 'dealer_for_phone' }), 1000))
      .rejects.toThrow(/dealer_for_phone: permission denied/)
  })

  it('a partial dataset (calls but no reviews) still trips the guard — all or nothing', async () => {
    const partial = { ...EMPTY_TABLES, stores: [{ id: 's' }], customers_public: [{ id: 'c' }], calls: [{ id: 'k' }] }
    await expect(hydrateFromSupabase(fakeClient(partial), 1000)).rejects.toThrow(/core tables are empty/)
    expect(CUSTOMERS.length).toBeGreaterThan(1) // nothing was spliced
  })

  it('reads the PII-free tables plus the two masked views — never `customers` or `dealers`', async () => {
    const client = fakeClient(EMPTY_TABLES)
    await hydrateFromSupabase(client, 1000).catch(() => {})
    expect(client.calls.sort()).toEqual([
      'call_transcript_turns', 'calls', 'customer_notes', 'customer_timeline_events',
      'customers_public', 'dealer_store_registry', 'media_assets', 'post_templates',
      'review_replies', 'reviews', 'stores',
    ])
    // The two tables that hold raw numbers are never touched.
    expect(client.calls).not.toContain('customers')
    expect(client.calls).not.toContain('dealers')
  })

  it('names its columns on the masked views and never `select *` on them', async () => {
    const client = fakeClient(EMPTY_TABLES)
    await hydrateFromSupabase(client, 1000).catch(() => {})
    expect(client.selects.customers_public).not.toBe('*')
    expect(client.selects.customers_public.split(',')).toContain('phone') // the MASK, not digits
    expect(client.selects.dealer_store_registry).toBe('code,location_id,dealer_id,phone_masked')
    expect(client.selects.stores).toBe('*') // no PII on stores — whole row is fine
  })

  it('asks the server who it is, and refuses to hydrate when nobody answers', async () => {
    const client = fakeClient(EMPTY_TABLES, { dealerId: null })
    await hydrateFromSupabase(client, 1000).catch(() => {})
    expect(client.rpcs).toEqual([{ fn: 'dealer_for_phone', args: { p_phone: DEALER_PHONE } }])
  })
})

// ⚠ MUTATES THE SEED — keep last in this file.
describe('snake_case → camelCase mapping (the drift trap)', () => {
  const AT = '2026-03-15T06:30:00.000Z'
  const AT_MS = Date.parse(AT)

  const TABLES = {
    // The registry view: opaque dealer id + a phone that is ALREADY masked.
    // There is no column here that could carry a raw number.
    dealer_store_registry: [{
      code: 'XYZ-ABC-07', location_id: 'st-1', dealer_id: DEALER_ID,
      phone_masked: '+91 98•••• ••42',
    }],
    stores: [{
      id: 'st-1', dealer_id: DEALER_ID, seq: 1, store_code: 'XYZ-ABC-07',
      name: 'Hydrated Electronics', branch: 'Whitefield', city: 'Bangalore',
      address: '1 Test Road', pincode: '560066', state: 'Karnataka',
      stated_lat: 12.97, stated_lng: 77.75, actual_lat: 12.98, actual_lng: 77.76,
      landmark: 'Near the test', missed_count: 4, answered_count: 6, recovered_count: 2,
      recovery_pct: 50, health: 70, health_prev: 65, reviews_count: 12, rating: '4.30',
      verified: false, is_primary: true, added_ago: 'Added 1 day ago',
      added_ago_key: 'seed.location.addedWhen', added_at: AT,
    }],
    // The masked view: `phone` is the display string, never digits.
    customers_public: [{
      id: 'cu-1', seq: 1, name: 'Test Caller', phone: '+91 ●●●●● ●●678', cli: 77, band: 'warm',
      value: 21000, category: 'Smart TV', category_key: 'seed.category.smartTv',
      ai_guess: 'Comparing prices', ai_guess_key: 'seed.aiGuess.comparing',
      first_seen_label: 'Mar 1', first_seen_at: AT, last_seen_label: 'Today', last_seen_at: AT,
      call_count: 3, review_sent: true, reviewed: false,
    }],
    customer_timeline_events: [{
      customer_id: 'cu-1', seq: 1, type: 'call', at: AT, at_label: '9:34 AM',
      detail: 'Asked about EMI', detail_key: 'seed.timeline.emi', at_precision: 'exact',
    }],
    customer_notes: [{ id: 'nt-1', customer_id: 'cu-1', at: AT, author: 'Rajesh', body: 'Call back after 6' }],
    calls: [{
      id: 'cl-1', seq: 1, bucket: 'today', outcome: 'missed', at: AT,
      masked: '+91 •••••678', source: 'Google', cli: 77, est_value: 21000,
      category: 'Smart TV', category_key: 'seed.category.smartTv', sentiment: 'neutral',
      call_reason: 'Price enquiry', call_reason_key: 'seed.callReason.priceEnquiry',
      lead_status: 'open', review_link_sent: false, customer_id: 'cu-1',
      time_label: '12:00 PM', minutes_ago: 30, full_masked_display: '+91 ●●●●● ●●678',
      repeats: 2, repeat_history_labels: ['9:00 AM', '12:00 PM'], repeat_history_at: [AT, AT],
      intent: 'high', intent_reason: 'Called twice', intent_reason_key: 'seed.reason.twice',
      spam: false,
    }],
    call_transcript_turns: [
      { call_id: 'cl-1', turn_index: 0, speaker: 'customer', body: 'Is the TV in stock?', at_offset_ms: 5000 },
    ],
    reviews: [{
      id: 'rv-h1', seq: 1, author_name: 'Hydrated Reviewer', rating: 4, time_label: '1h ago',
      at: AT, platform: 'Google', body: 'Decent service overall.', tags: ['staff'],
      customer_id: 'cu-1', priority: false, removed_from_google: false, edited: false,
    }],
    review_replies: [{
      id: 'rp-h1', review_id: 'rv-h1', platform: 'gbp', at: AT, author: 'Rajesh',
      deleted: false, deleted_at: null, body: 'Thank you!',
    }],
    media_assets: [{ id: 'md-1', seq: 1, kind: 'image', label: 'storefront.jpg', label_key: null, tag: 'Storefront', tag_key: 'seed.media.storefront', src: '/x.jpg' }],
    post_templates: [{ id: 'tp-1', seq: 1, name: 'Offer', name_key: 'seed.tpl.offer', icon: 'Tag', accent: '#0070FC', headline: 'Big sale', headline_key: 'seed.tpl.saleHeadline', cta: 'Shop now', cta_key: 'seed.tpl.shopNow' }],
  }

  it('splices in place and returns the total row count', async () => {
    const rows = await hydrateFromSupabase(fakeClient(TABLES), 2000)
    expect(rows).toBe(11) // one row per table
    expect(MISSED_CALLS).toHaveLength(1)
    expect(CONNECTED_CALLS).toHaveLength(0)
    expect(IVR_DROPS).toHaveLength(0)
    expect(CALL_HISTORY).toHaveLength(0)
  })

  it('maps every call column to the exact camelCase name the app reads', () => {
    const c = MISSED_CALLS[0]
    expect(c.id).toBe('cl-1')
    expect(c.atMs).toBe(AT_MS)                       // timestamptz → epoch ms
    expect(c.estValue).toBe(21000)                   // est_value
    expect(c.categoryKey).toBe('seed.category.smartTv')
    expect(c.callReason).toBe('Price enquiry')
    expect(c.callReasonKey).toBe('seed.callReason.priceEnquiry')
    expect(c.leadStatus).toBe('open')
    expect(c.reviewLinkSent).toBe(false)
    expect(c.customerId).toBe('cu-1')
    expect(c.time).toBe('12:00 PM')                  // time_label
    expect(c.minutesAgo).toBe(30)
    expect(c.fullMaskedDisplay).toBe('+91 ●●●●● ●●678')
    expect(c.repeatHistory).toEqual(['9:00 AM', '12:00 PM'])
    expect(c.repeatHistoryAtMs).toEqual([AT_MS, AT_MS])
    expect(c.intentReasonKey).toBe('seed.reason.twice')
  })

  it('strips the internal routing fields before the splice', () => {
    expect(MISSED_CALLS[0]).not.toHaveProperty('_bucket')
    expect(MISSED_CALLS[0]).not.toHaveProperty('_outcome')
    expect(MISSED_CALLS[0]).not.toHaveProperty('est_value')
    expect(MISSED_CALLS[0]).not.toHaveProperty('lead_status')
  })

  it('places a transcript turn at call-start + its offset into the call', () => {
    expect(MISSED_CALLS[0].transcript).toHaveLength(1)
    expect(MISSED_CALLS[0].transcript[0].text).toBe('Is the TV in stock?') // body → text
    expect(MISSED_CALLS[0].transcript[0].atMs).toBe(AT_MS + 5000)
  })

  it('maps a customer, takes the mask from the view, and attaches notes + timeline', () => {
    expect(CUSTOMERS).toHaveLength(1)
    const c = CUSTOMERS[0]
    expect(c.masked).toBe('+91 ●●●●● ●●678')          // straight off customers_public
    // The digits never arrive — see phonePrivacy.test.js for what that costs the
    // call-back button, and why that is the honest outcome.
    expect(c).not.toHaveProperty('phone')
    expect(c.categoryKey).toBe('seed.category.smartTv')
    expect(c.aiGuessKey).toBe('seed.aiGuess.comparing')
    expect(c.firstSeenAtMs).toBe(AT_MS)
    expect(c.lastSeenAtMs).toBe(AT_MS)
    expect(c.callCount).toBe(3)
    expect(c.reviewSent).toBe(true)
    expect(c.timeline).toHaveLength(1)
    expect(c.timeline[0].detailKey).toBe('seed.timeline.emi')
    expect(c.timeline[0].atMs).toBe(AT_MS)
    expect(c.notes).toHaveLength(1)
    expect(c.notes[0].text).toBe('Call back after 6')  // body → text
  })

  it('maps a review and its replies', () => {
    expect(REVIEWS).toHaveLength(1)
    const r = REVIEWS[0]
    expect(r.customer).toBe('Hydrated Reviewer')       // author_name → customer
    expect(r.atMs).toBe(AT_MS)
    expect(typeof r.atOffsetMs).toBe('number')         // rebuilt for sinceLastLogin()
    expect(r.removed).toBeUndefined()                  // absent, not false
    expect(r.replies).toHaveLength(1)
    expect(r.replies[0].text).toBe('Thank you!')       // body → text
    expect(r.replies[0].deletedAtMs).toBeNull()
  })

  it('maps a store into nested lat/lng and only for THIS dealer', () => {
    expect(MAPPED_LOCATIONS).toHaveLength(1)
    const s = MAPPED_LOCATIONS[0]
    expect(s.storeCode).toBe('XYZ-ABC-07')
    expect(s.stated).toEqual({ lat: 12.97, lng: 77.75 })
    expect(s.actual).toEqual({ lat: 12.98, lng: 77.76 })
    expect(s.missed).toBe(4)
    expect(s.answered).toBe(6)
    expect(s.recovery).toBe(50)
    expect(s.healthPrev).toBe(65)
    expect(s.rating).toBe(4.3)                        // numeric string → Number
    expect(s.primary).toBe(true)                      // is_primary
    expect(s.addedAtMs).toBe(AT_MS)
  })

  it('builds the store-code registry with NO phone number in it', () => {
    expect(STORE_CODE_REGISTRY).toEqual([{
      code: 'XYZ-ABC-07',
      locationId: 'st-1',
      dealerId: DEALER_ID,
      mine: true,                       // the server-resolved ownership verdict
      phoneMasked: '+91 98•••• ••42',   // display only, masked by the view
    }])
    expect(STORE_CODE_REGISTRY[0]).not.toHaveProperty('phone')
  })

  it('maps media and post templates', () => {
    expect(MEDIA_LIBRARY[0]).toMatchObject({ id: 'md-1', kind: 'image', label: 'storefront.jpg', tagKey: 'seed.media.storefront', src: '/x.jpg' })
    expect(MEDIA_LIBRARY[0].labelKey).toBeUndefined() // null column → key omitted, render verbatim
    expect(POST_TEMPLATES[0]).toMatchObject({ id: 'tp-1', nameKey: 'seed.tpl.offer', headlineKey: 'seed.tpl.saleHeadline', ctaKey: 'seed.tpl.shopNow' })
  })

  it('routes another dealer’s store out of MAPPED_LOCATIONS but into the registry — by ID', async () => {
    const twoDealers = {
      ...TABLES,
      // In the order `.order('code')` would hand them back.
      dealer_store_registry: [
        { code: 'QQQ-ZZZ-09', location_id: 'st-2', dealer_id: 'dl-2', phone_masked: '+91 99•••• ••00' },
        ...TABLES.dealer_store_registry,
      ],
      stores: [...TABLES.stores, { ...TABLES.stores[0], id: 'st-2', dealer_id: 'dl-2', store_code: 'QQQ-ZZZ-09' }],
    }
    await hydrateFromSupabase(fakeClient(twoDealers), 2000)
    expect(MAPPED_LOCATIONS.map(l => l.storeCode)).toEqual(['XYZ-ABC-07'])
    // Ordered by `code` off the view, so the other dealer's row sorts first.
    expect(STORE_CODE_REGISTRY.map(e => e.code)).toEqual(['QQQ-ZZZ-09', 'XYZ-ABC-07'])
    expect(STORE_CODE_REGISTRY.map(e => e.mine)).toEqual([false, true])
    // Not one raw number anywhere in the registry the client now holds.
    for (const e of STORE_CODE_REGISTRY) expect(e).not.toHaveProperty('phone')
  })

  it('splices nothing when the identity RPC cannot name a dealer', async () => {
    const before = MAPPED_LOCATIONS.map(l => l.storeCode)
    await expect(hydrateFromSupabase(fakeClient(TABLES, { dealerId: null }), 2000))
      .rejects.toThrow(/no dealer is registered/)
    expect(MAPPED_LOCATIONS.map(l => l.storeCode)).toEqual(before)
  })
})
