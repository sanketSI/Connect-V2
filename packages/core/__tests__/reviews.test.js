// reviews.js — the Nova filter set and the listing metrics.
//
// The metric expectations below are computed INDEPENDENTLY from the raw seed
// (and, where the number is small enough to hold in your head, written as a
// literal). Asserting reviewMetrics() against a second call to reviewMetrics()
// would only prove it is self-consistent.
import { describe, it, expect } from 'vitest'
import {
  getReviews, getReviewById, getReviewReplies, filterReviews, reviewMetrics,
  sentimentForRating, newReviewsCount, negativeReviewFor, getReviewsForCustomer,
  reviewTag, canPublishReply, RICH_WORD_MIN, REVIEW_TAGS,
} from '../data/reviews.js'
import { REVIEWS, PRIMARY_STORE_ID } from '../lib/seedData.js'

// THE FLAGSHIP'S reviews. Every hand-computed figure below (20 live, 4.05 mean, 17 with
// text, 9 replied) was measured against this store's seed, and stays measured against it
// now that the other two branches carry reviews of their own — so these assertions keep
// asserting what they were written to assert, and gain a second job: proving the store
// partition holds. The unscoped `ALL` below is untouched; it is only used relationally.
const LIVE = REVIEWS.filter(r => !r.removed && (r.storeId ?? PRIMARY_STORE_ID) === PRIMARY_STORE_ID)
const ALL = filterReviews({ window: 'all' })          // the same set, through the boundary

describe('sentimentForRating — the star is the verdict', () => {
  it('maps 4–5 positive, 3 neutral, 1–2 negative', () => {
    expect(sentimentForRating(5)).toBe('positive')
    expect(sentimentForRating(4)).toBe('positive')
    expect(sentimentForRating(3)).toBe('neutral')
    expect(sentimentForRating(2)).toBe('negative')
    expect(sentimentForRating(1)).toBe('negative')
  })

  it('falls back to neutral for a rating we do not recognise', () => {
    expect(sentimentForRating(0)).toBe('neutral')
    expect(sentimentForRating(undefined)).toBe('neutral')
  })
})

describe('filterReviews — rating range', () => {
  it('honours { min, max } inclusively', () => {
    const set = filterReviews({ window: 'all', rating: { min: 4, max: 5 }, storeId: PRIMARY_STORE_ID })
    expect(set.length).toBeGreaterThan(0)
    for (const r of set) expect(r.rating).toBeGreaterThanOrEqual(4)
    for (const r of set) expect(r.rating).toBeLessThanOrEqual(5)
    expect(set.length).toBe(LIVE.filter(r => r.rating >= 4).length)
  })

  it('accepts the [min, max] array form identically', () => {
    const a = filterReviews({ window: 'all', rating: [1, 2], storeId: PRIMARY_STORE_ID }).map(r => r.id)
    const b = filterReviews({ window: 'all', rating: { min: 1, max: 2 }, storeId: PRIMARY_STORE_ID }).map(r => r.id)
    expect(a).toEqual(b)
    expect(a.length).toBe(LIVE.filter(r => r.rating <= 2).length)
  })

  it('a single-star band returns only that star', () => {
    const set = filterReviews({ window: 'all', rating: { min: 3, max: 3 }, storeId: PRIMARY_STORE_ID })
    expect(set.every(r => r.rating === 3)).toBe(true)
    expect(set.length).toBe(LIVE.filter(r => r.rating === 3).length)
  })
})

describe('filterReviews — sentiment', () => {
  it('splits the set into three disjoint buckets that sum to the whole', () => {
    const pos = filterReviews({ window: 'all', sentiment: 'positive' })
    const neu = filterReviews({ window: 'all', sentiment: 'neutral' })
    const neg = filterReviews({ window: 'all', sentiment: 'negative' })
    expect(pos.length + neu.length + neg.length).toBe(ALL.length)
    expect(pos.every(r => r.rating >= 4)).toBe(true)
    expect(neu.every(r => r.rating === 3)).toBe(true)
    expect(neg.every(r => r.rating <= 2)).toBe(true)
  })

  it("'all' does not filter", () => {
    expect(filterReviews({ window: 'all', sentiment: 'all' }).length).toBe(ALL.length)
  })
})

