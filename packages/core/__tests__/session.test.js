// session.js — store-code validation. The three failure reasons are three
// different problems for the user, and the check is only worth having if
// 'notMapped' can actually fire (a well-formed, real code owned by someone else).
import { describe, it, expect } from 'vitest'
import {
  normalizeStoreCode, isValidStoreCodeFormat, resolveStoreCode,
  getStoreByCode, storeCodesFor, allStoreCodes, phoneOnFileFor,
  maskPhone, getCurrentUser, isReturningUser, markReturningUser,
  DEALER_PHONE, STORE_CODE_EXAMPLE,
} from '../data/session.js'

const OTHER_DEALER_CODE = 'LKS-JAY-04'   // real store, different owner
const NO_SUCH_CODE = 'LKS-ZZZ-99'        // well-formed, does not exist

describe('normalizeStoreCode', () => {
  it('uppercases, trims and strips spaces/underscores', () => {
    expect(normalizeStoreCode('  lks-ind-01  ')).toBe('LKS-IND-01')
    expect(normalizeStoreCode('lks ind 01')).toBe('LKSIND01'.replace(/^(...)(...)(..)$/, '$1-$2-$3'))
    expect(normalizeStoreCode('lks_ind_01')).toBe('LKS-IND-01')
  })

  it('puts the hyphens back on a well-formed un-hyphenated code', () => {
    expect(normalizeStoreCode('lksind01')).toBe('LKS-IND-01')
    expect(normalizeStoreCode('LKSIND01')).toBe('LKS-IND-01')
  })

  it('is idempotent — normalising twice changes nothing', () => {
    const inputs = ['lks-ind-01', 'lksind01', '  LKS IND 01 ', 'hello', '', '   ', 'LKS-ZZZ-99', 'lks_jay_04', '12345678']
    for (const raw of inputs) {
      const once = normalizeStoreCode(raw)
      expect(normalizeStoreCode(once), `idempotence for "${raw}"`).toBe(once)
      expect(normalizeStoreCode(normalizeStoreCode(once)), `triple for "${raw}"`).toBe(once)
    }
  })

  it("returns '' for empty-ish input rather than throwing", () => {
    expect(normalizeStoreCode('')).toBe('')
    expect(normalizeStoreCode(null)).toBe('')
    expect(normalizeStoreCode(undefined)).toBe('')
    expect(normalizeStoreCode('   ')).toBe('')
  })

  it('leaves junk alone — it validates nothing', () => {
    expect(normalizeStoreCode('hello')).toBe('HELLO')
    expect(isValidStoreCodeFormat('hello')).toBe(false)
  })
})

describe('isValidStoreCodeFormat — shape only', () => {
  it('accepts the canonical and the un-hyphenated forms', () => {
    expect(isValidStoreCodeFormat('LKS-IND-01')).toBe(true)
    expect(isValidStoreCodeFormat('lksind01')).toBe(true)
    expect(isValidStoreCodeFormat(STORE_CODE_EXAMPLE)).toBe(true)
  })

  it('says nothing about existence — a fictional code is still well-formed', () => {
    expect(isValidStoreCodeFormat(NO_SUCH_CODE)).toBe(true)
    expect(getStoreByCode(NO_SUCH_CODE)).toBeNull()
  })

  it('rejects the wrong shape', () => {
    for (const bad of ['hello', 'LKS-IND-1', 'LKS-IND-001', 'LK-IND-01', '1234567890', '']) {
      expect(isValidStoreCodeFormat(bad), `"${bad}" should be malformed`).toBe(false)
    }
  })
})

