// Pure display formatters shared across the data layer.
import i18next from 'i18next'
import { getLanguage } from '../i18n/languages.js'

/** The active Intl locale (e.g. "hi-IN"), driven by the chosen language. */
export function activeLocale() {
  return getLanguage(i18next.resolvedLanguage || i18next.language || 'en').intl
}

const label = (key, fallback) => {
  try { return i18next.t(`num.${key}`, { defaultValue: fallback }) } catch { return fallback }
}
// 1.6 → "1.6", 38.0 → "38"
const trim = (v) => String(Number(v.toFixed(1)))

// Abbreviations sit tight ("₹1.6L"); real words need a space ("₹1.6 लाख").
// Languages differ: Bengali has no short form for লাখ, Marathi uses लाख, English uses "L".
const scale = (value, key, fallback) => {
  const word = label(key, fallback)
  return `₹${trim(value)}${word.length > 2 ? ' ' : ''}${word}`
}

/**
 * Format a rupee amount using the Indian lakh/crore scale.
 *
 * We deliberately do NOT use Intl compact notation per-locale: ta-IN renders ₹1.6L as
 * "₹160.0ஆ" (thousand scale) and bn-IN/mr-IN emit native numerals — both wrong for
 * money in an Indian business app. Instead we always use the pan-India K/L/Cr scale with
 * Latin digits, and localise only the scale word.
 */
export function rupees(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e7) return scale(n / 1e7, 'crore', 'Cr')
  if (abs >= 1e5) return scale(n / 1e5, 'lakh', 'L')
  if (abs >= 1e3) return scale(n / 1e3, 'thousand', 'K')
  return `₹${formatNumber(n)}`
}

/** Plain number with Indian digit grouping (1,60,000) in Latin digits. */
export function formatNumber(n) {
  if (n == null) return '—'
  try { return new Intl.NumberFormat('en-IN').format(n) } catch { return String(n) }
}

/** Locale-aware percentage. */
export function formatPercent(n) {
  if (n == null) return '—'
  try { return new Intl.NumberFormat(activeLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(n / 100) } catch { return `${n}%` }
}

// ============================================================
// TIME
//
// Seed records carry a relative OFFSET (`atOffsetMs`), never a frozen string like
// "11:48 AM". The domain getters resolve each offset against SESSION_START to a real
// epoch-ms timestamp; the UI formats that timestamp at RENDER time with the helpers
// below. That split is what makes timestamps localise — a string baked in the seed
// would freeze at boot and stay English forever.
//
// Unlike money (see rupees() above), dates ARE a job for Intl: RelativeTimeFormat and
// DateTimeFormat carry correct CLDR data for every language we ship. The one thing we
// override is the numbering system — ur-IN/bn-IN/mr-IN default to native digits
// (۱۱:۴۸ / ১১:৪৮ / ११:४८), so we pin `-u-nu-latn` to keep digits Latin app-wide.
// ============================================================

/**
 * The instant every seed offset is measured from. Captured once at module load so all
 * records stay mutually consistent (a -12 min call is always 6 min after a -18 min one)
 * and so a record's timestamp never slides while the app is open. The *relative*
 * rendering stays live because relativeTime() re-measures against Date.now() each call.
 */
const SESSION_START = Date.now()

/** Resolve a seed offset (e.g. -12 * 60 * 1000) to a real epoch-ms timestamp. */
export function resolveAt(offsetMs) {
  return offsetMs == null ? null : SESSION_START + offsetMs
}

/**
 * The offset for a REAL instant — the full inverse of resolveAt().
 *
 * `resolveAt(offsetForInstant(t)) === t` for any t, which is what makes it safe to store a
 * record's absolute epoch time and rebuild its offset later.
 *
 * That round-trip is the whole reason this exists. SESSION_START is captured fresh on every
 * page load, so an offset is only meaningful WITHIN one session: persist `atOffsetMs` to
 * localStorage and a note written five minutes ago reappears five minutes after the NEW
 * boot — drifting later every reload until it claims to be from the future. Persist the
 * absolute instant and pass it back through here instead, and it stays put.
 * See addCustomerNote() / the note store in customers.js.
 */
export function offsetForInstant(atMs) {
  return atMs - SESSION_START
}

/**
 * The offset for RIGHT NOW — for records created during the session rather than seeded
 * (a note the manager just typed).
 *
 * Keeps SESSION_START private while letting a new record carry the same `atOffsetMs`
 * shape every seeded one has, so nothing downstream has to know which is which.
 */
export function nowOffsetMs() {
  return offsetForInstant(Date.now())
}

/** Force Latin digits — the app never renders native numerals (see note above). */
const latn = (locale) => (locale.includes('-u-nu-') ? locale : `${locale}-u-nu-latn`)

const MS = { second: 1000, minute: 60e3, hour: 3600e3, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }
// Largest unit first: the biggest unit the gap fits into is the one a human would use,
// so a 12-minute-old call reads "12 minutes ago" and a 32-day-old one "last month".
const UNITS = [
  ['year', MS.year],
  ['month', MS.month],
  ['week', MS.week],
  ['day', MS.day],
  ['hour', MS.hour],
  ['minute', MS.minute],
  ['second', MS.second],
]

function rtf() {
  return new Intl.RelativeTimeFormat(latn(activeLocale()), { numeric: 'auto' })
}

/**
 * "12 minutes ago" / "yesterday" / "now" — localised, in every language we ship.
 * numeric:'auto' is what buys the idiomatic forms (en "yesterday", hi "कल", ta "நேற்று")
 * instead of a wooden "1 day ago".
 */
export function relativeTime(at, now = Date.now()) {
  if (at == null) return '—'
  const diff = at - now
  try {
    const f = rtf()
    for (const [unit, ms] of UNITS) {
      if (Math.abs(diff) >= ms) return f.format(Math.round(diff / ms), unit)
    }
    return f.format(0, 'second') // < 1s → "now"
  } catch {
    return '—'
  }
}

/** Clock time only: "11:48 am". */
export function clockTime(at) {
  if (at == null) return '—'
  try {
    return new Intl.DateTimeFormat(latn(activeLocale()), { hour: 'numeric', minute: '2-digit' }).format(at)
  } catch {
    return '—'
  }
}

/** Calendar date, no year: "16 Jul". */
export function calendarDate(at) {
  if (at == null) return '—'
  try {
    return new Intl.DateTimeFormat(latn(activeLocale()), { day: 'numeric', month: 'short' }).format(at)
  } catch {
    return '—'
  }
}

/** Whole-calendar-days between two instants (−1 = the previous calendar day). */
function calendarDayDelta(at, now) {
  const a = new Date(at); a.setHours(0, 0, 0, 0)
  const b = new Date(now); b.setHours(0, 0, 0, 0)
  return Math.round((a - b) / MS.day)
}

/**
 * A timestamp a human can place: "11:48 am" today, "yesterday · 6:12 pm" within the
 * week, "1 Jul · 12:00 am" beyond it.
 *
 * Deliberately calendar-based, not elapsed-based: a call at 6 pm yesterday is
 * "yesterday" whether you open the app at 9 am or 11 pm. relativeTime() would call the
 * same instant "18 hours ago" — right for a feed, wrong for a wall-clock label.
 */
export function dayClock(at) {
  if (at == null) return '—'
  const delta = calendarDayDelta(at, Date.now())
  if (delta === 0) return clockTime(at)
  const day = Math.abs(delta) <= 6
    ? (() => { try { return rtf().format(delta, 'day') } catch { return calendarDate(at) } })()
    : calendarDate(at)
  return `${day} · ${clockTime(at)}`
}
