// calls.js — the roll-ups a manager reads off the VMN tab, and the mutators the
// bulk actions fire. The load-bearing contract under test: ONE object per call,
// so a mutation is visible through every getter that can reach it.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCalls, getCallById, getMissedCalls, getConnectedCalls, getIvrDrops,
  isMissed, isAttended, callCounts, callingReasons,
  setLeadStatus, markReviewLinkSent, missedOpportunities, callbackQueue,
  totalRecoverable, highIntentCount,  CALL_REASONS,
  customerInteractionCount, interactionCountForCall, callRecording,
} from '../data/calls.js'
import { LEAD_STATUSES } from '../data/leadStatus.js'
import { getCustomerById } from '../data/customers.js'
import { assignedStoreIds } from '../data/assignments.js'

const WINDOWS = ['last24h', 'last7', 'last30', 'last90', 'last365', 'all']

// Put every mutable call back the way the seed had it, so test order can never
// matter (the records are shared module state by design).
const ORIGINAL = new Map(
  getCalls('all', { includeSpam: true }).map(c => [c.id, { leadStatus: c.leadStatus, reviewLinkSent: c.reviewLinkSent }]),
)
beforeEach(() => {
  for (const c of getCalls('all', { includeSpam: true })) {
    const o = ORIGINAL.get(c.id)
    if (o) { c.leadStatus = o.leadStatus; c.reviewLinkSent = o.reviewLinkSent }
  }
})

describe('callCounts — the totals must reconcile', () => {
  it('total === missed + answered in every window', () => {
    for (const win of WINDOWS) {
      const c = callCounts(win)
      expect(c.total, `window ${win}`).toBe(c.missed + c.answered)
    }
  })

  it('agrees with getCalls() for the same window', () => {
    for (const win of WINDOWS) {
      const calls = getCalls(win)
      const c = callCounts(win)
      expect(c.total, `window ${win}`).toBe(calls.length)
      expect(c.missed, `window ${win}`).toBe(calls.filter(isMissed).length)
      expect(c.answered, `window ${win}`).toBe(calls.filter(isAttended).length)
    }
  })

  it('excludes spam by default and includes it on request — and still reconciles', () => {
    const clean = callCounts('all')
    const raw = callCounts('all', { includeSpam: true })
    expect(raw.total).toBeGreaterThan(clean.total)
    expect(raw.total).toBe(raw.missed + raw.answered)
  })

  it('a longer window can never contain fewer calls than a shorter one', () => {
    const lengths = WINDOWS.slice(0, 5).map(w => callCounts(w).total)
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1])
    }
  })
})

describe('isMissed / isAttended partition the log exactly', () => {
  const all = getCalls('all', { includeSpam: true })

  it('every call is exactly one of the two', () => {
    expect(all.length).toBeGreaterThan(0)
    for (const c of all) {
      expect(isMissed(c) !== isAttended(c), `call ${c.id} is neither or both`).toBe(true)
    }
  })

  it('the two sets sum back to the whole log with no overlap', () => {
    const missed = all.filter(isMissed)
    const attended = all.filter(isAttended)
    expect(missed.length + attended.length).toBe(all.length)
    const ids = new Set(missed.map(c => c.id))
    expect(attended.some(c => ids.has(c.id))).toBe(false)
  })

  it('IVR drops count as MISSED — nobody at the store spoke to them', () => {
    expect(getIvrDrops().length).toBeGreaterThan(0)
    for (const d of getIvrDrops()) expect(isMissed(d)).toBe(true)
  })

  it('connected calls count as attended, in both directions', () => {
    for (const c of getConnectedCalls()) expect(isAttended(c)).toBe(true)
  })

  it('is safe on null/undefined rather than throwing', () => {
    expect(isMissed(null)).toBe(false)
    expect(isAttended(undefined)).toBe(false)
  })
})

describe('callingReasons', () => {
  it('shares sum to ~100% (rounding is the only slack)', () => {
    for (const win of ['last24h', 'last30', 'all']) {
      const rows = callingReasons(win)
      if (!rows.length) continue
      const sum = rows.reduce((s, r) => s + r.share, 0)
      expect(sum, `window ${win} shares sum to ${sum}`).toBeGreaterThanOrEqual(98)
      expect(sum, `window ${win} shares sum to ${sum}`).toBeLessThanOrEqual(102)
    }
  })

  it('is sorted by count, descending', () => {
    const rows = callingReasons('all')
    expect(rows.length).toBeGreaterThan(1)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].count).toBeGreaterThanOrEqual(rows[i].count)
    }
  })

  it('drops empty reasons rather than zero-filling the chart', () => {
    for (const r of callingReasons('all')) expect(r.count).toBeGreaterThan(0)
  })

  it('counts reconcile with the calls actually in the window', () => {
    const rows = callingReasons('all')
    const counted = rows.reduce((s, r) => s + r.count, 0)
    const withReason = getCalls('all').filter(c => c.callReason).length
    expect(counted).toBe(withReason)
  })

  it('carries the i18n key alongside every reason, and only known reasons', () => {
    for (const r of callingReasons('all')) {
      expect(CALL_REASONS).toContain(r.reason)
      expect(r.reasonKey).toMatch(/^seed\.callReason\./)
    }
  })

  it('excludes spam by default — "spam" is not a reason anyone called', () => {
    const clean = callingReasons('all').find(r => r.reason === 'Spam / unwanted')
    expect(clean).toBeUndefined()
    const raw = callingReasons('all', { includeSpam: true }).find(r => r.reason === 'Spam / unwanted')
    expect(raw?.count).toBeGreaterThan(0)
  })
})