describe('resolveStoreCode — the four outcomes', () => {
  it('ok: a real code mapped to this dealer', () => {
    const res = resolveStoreCode('lks-ind-01', { phone: DEALER_PHONE })
    expect(res.ok).toBe(true)
    expect(res.code).toBe('LKS-IND-01')
    expect(res.store.storeCode).toBe('LKS-IND-01')
    expect(res.store.id).toBe('lks-ind')
    expect(res.reason).toBeUndefined()
  })

  it("format: not a store code at all → reason 'format'", () => {
    const res = resolveStoreCode('hello')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('format')
    expect(res.errorKey).toBe('login.storeCodeFormatError')
    expect(res.error).toContain(STORE_CODE_EXAMPLE)
    expect(res.store).toBeUndefined()
  })

  it("notFound: well-formed but no such store → reason 'notFound'", () => {
    const res = resolveStoreCode(NO_SUCH_CODE, { phone: DEALER_PHONE })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('notFound')
    expect(res.errorKey).toBe('login.storeCodeNotFoundError')
    expect(res.code).toBe(NO_SUCH_CODE)
  })

  it("notMapped: a real store owned by another dealer → reason 'notMapped'", () => {
    const res = resolveStoreCode(OTHER_DEALER_CODE, { phone: DEALER_PHONE })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('notMapped')
    expect(res.errorKey).toBe('login.storeCodeNotMappedError')
    // …and it resolves fine for its actual owner, which is what makes the check real.
    // Jayanagar is a real store now (it backs the single-location build), so for its own
    // manager this succeeds outright. It used to answer 'notFound' here only because the
    // registry row pointed at a location the fixture never defined.
    const owner = phoneOnFileFor(OTHER_DEALER_CODE)
    expect(owner).not.toBe(DEALER_PHONE)
    expect(resolveStoreCode(OTHER_DEALER_CODE, { phone: owner }).ok).toBe(true)
  })

  it('the three reasons are checked in order: format before existence before ownership', () => {
    expect(resolveStoreCode('hi', { phone: '0000000000' }).reason).toBe('format')
    expect(resolveStoreCode(NO_SUCH_CODE, { phone: '0000000000' }).reason).toBe('notFound')
    expect(resolveStoreCode(OTHER_DEALER_CODE, { phone: DEALER_PHONE }).reason).toBe('notMapped')
  })

  it('skips the ownership check entirely when no phone is supplied', () => {
    // Another dealer's code, and it still resolves — because with no phone there is
    // nobody to check it against. That is the whole point of the case, and it reads
    // properly now that Jayanagar is a real store: the code fails for THIS dealer
    // (notMapped, above) and passes when ownership is not asked about at all.
    expect(resolveStoreCode(OTHER_DEALER_CODE).ok).toBe(true)
    expect(resolveStoreCode('LKS-KOR-02').ok).toBe(true)
    // A registry row with no location behind it is still notFound, phone or no phone.
    expect(resolveStoreCode('CRM-KOR-01').ok).toBe(false)
  })

  it('tolerates spaces and dashes in the phone number', () => {
    expect(resolveStoreCode('LKS-IND-01', { phone: '98450 12342' }).ok).toBe(true)
    expect(resolveStoreCode('LKS-IND-01', { phone: '98450-12342' }).ok).toBe(true)
  })

  // CHARACTERIZATION, not endorsement. The phone comparison strips non-digits but
  // does NOT strip a country code, so an E.164 number ('+919845012342') compares
  // as twelve digits against ten and silently fails as 'notMapped'. Safe today —
  // Login.jsx only ever passes the 10-digit field — but it is a trap for any
  // future caller (a tel: link, a real auth provider) that hands over +91.
  it('KNOWN LIMITATION: a +91-prefixed number is not recognised as the same dealer', () => {
    expect(resolveStoreCode('LKS-IND-01', { phone: '+91 98450 12342' }).ok).toBe(false)
    expect(resolveStoreCode('LKS-IND-01', { phone: '+91 98450 12342' }).reason).toBe('notMapped')
  })

  it('every failure carries both an English sentence and a catalog key', () => {
    for (const bad of ['hello', NO_SUCH_CODE, OTHER_DEALER_CODE]) {
      const res = resolveStoreCode(bad, { phone: DEALER_PHONE })
      expect(res.ok).toBe(false)
      expect(typeof res.error).toBe('string')
      expect(res.error.length).toBeGreaterThan(10)
      expect(res.errorKey).toMatch(/^login\.storeCode/)
    }
  })
})

describe('phoneOnFileFor / storeCodesFor / allStoreCodes', () => {
  it('returns the registered number for a known code, normalising the input first', () => {
    expect(phoneOnFileFor('lksind01')).toBe(DEALER_PHONE)
    expect(phoneOnFileFor('  LKS-IND-01 ')).toBe(DEALER_PHONE)
  })

  it("returns null for a code we don't hold — never a guess", () => {
    expect(phoneOnFileFor(NO_SUCH_CODE)).toBeNull()
    expect(phoneOnFileFor('hello')).toBeNull()
    expect(phoneOnFileFor('')).toBeNull()
  })

  it('names a different owner for the other dealer’s store', () => {
    const other = phoneOnFileFor(OTHER_DEALER_CODE)
    expect(other).toBeTruthy()
    expect(other).not.toBe(DEALER_PHONE)
  })

  it('storeCodesFor lists exactly this dealer’s outlets', () => {
    const mine = storeCodesFor(DEALER_PHONE)
    // All six. The registry used to list only the first three, so sign-in said "3 stores
    // on this number" and the picker on the very next screen said "6 locations".
    expect(mine).toEqual([
      'LKS-IND-01', 'LKS-KOR-02', 'LKS-HSR-03', 'LKS-MYS-04', 'LKS-BOM-05', 'LKS-PUN-06',
    ])
    expect(mine).not.toContain(OTHER_DEALER_CODE)
    expect(storeCodesFor('98450 12342')).toEqual(mine) // spacing-insensitive
    expect(storeCodesFor('0000000000')).toEqual([])
    expect(storeCodesFor('+91 98450 12342')).toEqual([]) // see the KNOWN LIMITATION above
  })

  it('allStoreCodes is wider than one dealer — that is what makes notMapped possible', () => {
    const all = allStoreCodes()
    expect(all).toContain(OTHER_DEALER_CODE)
    expect(all.length).toBeGreaterThan(storeCodesFor(DEALER_PHONE).length)
  })
})

describe('maskPhone', () => {
  it('shows the first two and last two digits only', () => {
    expect(maskPhone('9845012342')).toBe('+91 98•••• ••42')
  })

  it('strips formatting before masking', () => {
    expect(maskPhone('98450-12342')).toBe(maskPhone('9845012342'))
    expect(maskPhone(' 98450 12342 ')).toBe(maskPhone('9845012342'))
  })

  // Same root cause as the store-code limitation above: the country code is not
  // stripped, so the first two digits shown become '91' rather than the subscriber's.
  it('KNOWN LIMITATION: a +91-prefixed number masks the country code, not the number', () => {
    expect(maskPhone('+91 98450-12342')).toBe('+91 91•••• ••42')
  })

  it('degrades safely on short or empty input rather than slicing garbage', () => {
    expect(maskPhone('12')).toBe('+91 12')
    expect(maskPhone('')).toBe('+91 ')
    expect(maskPhone(null)).toBe('+91 ')
  })

  it('never leaks the middle digits', () => {
    expect(maskPhone('9845012342')).not.toContain('450')
  })
})

describe('session identity + the returning-user flag', () => {
  it('names the signed-in user', () => {
    const u = getCurrentUser()
    expect(u).toBeTruthy()
    expect(typeof u.name).toBe('string')
  })

  it('persists through the storage seam (in-memory driver under Node)', () => {
    expect(isReturningUser()).toBe(false)
    markReturningUser()
    expect(isReturningUser()).toBe(true)
  })
})
