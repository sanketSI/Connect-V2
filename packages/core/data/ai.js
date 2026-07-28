// AI service boundary.
// The UI calls askAI() / isAILive() / typewriter() and never knows the vendor.
// Today this wraps the client-side Gemini adapter; swap the import below for a
// server-side AI endpoint and no screen changes.
import i18next from 'i18next'
import { geminiGenerate, isGeminiLive, typewriter as _typewriter } from '../lib/gemini.js'
import { getLanguage } from '../i18n/languages.js'

/** Instruction appended so generated content comes back in the user's language. */
function localeInstruction() {
  const lang = getLanguage(i18next.resolvedLanguage || i18next.language || 'en')
  if (lang.code === 'en') return null
  return [
    `Write your entire response in ${lang.label} (${lang.native}), using the ${lang.script} script.`,
    `Use natural, everyday ${lang.label} that an Indian shop owner would actually speak — not literal/textbook translation.`,
    `Keep brand names, people's names, phone numbers and currency figures exactly as given.`,
  ].join(' ')
}

/**
 * Generate text from the AI service, in the user's selected language.
 * @param {string} prompt
 * @param {{system?:string, temperature?:number, fallback?:string, maxOutputTokens?:number}} [opts]
 * @returns {Promise<string>}
 */
export function askAI(prompt, opts = {}) {
  const loc = localeInstruction()
  const system = [opts.system, loc].filter(Boolean).join('\n\n') || undefined
  return geminiGenerate(prompt, { ...opts, system })
}

/** Whether the live AI backend has answered successfully at least once. */
export function isAILive() {
  return isGeminiLive()
}

/** Render a finished string with a streamed-feel typewriter (UI helper kept vendor-agnostic). */
export const typewriter = _typewriter
