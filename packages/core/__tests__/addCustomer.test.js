// addCustomer() — the one door a customer record comes in through that the platform did
// not observe.
//
// PM feedback: "Flow of addition new customer is missing. While adding new customer,
// record customer details: NAME, PHONE NUMBER, EMAIL, Address."
//
// What these tests pin, in the order the mutator does it:
//   1. every refusal, with its stable discriminator (the screens branch on `reason`)
//   2. the duplicate DECISION — blocked, never merged, and a last-3 mask collision is
//      not a duplicate
//   3. the record it builds: masked derived (never raw), no invented score or category
//   4. that it is really in the record set — getCustomers() AND getCustomerById()
//   5. that it PERSISTS: a fresh module load over the same storage still has it
//   6. that it fires emitChange(), so every other screen re-reads
//
// The storage seam is driven directly (packages/core/storage.js) rather than mocked: it
// is a documented public seam with an in-memory default under Node, which is exactly the
// fixture this needs.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configureStorage } from '../storage.js'
import { subscribe } from '../events.js'
import {
  addCustomer, getCustomers, getCustomerById, getCustomerNotes, addCustomerNote,
  customerDialDigits, isIndianMobile, isEmailAddress, isManuallyAdded,
} from '../data/customers.js'

// A localStorage-shaped driver we can inspect and hand to a second module instance.
function driverOver(map = new Map()) {
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}

let store
beforeEach(() => {
  store = driverOver()
  configureStorage(store)
})

const VALID = { name: 'Anand Rao', phone: '9845098450', email: 'anand@example.com', address: '12 MG Road, Bangalore' }

// Unique numbers per test so the duplicate guard does not fire on a previous test's row
// (the module's record set is shared for the whole file, by design).
let n = 0
const freshPhone = () => `98450${String(10000 + n++).slice(-5)}`

describe('validation — the refusals, and their discriminators', () => {
  it('refuses a missing name', () => {
    const res = addCustomer({ ...VALID, name: '', phone: freshPhone() })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('name')
    expect(res.errorKey).toBe('customers.addErrorName')
    expect(res.error).toMatch(/name/i)
  })

  it('refuses a name that is only whitespace', () => {
    const res = addCustomer({ ...VALID, name: '   \n ', phone: freshPhone() })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('name')
  })

  it('refuses a name past the column ceiling', () => {
    const res = addCustomer({ ...VALID, name: 'A'.repeat(121), phone: freshPhone() })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('name')
    expect(res.errorKey).toBe('customers.addErrorNameLong')
  })

  it('refuses a number that is not an Indian mobile', () => {
    for (const phone of ['', '98450', '1234567890', '5845012342', '98450123425', 'abcdefghij']) {
      const res = addCustomer({ ...VALID, phone })
      expect(res.ok, `expected ${JSON.stringify(phone)} to be refused`).toBe(false)
      expect(res.reason).toBe('phone')
      expect(res.errorKey).toBe('customers.addErrorPhone')
    }
  })

  it('refuses a country code rather than silently truncating it', () => {
    // '+919845012342' → 12 digits. Truncating to the last 10 would be the app deciding
    // which digits it liked, and then dialling them.
    const res = addCustomer({ ...VALID, phone: '+919845012342' })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('phone')
  })

  it('accepts a number typed with spaces and hyphens', () => {
    const res = addCustomer({ ...VALID, name: 'Spaced Out', phone: '98450-98 451' })
    expect(res.ok).toBe(true)
    expect(res.customer.phone).toBe('9845098451')
  })

  it('refuses a malformed email', () => {
    for (const email of ['anand', 'anand@', 'anand@gmail', '@gmail.com', 'anand gmail.com', 'anand@@gmail.com', 'anand@.com']) {
      const res = addCustomer({ ...VALID, phone: freshPhone(), email })
      expect(res.ok, `expected ${JSON.stringify(email)} to be refused`).toBe(false)
      expect(res.reason).toBe('email')
      expect(res.errorKey).toBe('customers.addErrorEmail')
    }
  })

  it('accepts a blank email — optional means optional', () => {
    const res = addCustomer({ name: 'No Email', phone: freshPhone(), email: '  ', address: '' })
    expect(res.ok).toBe(true)
    expect(res.customer.email).toBeNull()
    expect(res.customer.address).toBeNull()
  })

  it('refuses an address past the column ceiling', () => {
    const res = addCustomer({ ...VALID, phone: freshPhone(), address: 'x'.repeat(501) })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('address')
    expect(res.errorKey).toBe('customers.addErrorAddressLong')
  })

  it('writes nothing at all when it refuses', () => {
    const before = getCustomers().length
    addCustomer({ name: '', phone: 'nope', email: 'bad' })
    expect(getCustomers().length).toBe(before)
    expect(store.map.get('connect-added-customers')).toBeUndefined()
  })
})

