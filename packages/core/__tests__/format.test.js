// format.js — money on the Indian lakh/crore scale, and timestamps that have to
// survive 18 languages (5 scripts, one RTL).
//
// i18next is initialised in beforeAll because that is the production boot order:
// apps/web/src/main.jsx awaits ./i18n/index.js before any data module loads.
// NOTE (found while writing this): rupees() >= ₹1,000 THROWS if i18next has not
// been initialised — label()'s try/catch guards against t() throwing, but v26's
// pre-init t() returns undefined instead, and scale() then reads .length off it.
// Production is safe because of that boot gate; a second entry point that skips
// i18n would crash on the first price. Not fixed here (format.js is out of scope
// for this change) — reported.
import { describe, it, expect, beforeAll } from 'vitest'
import i18next from 'i18next'
import { LANGUAGES } from '../i18n/languages.js'
import {
  rupees, formatNumber, formatPercent,
  relativeTime, clockTime, calendarDate, dayClock,
  resolveAt, offsetForInstant, nowOffsetMs, activeLocale,
} from '../data/format.js'

beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en: { translation: {} } } })
})

describe('rupees — the K / L / Cr boundaries', () => {
  it('leaves anything under ₹1,000 unscaled, with Indian grouping', () => {
    expect(rupees(0)).toBe('₹0')
    expect(rupees(999)).toBe('₹999')
  })

  it('crosses into K at exactly 1,000', () => {
    expect(rupees(999)).toBe('₹999')
    expect(rupees(1000)).toBe('₹1K')
    expect(rupees(1500)).toBe('₹1.5K')
    expect(rupees(38000)).toBe('₹38K')
  })

  it('crosses into L at exactly 1,00,000', () => {
    expect(rupees(99999)).toBe('₹100K')   // 99.999 → one decimal → 100
    expect(rupees(100000)).toBe('₹1L')
    expect(rupees(160000)).toBe('₹1.6L')
  })

  it('crosses into Cr at exactly 1,00,00,000', () => {
    expect(rupees(9999999)).toBe('₹100L')
    expect(rupees(10000000)).toBe('₹1Cr')
    expect(rupees(15500000)).toBe('₹1.6Cr')
  })

  it('trims a trailing .0 rather than printing "₹38.0K"', () => {
    expect(rupees(38000)).not.toContain('.0')
    expect(rupees(1000000)).toBe('₹10L')
  })

  it('scales by MAGNITUDE, so negatives pick the same unit', () => {
    expect(rupees(-1500)).toBe('₹-1.5K')
    expect(rupees(-200000)).toBe('₹-2L')
  })

  it('renders null as an em dash, never as ₹0', () => {
    expect(rupees(null)).toBe('—')
    expect(rupees(undefined)).toBe('—')
  })

  it('always uses Latin digits, never native numerals, in every language', async () => {
    for (const l of LANGUAGES) {
      await i18next.changeLanguage(l.code)
      expect(rupees(160000), `rupees in ${l.code}`).toMatch(/^₹1\.6/)
      expect(rupees(160000), `native digits leaked in ${l.code}`).toMatch(/[0-9]/)
    }
    await i18next.changeLanguage('en')
  })
})

describe('formatNumber / formatPercent', () => {
  it('groups Indian-style: 1,60,000 not 160,000', () => {
    expect(formatNumber(160000)).toBe('1,60,000')
    expect(formatNumber(1000)).toBe('1,000')
  })

  it('renders null as an em dash', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatPercent(null)).toBe('—')
  })

  it('turns a 0–100 share into a percentage string', () => {
    expect(formatPercent(45)).toMatch(/45\s?%/)
    expect(formatPercent(0)).toMatch(/0\s?%/)
  })
})

describe('offset ↔ instant round-trip', () => {
  it('resolveAt(offsetForInstant(t)) === t for any t', () => {
    for (const t of [0, 1, 1234567890123, Date.now(), Date.now() - 9e10]) {
      expect(resolveAt(offsetForInstant(t))).toBe(t)
    }
  })

  it('nowOffsetMs is ~0 — the session anchor is captured at module load', () => {
    expect(Math.abs(nowOffsetMs())).toBeLessThan(60_000)
  })

  it('resolveAt(null) is null, so a missing timestamp stays missing', () => {
    expect(resolveAt(null)).toBeNull()
    expect(resolveAt(undefined)).toBeNull()
  })
})

describe('time formatters do not throw in any language we ship', () => {
  const now = Date.now()
  const SAMPLES = [now, now - 45e3, now - 12 * 60e3, now - 5 * 3600e3, now - 864e5, now - 20 * 864e5, now - 400 * 864e5, now + 3600e3]

  it('relativeTime returns a non-empty string for every language × every sample', async () => {
    for (const l of LANGUAGES) {
      await i18next.changeLanguage(l.code)
      for (const at of SAMPLES) {
        const out = relativeTime(at)
        expect(typeof out, `${l.code} @ ${at}`).toBe('string')
        expect(out.length, `${l.code} @ ${at}`).toBeGreaterThan(0)
        expect(out, `${l.code} @ ${at}`).not.toBe('—')
      }
    }
    await i18next.changeLanguage('en')
  })

  it('dayClock / clockTime / calendarDate survive every language', async () => {
    for (const l of LANGUAGES) {
      await i18next.changeLanguage(l.code)
      for (const at of SAMPLES) {
        expect(() => dayClock(at), `dayClock ${l.code}`).not.toThrow()
        expect(dayClock(at), `dayClock ${l.code}`).not.toBe('—')
        expect(clockTime(at), `clockTime ${l.code}`).not.toBe('—')
        expect(calendarDate(at), `calendarDate ${l.code}`).not.toBe('—')
      }
    }
    await i18next.changeLanguage('en')
  })

  it('activeLocale tracks the chosen language and is always an -IN/-XX form', async () => {
    for (const l of LANGUAGES.slice(0, 6)) {
      await i18next.changeLanguage(l.code)
      expect(activeLocale()).toBe(l.intl)
    }
    await i18next.changeLanguage('en')
    expect(activeLocale()).toBe('en-IN')
  })

  it('renders null timestamps as an em dash instead of "Invalid Date"', () => {
    expect(relativeTime(null)).toBe('—')
    expect(clockTime(null)).toBe('—')
    expect(calendarDate(null)).toBe('—')
    expect(dayClock(null)).toBe('—')
  })
})

describe('dayClock is calendar-based, not elapsed-based', () => {
  it('shows a bare clock time for today', () => {
    const at = Date.now() - 60e3
    expect(dayClock(at)).toBe(clockTime(at))
    expect(dayClock(at)).not.toContain('·')
  })

  it('names the day for anything before today', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(18, 12, 0, 0)
    const out = dayClock(yesterday.getTime())
    expect(out).toContain('·')
    expect(out.endsWith(clockTime(yesterday.getTime()))).toBe(true)
  })

  it('falls back to a calendar date beyond a week', () => {
    const at = Date.now() - 20 * 864e5
    expect(dayClock(at)).toContain(calendarDate(at))
  })
})
