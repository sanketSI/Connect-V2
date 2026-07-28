// insights.js — the Google Business Profile panel on Home.
//
// The two invariants this file exists to defend are the ones a manager can check with
// his own eyes on the screen:
//
//   Click To Call + Store Visits + Website Visits === Total Actions
//   Action Rate                                   === Total Actions ÷ Profile Views
//
// A panel that breaks either is worse than no panel — the numbers are right there next
// to each other, so the first person to add them up stops trusting every other figure
// in the app. They are asserted over every store × every window, and recomputed here
// from the RAW SEED SERIES rather than from a second call to getStoreInsights(), which
// would only prove the selector agrees with itself.
import { describe, it, expect } from 'vitest'
import {
  getStoreInsights, insightStoreIds, INSIGHT_METRICS, ACTION_METRICS,
  CANONICAL_INSIGHTS_WINDOW,
} from '../data/insights.js'
import { resolveWindow, previousWindow } from '../data/timeWindow.js'
import { resolveAt } from '../data/format.js'
import { STORE_INSIGHTS, STORE_INSIGHT_DAYS } from '../lib/seedData.js'

const STORES = insightStoreIds()
const WINDOWS = ['last7', 'last30', 'last90', 'last365']

/** The same sum, computed straight off the seed. */
function rawTotals(storeId, win) {
  const { startMs, endMs } = resolveWindow(win)
  const rows = STORE_INSIGHTS[storeId]
    .map(d => ({ ...d, atMs: resolveAt(d.dayOffsetMs) }))
    .filter(d => d.atMs >= startMs && d.atMs <= endMs)
  const sum = k => rows.reduce((n, d) => n + d[k], 0)
  return {
    days: rows.length,
    profileViews: sum('profileViews'),
    clickToCall: sum('clickToCall'),
    storeVisits: sum('storeVisits'),
    websiteVisits: sum('websiteVisits'),
  }
}

