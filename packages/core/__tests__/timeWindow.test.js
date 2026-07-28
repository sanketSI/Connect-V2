// timeWindow.js — the window every windowed selector takes. If this drifts, every
// number on every screen drifts with it, silently.
import { describe, it, expect } from 'vitest'
import {
  TIME_WINDOWS, DEFAULT_CALL_WINDOW,
  resolveWindow, inWindow, previousWindow, windowDays,
} from '../data/timeWindow.js'

const DAY = 864e5
// A fixed "now" so calendar maths is deterministic: 15 Mar 2026, 12:00 local.
const NOW = new Date(2026, 2, 15, 12, 0, 0, 0).getTime()

describe('resolveWindow — presets', () => {
  it('resolves every rolling preset to now-Ndays … now', () => {
    for (const w of TIME_WINDOWS.filter(w => w.days)) {
      const r = resolveWindow(w.id, NOW)
      expect(r.id).toBe(w.id)
      expect(r.endMs).toBe(NOW)
      expect(r.startMs).toBe(NOW - w.days * DAY)
    }
  })

  it('covers the four documented rolling ids', () => {
    expect(TIME_WINDOWS.filter(w => w.days).map(w => w.id))
      .toEqual(['last7', 'last30', 'last90', 'last365'])
  })

  it("'all' is unbounded in both directions", () => {
    expect(resolveWindow('all', NOW)).toEqual({ id: 'all', startMs: -Infinity, endMs: Infinity })
  })

  it("'last24h' — the default the call counters run on — is exactly one day", () => {
    expect(DEFAULT_CALL_WINDOW).toBe('last24h')
    const r = resolveWindow(DEFAULT_CALL_WINDOW, NOW)
    expect(r.id).toBe('last24h')
    expect(r.endMs - r.startMs).toBe(DAY)
    expect(r.endMs).toBe(NOW)
  })

  it("'prevMonth' spans the whole previous calendar month and stops 1ms before this one", () => {
    const r = resolveWindow('prevMonth', NOW)
    expect(r.id).toBe('prevMonth')
    const start = new Date(r.startMs)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(1)   // February
    expect(start.getDate()).toBe(1)
    expect(start.getHours()).toBe(0)
    // Ends the instant before 1 March 00:00.
    expect(r.endMs).toBe(new Date(2026, 2, 1, 0, 0, 0, 0).getTime() - 1)
  })

  it("'prevMonth' rolls the year back across a January boundary", () => {
    const jan = new Date(2026, 0, 9, 12, 0, 0, 0).getTime()
    const start = new Date(resolveWindow('prevMonth', jan).startMs)
    expect(start.getFullYear()).toBe(2025)
    expect(start.getMonth()).toBe(11)  // December
  })

  it('null / undefined mean all time (the documented default)', () => {
    expect(resolveWindow(null, NOW).id).toBe('all')
    expect(resolveWindow(undefined, NOW).id).toBe('all')
    expect(resolveWindow(undefined, NOW).startMs).toBe(-Infinity)
  })
})

describe('resolveWindow — object forms', () => {
  it('passes a custom { startMs, endMs } straight through', () => {
    const r = resolveWindow({ startMs: 1000, endMs: 2000 }, NOW)
    expect(r).toEqual({ id: 'custom', startMs: 1000, endMs: 2000 })
  })

  it('leaves an omitted bound open-ended rather than guessing', () => {
    expect(resolveWindow({ startMs: 1000 }, NOW).endMs).toBe(Infinity)
    expect(resolveWindow({ endMs: 2000 }, NOW).startMs).toBe(-Infinity)
  })

  it('honours a caller-supplied id on a custom range', () => {
    expect(resolveWindow({ id: 'previous', startMs: 1, endMs: 2 }, NOW).id).toBe('previous')
  })

  it('{ days: N } is a rolling N-day window ending now', () => {
    const r = resolveWindow({ days: 45 }, NOW)
    expect(r.startMs).toBe(NOW - 45 * DAY)
    expect(r.endMs).toBe(NOW)
    expect(r.id).toBe('custom')
  })

  it('{ hours: N } is a rolling N-hour window ending now', () => {
    const r = resolveWindow({ hours: 6 }, NOW)
    expect(r.endMs - r.startMs).toBe(6 * 3600e3)
  })

  it('{ id } alone delegates to the preset of that name', () => {
    expect(resolveWindow({ id: 'last7' }, NOW)).toEqual(resolveWindow('last7', NOW))
  })
})

