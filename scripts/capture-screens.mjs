// Screenshot every app state to PNG files + an HTML contact sheet.
// Drives system Chrome via the app's ?capture dev mode (motion disabled, direct routing).
//   Usage: node scripts/capture-screens.mjs   (dev server must be running on :5175)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:5175/'
const OUT = path.resolve('screenshots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const VW = 440, VH = 920

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- page helpers (run in the browser) ---
const clickText = (page, pat) => page.evaluate((pat) => {
  const re = new RegExp(pat, 'i')
  const el = [...document.querySelectorAll('button')].find((e) => re.test(e.textContent || ''))
  if (el) { el.click(); return true } return false
}, pat)

const clickCard = (page, parts) => page.evaluate((parts) => {
  const el = [...document.querySelectorAll('*')].find((e) =>
    typeof e.className === 'string' && /rounded-2xl/.test(e.className) &&
    parts.every((p) => new RegExp(p).test(e.textContent || '')))
  if (el) { el.click(); return true } return false
}, parts)

const clickBtn = (page, parts) => page.evaluate((parts) => {
  const el = [...document.querySelectorAll('button')].find((e) =>
    parts.every((p) => new RegExp(p).test(e.textContent || '')))
  if (el) { el.click(); return true } return false
}, parts)

const clickAria = (page, label) => page.evaluate((label) => {
  const el = [...document.querySelectorAll('button')].find((e) => (e.getAttribute('aria-label') || '') === label)
  if (el) { el.click(); return true } return false
}, label)

const scrollBottom = (page) => page.evaluate(() => {
  const sc = [...document.querySelectorAll('.no-scrollbar')].find((e) => e.scrollHeight > e.clientHeight + 5)
  if (sc) sc.scrollTop = sc.scrollHeight
})

const fillPhone = (page, num) => page.evaluate((num) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const el = [...document.querySelectorAll('input')].find((i) => i.getAttribute('inputmode') === 'numeric' && !i.classList.contains('otp-box'))
  if (el) { set.call(el, num); el.dispatchEvent(new Event('input', { bubbles: true })) }
}, num)

const scrollTo = (page, text, block = 'start') => page.evaluate((text, block) => {
  const el = [...document.querySelectorAll('*')].find((e) =>
    typeof e.className === 'string' && /rounded-2xl/.test(e.className) && new RegExp(text).test(e.textContent || ''))
  if (el) el.scrollIntoView({ block })
}, text, block)

// Full verify wizard → advance to a given step and frame it (1 address, 2 pin, 3 plus code, 4 photo).
async function verifyTo(page, step) {
  await clickBtn(page, ['Koramangala', 'Needs location verification']); await sleep(500)
  await clickText(page, 'Start verification'); await sleep(800)                 // → Step 1 (address)
  if (step === 1) { await scrollTo(page, 'Correct address details', 'start'); await sleep(300); return }
  await clickText(page, 'Save details'); await sleep(600)                        // → Step 2 (pin)
  if (step === 2) { await scrollTo(page, 'Move the pin to the exact spot', 'start'); await sleep(300); return }
  await clickText(page, 'Snap pin|Confirm pin'); await sleep(500)
  await clickText(page, 'Looks right'); await sleep(500)                         // → Step 3 (plus code)
  if (step === 3) { await scrollBottom(page); await sleep(300); return }
  await clickText(page, 'Use this code'); await sleep(500)                       // → Step 4 (photo)
  await scrollBottom(page); await sleep(300)
}