describe('the seed series', () => {
  it('covers every mapped-store id with a full history', () => {
    expect(STORES).toEqual(['lks-ind', 'lks-kor', 'lks-new'])
    for (const id of STORES) expect(STORE_INSIGHTS[id]).toHaveLength(STORE_INSIGHT_DAYS)
  })

  it('holds whole non-negative counts only — these are people, not averages', () => {
    for (const id of STORES) {
      for (const day of STORE_INSIGHTS[id]) {
        for (const k of ['profileViews', ...ACTION_METRICS]) {
          expect(Number.isInteger(day[k])).toBe(true)
          expect(day[k]).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('is deterministic — two reads of the same window give the same numbers', () => {
    const a = getStoreInsights('lks-ind', 'last30')
    const b = getStoreInsights('lks-ind', 'last30')
    expect(a.profileViews).toBe(b.profileViews)
    expect(a.metrics.map(m => m.value)).toEqual(b.metrics.map(m => m.value))
  })
})

describe('INVARIANT — the three action metrics are the whole of Total Actions', () => {
  it('sums exactly, for every store and every window', () => {
    for (const id of STORES) {
      for (const win of WINDOWS) {
        const i = getStoreInsights(id, win)
        expect(i.clickToCall + i.storeVisits + i.websiteVisits).toBe(i.totalActions)
      }
    }
  })

  it('sums exactly in the metrics[] rows the UI actually renders', () => {
    for (const id of STORES) {
      const i = getStoreInsights(id, CANONICAL_INSIGHTS_WINDOW)
      const value = key => i.metrics.find(m => m.id === key).value
      const parts = ACTION_METRICS.reduce((n, k) => n + value(k), 0)
      expect(parts).toBe(value('totalActions'))
    }
  })

  it('sums exactly in the previous period too, so the deltas compare like with like', () => {
    for (const id of STORES) {
      const { previous } = getStoreInsights(id, 'last30')
      expect(previous).not.toBeNull()
      expect(previous.clickToCall + previous.storeVisits + previous.websiteVisits)
        .toBe(previous.totalActions)
    }
  })
})

describe('INVARIANT — Action Rate is Total Actions ÷ Profile Views', () => {
  it('matches the ratio to the stated one-decimal rounding, everywhere', () => {
    for (const id of STORES) {
      for (const win of WINDOWS) {
        const i = getStoreInsights(id, win)
        expect(i.profileViews).toBeGreaterThan(0)
        // The exact contract…
        expect(i.actionRate).toBe(Math.round((i.totalActions / i.profileViews) * 1000) / 10)
        // …and the thing a manager would check with a calculator.
        expect(i.actionRate / 100).toBeCloseTo(i.totalActions / i.profileViews, 3)
        expect(i.actionRatio).toBe(i.totalActions / i.profileViews)
      }
    }
  })

  it('is the same number in metrics[] as at the top level', () => {
    for (const id of STORES) {
      const i = getStoreInsights(id, 'last30')
      expect(i.metrics.find(m => m.id === 'actionRate').value).toBe(i.actionRate)
    }
  })

  it('never divides by zero — an unseen window scores 0%, not NaN', () => {
    // A one-hour window lands between the midday sample points: no days, no views.
    const i = getStoreInsights('lks-ind', { hours: 1 })
    expect(i.days).toBe(0)
    expect(i.profileViews).toBe(0)
    expect(i.actionRate).toBe(0)
    expect(Number.isNaN(i.actionRate)).toBe(false)
  })
})

describe('the totals are the seed, summed', () => {
  it('agrees with an independent sum over the raw series', () => {
    for (const id of STORES) {
      for (const win of WINDOWS) {
        const i = getStoreInsights(id, win)
        const raw = rawTotals(id, win)
        expect(i.days).toBe(raw.days)
        expect(i.profileViews).toBe(raw.profileViews)
        expect(i.clickToCall).toBe(raw.clickToCall)
        expect(i.storeVisits).toBe(raw.storeVisits)
        expect(i.websiteVisits).toBe(raw.websiteVisits)
      }
    }
  })

  it('picks up exactly N whole days for an N-day window — no half-counted day', () => {
    for (const id of STORES) {
      expect(getStoreInsights(id, 'last7').days).toBe(7)
      expect(getStoreInsights(id, 'last30').days).toBe(30)
      expect(getStoreInsights(id, 'last90').days).toBe(90)
      expect(getStoreInsights(id, 'last365').days).toBe(365)
    }
  })
})

describe('these are ONE STORE’s numbers, not a brand roll-up', () => {
  // The reference screenshot showed 11M profile views — that is a whole chain. A single
  // electronics showroom is thousands a month, and a panel quoting millions would be
  // discarded on sight. Deliberately wide bounds: this is a smell test, not a snapshot.
  it('reads as a few thousand profile views a month', () => {
    for (const id of STORES) {
      const { profileViews } = getStoreInsights(id, 'last30')
      expect(profileViews).toBeGreaterThan(500)
      expect(profileViews).toBeLessThan(20_000)
    }
  })

  it('converts at a believable single-digit action rate', () => {
    for (const id of STORES) {
      const { actionRate } = getStoreInsights(id, 'last30')
      expect(actionRate).toBeGreaterThan(2)
      expect(actionRate).toBeLessThan(20)
    }
  })
})

describe('period-over-period', () => {
  it('compares against the window of the same length immediately before it', () => {
    const i = getStoreInsights('lks-ind', 'last30')
    const raw = rawTotals('lks-ind', previousWindow('last30'))
    expect(i.previous.profileViews).toBe(raw.profileViews)
    expect(i.previous.days).toBe(30)
  })

  it('states the delta as a whole percentage of the previous value', () => {
    for (const id of STORES) {
      const i = getStoreInsights(id, 'last30')
      for (const m of i.metrics) {
        const prev = m.previous
        expect(m.deltaPct).toBe(Math.round(((m.value - prev) / prev) * 100))
        expect(Number.isInteger(m.deltaPct)).toBe(true)
      }
    }
  })

  it('reports no delta for all-time, where there is no period before', () => {
    const i = getStoreInsights('lks-ind', 'all')
    expect(i.comparable).toBe(false)
    expect(i.previous).toBeNull()
    for (const m of i.metrics) expect(m.deltaPct).toBeNull()
    // The totals themselves are still real.
    expect(i.profileViews).toBeGreaterThan(0)
  })

  it('refuses to compare when the history behind the window is short', () => {
    // The series is 760 days; a 500-day window has only 260 days behind it, and
    // comparing against a period 48% shorter would print a fake collapse.
    const i = getStoreInsights('lks-ind', { days: 500 })
    expect(i.days).toBe(500)
    expect(i.comparable).toBe(false)
    for (const m of i.metrics) expect(m.deltaPct).toBeNull()
  })
})

describe('the metric catalog is what the panel renders', () => {
  it('lists the six metrics in the reference order', () => {
    expect(INSIGHT_METRICS.map(m => m.id)).toEqual([
      'profileViews', 'totalActions', 'actionRate',
      'clickToCall', 'storeVisits', 'websiteVisits',
    ])
  })

  it('carries a catalog key beside every English label, and a unit for each', () => {
    for (const m of INSIGHT_METRICS) {
      expect(m.label).toBeTruthy()
      expect(m.labelKey).toBe(`insights.${m.id}`)
      expect(['count', 'percent']).toContain(m.unit)
    }
  })

  it('hands the UI a value for every row, with no holes to hardcode around', () => {
    const i = getStoreInsights('lks-ind', CANONICAL_INSIGHTS_WINDOW)
    expect(i.metrics).toHaveLength(INSIGHT_METRICS.length)
    for (const m of i.metrics) {
      expect(typeof m.value).toBe('number')
      expect(Number.isFinite(m.value)).toBe(true)
      expect(m.labelKey).toBeTruthy()
    }
  })
})

describe('windows and unknown stores', () => {
  it('defaults to the canonical 30 days', () => {
    expect(CANONICAL_INSIGHTS_WINDOW).toBe('last30')
    expect(getStoreInsights('lks-ind').window.id).toBe('last30')
    expect(getStoreInsights('lks-ind').profileViews)
      .toBe(getStoreInsights('lks-ind', 'last30').profileViews)
  })

  it('takes the same window vocabulary as every other selector', () => {
    expect(getStoreInsights('lks-ind', { days: 14 }).days).toBe(14)
    expect(getStoreInsights('lks-ind', 'prevMonth').window.id).toBe('prevMonth')
    expect(() => getStoreInsights('lks-ind', 'last-week')).toThrow(/unknown window/)
  })

  it('returns null for a store we hold no listing data for', () => {
    expect(getStoreInsights('lks-jay')).toBeNull()
    expect(getStoreInsights('nope', 'last30')).toBeNull()
    expect(getStoreInsights(undefined)).toBeNull()
  })
})
