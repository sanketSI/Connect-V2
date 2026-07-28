// Language registry — the single source of truth for what the app can speak.
//
// Each entry carries everything the UI needs to render that language correctly:
//   code   BCP-47 language subtag (also the catalog folder name: src/locales/<code>/)
//   intl   full locale for Intl.* APIs — "-IN" gives the Indian lakh/crore grouping
//   script writing system (drives which webfont must load)
//   font   Google "Noto Sans <Script>" family; null = covered by the Latin UI font
//   dir    text direction — Urdu is RTL
//
// Ordered by speakers. India first (our PAN-India customers), then other markets.

export const LANGUAGES = [
  // ---- India ----
  { code: 'en', intl: 'en-IN', label: 'English',   native: 'English',   script: 'Latin',      font: null,                     dir: 'ltr', region: 'India' },
  { code: 'hi', intl: 'hi-IN', label: 'Hindi',     native: 'हिन्दी',      script: 'Devanagari', font: 'Noto Sans Devanagari',   dir: 'ltr', region: 'India' },
  { code: 'bn', intl: 'bn-IN', label: 'Bengali',   native: 'বাংলা',      script: 'Bengali',    font: 'Noto Sans Bengali',      dir: 'ltr', region: 'India' },
  { code: 'mr', intl: 'mr-IN', label: 'Marathi',   native: 'मराठी',      script: 'Devanagari', font: 'Noto Sans Devanagari',   dir: 'ltr', region: 'India' },
  { code: 'te', intl: 'te-IN', label: 'Telugu',    native: 'తెలుగు',     script: 'Telugu',     font: 'Noto Sans Telugu',       dir: 'ltr', region: 'India' },
  { code: 'ta', intl: 'ta-IN', label: 'Tamil',     native: 'தமிழ்',      script: 'Tamil',      font: 'Noto Sans Tamil',        dir: 'ltr', region: 'India' },
  { code: 'gu', intl: 'gu-IN', label: 'Gujarati',  native: 'ગુજરાતી',    script: 'Gujarati',   font: 'Noto Sans Gujarati',     dir: 'ltr', region: 'India' },
  { code: 'kn', intl: 'kn-IN', label: 'Kannada',   native: 'ಕನ್ನಡ',      script: 'Kannada',    font: 'Noto Sans Kannada',      dir: 'ltr', region: 'India' },
  { code: 'ml', intl: 'ml-IN', label: 'Malayalam', native: 'മലയാളം',    script: 'Malayalam',  font: 'Noto Sans Malayalam',    dir: 'ltr', region: 'India' },
  { code: 'pa', intl: 'pa-IN', label: 'Punjabi',   native: 'ਪੰਜਾਬੀ',     script: 'Gurmukhi',   font: 'Noto Sans Gurmukhi',     dir: 'ltr', region: 'India' },
  { code: 'or', intl: 'or-IN', label: 'Odia',      native: 'ଓଡ଼ିଆ',       script: 'Odia',       font: 'Noto Sans Oriya',        dir: 'ltr', region: 'India' },
  { code: 'as', intl: 'as-IN', label: 'Assamese',  native: 'অসমীয়া',    script: 'Bengali',    font: 'Noto Sans Bengali',      dir: 'ltr', region: 'India' },
  { code: 'ur', intl: 'ur-IN', label: 'Urdu',      native: 'اردو',       script: 'Arabic',     font: 'Noto Nastaliq Urdu',     dir: 'rtl', region: 'India' },

  // ---- Other markets ----
  { code: 'id', intl: 'id-ID', label: 'Bahasa Indonesia', native: 'Bahasa Indonesia', script: 'Latin', font: null,             dir: 'ltr', region: 'International' },
  { code: 'vi', intl: 'vi-VN', label: 'Vietnamese',       native: 'Tiếng Việt',       script: 'Latin', font: null,             dir: 'ltr', region: 'International' },
  { code: 'th', intl: 'th-TH', label: 'Thai',             native: 'ภาษาไทย',          script: 'Thai',  font: 'Noto Sans Thai', dir: 'ltr', region: 'International' },
  { code: 'es', intl: 'es-ES', label: 'Spanish',          native: 'Español',          script: 'Latin', font: null,             dir: 'ltr', region: 'International' },
  { code: 'pt', intl: 'pt-BR', label: 'Portuguese',       native: 'Português',        script: 'Latin', font: null,             dir: 'ltr', region: 'International' },
]

export const DEFAULT_LANGUAGE = 'en'

/** Language codes we ship catalogs for. */
export const LANGUAGE_CODES = LANGUAGES.map(l => l.code)

/** Look up a language entry (falls back to English). */
export function getLanguage(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0]
}

/**
 * The language to offer as a one-tap alternative for AI-drafted text.
 * AI output already follows the active UI language, so offering "in <your own language>"
 * is a no-op — we offer the other side instead: English UI → Hindi, any Indic UI → English.
 */
export function altLanguage(code) {
  const base = String(code || '').split('-')[0]
  return getLanguage(base === 'en' ? 'hi' : 'en')
}

/** Languages grouped for the picker: Indian languages first. */
export function languagesByRegion() {
  return [
    { region: 'Indian languages', items: LANGUAGES.filter(l => l.region === 'India') },
    { region: 'Other markets', items: LANGUAGES.filter(l => l.region === 'International') },
  ]
}
