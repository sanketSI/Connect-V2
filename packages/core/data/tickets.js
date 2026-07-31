// ============================================================
// SUPPORT TICKETS — the store manager's way to raise a concern.
//
// PM feedback 3: "In the profile section, raise a ticket flow exactly the same as nova so
// that if a store manager wants to raise some concern or contact, they can do so via
// ticketing system." The Nova form is specified in the brief's screenshot: Title (max
// 100), Description (max 500), one optional attachment, Cancel / Raise Ticket.
//
// A RAISED TICKET IS THE MANAGER'S OWN WRITING, so it persists through the core storage
// seam exactly as customer notes and review replies do. A prototype that eats a support
// request on refresh teaches the manager that raising one does nothing — which is the
// precise opposite of what a support channel is for.
//
// NO BACKEND MIRROR. There is no tickets table (see supabase/migrations) and inventing a
// client write to one would fail permission-denied. Local + storage is the honest extent
// of it, and raisedTicket() says so in its return rather than the UI claiming delivery.
// ============================================================
import { storage } from '../storage.js'
import { emitChange } from '../events.js'
import { getCurrentUser } from './session.js'
import { offsetForInstant } from './format.js'

const TICKETS_KEY = 'connect-support-tickets'

/** The ceilings the Nova form prints under each field. */
export const TICKET_TITLE_MAX = 100
export const TICKET_BODY_MAX = 500

/** What an attachment may be, printed under the upload zone exactly as the brief shows. */
export const TICKET_ATTACHMENT_HINT = 'Supported formats: Images, PDF, DOC, DOCX, TXT (Max 10MB)'

let ticketSeq = 0

function readStored() {
  try {
    const raw = storage.getItem(TICKETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Every ticket this manager has raised, newest first.
 *
 * Rebuilt against THIS session's clock the way notes are: stored as an absolute instant,
 * read back with an offset, so a ticket does not drift later on every reload.
 */
export function getTickets(storeId) {
  return readStored()
    .filter(x => x && typeof x.title === 'string' && Number.isFinite(x.atMs))
    .filter(x => !storeId || x.storeId === storeId)
    .map(x => ({ ...x, atOffsetMs: offsetForInstant(x.atMs) }))
    .sort((a, b) => b.atMs - a.atMs)
}

/**
 * What is wrong with this draft — the same answer on both platforms.
 *
 * Returns `{ ok, missing: [field], tooLong: [field] }`. Trimmed before measuring, because
 * a title of eleven spaces is not a title.
 */
export function validateTicket({ title, body } = {}) {
  const t = String(title ?? '').trim()
  const b = String(body ?? '').trim()
  const missing = []
  const tooLong = []
  if (!t) missing.push('title')
  if (!b) missing.push('body')
  if (t.length > TICKET_TITLE_MAX) tooLong.push('title')
  if (b.length > TICKET_BODY_MAX) tooLong.push('body')
  return { ok: !missing.length && !tooLong.length, missing, tooLong }
}

/**
 * Raise one. Refuses an invalid draft rather than storing a half-ticket.
 *
 * `attachment` is a NAME ONLY — this build has no upload service, and storing a local
 * file URI that will not resolve on the next launch would be worse than recording that a
 * file was chosen. The UI says as much.
 *
 * @returns the stored ticket, or null when the draft does not validate.
 */
export function raiseTicket({ title, body, attachment, storeId } = {}) {
  if (!validateTicket({ title, body }).ok) return null

  const atMs = Date.now()
  const ticket = {
    id: `tkt-${atMs.toString(36)}-${ticketSeq++}`,
    title: String(title).trim(),
    body: String(body).trim(),
    attachment: attachment ? String(attachment) : null,
    storeId: storeId || null,
    author: getCurrentUser().name,
    status: 'open',
    atMs,
  }

  storage.setItem(TICKETS_KEY, JSON.stringify([...readStored(), ticket]))
  emitChange()
  return ticket
}
