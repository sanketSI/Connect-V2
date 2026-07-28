// ============================================================
// LEADS — one list, every source, one lifecycle.
//
// The MVP asks for "leads from all the sources (call, form, walk-in)" with a five-state
// lifecycle. Until now the app had two lists and a three-state one: Calls (an event log)
// and Customers (a book of people), with open | converted | expired between them. A
// walk-in was a customer, a missed call was a call, and neither could tell you where the
// lead had got to.
//
// A LEAD IS A PERSON WITH AN ENQUIRY, not a ring of the phone. The seed bears this out —
// no customer has more than one call record, and a caller who rang three times is one
// record carrying `repeats: 3`. So one call record is one lead, and form and walk-in
// customers are leads in their own right. Call-sourced customers are NOT emitted twice:
// their call already represents them.
//
// STATUS IS DERIVED, NOT MIGRATED. The seed still holds legacy 'open' values, and
// rewriting several hundred of them by hand is exactly the kind of edit that silently
// mangles a fixture. leadStatusOf() reads both vocabularies instead, so an untouched
// record lands in the right state and a manager's explicit choice always wins.
// ============================================================
import { getCalls, getCallById, setLeadStatus as setCallLeadStatus } from './calls.js'
import { getCustomers, customerSourceType } from './customers.js'
import { LEAD_STATUSES, LEAD_STATUS_IDS, LEAD_SOURCES } from './leadStatus.js'

const KNOWN = new Set(LEAD_STATUS_IDS)


/**
 * Where a record sits in the lifecycle.
 *
 * Reads the new vocabulary and the legacy one, in that order of authority:
 *   1. 'expired' means expired in both.
 *   2. 'converted' + a review already asked for IS 'review requested' — the request is
 *      the later step, and the app only lets you ask a converted customer, so the two
 *      can never contradict each other.
 *   3. an explicit new-vocabulary value is the manager's own last word.
 *   4. anything else ('open', or nothing at all) has not been actioned: a call the shop
 *      ANSWERED was contacted at the moment it was answered; one it missed was not.
 */
export function leadStatusOf(rec) {
  if (!rec) return null
  const s = rec.leadStatus
  if (s === 'expired') return 'expired'
  if (s === 'converted') return rec.reviewLinkSent || rec.reviewSent ? 'review_requested' : 'converted'
  if (KNOWN.has(s)) return s
  return rec.outcome === 'attended' ? 'contacted' : 'missed'
}

/** A call record, as a lead. */
function fromCall(call) {
  return {
    id: `call:${call.id}`,
    recordId: call.id,
    recordKind: 'call',
    source: 'call',
    storeId: call.storeId,
    status: leadStatusOf(call),
    customerId: call.customerId ?? null,
    name: null, // a caller is anonymous until the book names them
    masked: call.masked,
    value: call.estValue ?? 0,
    cli: call.cli ?? null,
    intent: call.intent ?? null,
    category: call.category,
    categoryKey: call.categoryKey,
    atMs: call.atMs,
    repeats: call.repeats ?? 1,
    outcome: call.outcome,
  }
}

/** A form or walk-in customer, as a lead. */
function fromCustomer(cu, source) {
  return {
    id: `cust:${cu.id}`,
    recordId: cu.id,
    recordKind: 'customer',
    source,
    storeId: cu.storeId,
    status: leadStatusOf(cu),
    customerId: cu.id,
    name: cu.name ?? null,
    masked: cu.masked,
    value: cu.value ?? 0,
    cli: cu.cli ?? null,
    intent: null,
    category: cu.category,
    categoryKey: cu.categoryKey,
    atMs: cu.firstSeenAtMs ?? cu.lastSeenAtMs ?? 0,
    repeats: 1,
    outcome: null,
  }
}

/**
 * Every lead, newest first.
 *
 * `win` is passed straight to getCalls so the call side honours the same window the rest
 * of the app uses. Form and walk-in leads carry no call, so they are not windowed — a
 * form nobody answered does not stop being a lead because it is four days old.
 */
export function getLeads({ storeId, source, status, win = 'all' } = {}) {
  const calls = getCalls(win, { storeId }).map(fromCall)
  const others = getCustomers(storeId)
    .map(cu => [cu, customerSourceType(cu)])
    .filter(([, src]) => src === 'form' || src === 'walk_in')
    .map(([cu, src]) => fromCustomer(cu, src))

  return [...calls, ...others]
    .filter(l => (!source || source === 'all' || l.source === source))
    .filter(l => (!status || status === 'all' || l.status === status))
    .sort((a, b) => (b.atMs || 0) - (a.atMs || 0))
}

/** How many leads sit in each status, for the segment badges. */
export function leadCounts(opts = {}) {
  const all = getLeads({ ...opts, status: 'all' })
  const out = { total: all.length }
  for (const id of LEAD_STATUS_IDS) out[id] = 0
  for (const l of all) out[l.status] = (out[l.status] || 0) + 1
  return out
}

/**
 * Move a lead along the lifecycle.
 *
 * NOT called setLeadStatus: calls.js already owns that name for the call-level mutator
 * that takes record IDs. Two exports with one name make the core barrel silently drop
 * one of them — which is exactly what happened, and the build caught it.
 *
 * Writes through to whichever record backs it, so the Calls-side mutator (and its
 * analytics, and its Supabase mirror) still runs for call leads rather than being
 * bypassed by a second write path.
 */
export function updateLeadStatus(lead, status) {
  if (!KNOWN.has(status)) throw new Error(`setLeadStatus: invalid status "${status}"`)
  if (!lead) return null
  if (lead.recordKind === 'call') {
    setCallLeadStatus([lead.recordId], status)
    return getCallById(lead.recordId)
  }
  const cu = getCustomers().find(c => c.id === lead.recordId)
  if (cu) cu.leadStatus = status
  return cu ?? null
}
