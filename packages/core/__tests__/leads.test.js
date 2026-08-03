import { describe, it, expect } from 'vitest'
import {
  getLeads, leadCounts, leadStatusOf, updateLeadStatus,
} from '../data/leads.js'
import { LEAD_STATUS_IDS, LEAD_SOURCES } from '../data/leadStatus.js'
import { getCalls } from '../data/calls.js'
import { getCustomers, customerSourceType } from '../data/customers.js'
import { assignedStores } from '../data/assignments.js'
import { getStoreLocations } from '../data/locations.js'

describe('lead lifecycle', () => {
  it('is the five states the MVP asks for, in lifecycle order', () => {
    expect(LEAD_STATUS_IDS).toEqual(['missed', 'contacted', 'converted', 'review_requested', 'expired'])
  })

  it('covers all three sources', () => {
    expect(LEAD_SOURCES.map(s => s.id)).toEqual(['call', 'form', 'walk_in'])
  })

  // The seed still holds legacy 'open' values; nothing was hand-migrated.
  it('reads a legacy record without migrating it', () => {
    expect(leadStatusOf({ leadStatus: 'open', outcome: 'missed' })).toBe('missed')
    expect(leadStatusOf({ leadStatus: 'open', outcome: 'attended' })).toBe('contacted')
    expect(leadStatusOf({ outcome: 'missed' })).toBe('missed')
  })

  it('treats a converted lead whose review was already asked for as review_requested', () => {
    expect(leadStatusOf({ leadStatus: 'converted' })).toBe('converted')
    expect(leadStatusOf({ leadStatus: 'converted', reviewLinkSent: true })).toBe('review_requested')
    expect(leadStatusOf({ leadStatus: 'converted', reviewSent: true })).toBe('review_requested')
  })

  it("lets a manager's explicit choice win over the derivation", () => {
    // A missed call the manager marked contacted stays contacted, even though the
    // record's own outcome still says the shop never picked up.
    expect(leadStatusOf({ leadStatus: 'contacted', outcome: 'missed' })).toBe('contacted')
    expect(leadStatusOf({ leadStatus: 'expired', outcome: 'attended' })).toBe('expired')
  })

  it('gives every lead a state that is one of the five', () => {
    const bad = getLeads().filter(l => !LEAD_STATUS_IDS.includes(l.status))
    expect(bad).toEqual([])
  })
})

describe('getLeads', () => {
  it('produces leads from all three sources', () => {
    const bySource = {}
    for (const l of getLeads()) bySource[l.source] = (bySource[l.source] || 0) + 1
    expect(bySource.call).toBeGreaterThan(0)
    expect(bySource.form).toBeGreaterThan(0)
    expect(bySource.walk_in).toBeGreaterThan(0)
  })

  it('populates every state, so no filter is a dead end', () => {
    const counts = leadCounts()
    for (const id of LEAD_STATUS_IDS) expect(counts[id]).toBeGreaterThan(0)
  })

  // A call-sourced customer is already represented by their call. Emitting both would
  // double-count the same person in a list the manager works through one row at a time.
  it('does not emit a call-sourced customer as a second lead', () => {
    const leads = getLeads()
    const callSourced = getCustomers().filter(c => customerSourceType(c) === 'call')
    expect(callSourced.length).toBeGreaterThan(0)
    for (const cu of callSourced) {
      expect(leads.some(l => l.id === `cust:${cu.id}`)).toBe(false)
    }
  })

  it('carries one lead per call record, and the seed has no customer with two', () => {
    const calls = getCalls('all')
    const callLeads = getLeads().filter(l => l.source === 'call')
    expect(callLeads).toHaveLength(calls.length)
    const ids = callLeads.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('filters by source', () => {
    for (const { id } of LEAD_SOURCES) {
      const only = getLeads({ source: id })
      expect(only.length).toBeGreaterThan(0)
      expect(only.every(l => l.source === id)).toBe(true)
    }
  })

  it('filters by status', () => {
    for (const id of LEAD_STATUS_IDS) {
      const only = getLeads({ status: id })
      expect(only.every(l => l.status === id)).toBe(true)
    }
  })

  it('scopes to one store, and the parts sum to the whole', () => {
    const all = getLeads()
    let summed = 0
    // The ASSIGNED stores, not every location in the fixture: an unscoped getLeads()
    // means "mine", so the parts that sum to it are mine too. Asking explicitly for a
    // store someone else holds still returns that store's leads — storeId is a filter,
    // not a permission (the security boundary is RLS, see 0002_harden_rls.sql).
    for (const loc of assignedStores()) {
      const mine = getLeads({ storeId: loc.id })
      expect(mine.every(l => l.storeId === loc.id)).toBe(true)
      summed += mine.length
    }
    expect(summed).toBe(all.filter(l => l.storeId).length)
  })

  it('puts every missed lead first, then orders each group newest first', () => {
    // The contract CHANGED on PM instruction: "by default when loading the Lead tab, all
    // missed calls would come first". A missed call is the only row still owed an action,
    // so it outranks a walk-in from this morning that has already been served.
    const leads = getLeads()
    const firstSettled = leads.findIndex(l => l.status !== 'missed')
    const missedCount = leads.filter(l => l.status === 'missed').length

    // Either everything is missed, or the missed block ends exactly where the count says.
    expect(firstSettled === -1 ? missedCount : firstSettled).toBe(missedCount)
    // Nothing missed appears after the boundary.
    expect(leads.slice(missedCount).every(l => l.status !== 'missed')).toBe(true)

    // And WITHIN each group the old rule still holds — newest first, which is what a
    // call list means. Losing that would make "first" mean nothing inside the block.
    const monotonic = arr => arr.every((l, i) => i === 0 || (arr[i - 1].atMs || 0) >= (l.atMs || 0))
    expect(monotonic(leads.slice(0, missedCount))).toBe(true)
    expect(monotonic(leads.slice(missedCount))).toBe(true)
  })

  it('counts what it lists', () => {
    const counts = leadCounts()
    expect(counts.total).toBe(getLeads().length)
    const summed = LEAD_STATUS_IDS.reduce((n, id) => n + counts[id], 0)
    expect(summed).toBe(counts.total)
  })
})

describe('updateLeadStatus', () => {
  it('refuses a status outside the lifecycle', () => {
    const lead = getLeads()[0]
    expect(() => updateLeadStatus(lead, 'open')).toThrow(/invalid status/)
    expect(() => updateLeadStatus(lead, 'nonsense')).toThrow(/invalid status/)
  })

  it('moves a CALL lead and the list reflects it', () => {
    const lead = getLeads({ source: 'call', status: 'missed' })[0]
    expect(lead).toBeTruthy()
    updateLeadStatus(lead, 'contacted')
    const again = getLeads().find(l => l.id === lead.id)
    expect(again.status).toBe('contacted')
    updateLeadStatus(lead, 'missed') // leave the fixture as we found it
  })

  it('moves a FORM lead, which has no call record behind it', () => {
    const lead = getLeads({ source: 'form' })[0]
    const before = lead.status
    updateLeadStatus(lead, 'converted')
    expect(getLeads().find(l => l.id === lead.id).status).toBe('converted')
    updateLeadStatus(lead, before)
    expect(getLeads().find(l => l.id === lead.id).status).toBe(before)
  })
})
