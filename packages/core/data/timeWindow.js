// ============================================================
// TIME WINDOWS — the range every windowed selector takes.
//
// Shared by calls and reviews so "last 30 days" means one thing in this app. Matches the
// set Nova offers: last 7 / 30 / 90 / 365 days, previous calendar month, all time, plus a
// custom start/end range.
//
// Windows are resolved against Date.now(), NOT against the seed's session anchor: a
// window is a question the user asks now ("what happened in the last 7 days?"), while
// `atOffsetMs` is a property of a record. resolveAt() bridges the two, and because the
// anchor is captured at module load the two clocks are milliseconds apart anyway.
//
// Every selector that takes a window accepts the same shapes — see resolveWindow().
// ============================================================

/**
 * The preset windows, in the order a picker should list them.
 *
 * `label` is the English fallback, `labelKey` the catalog key — the UI renders
 * `t(w.labelKey, { defaultValue: w.label })`. Never resolved here: this module is read at
 * module scope, so an i18next.t() call would freeze at boot (see the seed's i18n contract).
 */
export const TIME_WINDOWS = [
  { id: 'last7', label: 'Last 7 days', labelKey: 'window.last7', days: 7 },
  { id: 'last30', label: 'Last 30 days', labelKey: 'window.last30', days: 30 },
  { id: 'last90', label: 'Last 90 days', labelKey: 'window.last90', days: 90 },
  { id: 'last365', label: 'Last 365 days', labelKey: 'window.last365', days: 365 },
  { id: 'prevMonth', label: 'Previous month', labelKey: 'window.prevMonth' },
  { id: 'all', label: 'All time', labelKey: 'window.all' },
  { id: 'custom', label: 'Custom range', labelKey: 'window.custom' },
]

/** 'last24h' is not in the picker — it is what the day-to-day call counters run on. */
export const DEFAULT_CALL_WINDOW = 'last24h'

const DAY = 864e5

/** Start of the previous calendar month, and the last instant of it. */
function previousMonth(now) {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1, 0, 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime() - 1
  return { startMs: start.getTime(), endMs: end }
}

/**
 * Normalise anything a caller might pass as a window into `{ id, startMs, endMs }`.
 *
 * Accepts:
 *   undefined / null      → all time
 *   'last7' | 'last30' | 'last90' | 'last365' | 'prevMonth' | 'all' | 'last24h'
 *   { id, startMs, endMs } → custom range (either bound may be omitted → open-ended)
 *   { days: N } / { hours: N } → a rolling window of that length
 *
 * Open ends are ±Infinity so `at >= startMs && at <= endMs` is the only test anyone needs.
 */
export function resolveWindow(win, now = Date.now()) {
  if (win == null) return { id: 'all', startMs: -Infinity, endMs: Infinity }

  if (typeof win === 'string') {
    if (win === 'all') return { id: 'all', startMs: -Infinity, endMs: Infinity }
    if (win === 'last24h') return { id: 'last24h', startMs: now - DAY, endMs: now }
    if (win === 'prevMonth') return { id: 'prevMonth', ...previousMonth(now) }
    const preset = TIME_WINDOWS.find(w => w.id === win && w.days)
    if (preset) return { id: preset.id, startMs: now - preset.days * DAY, endMs: now }
    // An unknown id is a caller bug, not data to guess at — fail loudly rather than
    // silently returning "all time" and quietly inflating every number on the screen.
    throw new Error(`resolveWindow: unknown window id "${win}"`)
  }

  if (typeof win === 'object') {
    if (win.days != null) return { id: win.id || 'custom', startMs: now - win.days * DAY, endMs: now }
    if (win.hours != null) return { id: win.id || 'custom', startMs: now - win.hours * 3600e3, endMs: now }
    if (win.startMs != null || win.endMs != null) {
      return {
        id: win.id || 'custom',
        startMs: win.startMs ?? -Infinity,
        endMs: win.endMs ?? Infinity,
      }
    }
    if (win.id) return resolveWindow(win.id, now)
  }

  throw new Error('resolveWindow: unrecognised window')
}

/** Is a timestamp inside a window? `win` is anything resolveWindow() accepts. */
export function inWindow(atMs, win, now = Date.now()) {
  if (atMs == null) return false
  const { startMs, endMs } = resolveWindow(win, now)
  return atMs >= startMs && atMs <= endMs
}

/**
 * The window of the same length immediately BEFORE this one — what "vs previous period"
 * compares against. Returns null for an unbounded window, where there is no "before".
 */
export function previousWindow(win, now = Date.now()) {
  const { startMs, endMs } = resolveWindow(win, now)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  const span = endMs - startMs
  return { id: 'previous', startMs: startMs - span, endMs: startMs }
}

/** Length of a window in days (Infinity for all-time). Used for per-day/per-week rates. */
export function windowDays(win, now = Date.now()) {
  const { startMs, endMs } = resolveWindow(win, now)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Infinity
  return (endMs - startMs) / DAY
}
