import { describe, it, expect } from 'vitest'
import { groupByStore } from '../data/network.js'
import { getStoreLocations } from '../data/locations.js'
import { getCalls, CANONICAL_MISSED_WINDOW } from '../data/calls.js'
import { filterReviews } from '../data/reviews.js'
import { getCustomers } from '../data/customers.js'

const IDS = getStoreLocations().map(l => l.id)
const [A, B, C] = IDS

describe('groupByStore', () => {
  it('returns nothing for an empty list, so the caller needs no separate check', () => {
    expect(groupByStore([])).toEqual([])
    expect(groupByStore()).toEqual([])
  })

  it('puts the biggest group first — on a missed-calls screen that is the branch losing most', () => {
    const recs = [
      { id: 1, storeId: B }, { id: 2, storeId: A }, { id: 3, storeId: A },
      { id: 4, storeId: A }, { id: 5, storeId: B },
      { id: 6, storeId: C },
    ]
    expect(groupByStore(recs).map(g => [g.storeId, g.count])).toEqual([[A, 3], [B, 2], [C, 1]])
  })

  it('breaks ties on the canonical store order, so groups never reshuffle between renders', () => {
    const recs = [{ id: 1, storeId: C }, { id: 2, storeId: A }, { id: 3, storeId: B }]
    // one each — order is decided entirely by the registry, not by input order
    expect(groupByStore(recs).map(g => g.storeId)).toEqual([A, B, C])
    // and it is stable when the input is shuffled
    expect(groupByStore([...recs].reverse()).map(g => g.storeId)).toEqual([A, B, C])
  })

  it('names each group with the branch, which is what the header shows', () => {
    const [first] = groupByStore([{ id: 1, storeId: A }])
    expect(first.label).toBe(getStoreLocations().find(l => l.id === A).branch)
  })

  // A row we cannot attribute is a row we cannot ask a manager to act on.
  it('drops unattributed rows rather than inventing an "Other" branch for them', () => {
    const recs = [{ id: 1, storeId: A }, { id: 2 }, { id: 3, storeId: null }, { id: 4, storeId: 'lks-nope' }]
    const groups = groupByStore(recs)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(1)
    expect(groups.some(g => /other|unknown/i.test(g.label || ''))).toBe(false)
  })

  it('keeps every record exactly once — a grouped list loses nothing', () => {
    const recs = [
      { id: 1, storeId: A }, { id: 2, storeId: B }, { id: 3, storeId: A }, { id: 4, storeId: C },
    ]
    const flat = groupByStore(recs).flatMap(g => g.items)
    expect(flat).toHaveLength(recs.length)
    expect(new Set(flat.map(r => r.id)).size).toBe(recs.length)
  })

  it('preserves the order the caller sorted rows into, inside each group', () => {
    const recs = [
      { id: 'newest', storeId: A }, { id: 'middle', storeId: A }, { id: 'oldest', storeId: A },
    ]
    expect(groupByStore(recs)[0].items.map(r => r.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  // The three screens this serves, against real records: grouping must account for
  // every attributed row the ungrouped list would have shown.
  it.each([
    ['calls', () => getCalls(CANONICAL_MISSED_WINDOW)],
    ['reviews', () => filterReviews({})],
    ['customers', () => getCustomers()],
  ])('accounts for every attributed %s record', (_name, load) => {
    const all = load()
    const grouped = groupByStore(all)
    const attributed = all.filter(r => r.storeId && IDS.includes(r.storeId))
    expect(grouped.reduce((n, g) => n + g.count, 0)).toBe(attributed.length)
    expect(grouped.every(g => g.count > 0)).toBe(true)
  })
})
