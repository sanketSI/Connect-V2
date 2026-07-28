// No raw phone number reaches this client any more.
//
// `dealers.phone` IS the login credential and `customers.phone` is consumer PII;
// supabase/migrations/0002_harden_rls.sql revokes both from anon — the role whose
// key ships inside the bundle. Three behaviours used to be load-bearing on those
// columns, and this file is the proof that each one still works without them:
//
//   1. which stores belong to the signed-in dealer  (hydrate, by dealer ID)
//   2. store-code sign-in, all three refusals       (session, by identity)
//   3. click-to-call                                (degrades, honestly)
//
// …and that SEED MODE — no env vars, no backend — behaves exactly as it always did.
//
// The last describe() HYDRATES, which mutates the seed arrays. Vitest isolates
// module state per test FILE, so that damage is contained here — keep it last.
import { describe, it, expect, vi } from 'vitest'

// A live client, without a network or a single env var. `liveClient()` is the
// gate verifyStoreLogin() and the mutators read; nothing else here needs the SDK.
const sb = vi.hoisted(() => ({ client: null, rpcs: [] }))
vi.mock('../lib/supabase.js', () => ({
  supabaseEnabled: () => Boolean(sb.client),
  initSupabase: async () => sb.client,
  setSupabaseLive: () => {},
  liveClient: () => sb.client,
}))

const { hydrateFromSupabase } = await import('../data/hydrate.js')
const {
  resolveStoreCode, storeCodesFor, allStoreCodes, phoneOnFileFor,
  verifyStoreLogin, maskPhone, DEALER_PHONE,
} = await import('../data/session.js')
const { customerDialDigits } = await import('../data/customers.js')
const { CUSTOMERS, STORE_CODE_REGISTRY, MAPPED_LOCATIONS } = await import('../lib/seedData.js')

const OTHER_DEALER_CODE = 'LKS-JAY-04'  // a real code, another dealer's
const NO_SUCH_CODE = 'LKS-ZZZ-99'
const OTHER_DEALER_ID = 'dl-jayanagar'
const MY_DEALER_ID = 'dl-lakshmi'

/** The sign-in matrix, asserted identically before and after hydration. */
function expectSignInMatrix() {
  expect(resolveStoreCode('LKS-IND-01', { phone: DEALER_PHONE }).ok).toBe(true)
  expect(resolveStoreCode('LKS-KOR-02', { phone: DEALER_PHONE }).ok).toBe(true)
  expect(resolveStoreCode(OTHER_DEALER_CODE, { phone: DEALER_PHONE }).reason).toBe('notMapped')
  expect(resolveStoreCode(NO_SUCH_CODE, { phone: DEALER_PHONE }).reason).toBe('notFound')
  expect(resolveStoreCode('hello', { phone: DEALER_PHONE }).reason).toBe('format')
}

describe('SEED MODE — zero env vars, and nothing about it changed', () => {
  it('still produces all four sign-in outcomes', () => {
    expectSignInMatrix()
  })

  it('still names this dealer’s six outlets and nobody else’s', () => {
    // Six, not three: Mysore, Andheri and Baner are this dealer's too. They were in
    // MAPPED_LOCATIONS but missing from the code registry, so sign-in counted three
    // while the next screen counted six.
    expect(storeCodesFor(DEALER_PHONE)).toEqual([
      'LKS-IND-01', 'LKS-KOR-02', 'LKS-HSR-03', 'LKS-MYS-04', 'LKS-BOM-05', 'LKS-PUN-06',
    ])
    expect(storeCodesFor('9845077777')).toEqual([OTHER_DEALER_CODE])
    expect(storeCodesFor('0000000000')).toEqual([])
  })

  it('still hands the call-back button a real number to dial', () => {
    const withNumber = CUSTOMERS.find(c => c.phone)
    expect(withNumber).toBeTruthy()
    expect(customerDialDigits(withNumber)).toMatch(/^[6-9]\d{9}$/)
  })

  it('still returns raw digits for the number on file — the fixture is nobody’s number', () => {
    expect(phoneOnFileFor('LKS-IND-01')).toBe(DEALER_PHONE)
    expect(maskPhone(phoneOnFileFor('LKS-IND-01'))).toBe('+91 98•••• ••42')
  })
})

describe('maskPhone is idempotent', () => {
  // With the raw columns revoked, "the number on file" a caller holds may already
  // BE the server's mask. Re-masking it used to print the country code as if it
  // were the subscriber's first two digits — a confident lie.
  it('leaves an already-masked string exactly as it found it', () => {
    expect(maskPhone('+91 98•••• ••42')).toBe('+91 98•••• ••42')
    expect(maskPhone(maskPhone('9845012342'))).toBe(maskPhone('9845012342'))
  })

  it('still masks a raw number, and still degrades safely', () => {
    expect(maskPhone('9845012342')).toBe('+91 98•••• ••42')
    expect(maskPhone('')).toBe('+91 ')
    expect(maskPhone(null)).toBe('+91 ')
  })

  it('recognises the customer mask too, not just the dealer one', () => {
    expect(maskPhone('+91 ●●●●● ●●775')).toBe('+91 ●●●●● ●●775')
  })
})

