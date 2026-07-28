#!/usr/bin/env node
// i18n coverage gate.
//
// The bug this exists to prevent: a screen renders hardcoded English, or a catalog
// is missing a key so i18next silently falls back to English. Both look like
// "I switched to Hindi but the cards are still English" — which is exactly the
// failure we shipped once already. Fail the build instead of failing the user.
//
//   node scripts/i18n-lint.mjs          → report + exit 1 on any error
//   node scripts/i18n-lint.mjs --warn   → report only, always exit 0
//
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOC = path.join(ROOT, 'packages/core/locales')
// Keys are referenced from BOTH sides of the workspace split: screens/components
// in apps/web, and the `*Key` defaults that live in core (seed data, domain modules).
const SRC_DIRS = [path.join(ROOT, 'apps/web/src'), path.join(ROOT, 'packages/core')]
const WARN_ONLY = process.argv.includes('--warn')

const flatten = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k
    v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, key, out) : (out[key] = v)
  }
  return out
}
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  if (d.name === 'node_modules') return []
  const f = path.join(dir, d.name)
  return d.isDirectory() ? walk(f) : /\.(jsx?|tsx?)$/.test(f) ? [f] : []
})

const en = flatten(JSON.parse(fs.readFileSync(path.join(LOC, 'en/common.json'), 'utf8')))
// Directories only — LOC also holds the generated index.js loader map.
const codes = fs.readdirSync(LOC, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'en').map(d => d.name).sort()
const errors = []
const warnings = []

// ── 1. Every t('…') / <Trans i18nKey="…"> in the source resolves in the English catalog.
// A key with no catalog entry renders as the raw key string on screen.
const files = SRC_DIRS.flatMap(walk).filter(f => !f.includes('/locales/'))
const referenced = new Set()
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = path.relative(ROOT, f)
  for (const m of src.matchAll(/\bt\(\s*'([a-z][\w.]*\.[\w]+)'/gi)) referenced.add(m[1])
  for (const m of src.matchAll(/i18nKey=["']([\w.]+)["']/g)) referenced.add(m[1])
  // labelKey: 'x.y' — the module-level-constant pattern the screens use
  for (const m of src.matchAll(/labelKey:\s*'([\w.]+)'/g)) referenced.add(m[1])
  for (const key of referenced) {
    if (!(key in en) && !(`${key}_other` in en)) {
      errors.push(`${rel}: t('${key}') has no entry in en/common.json`)
      referenced.delete(key)
    }
  }
}

// ── 2. Every catalog covers every English key. A gap here = silent English fallback.
for (const code of codes) {
  const p = path.join(LOC, code, 'common.json')
  if (!fs.existsSync(p)) { errors.push(`${code}: catalog missing`); continue }
  const cat = flatten(JSON.parse(fs.readFileSync(p, 'utf8')))
  const missing = Object.keys(en).filter(k => !(k in cat))
  const extra = Object.keys(cat).filter(k => !(k in en))
  if (missing.length) errors.push(`${code}: ${missing.length} key(s) missing → will render English: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`)
  if (extra.length) warnings.push(`${code}: ${extra.length} stale key(s) not in en: ${extra.slice(0, 4).join(', ')}${extra.length > 4 ? ' …' : ''}`)

  // Interpolation placeholders must survive translation, or the value renders blank.
  const vars = s => (String(s).match(/\{\{\s*(\w+)/g) || []).map(v => v.slice(2).trim()).sort().join(',')
  const broken = Object.keys(en).filter(k => k in cat && vars(cat[k]) !== vars(en[k]))
  if (broken.length) errors.push(`${code}: ${broken.length} key(s) lost an {{interpolation}}: ${broken.slice(0, 6).join(', ')}${broken.length > 6 ? ' …' : ''}`)

  // Single-brace tokens like {LINK} are invisible to i18next — they're substituted
  // later by hand (out.replace('{LINK}', url)). A translator who drops one silently
  // removes the review link from the message, with nothing to catch it at runtime.
  const tokens = s => (String(s).match(/\{[A-Z][A-Z_]*\}/g) || []).sort().join(',')
  const lostTokens = Object.keys(en).filter(k => k in cat && tokens(cat[k]) !== tokens(en[k]))
  if (lostTokens.length) errors.push(`${code}: ${lostTokens.length} key(s) lost a literal {TOKEN} placeholder: ${lostTokens.join(', ')}`)
}

const p = s => console.log(s)
p(`\n  en catalog: ${Object.keys(en).length} keys · ${referenced.size} referenced in source · ${codes.length} translated catalogs`)
const unused = Object.keys(en).filter(k => !referenced.has(k) && !referenced.has(k.replace(/_(one|other)$/, '')))
if (unused.length) p(`  ${unused.length} catalog key(s) not referenced in source (dead or resolved dynamically)`)
if (warnings.length) { p('\n  warnings:'); warnings.forEach(w => p(`    ~ ${w}`)) }
if (errors.length) {
  p(`\n  ${errors.length} error(s):`)
  errors.forEach(e => p(`    ✗ ${e}`))
  p('')
  process.exit(WARN_ONLY ? 0 : 1)
}
p('\n  ✓ i18n clean — every key resolves, every language covers every key\n')