describe('filterReviews — ratingType', () => {
  it('withText / withoutText partition the set exactly', () => {
    const withText = filterReviews({ window: 'all', ratingType: 'withText' })
    const without = filterReviews({ window: 'all', ratingType: 'withoutText' })
    expect(withText.length + without.length).toBe(ALL.length)
    expect(withText.every(r => r.hasText)).toBe(true)
    expect(without.every(r => !r.hasText)).toBe(true)
  })

  it('the star-only reviews are exactly the three bodyless seed rows', () => {
    const ids = filterReviews({ window: 'all', ratingType: 'withoutText' }).map(r => r.id).sort()
    expect(ids).toEqual(['rv-08', 'rv-12', 'rv-17'])
  })
})

describe('filterReviews — status', () => {
  it('replied / unreplied partition the set exactly', () => {
    const replied = filterReviews({ window: 'all', status: 'replied' })
    const unreplied = filterReviews({ window: 'all', status: 'unreplied' })
    expect(replied.length + unreplied.length).toBe(ALL.length)
    expect(replied.every(r => r.responded)).toBe(true)
    expect(unreplied.every(r => !r.responded)).toBe(true)
  })

  it('a review whose only reply was DELETED counts as unreplied', () => {
    // rv-14 has two replies, the first deleted — it is still "replied".
    // The contract under test: `responded` is derived from LIVE replies only.
    const withDeletedOnly = ALL.filter(r => r.replies.length > 0 && r.replies.every(rep => rep.deleted))
    for (const r of withDeletedOnly) expect(r.responded).toBe(false)
  })

  it('unreplied count matches the raw seed (11 of the 20 live reviews)', () => {
    expect(filterReviews({ window: 'all', status: 'unreplied', storeId: PRIMARY_STORE_ID })).toHaveLength(11)
    expect(newReviewsCount(PRIMARY_STORE_ID)).toBe(11)
  })
})

describe('filterReviews — tags, removed, edited, window', () => {
  it('matches a review carrying ANY of the requested tags', () => {
    const staff = filterReviews({ window: 'all', tags: ['staff'], storeId: PRIMARY_STORE_ID })
    expect(staff).toHaveLength(9)
    expect(staff.every(r => r.tags.includes('staff'))).toBe(true)

    const either = filterReviews({ window: 'all', tags: ['staff', 'delivery'] })
    expect(either.length).toBeGreaterThanOrEqual(staff.length)
    expect(either.every(r => r.tags.includes('staff') || r.tags.includes('delivery'))).toBe(true)
  })

  it('an empty tag list does not filter', () => {
    expect(filterReviews({ window: 'all', tags: [] }).length).toBe(ALL.length)
  })

  it('hides Google-removed reviews by default and shows them on request', () => {
    expect(ALL.some(r => r.removed)).toBe(false)
    const withRemoved = filterReviews({ window: 'all', showRemoved: true })
    expect(withRemoved.length).toBe(REVIEWS.length)
    expect(withRemoved.length).toBe(ALL.length + 1)
    expect(withRemoved.some(r => r.removed)).toBe(true)
  })

  it('editedOnly narrows to the reviews the customer changed after posting', () => {
    const edited = filterReviews({ window: 'all', editedOnly: true })
    expect(edited).toHaveLength(1)
    expect(edited[0].id).toBe('rv-10')
    expect(edited[0].edited).toBe(true)
  })

  it('the window really bounds the set, and narrower windows nest inside wider ones', () => {
    const now = Date.now()
    const last7 = filterReviews({ window: 'last7' })
    for (const r of last7) expect(r.atMs).toBeGreaterThanOrEqual(now - 7 * 864e5)
    const last30 = new Set(filterReviews({ window: 'last30' }).map(r => r.id))
    for (const r of last7) expect(last30.has(r.id)).toBe(true)
  })

  it('returns newest first', () => {
    for (let i = 1; i < ALL.length; i++) {
      expect(ALL[i - 1].atMs).toBeGreaterThanOrEqual(ALL[i].atMs)
    }
  })
})

