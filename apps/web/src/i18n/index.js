// i18n WEB RUNTIME (i18next + react-i18next) — deliberately NOT in @connect/core:
// it touches the DOM (font <link> injection, <html dir>), navigator.language and
// localStorage, all web-only. The catalogs and language registry it consumes DO
// live in core, shared with the Expo app from Phase 1 on.
//
// Design notes:
//  • Only English ships in the main bundle. Every other catalog is lazy-loaded on
//    switch (the static CATALOGS map in @connect/core/locales/index.js — generated
//    by scripts/gen-locale-index.mjs), so a Hindi user never downloads Tamil.
//  • Indic scripts are NOT covered by the UI font (Hanken Grotesk). We load the
//    matching "Noto Sans <Script>" webfont on demand and append it to the font
//    stack — without this, Hindi/Tamil/Telugu render as tofu boxes (□□□).
//  • Urdu is RTL: we flip <html dir> so the whole document mirrors.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@connect/core/locales/en/common.json'
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, getLanguage } from '@connect/core/i18n/languages.js'
import { CATALOGS } from '@connect/core/locales/index.js'
import { track, setAnalyticsContext } from '@connect/core/analytics.js'

const STORAGE_KEY = 'si-lang'
const NS = 'common'

/** The language to boot with: saved choice → browser language → English. */
export function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LANGUAGE_CODES.includes(saved)) return saved
  } catch {}
  try {
    const nav = (navigator.language || '').split('-')[0]
    if (LANGUAGE_CODES.includes(nav)) return nav
  } catch {}
  return DEFAULT_LANGUAGE
}

const loadedFonts = new Set()
/** Inject the Noto webfont for a script, once. */
function ensureFont(family) {
  if (!family || loadedFonts.has(family)) return
  loadedFonts.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400..700&display=swap`
  document.head.appendChild(link)
}

/** Apply font stack + direction + lang attribute for a language. */
function applyChrome(code) {
  const lang = getLanguage(code)
  ensureFont(lang.font)
  const root = document.documentElement
  root.style.setProperty('--font-script', lang.font ? `'${lang.font}'` : "'Hanken Grotesk'")
  root.setAttribute('lang', lang.code)
  root.setAttribute('dir', lang.dir)
}

async function loadCatalog(code) {
  if (code === DEFAULT_LANGUAGE) return en
  const loader = CATALOGS[code]
  if (!loader) return null
  try {
    const mod = await loader()
    return mod.default || mod
  } catch {
    return null // catalog not generated yet → fall back to English
  }
}

/**
 * Switch the app's language: fetch catalog if needed, then swap font/dir/strings.
 *
 * `{ silent: true }` is for the boot call at the bottom of this file — it applies the
 * saved/browser language, which is the INITIAL state, not a change the dealer made. A
 * user-facing switch (Profile) calls setLanguage(code) with no options and IS measured.
 */
export async function setLanguage(code, { silent = false } = {}) {
  const lang = getLanguage(code)
  const from = currentLanguage().code // the language in effect BEFORE this switch
  if (!i18n.hasResourceBundle(lang.code, NS)) {
    const catalog = await loadCatalog(lang.code)
    if (catalog) i18n.addResourceBundle(lang.code, NS, catalog, true, true)
  }
  await i18n.changeLanguage(lang.code)
  applyChrome(lang.code)
  try { localStorage.setItem(STORAGE_KEY, lang.code) } catch {}
  // Keep the analytics context in step so EVERY subsequent event is sliceable by the
  // language on screen — done whether or not we emit the event just below.
  setAnalyticsContext({ language: lang.code })
  // The 18-language argument, measured — but only on a real, user-initiated switch: not
  // the silent boot call, and not a no-op re-select of the language already in effect.
  if (!silent && from !== lang.code) {
    track('language_changed', { from, to: lang.code })
  }
  return lang
}

export function currentLanguage() {
  return getLanguage(i18n.resolvedLanguage || i18n.language || DEFAULT_LANGUAGE)
}

const boot = initialLanguage()

i18n.use(initReactI18next).init({
  resources: { en: { [NS]: en } },
  lng: DEFAULT_LANGUAGE,      // start on English, then switch (so the boot catalog is loaded)
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: NS,
  ns: [NS],
  interpolation: { escapeValue: false }, // React already escapes
  returnEmptyString: false,              // empty translation → fall back to English
  react: { useSuspense: false },
})

applyChrome(DEFAULT_LANGUAGE)
// Silent: this establishes the INITIAL language (saved choice / browser), which is not a
// switch the dealer made — language_changed must not fire at boot.
if (boot !== DEFAULT_LANGUAGE) setLanguage(boot, { silent: true })

export default i18n