describe('setLeadStatus — the shared-object contract', () => {
  it('mutates and is visible through getCalls AND getMissedCalls (same object)', () => {
    const target = getMissedCalls().find(m => !m.spam)
    expect(target).toBeTruthy()

    const [updated] = setLeadStatus(target.id, 'converted')
    expect(updated.leadStatus).toBe('converted')
    // Same identity everywhere it can be reached — this is the whole design.
    expect(getCallById(target.id)).toBe(updated)
    expect(getMissedCalls().find(m => m.id === target.id)).toBe(updated)
    expect(getCalls('all').find(c => c.id === target.id).leadStatus).toBe('converted')
  })

  it('accepts the bulk (array) form through the same code path', () => {
    const ids = getMissedCalls().filter(m => !m.spam).slice(0, 3).map(m => m.id)
    expect(ids.length).toBe(3)
    const updated = setLeadStatus(ids, 'expired')
    expect(updated.map(c => c.id)).toEqual(ids)
    for (const id of ids) expect(getCallById(id).leadStatus).toBe('expired')
  })

  it('skips ids that match nothing instead of inventing records', () => {
    const real = getMissedCalls()[0].id
    const updated = setLeadStatus([real, 'no-such-call'], 'converted')
    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe(real)
  })

  it('throws on an invalid status rather than writing junk', () => {
    const id = getMissedCalls()[0].id
    expect(() => setLeadStatus(id, 'maybe')).toThrow(/invalid status "maybe"/)
    expect(getCallById(id).leadStatus).not.toBe('maybe')
  })

  it('accepts every status in the published LEAD_STATUSES catalog', () => {
    const id = getMissedCalls()[0].id
    for (const s of LEAD_STATUSES) {
      setLeadStatus(id, s.id)
      expect(getCallById(id).leadStatus).toBe(s.id)
    }
  })
})

describe('markReviewLinkSent', () => {
  it('marks one call and is visible through every getter', () => {
    const target = getMissedCalls().find(m => !m.spam)
    markReviewLinkSent(target.id)
    expect(getCallById(target.id).reviewLinkSent).toBe(true)
    expect(getMissedCalls().find(m => m.id === target.id).reviewLinkSent).toBe(true)
  })

  it('un-sends when told to', () => {
    const id = getMissedCalls()[0].id
    markReviewLinkSent(id, true)
    markReviewLinkSent(id, false)
    expect(getCallById(id).reviewLinkSent).toBe(false)
  })

  it('takes the bulk form and returns exactly what it changed', () => {
    const ids = getMissedCalls().slice(0, 2).map(m => m.id)
    const updated = markReviewLinkSent(ids)
    expect(updated).toHaveLength(2)
    for (const id of ids) expect(getCallById(id).reviewLinkSent).toBe(true)
  })

  it('also reaches IVR drops, which the review blast can select', () => {
    const drop = getIvrDrops()[0]
    markReviewLinkSent(drop.id)
    expect(getIvrDrops()[0].reviewLinkSent).toBe(true)
  })
})

describe('getCalls / getCallById', () => {
  it('returns the log newest first', () => {
    const calls = getCalls('all', { includeSpam: true })
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i - 1].atMs).toBeGreaterThanOrEqual(calls[i].atMs)
    }
  })

  it('every returned call really falls inside the window', () => {
    const now = Date.now()
    for (const c of getCalls('last7')) {
      expect(c.atMs).toBeGreaterThanOrEqual(now - 7 * 864e5)
      expect(c.atMs).toBeLessThanOrEqual(now + 1000)
    }
  })

  it('filters by outcome', () => {
    expect(getCalls('all', { outcome: 'missed' }).every(isMissed)).toBe(true)
    expect(getCalls('all', { outcome: 'attended' }).every(isAttended)).toBe(true)
  })

  it('finds a call from any bucket by id, and null for a stranger', () => {
    for (const bucket of [getMissedCalls(), getConnectedCalls(), getIvrDrops()]) {
      expect(getCallById(bucket[0].id)).toBe(bucket[0])
    }
    expect(getCallById('nope')).toBeNull()
  })
})