describe('reviewMetrics — hand-computed against the seed', () => {
  const m = reviewMetrics({ window: 'all', storeId: PRIMARY_STORE_ID })

  it('counts the 20 live reviews (the 21st is removed from Google)', () => {
    expect(m.total).toBe(20)
    expect(m.total).toBe(LIVE.length)
  })

  it('averages the stars to 4.1 — mean 4.05, rounded to one decimal', () => {
    const mean = LIVE.reduce((s, r) => s + r.rating, 0) / LIVE.length
    expect(mean).toBeCloseTo(4.05, 5)
    expect(m.avgRating).toBe(4.1)
  })

  it('returns null — not 0 — for an empty set, so the UI never shows "0.0★"', () => {
    const empty = reviewMetrics({ window: 'all', rating: { min: 5, max: 5 }, sentiment: 'negative' })
    expect(empty.total).toBe(0)
    expect(empty.avgRating).toBeNull()
    expect(empty.responseTime.medianMs).toBeNull()
  })

  it('richness: 17 of 20 carry words (85%), 15 are substantive (75%)', () => {
    const words = b => (b ? String(b).trim().split(/\s+/).filter(Boolean).length : 0)
    expect(m.richness.withTextCount).toBe(17)
    expect(m.richness.withoutTextCount).toBe(3)
    expect(m.richness.withTextPct).toBe(85)
    expect(m.richness.richCount).toBe(LIVE.filter(r => words(r.body) >= RICH_WORD_MIN).length)
    expect(m.richness.richCount).toBe(15)
    expect(m.richness.score).toBe(75)
    expect(m.richness.wordMin).toBe(RICH_WORD_MIN)
  })

  it('response time: 9 replied reviews, median lag exactly 4 hours', () => {
    // Independent recompute straight off the seed offsets (linear with the
    // resolved instants, so the differences are identical).
    const lags = LIVE
      .filter(r => (r.replies || []).length)
      .map(r => {
        const first = [...r.replies].sort((a, b) => a.atOffsetMs - b.atOffsetMs)[0]
        return first.atOffsetMs - r.atOffsetMs
      })
      .sort((a, b) => a - b)
    expect(lags).toHaveLength(9)
    const expectedMedian = lags[Math.floor(lags.length / 2)] // odd count
    expect(expectedMedian).toBe(4 * 3600e3)

    expect(m.responseTime.repliedCount).toBe(9)
    expect(m.responseTime.medianMs).toBe(expectedMedian)
    expect(m.responseTime.medianMs).toBe(14400000)
    expect(m.responseTime.unrepliedCount).toBe(11)
    expect(m.responseTime.repliedCount + m.responseTime.unrepliedCount).toBe(m.total)
  })

  it('counts a reply we later DELETED — we did answer', () => {
    // rv-13's only reply was deleted and the review was removed; rv-14's first
    // reply was deleted but repliedAtMs must still point at that first reply.
    const rv14 = getReviewById('rv-14')
    expect(rv14.replies[0].deleted).toBe(true)
    expect(rv14.repliedAtMs).toBe(rv14.replies[0].atMs)
    expect(rv14.responded).toBe(true) // a later, live reply exists
  })

  it('the mean sits above the median — one 26-hour outlier drags it', () => {
    expect(m.responseTime.meanMs).toBeGreaterThan(m.responseTime.medianMs)
  })

  it('velocity is undefined for all-time (there is no "before")', () => {
    expect(m.velocity.count).toBe(20)
    expect(m.velocity.perDay).toBeNull()
    expect(m.velocity.perWeek).toBeNull()
    expect(m.velocity.prevCount).toBeNull()
    expect(m.velocity.changePct).toBeNull()
  })

  it('velocity over a bounded window is total/days, and compares with the window before', () => {
    const m30 = reviewMetrics({ window: 'last30' })
    expect(m30.velocity.perDay).toBe(Math.round((m30.total / 30) * 100) / 100)
    expect(m30.velocity.perWeek).toBe(Math.round((m30.total / 30) * 7 * 10) / 10)
    expect(m30.velocity.prevCount).toBe(
      filterReviews({ window: { startMs: Date.now() - 60 * 864e5, endMs: Date.now() - 30 * 864e5 } }).length,
    )
  })

  it('metrics describe the FILTERED set, not the whole listing', () => {
    const neg = reviewMetrics({ window: 'all', sentiment: 'negative' })
    expect(neg.total).toBe(filterReviews({ window: 'all', sentiment: 'negative' }).length)
    expect(neg.avgRating).toBeLessThan(3)
  })
})

