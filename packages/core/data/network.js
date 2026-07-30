// ============================================================
// NETWORK / PER-STORE ROLLUPS — the numbers on a store card, DERIVED.
//
// THE BUG THIS EXISTS TO KILL: MAPPED_LOCATIONS carries decorative `missed`/`answered`/
// `recovered`/`reviews` fields that were written by hand and never touched the call or
// review records. The moment "All locations" summed them, Home's strip claimed 23 missed
// while the Calls tab — reading the actual records over the same window — showed 11.
// Two numbers, both on screen, neither wrong on its own terms, and no way for a dealer
// to tell which to believe. Exactly the "8 vs 11" class this app has fought before.
//
// So every count here is computed from the SAME records the lists render. A store card
// and the screen behind it cannot disagree, because they are the same arithmetic.
//
// Lives in its own module because it depends on calls + reviews + locations: putting it
// in locations.js (where it started) would close an import cycle, since calls/reviews
// resolve their own storeId from the leaf seed constant instead.
// ============================================================
import { getStoreLocations, storeLabelOf, subBrandOf } from './locations.js'
import { assignedStores } from './assignments.js'
import { CITY_STORES, REGIONAL_CITIES, STORE_TEAM } from '../lib/seedData.js'
import { getCalls, callCounts, CANONICAL_MISSED_WINDOW } from './calls.js'
import { filterReviews, CANONICAL_REVIEW_WINDOW } from './reviews.js'

/**
 * One store's live headline numbers.
 *
 * `recovered` is missed calls that were since marked converted — the product's own
 * definition of a recovered lead — and `recovery` is that over the misses, re-derived
 * rather than stored, so it can never drift from the two numbers beside it.
 */
export function storeRollup(storeId, win = CANONICAL_MISSED_WINDOW) {
  const counts = callCounts(win, { storeId })
  const missedCalls = getCalls(win, { outcome: 'missed', storeId })
  const recovered = missedCalls.filter(c => c.leadStatus === 'converted').length
  const reviews = filterReviews({ window: CANONICAL_REVIEW_WINDOW, storeId })
  const rated = reviews.filter(r => Number.isFinite(r.rating))
  return {
    storeId,
    missed: counts.missed,
    answered: counts.answered,
    total: counts.total,
    recovered,
    recovery: counts.missed > 0 ? Math.round((recovered / counts.missed) * 100) : 0,
    reviews: reviews.length,
    // Null, never 0.0 — a branch with no reviews yet has no rating, and printing "0★"
    // would be the app inventing a verdict its customers never gave.
    rating: rated.length
      ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10
      : null,
  }
}

/**
 * Every ASSIGNED store's rollup, in the order the switcher lists them.
 *
 * Assigned, not every location in the fixture: the totals on Home and in the switcher
 * are "your stores", and a manager who holds one shop must not be shown a network summed
 * over somebody else's. Everything downstream — networkRollup, the leaderboards — sums
 * this, so scoping it here scopes all of them.
 */
export function storeRollups(win = CANONICAL_MISSED_WINDOW) {
  return assignedStores().map(l => ({ ...storeRollup(l.id, win), branch: l.branch, name: l.name }))
}

/**
 * The whole network, summed from the same records.
 *
 * Recovery is re-derived from the summed counts — never an average of the per-store
 * percentages, which would let the smallest branch swing the headline.
 */
export function networkRollup(win = CANONICAL_MISSED_WINDOW) {
  const per = storeRollups(win)
  const sum = k => per.reduce((n, r) => n + r[k], 0)
  const missed = sum('missed')
  const recovered = sum('recovered')
  return {
    stores: per.length,
    missed,
    answered: sum('answered'),
    total: sum('total'),
    recovered,
    recovery: missed > 0 ? Math.round((recovered / missed) * 100) : 0,
    reviews: sum('reviews'),
    perStore: per,
  }
}

