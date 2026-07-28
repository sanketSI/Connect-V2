// Generate translation catalogs from packages/core/locales/en/common.json.
// After adding a NEW language catalog, also run scripts/gen-locale-index.mjs
// so the lazy CATALOGS map picks it up.
//
//   node scripts/i18n-translate.mjs                  # all Indian languages
//   node scripts/i18n-translate.mjs --langs=hi,ta    # specific ones
//   node scripts/i18n-translate.mjs --provider=bhashini
//
// PROVIDERS
//   gemini    (default) — already wired into this app, zero setup, good general quality.
//   bhashini  — Government of India's platform (bhashini.gov.in), powered by AI4Bharat's
//               IndicTrans2, the open-source SOTA model for all 22 scheduled Indian
//               languages. Better Indic fidelity → use this for production. Needs
//               BHASHINI_USER_ID + BHASHINI_API_KEY.
//
// Output is machine-translated: treat it as a first pass and have a native speaker review.
import fs from 'node:fs'
import path from 'node:path'
import { LANGUAGES } from '../packages/core/i18n/languages.js'

const EN = path.resolve('packages/core/locales/en/common.json')
const OUT_DIR = path.resolve('packages/core/locales')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const PROVIDER = args.provider || 'gemini'
const BATCH = 35

// Don't translate these — they're brands/protocols/units.
const KEEP = ['SingleInterface', 'Nova', 'Gemini', 'VMN', 'WhatsApp', 'Google', 'NPS', 'Plus Code', 'GPS', 'AI', 'EMI', 'IVR']

const geminiKey = () => {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const src = fs.readFileSync(path.resolve('packages/core/lib/gemini.js'), 'utf8')
  const keys = [...src.matchAll(/'(AIza[\w-]+)'/g)].map((m) => m[1])
  if (!keys.length) throw new Error('No Gemini key found — set GEMINI_API_KEY')
  return keys[0]
}

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = v
  }
  return out
}
const unflatten = (flat) => {
  const out = {}
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.')
    let cur = out
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = v
      else cur = (cur[p] = cur[p] || {})
    })
  }
  return out
}

async function translateGemini(pairs, lang) {
  const key = geminiKey()
  const system = [
    `You are a professional localiser for an Indian retail business app used by shop owners.`,
    `Translate the JSON values into ${lang.label} (${lang.native}) using the ${lang.script} script.`,
    `RULES:`,
    `1. Return STRICT JSON with exactly the same keys. Translate values only.`,
    `2. Preserve every {{placeholder}} and <1>…</1> tag EXACTLY as-is.`,
    `3. Do NOT translate these terms: ${KEEP.join(', ')}.`,
    `4. Keep "₹", digits, and symbols as-is.`,
    `5. Use natural, everyday spoken ${lang.label} a shopkeeper would use — not literal/textbook translation.`,
    `6. Keep it SHORT — this is mobile UI; similar length to the English.`,
  ].join('\n')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(pairs, null, 0) }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: 8192 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  return JSON.parse(text)
}

async function translateBhashini() {
  throw new Error(
    'Bhashini provider not configured. Register at https://bhashini.gov.in, then set BHASHINI_USER_ID and BHASHINI_API_KEY.\n' +
    'It exposes AI4Bharat IndicTrans2 (https://github.com/AI4Bharat/IndicTrans2) for all 22 scheduled languages.',
  )
}

const translate = PROVIDER === 'bhashini' ? translateBhashini : translateGemini

async function run() {
  const en = JSON.parse(fs.readFileSync(EN, 'utf8'))
  const flat = flatten(en)
  const keys = Object.keys(flat)

  const requested = args.langs ? args.langs.split(',') : null
  const targets = LANGUAGES.filter((l) => l.code !== 'en' && (requested ? requested.includes(l.code) : l.region === 'India'))

  console.log(`Provider: ${PROVIDER} · ${keys.length} keys · ${targets.length} languages\n`)

  for (const lang of targets) {
    const outFile = path.join(OUT_DIR, lang.code, 'common.json')
    const result = {}
    let failed = 0
    for (let i = 0; i < keys.length; i += BATCH) {
      const slice = Object.fromEntries(keys.slice(i, i + BATCH).map((k) => [k, flat[k]]))
      try {
        Object.assign(result, await translate(slice, lang))
      } catch (e) {
        failed += Object.keys(slice).length
        Object.assign(result, slice) // fall back to English for this batch
      }
      process.stdout.write(`\r  ${lang.label.padEnd(12)} ${Math.min(i + BATCH, keys.length)}/${keys.length}`)
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, JSON.stringify(unflatten(result), null, 2) + '\n')
    console.log(`\r  ${lang.label.padEnd(12)} ✓ ${keys.length - failed}/${keys.length} translated → packages/core/locales/${lang.code}/common.json`)
  }
  console.log('\nDone. Machine-translated — have a native speaker review before shipping.')
}

run().catch((e) => { console.error(e.message); process.exit(1) })