describe('the duplicate decision — blocked, not merged', () => {
  it('refuses a number already in the book, and hands back the record it collided with', () => {
    // cust-231 in the seed. The existing record is what the manager was looking for.
    const seeded = getCustomerById('cust-231')
    const res = addCustomer({ name: 'Someone Else', phone: seeded.phone })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('duplicate')
    expect(res.errorKey).toBe('customers.addErrorDuplicate')
    expect(res.existingId).toBe('cust-231')
  })

  it('leaves the existing record completely untouched — a merge would overwrite it', () => {
    const before = { ...getCustomerById('cust-231') }
    addCustomer({ name: 'Someone Else', phone: before.phone, email: 'someone@else.com', address: 'Elsewhere' })
    const after = getCustomerById('cust-231')
    expect(after.name).toBe(before.name)
    expect(after.cli).toBe(before.cli)
    expect(after.email).toBeUndefined()
    expect(after.address).toBeUndefined()
    expect(after.notes.length).toBe(before.notes.length)
  })

  it('refuses a duplicate however it was punctuated', () => {
    const seeded = getCustomerById('cust-087')
    const spaced = seeded.phone.replace(/^(\d{5})(\d{5})$/, '$1 $2')
    expect(addCustomer({ name: 'Punctuated', phone: spaced }).reason).toBe('duplicate')
  })

  it('a shared last-3 mask is NOT a duplicate — two different numbers, two people', () => {
    // The seed's own collision: cust-231 and cust-231b mask identically.
    const a = getCustomerById('cust-231')
    const b = getCustomers().find(c => c.id !== 'cust-231' && c.masked === a.masked)
    expect(b, 'the seed should still hold a last-3 collision').toBeTruthy()
    expect(b.phone).not.toBe(a.phone)

    // …and a NEW number that happens to end in the same three digits is admitted.
    const sharedTail = `98888${'0'.repeat(2)}${a.phone.slice(-3)}`
    const res = addCustomer({ name: 'Same Last Three', phone: sharedTail })
    expect(res.ok).toBe(true)
    expect(res.customer.masked).toBe(a.masked)
  })

  it('refuses a second copy of a customer it just added itself', () => {
    const phone = freshPhone()
    const first = addCustomer({ name: 'First Time', phone })
    expect(first.ok).toBe(true)
    const second = addCustomer({ name: 'Second Time', phone })
    expect(second.ok).toBe(false)
    expect(second.reason).toBe('duplicate')
    expect(second.existingId).toBe(first.customer.id)
  })
})

describe('the record it builds', () => {
  it('records all four details the PM asked for', () => {
    const phone = freshPhone()
    const res = addCustomer({ name: '  Meera Iyer  ', phone, email: '  MEERA@example.com ', address: '  4th Cross, Jayanagar  ' })
    expect(res.ok).toBe(true)
    expect(res.customer.name).toBe('Meera Iyer')       // trimmed
    expect(res.customer.phone).toBe(phone)
    expect(res.customer.email).toBe('MEERA@example.com')
    expect(res.customer.address).toBe('4th Cross, Jayanagar')
  })

  it('DERIVES the mask from the number — the list never renders raw digits', () => {
    const res = addCustomer({ name: 'Masked Properly', phone: '9876500123' })
    expect(res.customer.masked).toBe('+91 ●●●●● ●●123')
    // Same rule, same shape, as every seeded record on the same screen.
    expect(res.customer.masked).toMatch(/^\+91 ●●●●● ●●\d{3}$/)
    expect(res.customer.masked).not.toContain('98765')
    // The raw number is still there for the ONE door it leaves by.
    expect(customerDialDigits(res.customer)).toBe('9876500123')
  })

  it('invents no score, no band, no category and no AI read', () => {
    const res = addCustomer({ name: 'No Score Yet', phone: freshPhone() })
    expect(res.customer.cli).toBeNull()
    expect(res.customer.band).toBeNull()
    expect(res.customer.value).toBeNull()
    expect(res.customer.category).toBeNull()
    expect(res.customer.categoryKey).toBeNull()
    expect(res.customer.aiGuess).toBeNull()
    expect(res.customer.callCount).toBe(0)
    expect(res.customer.reviewSent).toBe(false)
    expect(res.customer.reviewed).toBe(false)
    expect(res.customer.timeline).toEqual([])
  })

  it('stamps who added it and when, and is recognisable as hand-entered', () => {
    const before = Date.now()
    const res = addCustomer({ name: 'Stamped', phone: freshPhone() }, 'Priya Nair')
    expect(res.customer.addedBy).toBe('Priya Nair')
    expect(res.customer.addedAtMs).toBeGreaterThanOrEqual(before)
    expect(res.customer.firstSeenAtMs).toBe(res.customer.addedAtMs)
    expect(res.customer.lastSeenAtMs).toBe(res.customer.addedAtMs)
    expect(isManuallyAdded(res.customer)).toBe(true)
    expect(isManuallyAdded(getCustomerById('cust-231'))).toBe(false)
  })

  it('defaults the author to the signed-in user', () => {
    const res = addCustomer({ name: 'Default Author', phone: freshPhone() })
    expect(res.customer.addedBy).toBe('Rajesh Kumar')
  })
})