// ============================================================
// THE HIERARCHY ROLL-UPS — the same records, one level up.
//
// These replace three hand-written seed tables that were a SECOND source of truth for
// "how are my stores doing". They had drifted in exactly the way that costs trust:
//
//   • the cluster table listed Jayanagar, a store this account does not have, while the
//     dealer's actual third store (HSR Layout) was missing from it;
//   • HSR Layout appeared in the city table under a different id with different figures
//     (5 missed / 12 answered) from its own records (2 / 1) — the same branch, two
//     numbers, depending on which screen you were standing on;
//   • its manager was named Vikram Shetty there and Suresh Iyer on the team sheet.
//
// So every row this account HOLDS RECORDS FOR is now derived from those records, joined
// by branch name (the ids were never consistent). Rows for stores outside the account —
// other managers' shops in the wider hierarchy — stay seeded, because there is no data
// here to derive them from and inventing some would be the very thing this fixes. The
// totals above them therefore include both, which is what a city manager actually sees.
// ============================================================

/** Derived rows keyed by branch name — the join the mismatched ids could not provide. */
function derivedByBranch(win) {
  return new Map(storeRollups(win).map(r => [r.branch, r]))
}

/** A cluster owner's stores ARE this dealer's mapped stores. Fully derived. */
export function clusterRollup(win = CANONICAL_MISSED_WINDOW) {
  return storeRollups(win).map(r => ({
    id: r.storeId,
    name: r.name,
    branch: r.branch,
    missed: r.missed,
    answered: r.answered,
    recovered: r.recovered,
    recovery: r.recovery,
    total: r.total,
    reviews: r.reviews,
  }))
}

/**
 * The city view: every store in the city, with this account's own rows derived.
 *
 * `sourced` says which is which ('records' | 'seed') so a screen can be honest about it
 * if it ever wants to be; nothing renders it today.
 */
export function cityRollup(win = CANONICAL_MISSED_WINDOW) {
  const derived = derivedByBranch(win)
  return CITY_STORES.map(row => {
    const d = derived.get(row.name)
    if (!d) return { ...row, sourced: 'seed' }
    // Manager comes from the branch's own roster, so the hierarchy and the team sheet
    // cannot name two different people for the same shop.
    const lead = (STORE_TEAM[d.storeId] || [])[0]
    return {
      ...row,
      id: d.storeId,
      total: d.total,
      missed: d.missed,
      answered: d.answered,
      recovered: d.recovered,
      recovery: d.recovery,
      reviews: d.reviews,
      manager: lead?.name || row.manager,
      sourced: 'records',
    }
  })
}

/** Regional: the dealer's own city is summed from cityRollup(); other cities stay seeded. */
export function regionalRollup(win = CANONICAL_MISSED_WINDOW) {
  const city = cityRollup(win)
  const sum = k => city.reduce((n, r) => n + (r[k] || 0), 0)
  const missed = sum('missed')
  const recovered = sum('recovered')
  return REGIONAL_CITIES.map(c => (c.id !== 'blr' ? c : {
    ...c,
    stores: city.length,
    missed,
    answered: sum('answered'),
    recovered,
    recovery: missed > 0 ? Math.round((recovered / missed) * 100) : 0,
  }))
}

/**
 * Split a list of records into one group per store, for the All-locations view.
 *
 * WHY GROUP AT ALL. Cumulative view used to interleave every branch's rows and hang a
 * branch badge off each one, so reading "how is Koramangala doing" meant scanning a
 * mixed list and filtering it by eye. Records belonging to different shops are not one
 * list; they are several lists shown together.
 *
 * ORDER: biggest group first, tie-broken by the canonical store order so it never
 * reshuffles between renders. On a screen showing missed calls, biggest group IS the
 * branch losing the most business, which is the one to open — the ordering falls out of
 * what the screen is about rather than being a separate rule per screen.
 *
 * Records with no storeId (or one no longer in the registry) are dropped rather than
 * pooled into an "Other" bucket: a row we cannot attribute is a row we cannot ask a
 * manager to act on, and inventing a home for it would be worse than omitting it. The
 * caller can compare `items` totals against the ungrouped length to notice.
 *
 * Returns [] for an empty input, so a caller can render groups or the empty state
 * without a separate check.
 */
