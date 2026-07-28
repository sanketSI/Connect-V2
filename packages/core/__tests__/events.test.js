// events.js — the change emitter that makes an in-place mutation visible to React.
//
// The audit finding this closes: the mutators mutate SHARED objects, so the screen
// that fired the mutation re-renders (it also called setState) and nothing else
// does. These tests pin the store contract useSyncExternalStore depends on, and
// that all four mutators actually fire it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { subscribe, emitChange, getSnapshot, listenerCount, dataStore } from '../events.js'
import { setLeadStatus, markReviewLinkSent, getMissedCalls, getCallById } from '../data/calls.js'
import { addCustomerNote, getCustomers } from '../data/customers.js'
import { verifyLocation, getStoreLocations } from '../data/locations.js'

const unsubs = []
const track = (fn) => { const u = subscribe(fn); unsubs.push(u); return u }

afterEach(() => {
  while (unsubs.length) unsubs.pop()()
})
beforeEach(() => {
  expect(listenerCount()).toBe(0) // no leaks between tests
})

describe('the useSyncExternalStore contract', () => {
  it('getSnapshot is stable while nothing changes', () => {
    expect(getSnapshot()).toBe(getSnapshot())
  })

  it('every emit increases the version, monotonically', () => {
    const a = getSnapshot()
    emitChange()
    const b = getSnapshot()
    emitChange()
    const c = getSnapshot()
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(c - a).toBe(2)
  })

  it('dataStore exposes the two functions useSyncExternalStore takes', () => {
    expect(typeof dataStore.subscribe).toBe('function')
    expect(typeof dataStore.getSnapshot).toBe('function')
    expect(dataStore.getSnapshot()).toBe(getSnapshot())
  })

  it('notifies every subscriber with the new version', () => {
    const a = vi.fn()
    const b = vi.fn()
    track(a); track(b)
    emitChange()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(getSnapshot())
  })

  it('unsubscribe really detaches', () => {
    const fn = vi.fn()
    const off = subscribe(fn)
    emitChange()
    off()
    emitChange()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(listenerCount()).toBe(0)
  })

  it('unsubscribing twice is harmless', () => {
    const off = subscribe(() => {})
    off(); off()
    expect(listenerCount()).toBe(0)
  })

  it('ignores a non-function subscriber instead of corrupting the set', () => {
    const off = subscribe(null)
    expect(listenerCount()).toBe(0)
    expect(() => off()).not.toThrow()
  })

  it('one broken subscriber cannot take down the emit or the others', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = vi.fn()
    track(() => { throw new Error('screen blew up') })
    track(good)
    expect(() => emitChange()).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('unsubscribing from inside a listener does not skip the next one', () => {
    const later = vi.fn()
    // Iterating a COPY of the set is what makes this safe.
    const off = subscribe(() => off())
    const offLater = subscribe(later)
    emitChange()
    expect(later).toHaveBeenCalledTimes(1)
    expect(listenerCount()).toBe(1) // the self-removing one is gone
    offLater()
  })

  it('subscribing from inside a listener does not fire the newcomer in the same emit', () => {
    const newcomer = vi.fn()
    let offNew
    const off = subscribe(() => { offNew ??= subscribe(newcomer) })
    emitChange()
    expect(newcomer).not.toHaveBeenCalled()
    emitChange()
    expect(newcomer).toHaveBeenCalledTimes(1)
    off(); offNew()
  })
})

describe('the four mutators fire it', () => {
  it('setLeadStatus bumps the version', () => {
    const before = getSnapshot()
    setLeadStatus(getMissedCalls()[0].id, 'converted')
    expect(getSnapshot()).toBeGreaterThan(before)
  })

  it('markReviewLinkSent bumps the version', () => {
    const before = getSnapshot()
    markReviewLinkSent(getMissedCalls()[0].id, true)
    expect(getSnapshot()).toBeGreaterThan(before)
  })

  it('addCustomerNote bumps the version', () => {
    const before = getSnapshot()
    addCustomerNote(getCustomers()[0].id, 'Followed up on WhatsApp')
    expect(getSnapshot()).toBeGreaterThan(before)
  })

  it('verifyLocation bumps the version', () => {
    const before = getSnapshot()
    verifyLocation(getStoreLocations()[0].id, {})
    expect(getSnapshot()).toBeGreaterThan(before)
  })

  it('a mutation that changed nothing does NOT bump — no spurious re-renders', () => {
    const before = getSnapshot()
    setLeadStatus('no-such-call', 'expired')
    markReviewLinkSent(['also-not-real'], true)
    addCustomerNote(getCustomers()[0].id, '   ')   // empty text → rejected
    addCustomerNote('no-such-customer', 'hello')
    verifyLocation('no-such-store')
    expect(getSnapshot()).toBe(before)
  })

  it('a subscriber sees the NEW value when it re-reads during the callback', () => {
    const id = getMissedCalls()[0].id
    setLeadStatus(id, 'missed')
    let seen = null
    track(() => { seen = getCallById(id).leadStatus })
    setLeadStatus(id, 'expired')
    expect(seen).toBe('expired') // emitted AFTER the mutation, never mid-write
  })

  it('the bulk form emits exactly once, not once per id', () => {
    const fn = vi.fn()
    track(fn)
    setLeadStatus(getMissedCalls().slice(0, 3).map(m => m.id), 'converted')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