// ⚠ HYDRATES — mutates the seed arrays. Keep last in this file.
describe('LIVE MODE — hydrated from the masked views', () => {
  const AT = '2026-03-15T06:30:00.000Z'
  const store = (id, code, dealer) => ({
    id, store_code: code, dealer_id: dealer, seq: 1, name: 'Lakshmi Electronics',
    branch: code, city: 'Bangalore', verified: true, rating: '4.5',
  })
  // The registry view hands over an opaque dealer id and an ALREADY-masked
  // string. There is no column here that could carry a raw number.
  const reg = (code, locationId, dealerId, masked) => ({
    code, location_id: locationId, dealer_id: dealerId, phone_masked: masked,
  })
  const MINE = '+91 98•••• ••42'
  const THEIRS = '+91 98•••• ••77'

  const TABLES = {
    stores: [
      store('lks-ind', 'LKS-IND-01', MY_DEALER_ID),
      store('lks-kor', 'LKS-KOR-02', MY_DEALER_ID),
      store('lks-new', 'LKS-HSR-03', MY_DEALER_ID),
      store('lks-jay', OTHER_DEALER_CODE, OTHER_DEALER_ID),
    ],
    dealer_store_registry: [ // ordered by code, as `.order('code')` returns them
      reg('LKS-HSR-03', 'lks-new', MY_DEALER_ID, MINE),
      reg('LKS-IND-01', 'lks-ind', MY_DEALER_ID, MINE),
      reg(OTHER_DEALER_CODE, 'lks-jay', OTHER_DEALER_ID, THEIRS),
      reg('LKS-KOR-02', 'lks-kor', MY_DEALER_ID, MINE),
    ],
    customers_public: [{
      id: 'cu-1', seq: 1, name: 'Anand Rao', phone: '+91 ●●●●● ●●775',
      cli: 82, band: 'hot', value: 40000, call_count: 2,
      first_seen_at: AT, last_seen_at: AT,
    }],
    calls: [{ id: 'cl-1', seq: 1, bucket: 'today', outcome: 'missed', at: AT }],
    reviews: [{ id: 'rv-1', seq: 1, author_name: 'A', rating: 5, at: AT, platform: 'Google', tags: [] }],
    customer_timeline_events: [], customer_notes: [], call_transcript_turns: [],
    review_replies: [], media_assets: [], post_templates: [],
  }

  /** supabase-js shaped, with a scriptable rpc(). */
  function client({ dealerId = MY_DEALER_ID, verify = null, rpcError = null } = {}) {
    const settle = (payload) => ({ then: (ok, err) => Promise.resolve(payload).then(ok, err) })
    return {
      from: (t) => {
        const q = { select: () => q, order: () => q, ...settle({ data: TABLES[t] ?? [], error: null }) }
        return q
      },
      rpc: (fn, args) => {
        sb.rpcs.push({ fn, args })
        if (rpcError) return settle({ data: null, error: { message: rpcError } })
        if (fn === 'dealer_for_phone') return settle({ data: dealerId, error: null })
        return settle({ data: verify ? [verify(args)] : null, error: null })
      },
    }
  }

  it('hydrates, and the registry it leaves behind holds no phone number at all', async () => {
    sb.client = client()
    await hydrateFromSupabase(sb.client, 2000)

    expect(STORE_CODE_REGISTRY.map(e => e.code)).toEqual([
      'LKS-HSR-03', 'LKS-IND-01', OTHER_DEALER_CODE, 'LKS-KOR-02',
    ])
    for (const e of STORE_CODE_REGISTRY) {
      expect(e).not.toHaveProperty('phone')
      expect(e.dealerId).toBeTruthy()
      expect(String(e.phoneMasked)).toMatch(/[•●]/)
    }
    // Ownership came from comparing opaque ids, never a phone string.
    expect(STORE_CODE_REGISTRY.filter(e => e.mine).map(e => e.code).sort())
      .toEqual(['LKS-HSR-03', 'LKS-IND-01', 'LKS-KOR-02'])
    expect(MAPPED_LOCATIONS.map(l => l.id).sort()).toEqual(['lks-ind', 'lks-kor', 'lks-new'])
    expect(allStoreCodes()).toContain(OTHER_DEALER_CODE) // still wide enough to refuse
  })

  it('produces the SAME four sign-in outcomes with no number to compare', () => {
    expectSignInMatrix()
  })

  it('still refuses a real code belonging to another dealer', () => {
    const res = resolveStoreCode(OTHER_DEALER_CODE, { phone: DEALER_PHONE })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('notMapped')
    expect(res.errorKey).toBe('login.storeCodeNotMappedError')
  })

  it('names the dealer’s outlets by identity, and vouches for no other number', () => {
    expect(storeCodesFor(DEALER_PHONE).sort()).toEqual(['LKS-HSR-03', 'LKS-IND-01', 'LKS-KOR-02'])
    // We hold nothing that could confirm someone else's number offline. Fail closed.
    expect(storeCodesFor('9845077777')).toEqual([])
    expect(storeCodesFor('0000000000')).toEqual([])
  })

  it('hands the access sheet the server’s mask, and maskPhone leaves it intact', () => {
    expect(phoneOnFileFor('LKS-IND-01')).toBe(MINE)
    expect(maskPhone(phoneOnFileFor('LKS-IND-01'))).toBe(MINE)          // not '+91 91•••• ••42'
    expect(phoneOnFileFor(OTHER_DEALER_CODE)).toBe(THEIRS)
    expect(phoneOnFileFor(NO_SUCH_CODE)).toBeNull()
  })

  it('cannot dial a hydrated customer — masked stays, tel: goes', () => {
    const c = CUSTOMERS[0]
    expect(c.masked).toBe('+91 ●●●●● ●●775')  // the screens still show this
    expect(c).not.toHaveProperty('phone')
    expect(customerDialDigits(c)).toBeNull()  // Customers.jsx draws the disabled button
  })

  it('prefers the server for sign-in, and takes its verdict for the other dealer’s code', async () => {
    sb.client = client({
      verify: ({ p_store_code }) => (p_store_code === OTHER_DEALER_CODE
        ? { status: 'notMapped', location_id: null, dealer_id: null, phone_on_file_masked: THEIRS }
        : { status: 'ok', location_id: 'lks-ind', dealer_id: MY_DEALER_ID, phone_on_file_masked: null }),
    })
    sb.rpcs.length = 0

    const ok = await verifyStoreLogin('lksind01', '98450 12342')
    expect(ok.ok).toBe(true)
    expect(ok.store.id).toBe('lks-ind')
    expect(sb.rpcs.at(-1)).toEqual({
      fn: 'verify_store_login',
      args: { p_store_code: 'LKS-IND-01', p_phone: DEALER_PHONE },
    })

    const refused = await verifyStoreLogin(OTHER_DEALER_CODE, DEALER_PHONE)
    expect(refused.reason).toBe('notMapped')
    expect(refused.phoneOnFileMasked).toBe(THEIRS) // already masked — render as-is
  })

  it('never spends a round trip on a typo — format is still the client’s own answer', async () => {
    sb.rpcs.length = 0
    expect((await verifyStoreLogin('hello', DEALER_PHONE)).reason).toBe('format')
    expect(sb.rpcs).toEqual([])
  })

  it('binds the number the server vouched for, so the sync resolver can answer for it', async () => {
    sb.client = client({
      verify: () => ({ status: 'ok', location_id: 'lks-jay', dealer_id: OTHER_DEALER_ID, phone_on_file_masked: null }),
    })
    // The other dealer's store is not in MAPPED_LOCATIONS, so the sign-in itself is
    // still refused — but the identity binding is what we are checking.
    await verifyStoreLogin(OTHER_DEALER_CODE, '9845077777')
    expect(storeCodesFor('9845077777')).toEqual([OTHER_DEALER_CODE])
    // …and it did not quietly hand that dealer OUR stores.
    expect(storeCodesFor('9845077777')).not.toContain('LKS-IND-01')
  })

  it('falls back to the local registry when the RPC fails, rather than letting anyone in', async () => {
    sb.client = client({ rpcError: 'permission denied' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await verifyStoreLogin('LKS-IND-01', DEALER_PHONE)).ok).toBe(true)
    expect((await verifyStoreLogin('LKS-HSR-03', '0000000000')).reason).toBe('notMapped')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('is exactly resolveStoreCode when there is no client at all', async () => {
    sb.client = null
    sb.rpcs.length = 0
    for (const [code, phone] of [['LKS-KOR-02', DEALER_PHONE], [NO_SUCH_CODE, DEALER_PHONE], ['LKS-HSR-03', '0000000000']]) {
      const viaRpc = await verifyStoreLogin(code, phone)
      const local = resolveStoreCode(code, { phone })
      expect(viaRpc.ok).toBe(local.ok)
      expect(viaRpc.reason).toBe(local.reason)
    }
    expect(sb.rpcs).toEqual([])
  })
})