describe('the customer join is by id and nothing else', () => {
  it('returns [] for a customer with no attributable review', () => {
    expect(getReviewsForCustomer('cust-does-not-exist')).toEqual([])
    expect(getReviewsForCustomer(null)).toEqual([])
    expect(negativeReviewFor('cust-does-not-exist')).toBeNull()
  })

  it('finds the linked negative review, worst star first', () => {
    const linked = LIVE.filter(r => r.customerId)
    expect(linked.length).toBeGreaterThan(0)
    const negative = linked.find(r => r.rating <= 2)
    const found = negativeReviewFor(negative.customerId)
    expect(found?.id).toBe(negative.id)
    expect(found.sentiment).toBe('negative')
  })
})

describe('reference data through the boundary', () => {
  it('reviewTag resolves a known id and returns undefined for a stranger', () => {
    expect(reviewTag('staff').labelKey).toBe('seed.reviewTag.staff')
    expect(reviewTag('nope')).toBeUndefined()
  })

  it('every tag on every review is a published REVIEW_TAGS id', () => {
    const ids = new Set(REVIEW_TAGS.map(t => t.id))
    for (const r of ALL) for (const t of r.tags) expect(ids.has(t), `unknown tag ${t}`).toBe(true)
  })

  it('only GBP replies are publishable in scope 1', () => {
    expect(canPublishReply('gbp')).toBe(true)
    expect(canPublishReply('justdial')).toBe(false)
    expect(canPublishReply('nonsense')).toBe(false)
  })

  it('getReviews() hides removed reviews but getReviewById() still finds them', () => {
    const removed = REVIEWS.find(r => r.removed)
    expect(getReviews().some(r => r.id === removed.id)).toBe(false)
    expect(getReviewById(removed.id)?.id).toBe(removed.id)
    expect(getReviewById('nope')).toBeNull()
  })

  it('getReviewReplies returns the full history, oldest first, deletions included', () => {
    const replies = getReviewReplies('rv-14')
    expect(replies).toHaveLength(2)
    expect(replies[0].atMs).toBeLessThan(replies[1].atMs)
    expect(getReviewReplies('nope')).toEqual([])
  })
})

describe('store attribution — every review belongs to exactly one branch', () => {
  it('partitions the live set across the mapped stores with nothing lost or double-counted', () => {
    const all = filterReviews({ window: 'all' })
    const ids = [...new Set(all.map(r => r.storeId))]
    expect(ids.length).toBeGreaterThan(1)                     // multi-store data really exists
    const summed = ids.reduce((n, id) => n + filterReviews({ window: 'all', storeId: id }).length, 0)
    expect(summed).toBe(all.length)                           // a partition, not an overlap
    expect(all.every(r => typeof r.storeId === 'string')).toBe(true) // nothing unattributed
  })

  it('scoping to one store is a strict subset of the whole network', () => {
    const all = filterReviews({ window: 'all' })
    const primary = filterReviews({ window: 'all', storeId: PRIMARY_STORE_ID })
    expect(primary.length).toBeLessThan(all.length)
    expect(primary.every(r => r.storeId === PRIMARY_STORE_ID)).toBe(true)
  })
})
