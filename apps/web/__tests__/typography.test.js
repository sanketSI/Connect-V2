import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ============================================================
// The 4pt vertical rhythm, asserted.
//
// The scale's whole promise is that any two text blocks stack onto the same 8dp/4dp
// padding grid. That holds only while every line box is an absolute multiple of 4 —
// and it is one careless `line-height: 1.4` away from being false again, which is
// exactly the state this replaced (38.08px, 22.05px, 17.03px).
//
// Ratios are rejected outright, not rounded: `1.5` on a 16px face happens to give 24,
// but it silently becomes 21 the moment someone changes the size. The unit is the
// contract.
// ============================================================
const CSS = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8')

/** Every `.m-*` type class and the declarations in its block. */
function typeRoles() {
  const roles = []
  const re = /^\.(m-[A-Za-z0-9]+)\s*\{([^}]*)\}/gm
  let m
  while ((m = re.exec(CSS))) {
    const [, name, body] = m
    if (!/font-size/.test(body)) continue // m-tabular etc. carry no metrics
    roles.push({
      name,
      size: (body.match(/font-size:\s*([^;]+)/) || [])[1]?.trim(),
      lineHeight: (body.match(/line-height:\s*([^;]+)/) || [])[1]?.trim(),
      tracking: (body.match(/letter-spacing:\s*([^;]+)/) || [])[1]?.trim(),
    })
  }
  return roles
}

describe('type scale — 4pt vertical rhythm', () => {
  const roles = typeRoles()

  it('finds the whole scale', () => {
    expect(roles.length).toBeGreaterThanOrEqual(10)
    expect(roles.map(r => r.name)).toContain('m-largeTitle')
    expect(roles.map(r => r.name)).toContain('m-micro')
  })

  it.each(typeRoles())('$name states line-height in px, never a ratio', ({ lineHeight }) => {
    expect(lineHeight).toBeDefined()
    expect(lineHeight).toMatch(/^\d+px$/)
  })

  it.each(typeRoles())('$name lands on the 4px grid', ({ lineHeight }) => {
    expect(parseInt(lineHeight, 10) % 4).toBe(0)
  })

  it.each(typeRoles())('$name sets font-size in px', ({ size }) => {
    expect(size).toMatch(/^\d+px$/)
  })

  // `em` tracking re-derives per size, so a shared token drifts between roles.
  it.each(typeRoles().filter(r => r.tracking))('$name tracks in px, not em', ({ tracking }) => {
    expect(tracking).toMatch(/^-?\d*\.?\d+px$/)
  })

  // The floor is a deliberate accessibility decision for 45+ owners reading
  // one-handed in a bright shop: 13px for content text, with ONE 12px semibold
  // exception for tag text inside fixed-height badges.
  it('holds the 13px content-text floor, with m-micro the only exception', () => {
    const belowFloor = roles.filter(r => parseInt(r.size, 10) < 13)
    expect(belowFloor.map(r => r.name)).toEqual(['m-micro'])
    expect(parseInt(roles.find(r => r.name === 'm-micro').size, 10)).toBe(12)
  })

  // An inline link that re-flows its own line box breaks the rhythm mid-paragraph,
  // so link and paragraph metrics have to be the same object, not merely similar.
  it('gives paragraph and inline-link text identical metrics', () => {
    const body = roles.find(r => r.name === 'm-body')
    expect(body.size).toBe('16px')
    expect(body.lineHeight).toBe('24px')
  })
})

// A grid-correct stylesheet is only half the guarantee: a Tailwind `leading-*` utility
// in the markup overrides it per element. The ratio-named steps are the dangerous ones
// — `leading-snug` on m-callout computed 19.25px, `leading-tight` on m-caption 16.25px,
// both invisible in review and both off-grid. The NUMBERED steps (leading-4 = 16px,
// leading-6 = 24px …) are already 4px multiples, so they stay allowed.
describe('type scale — no ratio line-heights in the markup', () => {
  const RATIO_LEADING = /\bleading-(none|tight|snug|normal|relaxed|loose)\b/

  const sources = (() => {
    const root = fileURLToPath(new URL('../src', import.meta.url))
    const out = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.jsx?$/.test(entry)) out.push([full, readFileSync(full, 'utf8')])
      }
    }
    walk(root)
    return out
  })()

  it('reads the whole source tree', () => {
    expect(sources.length).toBeGreaterThan(10)
  })

  it('uses no ratio-named leading utility in any className', () => {
    const offenders = []
    for (const [file, src] of sources) {
      src.split('\n').forEach((line, i) => {
        // className strings only — the rule is discussed by name in comments.
        if (/^\s*(\/\/|\*)/.test(line)) return
        if (RATIO_LEADING.test(line)) offenders.push(`${file.split('/src/')[1]}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