// --- the full screen catalog ---
const screens = [
  { file: '01-login',            desc: 'Login — mobile number',               go: '?capture&stage=login', group: 'Auth & entry' },
  { file: '02-otp',              desc: 'OTP verification',                    go: '?capture&stage=login', group: 'Auth & entry',
    act: async (p) => { await fillPhone(p, '9845012342'); await sleep(150); await clickText(p, 'Send verification'); await p.waitForSelector('input.otp-box', { timeout: 4000 }).catch(() => {}); await sleep(400) } },
  { file: '03-request-access',   desc: 'Request number-change sheet',         go: '?capture&stage=login', group: 'Auth & entry',
    act: async (p) => { await clickText(p, 'Request access') } },
  { file: '04-store-selector',   desc: 'Store selector — multi-location',     go: '?capture&stage=store', group: 'Auth & entry' },

  { file: '05-home-welcome',     desc: 'First-run welcome',                   go: '?capture&tab=home&welcome', group: 'Home' },
  { file: '06-home',             desc: 'Home — what you missed',              go: '?capture&tab=home', group: 'Home' },

  { file: '07-vmn-incoming',     desc: 'VMN — Incoming',                      go: '?capture&tab=vmn', group: 'VMN' },
  { file: '08-vmn-outbound',     desc: 'VMN — Outbound (callback queue)',     go: '?capture&tab=vmn', group: 'VMN', act: async (p) => { await clickText(p, 'Outbound') } },
  { file: '09-vmn-missed-ops',   desc: 'VMN — Missed opportunities (calls + IVR)', go: '?capture&tab=vmn', group: 'VMN', act: async (p) => { await clickText(p, 'Missed o') } },
  { file: '10-vmn-callcoach',    desc: 'AI Call-Back Coach sheet',            go: '?capture&tab=vmn', group: 'VMN', act: async (p) => { await clickCard(p, ['231', 'Called']) } },

  { file: '11-customers',        desc: 'Customers — CRM list',                go: '?capture&tab=customers', group: 'Customers' },
  { file: '12-customer-detail',  desc: 'Customer detail sheet',               go: '?capture&tab=customers', group: 'Customers', act: async (p) => { await clickCard(p, ['Anand Rao', 'Reviewed']) } },

  { file: '13-reviews-inbox',    desc: 'Reviews — Inbox',                     go: '?capture&tab=reviews', group: 'Reviews' },
  { file: '14-review-reply',     desc: 'Review reply sheet (AI draft)',       go: '?capture&tab=reviews', group: 'Reviews', act: async (p) => { await clickCard(p, ['Arjun Mehta', 'tap to review']) } },
  { file: '15-reviews-generate', desc: 'Reviews — Generate review link',      go: '?capture&tab=reviews', group: 'Reviews', act: async (p) => { await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Generate'); if (b) b.click() }) } },
  { file: '16-reviews-leaderboard', desc: 'Reviews — Leaderboard (brand role)', go: '?capture&tab=reviews&role=cluster', group: 'Reviews', act: async (p) => { await clickText(p, 'Leaderboard') } },

  { file: '17-profile',          desc: 'Profile hub',                         go: '?capture&tab=profile', group: 'Profile' },
  { file: '18-business-profile', desc: 'Business Profile (GBP editor)',       go: '?capture&tab=profile', group: 'Profile', act: async (p) => { await clickCard(p, ['Business Profile', 'attributes']) } },
  { file: '19-manage-media',     desc: 'Manage Media sheet',                  go: '?capture&tab=profile', group: 'Profile', act: async (p) => { await clickCard(p, ['Manage Media', 'photos']) } },
  { file: '20-team',             desc: 'Team sheet',                          go: '?capture&tab=profile', group: 'Profile', act: async (p) => { await clickCard(p, ['Team', 'Add people']) } },
  { file: '21-switch-role',      desc: 'Switch-role sheet',                   go: '?capture&tab=profile', group: 'Profile', act: async (p) => { await clickCard(p, ['Switch role', 'hierarchy']) } },
  { file: '22-ai-tokens',        desc: 'AI Tokens ledger sheet',             go: '?capture&tab=profile', group: 'Profile', act: async (p) => { await scrollBottom(p); await sleep(200); await clickText(p, 'AI Tokens') } },

  { file: '23-verify-presence',  desc: 'Location Verify — presence gate',            go: '?capture&stage=store', group: 'Location verification', act: async (p) => { await clickBtn(p, ['Koramangala', 'Needs location verification']) } },
  { file: '24-verify-address',   desc: 'Verify — Step 1 · Correct address details',  go: '?capture&stage=store', group: 'Location verification', act: async (p) => { await verifyTo(p, 1) } },
  { file: '25-verify-pin',       desc: 'Verify — Step 2 · Move the pin to the spot',  go: '?capture&stage=store', group: 'Location verification', act: async (p) => { await verifyTo(p, 2) } },
  { file: '26-verify-pluscode',  desc: 'Verify — Step 3 · auto Google Plus Code',     go: '?capture&stage=store', group: 'Location verification', act: async (p) => { await verifyTo(p, 3) } },
  { file: '27-verify-photo',     desc: 'Verify — Step 4 · real photo picker',         go: '?capture&stage=store', group: 'Location verification', act: async (p) => { await verifyTo(p, 4) } },

  { file: '28-ai-copilot',       desc: 'AI Copilot assistant',                go: '?capture&tab=home', group: 'AI & roles', act: async (p) => { await clickAria(p, 'Open AI Assistant') } },
  { file: '29-role-cluster',     desc: 'Cluster Owner roll-up',               go: '?capture&tab=vmn&role=cluster', group: 'AI & roles' },
  { file: '30-role-city',        desc: 'City Manager roll-up',                go: '?capture&tab=vmn&role=city', group: 'AI & roles' },
  { file: '31-role-regional',    desc: 'Regional Manager roll-up',            go: '?capture&tab=vmn&role=regional', group: 'AI & roles' },
  { file: '32-role-head',        desc: 'Distribution Head roll-up',           go: '?capture&tab=vmn&role=head', group: 'AI & roles' },

  { file: '33-home-dark',        desc: 'Dark theme — Home',                   go: '?capture&tab=profile', group: 'Theme',
    act: async (p) => { await clickBtn(p, ['Dark', 'Futuristic']); await sleep(300); await p.goto(BASE + '?capture&tab=home', { waitUntil: 'networkidle2' }); await sleep(900) } },
  { file: '34-vmn-dark',         desc: 'Dark theme — VMN',                    go: '?capture&tab=vmn', group: 'Theme' },
]

async function run() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', `--window-size=${VW},${VH}`],
    defaultViewport: { width: VW, height: VH, deviceScaleFactor: 2 },
  })
  const page = (await browser.pages())[0] || (await browser.newPage())
  // grant a mock GPS so the verification flow captures real coordinates
  const ctx = browser.defaultBrowserContext()
  await ctx.overridePermissions(BASE, ['geolocation'])
  await page.setGeolocation({ latitude: 12.9366, longitude: 77.6260, accuracy: 8 })

  const done = []
  for (const s of screens) {
    try {
      await page.goto(BASE + s.go, { waitUntil: 'networkidle2' })
      await sleep(950) // let reduced-motion opacity settle
      if (s.act) { await s.act(page); await sleep(900) }
      await page.screenshot({ path: path.join(OUT, `${s.file}.png`) })
      done.push(s)
      console.log('✓', s.file, '—', s.desc)
    } catch (e) {
      console.log('✗', s.file, '—', e.message)
    }
  }
  await browser.close()

  // contact sheet
  const groups = [...new Set(done.map((s) => s.group))]
  const html = `<!doctype html><meta charset=utf8><title>SingleInterface — App screens</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0A0E24;color:#F4F6FF;font:15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:32px}
  h1{font-size:26px;margin:0 0 4px} .sub{color:#93A0C8;margin-bottom:28px}
  h2{font-size:16px;color:#9DC2FF;margin:34px 0 14px;letter-spacing:.02em;text-transform:uppercase}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
  .card{background:#121A3C;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden}
  .card img{width:100%;display:block;background:#070A1C}
  .card .cap{padding:10px 12px;font-size:13px;color:#CBD5F0}
  .card .cap b{color:#F4F6FF}
</style>
<h1>SingleInterface — Zero Business Loss</h1>
<div class=sub>${done.length} app screens · captured ${new Date().toISOString().slice(0, 10)}</div>
${groups.map((g) => `<h2>${g}</h2><div class=grid>${done.filter((s) => s.group === g).map((s) => `<div class=card><img src="${s.file}.png" alt="${s.desc}"><div class=cap><b>${s.file.replace(/^\d+-/, '')}</b><br>${s.desc}</div></div>`).join('')}</div>`).join('')}
`
  fs.writeFileSync(path.join(OUT, 'index.html'), html)
  console.log(`\nDone: ${done.length}/${screens.length} screens → ${OUT}`)
}

run().catch((e) => { console.error(e); process.exit(1) })