export function groupByStore(records = []) {
  // getStoreLocations(), NOT the assignment: this groups a list the caller has already
  // scoped, and `order` decides membership as well as order. Scoping it here would
  // silently drop records the caller deliberately passed in — a grouping helper that
  // loses rows is worse than one that shows an unexpected group.
  const order = getStoreLocations().map(l => l.id)
  const byStore = new Map()
  for (const rec of records) {
    const id = rec?.storeId
    if (!id || !order.includes(id)) continue
    if (!byStore.has(id)) byStore.set(id, [])
    byStore.get(id).push(rec)
  }
  return [...byStore.entries()]
    .map(([storeId, items]) => ({
      storeId,
      label: storeLabelOf(storeId),
      count: items.length,
      items,
    }))
    .sort((a, b) => (b.count - a.count) || (order.indexOf(a.storeId) - order.indexOf(b.storeId)))
}

/**
 * One row per group at a level of the hierarchy, for the multi-location roll-up.
 *
 * `level` is 'subBrand' | 'state' | 'city' | 'store'. Rows are built by summing the SAME per-store
 * numbers the store cards read, never the decorative fields on the location records —
 * a new level is exactly where that drift would creep back in.
 *
 * `missedPct` and `negativePct` are the two the MVP ranks on. Both are re-derived from
 * their numerator and denominator on every read rather than stored, so a row can never
 * show a percentage that disagrees with the counts printed beside it. A group with no
 * calls (or no reviews) gets null, not 0 — "none yet" and "none missed" are different
 * answers and a leaderboard that conflates them ranks an empty store top.
 */
export function networkRows({ level = 'store', subBrand = null, state = null, city = null, storeIds = null, win = CANONICAL_MISSED_WINDOW } = {}) {
  const locs = assignedStores().filter(l => (
    (!storeIds || storeIds.includes(l.id)) &&
    (!subBrand || subBrandOf(l) === subBrand) &&
    (!state || l.state === state) &&
    (!city || l.city === city)
  ))
  const rollups = new Map(storeRollups(win).map(r => [r.storeId, r]))

  const keyOf = (l) => (
    level === 'subBrand' ? subBrandOf(l)
      : level === 'state' ? l.state
        : level === 'city' ? l.city
          : l.id)
  const groups = new Map()
  for (const l of locs) {
    const key = keyOf(l) || '—'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(l)
  }

  return [...groups.entries()].map(([key, members]) => {
    let missed = 0, answered = 0, reviews = 0, negative = 0, recovered = 0
    for (const l of members) {
      const r = rollups.get(l.id)
      if (!r) continue
      missed += r.missed
      answered += r.answered
      recovered += r.recovered
      const rs = filterReviews({ window: 'all', storeId: l.id })
      reviews += rs.length
      negative += rs.filter(rv => rv.rating <= 2).length
    }
    const total = missed + answered
    return {
      key,
      level,
      label: level === 'store' ? (members[0].branch || members[0].name) : key,
      storeId: level === 'store' ? members[0].id : null,
      stores: members.length,
      state: members[0].state,
      city: members[0].city,
      missed, answered, total, recovered, reviews, negative,
      missedPct: total ? Math.round((missed / total) * 100) : null,
      negativePct: reviews ? Math.round((negative / reviews) * 100) : null,
    }
  })
}

/**
 * Rank rows for a leaderboard.
 *
 * `metric` is 'missedPct' or 'negativePct'; `dir` is 'desc' (worst first — the MVP's
 * default, because the point is to find the branch that needs help) or 'asc'.
 *
 * Rows with a null metric sort to the BOTTOM either way. A store with no calls has not
 * earned the top of a worst-first list, and it has not earned the top of a best-first
 * one either — it simply has nothing to rank.
 */
export function rankRows(rows, metric = 'missedPct', dir = 'desc') {
  const withValue = rows.filter(r => r[metric] != null)
  const without = rows.filter(r => r[metric] == null)
  const sorted = [...withValue].sort((a, b) => (
    dir === 'asc' ? a[metric] - b[metric] : b[metric] - a[metric]
  ) || a.label.localeCompare(b.label))
  return [...sorted, ...without]
}
