// storeReviewLink() — the URL the counter QR encodes.
//
// A QR is printed once and stuck to a counter. If the link it encodes ever changes
// shape, every card in every shop silently stops working, and nobody finds out until a
// month of reviews has not arrived. So the format is pinned here, deliberately tightly.
import { describe, it, expect } from 'vitest'
import { storeReviewLink, reviewLinkCode } from '../data/reviews.js'
import { MAPPED_LOCATIONS } from '../lib/seedData.js'

describe('reviewLinkCode', () => {
  it('is six upper-case base36 characters', () => {
    for (const loc of MAPPED_LOCATIONS) {
      expect(reviewLinkCode(loc.id)).toMatch(/^[0-9A-Z]{6}$/)
    }
  })

  it('is deterministic — the card printed in January still resolves in December', () => {
    expect(reviewLinkCode('lks-ind')).toBe(reviewLinkCode('lks-ind'))
    expect(reviewLinkCode('lks-ind')).toBe('LGH63P')
  })

  it('gives different stores different codes', () => {
    const codes = MAPPED_LOCATIONS.map(l => reviewLinkCode(l.id))
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('matches the per-customer builder’s seeding scheme (store:customer)', () => {
    // apps/web/src/screens/Customers.jsx hashes `${store.id}:${customer.id}` with the
    // same function. Same shape, different subject — one link format, not two.
    expect(reviewLinkCode('lks-ind:cust-231')).toMatch(/^[0-9A-Z]{6}$/)
    expect(reviewLinkCode('lks-ind:cust-231')).not.toBe(reviewLinkCode('lks-ind'))
  })
})

describe('storeReviewLink', () => {
  it('is an https si.link/r/ short link', () => {
    expect(storeReviewLink('lks-ind')).toBe('https://si.link/r/LGH63P')
    for (const loc of MAPPED_LOCATIONS) {
      expect(storeReviewLink(loc.id)).toMatch(/^https:\/\/si\.link\/r\/[0-9A-Z]{6}$/)
    }
  })

  it('accepts a store record as well as an id', () => {
    const store = MAPPED_LOCATIONS[0]
    expect(storeReviewLink(store)).toBe(storeReviewLink(store.id))
  })

  it('stays short enough to print small and scan from arm’s length', () => {
    // 24 chars fits a version-2 QR at the lowest module count we can get away with —
    // the coarser the grid, the further away a phone can lock onto it.
    expect(storeReviewLink('lks-ind').length).toBeLessThanOrEqual(30)
  })

  it('returns null rather than encoding the word "undefined" into a QR', () => {
    expect(storeReviewLink(null)).toBeNull()
    expect(storeReviewLink(undefined)).toBeNull()
    expect(storeReviewLink({})).toBeNull()
    expect(storeReviewLink('')).toBeNull()
  })
})
