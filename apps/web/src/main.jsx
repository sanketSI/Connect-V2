// Async boot, in four ordered acts — the ORDER is the whole design
// (see packages/core/data/hydrate.js):
//   0. Platform seams FIRST, synchronously — configureEnv() with the Vite env
//      values and configureStorage() with a localStorage driver, BEFORE any
//      dynamic import below can pull in a core module. Core never touches
//      import.meta.env or localStorage itself; customers.js even reads storage
//      at module scope, so the driver must be in place before the barrel loads.
//      env.js/storage.js are leaf modules — importing them loads no data code.
//   1. i18n — must init before the tree renders (sets language, font, dir),
//      exactly as it did when this was a static import.
//   2. hydrate() — with Supabase env present, replaces the seed arrays' contents
//      with backend rows (4s budget; any failure falls back to seed, silently
//      for the user). Without env this returns immediately: seed mode unchanged.
//   3. ONLY THEN import App — screens read data at module scope
//      (`const MISSED_CALLS = getMissedCalls()`), so every data module must
//      load AFTER hydration has resolved. A static `import App` here would
//      hoist the whole tree above step 2 and the getters would resolve seed
//      records before the splice. Do not "simplify" these back to static.
import React from 'react'
import ReactDOM from 'react-dom/client'
import { configureEnv } from '@connect/core/env.js'
import { configureStorage } from '@connect/core/storage.js'
import { configureAnalytics, setAnalyticsContext, track, flushAnalytics } from '@connect/core/analytics.js'
import './index.css'

configureEnv({
  geminiKeys: import.meta.env.VITE_GEMINI_API_KEYS,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
})
// Telemetry is a leaf module like the two above — configuring it here means the very
// first event (app_opened, fired below in boot() once hydrate() reports its source)
// already has a sink. Without this call track() validates and then drops every event on
// the floor, which is indistinguishable from having no telemetry at all.
// No endpoint configured → zero network calls; in dev it prints to the console.
// `app_version` is the one context field known synchronously at boot; store_id/role/
// language are set once the app knows them (App.jsx openStore, i18n setLanguage).
configureAnalytics({
  endpoint: import.meta.env.VITE_ANALYTICS_URL,
  debug: import.meta.env.DEV,
  context: { app_version: import.meta.env.VITE_APP_VERSION || 'web-dev' },
})

// Flush the buffered batch when the tab is backgrounded or closed — the one moment a
// real batching endpoint would otherwise lose the last ≤20 events. flushAnalytics() is a
// no-op when nothing is buffered or no endpoint is configured, and never throws, so this
// costs nothing in the default (console/seed) posture. `visibilitychange→hidden` is the
// reliable mobile signal; `pagehide` covers the desktop tab-close it doesn't always fire.
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAnalytics()
})
window.addEventListener('pagehide', () => { flushAnalytics() })
// Raw localStorage, no try/catch here — the core facade already swallows
// driver failures (blocked storage degrades to the empty state).
configureStorage({
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => window.localStorage.setItem(k, v),
  removeItem: (k) => window.localStorage.removeItem(k),
})

const rootEl = document.getElementById('root')

// Minimal boot splash — no React, no text; replaced by the app render.
// Brand ring: deep indigo #0E0071 track, electric blue #0070FC arc.
rootEl.innerHTML = `
  <style>@keyframes tsc-boot-spin { to { transform: rotate(360deg) } }</style>
  <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center">
    <div style="width:44px;height:44px;border-radius:50%;border:3px solid rgba(14,0,113,.22);border-top-color:#0070FC;animation:tsc-boot-spin .8s linear infinite"></div>
  </div>`