describe('it is really in the record set', () => {
  it('is visible through getCustomers() and getCustomerById() immediately', () => {
    const before = getCustomers().length
    const res = addCustomer({ name: 'Findable', phone: freshPhone(), email: 'findable@example.com' })
    expect(getCustomers().length).toBe(before + 1)
    // The SAME object, not a copy — screens hold record identity (see data/calls.js).
    expect(getCustomers().find(c => c.id === res.customer.id)).toBe(res.customer)
    expect(getCustomerById(res.customer.id)).toBe(res.customer)
    expect(getCustomerById(res.customer.id).email).toBe('findable@example.com')
  })

  it('takes notes like any other customer', () => {
    const res = addCustomer({ name: 'Notable', phone: freshPhone() })
    const note = addCustomerNote(res.customer.id, 'Wants the 1.5T split AC, coming Saturday.')
    expect(note).toBeTruthy()
    expect(getCustomerNotes(res.customer.id).map(x => x.text)).toContain('Wants the 1.5T split AC, coming Saturday.')
  })

  it('fires emitChange() so every other screen re-reads', () => {
    const seen = vi.fn()
    const off = subscribe(seen)
    addCustomer({ name: 'Emitter', phone: freshPhone() })
    expect(seen).toHaveBeenCalledTimes(1)
    // …and not on a refusal: nothing moved.
    addCustomer({ name: '', phone: '' })
    expect(seen).toHaveBeenCalledTimes(1)
    off()
  })
})

describe('persistence — it survives the reload', () => {
  it('writes through the storage seam and comes back on a fresh module load', async () => {
    const res = addCustomer({ name: 'Survivor Singh', phone: '9812345678', email: 'survivor@example.com', address: '9 Church Street' })
    expect(res.ok).toBe(true)

    const raw = store.map.get('connect-added-customers')
    expect(raw, 'nothing was written to storage').toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed.some(r => r.id === res.customer.id)).toBe(true)
    // Stored RAW, so the mask is re-derived rather than trusted.
    expect(parsed.find(r => r.id === res.customer.id).masked).toBeUndefined()

    // A NEW module instance over the SAME storage — this is the reload.
    vi.resetModules()
    const { configureStorage: configureAgain } = await import('../storage.js')
    configureAgain(store)
    const reloaded = await import('../data/customers.js')

    const found = reloaded.getCustomerById(res.customer.id)
    expect(found, 'the customer did not survive the reload').toBeTruthy()
    expect(found.name).toBe('Survivor Singh')
    expect(found.email).toBe('survivor@example.com')
    expect(found.address).toBe('9 Church Street')
    expect(found.masked).toBe('+91 ●●●●● ●●678')      // re-derived, not stored
    expect(found.addedBy).toBe('Rajesh Kumar')
    expect(reloaded.getCustomers().filter(c => c.id === res.customer.id).length).toBe(1)
  })

  it('a corrupt storage payload is "nobody added anyone", not a crash', async () => {
    const corrupt = driverOver(new Map([['connect-added-customers', '{"not":"an array"}']]))
    vi.resetModules()
    const { configureStorage: configureAgain } = await import('../storage.js')
    configureAgain(corrupt)
    const reloaded = await import('../data/customers.js')
    expect(reloaded.getCustomers().length).toBeGreaterThan(0)
    expect(reloaded.getCustomers().every(c => c.masked)).toBe(true)
  })

  it('drops a stored row whose number is no longer valid rather than rendering it', async () => {
    const junk = driverOver(new Map([['connect-added-customers', JSON.stringify([
      { id: 'cust-add-bad', name: 'Bad Number', phone: '123', atMs: Date.now() },
      { id: 'cust-add-good', name: 'Good Number', phone: '9845011111', atMs: Date.now() },
    ])]]))
    vi.resetModules()
    const { configureStorage: configureAgain } = await import('../storage.js')
    configureAgain(junk)
    const reloaded = await import('../data/customers.js')
    expect(reloaded.getCustomerById('cust-add-bad')).toBeNull()
    expect(reloaded.getCustomerById('cust-add-good')?.name).toBe('Good Number')
  })
})

describe('the validators, shared with the screens', () => {
  it('isIndianMobile is the one rule both the form and the review-link builder use', () => {
    expect(isIndianMobile('9845012342')).toBe(true)
    expect(isIndianMobile('6845012342')).toBe(true)
    expect(isIndianMobile('5845012342')).toBe(false)
    expect(isIndianMobile('984501234')).toBe(false)
    expect(isIndianMobile('98450 12342')).toBe(true)
    expect(isIndianMobile(null)).toBe(false)
    // A masked string must never read as a dialable number.
    expect(isIndianMobile('+91 ●●●●● ●●775')).toBe(false)
  })

  it('isEmailAddress catches the typos and accepts the real shapes', () => {
    expect(isEmailAddress('anand@example.com')).toBe(true)
    expect(isEmailAddress('anand.rao+shop@mail.co.in')).toBe(true)
    expect(isEmailAddress('anand@gmail')).toBe(false)
    expect(isEmailAddress('anand gmail.com')).toBe(false)
    expect(isEmailAddress('')).toBe(false)
    expect(isEmailAddress(null)).toBe(false)
    expect(isEmailAddress(`${'a'.repeat(250)}@example.com`)).toBe(false)   // RFC 5321 ceiling
  })
})
