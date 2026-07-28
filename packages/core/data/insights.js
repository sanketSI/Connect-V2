// Listing-insights domain: the Google Business Profile "discovery, engagement and
// leads" numbers for one store — how many people saw the listing, and what they did
// with it.
//
// ============================================================
// THE SIX METRICS, and the two rules that tie them together
//
//   Profile Views   people who saw the listing (Search + Maps).
//   Total Actions   what they then DID with it.
//   Action Rate     Total Actions ÷ Profile Views, as a percentage.
//   Click To Call   tapped the number.
//   Store Visits    asked for directions.
//   Website Visits  tapped through to the site.
//
// The last three are the WHOLE of Total Actions — there is no fourth kind of action —
// so two invariants must hold for any window, or the panel is quietly lying:
//
//   clickToCall + storeVisits + websiteVisits === totalActions
//   actionRate                                === totalActions / profileViews
//
// Both are arithmetic here rather than three seeded numbers that happen to agree: the
// selector sums a daily series (see the STORE_INSIGHTS note in lib/seedData.js) and
// derives the rest. packages/core/__tests__/insights.test.js asserts them over every
// store × every window.
//
// ROUNDING CONTRACT. `actionRate` is a percentage to ONE decimal (8.9 means 8.9%).
// The unrounded ratio is `actionRatio` for anyone who needs to do maths with it.
//
// WINDOWS are the app-wide vocabulary — anything resolveWindow() takes (see
// timeWindow.js). `previousWindow()` supplies the "vs previous period" comparison, the
// same way reviewMetrics().velocity does, so a delta here means what a delta means on
// the Reviews screen.
// ============================================================
import { STORE_INSIGHTS } from '../lib/seedData.js'
import { resolveAt } from './format.js'
import { resolveWindow, previousWindow } from './timeWindow.js'

/**
 * The window the insight panel opens on.
 *
 * 30 days, matching CANONICAL_REVIEW_WINDOW: listing discovery moves slowly, and a
 * 7-day read of "profile views" is mostly weather. Named here so the screen and the
 * tests cannot pick different months.
 */
export const CANONICAL_INSIGHTS_WINDOW = 'last30'

/** The action metrics that make up Total Actions. There is no fourth. */
export const ACTION_METRICS = ['clickToCall', 'storeVisits', 'websiteVisits']

/**
 * The panel's rows, in the order the reference lays them out.
 *
 * `label` is the English fallback and `labelKey` the catalog key — the UI renders
 * `t(m.labelKey, { defaultValue: m.label })`, the same contract every other catalog in
 * the data layer uses. `unit` tells the UI how to print the value: 'count' → a grouped
 * integer, 'percent' → one decimal and a % sign.
 */
// CASE: sentence, not the reference's Title Case. Every other stat label in this app
// reads "Leads won" / "New reviews" / "Value won", and a row of Title Case in the
// middle of them would look like a paste from another product — which it would be.
/**
 * `syncLagDays` — DESIGN REVIEW 3, items 3 + 5.
 *
 * Google backfills each of these on its OWN schedule, so "how fresh is this number" is a
 * per-metric fact, not a per-screen one. Views lag furthest behind; the interaction
 * counts land sooner. Action rate is derived from views ÷ actions, so it can only ever be
 * as fresh as its slowest input — it inherits the views lag rather than claiming better.
 *
 * The UI turns this into the freshness note beside each figure ("accurate through <date>,
 * may take up to N days to sync"), which is the honest answer to "why doesn't this match
 * what I see in Google today".
 */
export const INSIGHT_METRICS = [
  { id: 'profileViews', label: 'Profile views', labelKey: 'insights.profileViews', unit: 'count', syncLagDays: 4 },
  { id: 'totalActions', label: 'Total actions', labelKey: 'insights.totalActions', unit: 'count', syncLagDays: 3 },
  { id: 'actionRate', label: 'Action rate', labelKey: 'insights.actionRate', unit: 'percent', syncLagDays: 4 },
  { id: 'clickToCall', label: 'Click to call', labelKey: 'insights.clickToCall', unit: 'count', syncLagDays: 3 },
  { id: 'storeVisits', label: 'Store visits', labelKey: 'insights.storeVisits', unit: 'count', syncLagDays: 3 },
  { id: 'websiteVisits', label: 'Website visits', labelKey: 'insights.websiteVisits', unit: 'count', syncLagDays: 3 },
]

// Offsets → real instants, once. Same pattern as the other domains: resolve at module
// load so every selector shares one set of timestamps for the session.
const RESOLVED = Object.fromEntries(
  Object.entries(STORE_INSIGHTS).map(([storeId, days]) => [
    storeId,
    days.map(d => ({ ...d, atMs: resolveAt(d.dayOffsetMs) })),
  ]),
)

/** Which store ids the series covers. */
export function insightStoreIds() {
  return Object.keys(RESOLVED)
}

/** Sum one store's daily rows inside a window, plus how many days actually landed in it. */
function totalsIn(days, win) {
  const { startMs, endMs } = resolveWindow(win)
  const rows = days.filter(d => d.atMs >= startMs && d.atMs <= endMs)
  const sum = key => rows.reduce((n, d) => n + d[key], 0)
  const clickToCall = sum('clickToCall')
  const storeVisits = sum('storeVisits')
  const websiteVisits = sum('websiteVisits')
  return {
    days: rows.length,
    profileViews: sum('profileViews'),
    // DERIVED, never summed from a stored column: this is what makes the second
    // invariant true by construction rather than by luck.
    totalActions: clickToCall + storeVisits + websiteVisits,
    clickToCall,
    storeVisits,
    websiteVisits,
  }
}

