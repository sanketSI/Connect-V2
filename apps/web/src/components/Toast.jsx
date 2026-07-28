import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, PhoneMissed, Star, CheckCircle2, Info, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { uid } from '../lib/utils'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

/** Never show more than this many at once — the oldest is retired to make room. */
const MAX_TOASTS = 2
const DEFAULT_DURATION = 4200

/**
 * Transient notification host.
 *
 * Three things were wrong before and all three are fixed here:
 *
 *  1. POSITION. The stack rendered at `top-11` (44px) — the exact offset every screen
 *     anchors its scroll container and LargeTitle at — with z-60 over the screen's z-0,
 *     so a toast reliably sat on top of the screen title and its header controls.
 *     Toasts now dock to the BOTTOM, above the tab bar (--m-toast-inset), where the
 *     app has no headings and where the close button is inside thumb reach.
 *
 *  2. IT RE-FIRED FOREVER AND PILED UP. The context value was a fresh `{ push }`
 *     object on every render, so every toast state change handed consumers a new
 *     identity; App.jsx's `useEffect(..., [stage, toast])` therefore tore down and
 *     re-armed its 6s/14s timers on every toast — an endless self-feeding loop that
 *     left copies stacked in the DOM. The value is memoised now, so the effect runs
 *     once per stage. Belt and braces: identical toasts de-duplicate (the timer just
 *     restarts) and the stack is capped at MAX_TOASTS.
 *
 *  3. NO WAY OUT. Drag-to-dismiss existed but was invisible. There is now an explicit
 *     labelled close button with a full 44px hit area; the whole card is still tappable
 *     and still swipe-dismissable, and auto-dismiss timers are tracked in a ref so they
 *     are cleared on manual dismiss and on unmount (they used to leak).
 *
 * API (unchanged + additive):
 *   push({ kind, title, body, icon, duration })       // as before
 *   push({ kind, titleKey, bodyKey, bodyOpts, ... })  // preferred: stays localized
 *   push({ ..., action: { label, onClick } })         // one inline action (e.g. Undo)
 *   push({ ..., signature })                           // override the dedupe key
 *
 * `action` renders a labelled button with its own ≥44px hit area (the destructive-delete
 * Undo on Manage Media rides on this); tapping it runs onClick and dismisses the toast.
 * `signature` lets a caller keep otherwise-identical toasts distinct — two photo deletes
 * carry the same title/body but must NOT dedupe, or the second would swallow the first's
 * Undo and leave a photo unrecoverable.
 */