describe('resolveWindow — failure is loud, never silent', () => {
  it('THROWS on an unknown window id instead of returning all-time', () => {
    expect(() => resolveWindow('last42', NOW)).toThrow(/unknown window id "last42"/)
  })

  it("throws on 'custom' as a bare string — it carries no bounds", () => {
    // 'custom' is in TIME_WINDOWS but has no `days`, so it is not a resolvable preset.
    expect(() => resolveWindow('custom', NOW)).toThrow(/unknown window id/)
  })

  it('throws on an object with nothing resolvable in it', () => {
    expect(() => resolveWindow({}, NOW)).toThrow(/unrecognised window/)
  })

  it('throws on a wholly wrong type', () => {
    expect(() => resolveWindow(42, NOW)).toThrow(/unrecognised window/)
  })
})

describe('inWindow', () => {
  it('is inclusive at both ends', () => {
    const w = { startMs: 100, endMs: 200 }
    expect(inWindow(100, w, NOW)).toBe(true)
    expect(inWindow(200, w, NOW)).toBe(true)
    expect(inWindow(99, w, NOW)).toBe(false)
    expect(inWindow(201, w, NOW)).toBe(false)
  })

  it('is false for a null timestamp, never a throw', () => {
    expect(inWindow(null, 'last7', NOW)).toBe(false)
  })

  it('accepts the same shapes resolveWindow does', () => {
    expect(inWindow(NOW - DAY, 'last7', NOW)).toBe(true)
    expect(inWindow(NOW - 30 * DAY, { days: 7 }, NOW)).toBe(false)
  })
})

describe('previousWindow', () => {
  it('is the same-length window immediately before, touching at the seam', () => {
    const cur = resolveWindow('last7', NOW)
    const prev = previousWindow('last7', NOW)
    expect(prev.id).toBe('previous')
    expect(prev.endMs).toBe(cur.startMs)                       // no gap
    expect(prev.endMs - prev.startMs).toBe(cur.endMs - cur.startMs) // same span
    expect(prev.startMs).toBe(NOW - 14 * DAY)
  })

  it('returns null for an unbounded window — there is no "before" all time', () => {
    expect(previousWindow('all', NOW)).toBeNull()
    expect(previousWindow({ startMs: 1 }, NOW)).toBeNull()
  })

  it('works on a custom range too', () => {
    const prev = previousWindow({ startMs: 1000, endMs: 3000 }, NOW)
    expect(prev).toEqual({ id: 'previous', startMs: -1000, endMs: 1000 })
  })

  it('the previous window never overlaps the current one', () => {
    const cur = resolveWindow('last30', NOW)
    const prev = previousWindow('last30', NOW)
    expect(prev.endMs).toBeLessThanOrEqual(cur.startMs)
  })
})

describe('windowDays', () => {
  it('reports the preset lengths exactly', () => {
    expect(windowDays('last7', NOW)).toBe(7)
    expect(windowDays('last30', NOW)).toBe(30)
    expect(windowDays('last365', NOW)).toBe(365)
    expect(windowDays('last24h', NOW)).toBe(1)
  })

  it('is Infinity for all time, so per-day rates come out null rather than 0', () => {
    expect(windowDays('all', NOW)).toBe(Infinity)
  })

  it('measures a custom range', () => {
    expect(windowDays({ startMs: NOW - 3 * DAY, endMs: NOW }, NOW)).toBe(3)
  })
})