/** Total Actions ÷ Profile Views. 0 views → 0, never NaN and never Infinity. */
function ratio({ totalActions, profileViews }) {
  return profileViews > 0 ? totalActions / profileViews : 0
}

/** Percentage to one decimal — the rounding contract stated in the header. */
const asPercent = (r) => Math.round(r * 1000) / 10

/** Period-over-period change, as a percentage of the previous value. */
function changePct(value, previous) {
  if (previous == null || previous === 0) return null
  return Math.round(((value - previous) / previous) * 100)
}

/**
 * THE NETWORK VIEW — the same six metrics summed across every store we hold listing
 * data for (feedback round 4: "All locations" shows cumulative data).
 *
 * Sums are honest sums: raw counters add across stores; ACTION RATE is re-derived from
 * the summed actions over the summed views — never an average of per-store percentages,
 * which would let a tiny store swing the network number. Deltas compare summed current
 * against summed previous, and only when EVERY store has a like-for-like previous
 * period (one incomparable store would silently understate the network's past).
 */
export function getNetworkInsights(win = CANONICAL_INSIGHTS_WINDOW) {
  const per = insightStoreIds().map(id => getStoreInsights(id, win)).filter(Boolean)
  if (!per.length) return null
  const comparable = per.every(p => p.comparable)
  const sum = k => per.reduce((n, p) => n + p[k], 0)
  const sumPrev = k => (comparable ? per.reduce((n, p) => n + p.previous[k], 0) : null)

  const now = {
    profileViews: sum('profileViews'),
    clickToCall: sum('clickToCall'),
    storeVisits: sum('storeVisits'),
    websiteVisits: sum('websiteVisits'),
  }
  now.totalActions = now.clickToCall + now.storeVisits + now.websiteVisits
  const prev = comparable ? {
    profileViews: sumPrev('profileViews'),
    clickToCall: sumPrev('clickToCall'),
    storeVisits: sumPrev('storeVisits'),
    websiteVisits: sumPrev('websiteVisits'),
  } : null
  if (prev) prev.totalActions = prev.clickToCall + prev.storeVisits + prev.websiteVisits

  const valOf = (t, id) => id === 'actionRate' ? asPercent(ratio(t)) : t[id]
  return {
    storeId: 'all',
    stores: per.length,
    window: per[0].window,
    profileViews: now.profileViews,
    totalActions: now.totalActions,
    actionRatio: ratio(now),
    actionRate: asPercent(ratio(now)),
    clickToCall: now.clickToCall,
    storeVisits: now.storeVisits,
    websiteVisits: now.websiteVisits,
    previous: prev ? { ...prev, actionRate: asPercent(ratio(prev)), actionRatio: ratio(prev) } : null,
    comparable,
    metrics: INSIGHT_METRICS.map(m => {
      const value = valOf(now, m.id)
      const previous = prev ? valOf(prev, m.id) : null
      return {
        ...m,
        value,
        previous,
        deltaPct: comparable ? changePct(value, previous) : null,
        accurateThroughMs: Date.now() - m.syncLagDays * 86400000,
      }
    }),
  }
}

/**
 * The six insight metrics for one store, over a window.
 *
 * @param storeId  a MAPPED_LOCATIONS id ('lks-ind'). Unknown id → null, deliberately:
 *                 a store we hold no listing data for has no insights, and inventing
 *                 zeroes would print "0 profile views" as if that were measured.
 * @param win      anything resolveWindow() takes. Default: the canonical 30 days.
 *
 * @returns {
 *   storeId, window: { id, startMs, endMs }, days,
 *   profileViews, totalActions, actionRate, actionRatio,
 *   clickToCall, storeVisits, websiteVisits,
 *   previous,        // the same totals for the preceding window of equal length, or null
 *   comparable,      // false when that preceding window is not fully covered by the
 *                    // series — the deltas are then null rather than computed against
 *                    // a short period and overstated
 *   metrics: [{ id, label, labelKey, unit, value, previous, deltaPct }]
 * }
 */
export function getStoreInsights(storeId, win = CANONICAL_INSIGHTS_WINDOW) {
  const days = RESOLVED[storeId]
  if (!days) return null

  const window = resolveWindow(win)
  const now = totalsIn(days, win)

  const prevWin = previousWindow(win)
  const prev = prevWin ? totalsIn(days, prevWin) : null
  // A previous period the series only half covers would make every delta look like a
  // collapse. Compare only when there is a like-for-like period behind us.
  const comparable = !!prev && prev.days >= now.days && now.days > 0

  const valueOf = (t, id) => (id === 'actionRate' ? asPercent(ratio(t)) : t[id])

  return {
    storeId,
    window: { id: window.id, startMs: window.startMs, endMs: window.endMs },
    days: now.days,
    profileViews: now.profileViews,
    totalActions: now.totalActions,
    actionRatio: ratio(now),
    actionRate: asPercent(ratio(now)),
    clickToCall: now.clickToCall,
    storeVisits: now.storeVisits,
    websiteVisits: now.websiteVisits,
    previous: comparable ? { ...prev, actionRate: asPercent(ratio(prev)), actionRatio: ratio(prev) } : null,
    comparable,
    metrics: INSIGHT_METRICS.map(m => {
      const value = valueOf(now, m.id)
      const previous = comparable ? valueOf(prev, m.id) : null
      return {
        ...m,
        value,
        previous,
        deltaPct: comparable ? changePct(value, previous) : null,
        // Design review 3, items 3 + 5: the instant this figure is complete UP TO. Derived
        // from the metric's own Google sync lag, so each number carries its own freshness
        // rather than the screen making one blanket claim for all six.
        accurateThroughMs: Date.now() - m.syncLagDays * 86400000,
      }
    }),
  }
}