describe('win-back selectors', () => {
  it('the call-back queue is ranked by chance-to-buy and holds no spam', () => {
    const q = callbackQueue()
    expect(q.length).toBeGreaterThan(0)
    for (let i = 1; i < q.length; i++) expect(q[i - 1].cli).toBeGreaterThanOrEqual(q[i].cli)
    expect(q.some(c => c.spam)).toBe(false)
  })

  it('missedOpportunities merges missed calls and IVR drops, biggest value first', () => {
    const rows = missedOpportunities()
    expect(rows.length).toBe(getMissedCalls().filter(m => !m.spam).length + getIvrDrops().length)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].estValue).toBeGreaterThanOrEqual(rows[i].estValue)
    }
  })

  it('totalRecoverable is the sum of non-spam missed value', () => {
    // getMissedCalls() is the raw bucket — every store in the fixture, including the
    // one belonging to a different manager. totalRecoverable() answers "mine", so the
    // baseline has to be scoped the same way to be comparing like with like.
    const mine = new Set(assignedStoreIds())
    const expected = getMissedCalls().filter(m => !m.spam && mine.has(m.storeId)).reduce((s, m) => s + m.estValue, 0)
    expect(totalRecoverable()).toBe(expected)
    expect(totalRecoverable()).toBeGreaterThan(0)
  })

  it('highIntentCount counts exactly the high-intent missed callers', () => {
    const mine = new Set(assignedStoreIds())
    expect(highIntentCount()).toBe(getMissedCalls().filter(m => m.intent === 'high' && mine.has(m.storeId)).length)
  })
})

// ============================================================
// INTERACTION COUNT — the number that replaced call duration on the detail sheet.
// The contract that matters: it is a UNION of the call log and the customer timeline,
// never a sum, because the seed writes the same event down in both places.
// ============================================================
describe('customerInteractionCount / interactionCountForCall', () => {
  const minute = ms => Math.round(ms / 60000)

  it('is null for a caller with no customer record — never a fabricated 1', () => {
    const anon = getCalls('all', { includeSpam: true }).find(c => !c.customerId)
    expect(anon, 'the seed must keep at least one anonymous caller').toBeTruthy()
    expect(interactionCountForCall(anon)).toBeNull()
    expect(interactionCountForCall(anon.id)).toBeNull()
    expect(customerInteractionCount(null)).toBe(0)
    expect(customerInteractionCount(undefined)).toBe(0)
  })

  it('is 0 for a customer id nothing is filed under', () => {
    expect(customerInteractionCount('cust-does-not-exist')).toBe(0)
  })

  it('counts every distinct minute the caller and the store were in contact', () => {
    const seen = new Set()
    for (const call of getCalls('all', { includeSpam: true })) {
      if (!call.customerId || seen.has(call.customerId)) continue
      seen.add(call.customerId)
      // Rebuild the union independently of the implementation.
      const expected = new Set()
      for (const c of getCalls('all', { includeSpam: true })) {
        if (c.customerId !== call.customerId) continue
        expected.add(minute(c.atMs))
        for (const at of c.repeatHistoryAtMs || []) expected.add(minute(at))
      }
      for (const e of getCustomerById(call.customerId)?.timeline || []) expected.add(minute(e.atMs))
      expect(customerInteractionCount(call.customerId), call.customerId).toBe(expected.size)
      expect(interactionCountForCall(call), call.id).toBe(expected.size)
    }
    expect(seen.size).toBeGreaterThan(0)
  })

  it('never counts fewer interactions than the call itself proves happened', () => {
    for (const call of getCalls('all', { includeSpam: true })) {
      if (!call.customerId) continue
      const n = customerInteractionCount(call.customerId)
      expect(n, call.id).toBeGreaterThanOrEqual(Math.max(1, call.repeats || 1))
    }
  })

  it('unions rather than sums: a repeat caller whose timeline mirrors every ring counts once each', () => {
    // mc-01 rang 3× and cust-231's timeline records those same 3 rings. 3, not 6.
    const call = getCallById('mc-01')
    expect(call.repeats).toBe(3)
    expect(call.repeatHistoryAtMs).toHaveLength(3)
    expect(getCustomerById('cust-231').timeline).toHaveLength(3)
    expect(customerInteractionCount('cust-231')).toBe(3)
  })

  it('counts the non-call touches too — the review link out and the review back', () => {
    // cust-775: 1 missed + 1 called-back (= call cc-07) + review-sent + review-landed.
    const timeline = getCustomerById('cust-775').timeline
    expect(timeline.map(e => e.type)).toEqual(['missed', 'outbound', 'review-sent', 'review-landed'])
    expect(customerInteractionCount('cust-775')).toBe(4)
  })
})

describe('callRecording — honest about audio we do not hold', () => {
  it('returns null for every seeded call, because no audio ships with them', () => {
    for (const c of getCalls('all', { includeSpam: true })) {
      expect(callRecording(c), c.id).toBeNull()
      expect(callRecording(c.id), c.id).toBeNull()
    }
  })

  it('returns null for a stranger id rather than throwing', () => {
    expect(callRecording('nope')).toBeNull()
  })

  it('hands back a player-ready descriptor the moment a record carries a URL', () => {
    const call = getCallById('cc-01')
    try {
      call.recordingUrl = 'https://example.test/cc-01.mp3'
      expect(callRecording('cc-01')).toEqual({ url: 'https://example.test/cc-01.mp3', mimeType: 'audio/mpeg' })
      call.recordingMimeType = 'audio/ogg'
      expect(callRecording(call).mimeType).toBe('audio/ogg')
    } finally {
      delete call.recordingUrl
      delete call.recordingMimeType
    }
  })
})