export function ToastProvider({ children }) {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  // The list lives in a ref as well as in state: push() has to read the current
  // stack, dedupe against it and hand back an id synchronously, and a setState
  // updater is not a safe place to do any of that (React may replay it).
  const list = useRef([])

  const commit = useCallback((next) => { list.current = next; setToasts(next) }, [])

  const clearTimer = useCallback((id) => {
    const handle = timers.current.get(id)
    if (handle) { clearTimeout(handle); timers.current.delete(id) }
  }, [])

  const dismiss = useCallback((id) => {
    clearTimer(id)
    commit(list.current.filter(x => x.id !== id))
  }, [clearTimer, commit])

  const arm = useCallback((id, duration) => {
    clearTimer(id)
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id)
      commit(list.current.filter(x => x.id !== id))
    }, duration || DEFAULT_DURATION))
  }, [clearTimer, commit])

  const push = useCallback((toast) => {
    const duration = toast.duration || DEFAULT_DURATION
    // Same notification already on screen? Restart its clock instead of stacking a clone.
    // A caller can pass its own `signature` to opt OUT of dedupe (see the module note): a
    // per-item key keeps two look-alike "Photo removed" toasts — each carrying a DIFFERENT
    // Undo — from collapsing into one.
    const signature = toast.signature
      || `${toast.kind || 'info'}|${toast.titleKey || toast.title || ''}|${toast.bodyKey || toast.body || ''}`
    const existing = list.current.find(x => x.signature === signature)
    if (existing) { arm(existing.id, duration); return existing.id }

    const id = uid()
    const next = [...list.current, { id, signature, ...toast }]
    // Cap the stack: retire the oldest (and its pending timer) rather than burying
    // the screen under notifications.
    while (next.length > MAX_TOASTS) clearTimer(next.shift().id)
    commit(next)
    arm(id, duration)
    return id
  }, [arm, clearTimer, commit])

  // Never leave a timer running past unmount.
  useEffect(() => () => {
    timers.current.forEach(handle => clearTimeout(handle))
    timers.current.clear()
  }, [])

  // STABLE identity — this is what stops consumers' effects from re-running forever.
  const api = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="absolute left-0 right-0 z-[70] px-3 flex flex-col gap-2 pointer-events-none"
        style={{ bottom: 'var(--m-toast-inset)' }}
        role="status"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t('common.notifications', { defaultValue: 'Notifications' })}
      >
        <AnimatePresence initial={false}>
          {toasts.map(toast => (
            <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

function ToastCard({ toast, onDismiss }) {
  const { t } = useTranslation()
  return (
    <motion.div
      layout
      initial={{ y: 32, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 24, opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: [0.3, 0, 0.8, 0.15] } }}
      transition={{ type: 'spring', damping: 26, stiffness: 340 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 90 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      onDragEnd={(_, info) => { if (info.offset.y > 28) onDismiss() }}
      onClick={onDismiss}
      className="pointer-events-auto"
    >
      <ToastBody {...toast} onDismiss={onDismiss} dismissLabel={t('common.dismiss', { defaultValue: 'Dismiss' })} />
    </motion.div>
  )
}

function ToastBody({ title, body, titleKey, bodyKey, bodyOpts, kind = 'info', icon: Icon, action, onDismiss, dismissLabel }) {
  const { t } = useTranslation()
  // Theme-aware: a light card in light mode / dark glass in dark mode (via var(--bg-card-strong)),
  // with a per-kind accent on the icon chip + border. Text uses theme tokens so it always reads.
  const map = {
    ai:      { accent: '#0070FC', Icon: Sparkles },
    missed:  { accent: '#DC2626', Icon: PhoneMissed },
    review:  { accent: '#F59E0B', Icon: Star },
    success: { accent: '#16A34A', Icon: CheckCircle2 },
    info:    { accent: '#0070FC', Icon: Info },
  }
  const s = map[kind] || map.info
  const I = Icon || s.Icon
  // Prefer a catalog key so the notification follows the app language; fall back to
  // whatever literal the caller passed (see the App.jsx note in the module header).
  const headline = titleKey ? t(titleKey, { defaultValue: title || '' }) : title
  const detail = bodyKey ? t(bodyKey, { ...bodyOpts, defaultValue: body || '' }) : body
  return (
    <div
      className="rounded-2xl p-3 pr-2 flex gap-3 items-start glass-strong"
      style={{
        background: 'var(--bg-card-strong)',
        border: `1px solid ${s.accent}55`,
        boxShadow: 'var(--shadow-card), 0 12px 30px rgba(15,23,42,.14)',
      }}
    >
      <div
        className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
        style={{ background: `${s.accent}1F`, border: `1px solid ${s.accent}40` }}
      >
        <I size={18} style={{ color: s.accent }} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0 py-0.5">
        {headline && <div className="m-headline" style={{ color: 'var(--text-primary)' }}>{headline}</div>}
        {detail && <div className="m-callout mt-0.5" style={{ color: 'var(--text-secondary)' }}>{detail}</div>}
      </div>
      {/* One inline action (Undo). Its own ≥44px hit box, accent-coloured via the
          theme-aware token so it clears AA on the toast surface in both themes. It must
          run BEFORE the card's dismiss, so it stops the tap from bubbling to onClick. */}
      {action && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); action.onClick?.(); onDismiss?.() }}
          className="shrink-0 self-center inline-flex items-center justify-center px-3 min-h-[var(--m-touch-min)] rounded-xl m-subhead font-semibold press md-state"
          style={{ color: 'var(--si-primary-text)' }}
        >
          {action.label}
        </button>
      )}
      {/* Explicit, discoverable dismiss. 44px hit box, 28px painted circle. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss?.() }}
        aria-label={dismissLabel}
        className="grid place-items-center shrink-0 press w-[var(--m-touch-min)] h-[var(--m-touch-min)] -my-1"
      >
        <span
          className="w-7 h-7 rounded-full grid place-items-center md-state"
          style={{ background: 'var(--bg-subtle-strong)', border: '1px solid var(--border-glass)' }}
        >
          <X size={15} style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
        </span>
      </button>
    </div>
  )
}