async function boot() {
  const i18nMod = await import('./i18n/index.js') // must init before the tree renders (sets language, font, dir)
  // hydrate.js is imported by SUBPATH, not through the barrel: loading it must
  // not resolve the data modules (they'd read seed records before the splice).
  const { hydrate } = await import('@connect/core/data/hydrate.js')
  const source = await hydrate() // 'seed' | 'supabase' — the RESOLVED source (see hydrate.js)

  // app_opened — the top of the funnel, fired exactly once, now that the source and the
  // boot context are both known. The data getters are imported AFTER hydrate() so they
  // read the (possibly spliced-in) backend rows, never stale seed — the same reason App
  // is imported below rather than at the top. Telemetry must never break boot (analytics
  // rule 2), so the whole block is swallowed on any failure.
  try {
    const { getCurrentUser, isReturningUser, getStoreLocations } = await import('@connect/core')
    const language = i18nMod.currentLanguage().code
    setAnalyticsContext({ language }) // slice-by-language from this very first event onward
    track('app_opened', {
      source,                                  // seed | supabase — live data or the demo seed
      role: getCurrentUser().role,             // the dealer's account role (no viewing role chosen yet at boot)
      returning: isReturningUser(),            // first run vs a return visit
      language,
      store_count: getStoreLocations().length, // how many outlets this dealer runs
    })
  } catch (err) {
    console.warn('[analytics] app_opened could not be recorded:', err)
  }

  const { default: App } = await import('./App.jsx')
  rootEl.replaceChildren() // drop the splash; createRoot owns the container now
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

/**
 * Boot failure state — plain DOM, no React, no i18n.
 *
 * boot() used to only console.error, which left the splash ring spinning
 * forever: to the dealer the app simply never opened, with nothing to read and
 * nothing to tap. Whatever broke above (i18n, a chunk that 404'd, hydration
 * throwing outside its own try/catch) may have taken React or the catalogs with
 * it, so this is written against the DOM directly and the copy is English.
 *
 * Brand fallbacks are hard-coded: index.css may not have applied, and the
 * ThemeProvider that sets data-theme never got to run.
 */
function renderBootFailure(err) {
  rootEl.replaceChildren()

  const wrap = document.createElement('div')
  wrap.setAttribute('role', 'alert')
  wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#F4FBFF;font-family:"Hanken Grotesk",system-ui,-apple-system,sans-serif'

  const card = document.createElement('div')
  card.style.cssText = 'width:100%;max-width:320px;text-align:center;background:#fff;border:1px solid #E5E7EB;border-radius:20px;padding:24px 20px;box-shadow:0 8px 28px rgba(0,112,252,.10)'

  const badge = document.createElement('div')
  badge.style.cssText = 'width:48px;height:48px;margin:0 auto 12px;border-radius:50%;background:rgba(220,38,38,.10);display:flex;align-items:center;justify-content:center'
  // Flat line icon, drawn inline — lucide lives in the bundle that just failed.
  badge.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'

  const title = document.createElement('h1')
  title.textContent = 'Connect could not start'
  title.style.cssText = 'margin:0;font-size:16px;font-weight:600;line-height:1.375;color:#111827'

  const body = document.createElement('p')
  body.textContent = 'Something went wrong while loading the app. Check your connection and try again.'
  body.style.cssText = 'margin:6px 0 0;font-size:13px;line-height:1.38;color:#5F6878'

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Reload App'
  button.style.cssText = 'margin-top:16px;width:100%;height:44px;border:0;border-radius:999px;background:#0070FC;color:#fff;font-size:15px;font-weight:600;cursor:pointer'
  button.addEventListener('click', () => window.location.reload())

  card.append(badge, title, body, button)

  // DEV only: the real error, so a developer is not left guessing.
  if (import.meta.env.DEV) {
    const detail = document.createElement('pre')
    detail.textContent = String(err?.stack || err?.message || err)
    detail.style.cssText = 'margin:12px 0 0;max-height:140px;overflow:auto;text-align:left;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.18);border-radius:12px;padding:8px 10px;color:#374151'
    card.insertBefore(detail, button)
  }

  wrap.append(card)
  rootEl.append(wrap)
}

boot().catch((err) => {
  console.error('[boot] failed to start the app:', err)
  try {
    renderBootFailure(err)
  } catch (renderErr) {
    // Last resort: never leave the splash spinning.
    console.error('[boot] failure screen itself failed:', renderErr)
    rootEl.textContent = 'Connect could not start. Please reload the page.'
  }
})
