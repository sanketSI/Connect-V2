import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCcw } from 'lucide-react'
import { cn, vibrate } from '../lib/utils'

// ============================================================
// THE SCROLLING BODY OF A TAB, WITH PULL-TO-REFRESH.
//
// Every tab screen repeated the same scroller — `absolute top-[44px] … pb-[88px]
// overflow-y-auto no-scrollbar` — so the geometry lives here once and the gesture comes
// with it.
//
// WHY IT IS HAND-WRITTEN. `html, body { overscroll-behavior: none }` (index.css) turns
// OFF the browser's own pull-to-refresh on purpose: a web app that reloads the document
// when a manager over-scrolls a list is not behaving like an app. That leaves the
// gesture people expect unowned, so this owns it.
//
// THE FEEL, and why each part is there:
//   • It engages only at the very top (scrollTop <= 0) and only on a downward drag, so
//     it can never fight a normal scroll.
//   • RESISTANCE (×0.45, capped): the sheet lags the finger, which is what tells you
//     you have reached the end of the list rather than that the app is slow.
//   • A HAPTIC at the moment you cross the threshold — the commit point is felt, not
//     read, so the eye stays on the list.
//   • It holds open while the work runs, then closes. A spinner that vanishes on release
//     leaves you unsure whether anything happened.
//
// REDUCED MOTION is honoured (see index.css / MotionConfig): the sheet does not slide,
// the spinner does not rotate with the drag — it simply appears, does its job and goes.
//
// ACCESSIBILITY. A drag is a path-based gesture, and WCAG 2.5.1 asks for a single-
// pointer alternative — so this is an ACCELERATOR, never the only way to see new data:
// every screen already re-derives from `dataStore` the moment any mutator commits (see
// useDataVersion), so a manager who cannot perform the drag is not stuck with stale
// numbers. The state change is announced via role="status" for anyone who cannot see
// the spinner.
// ============================================================

const THRESHOLD = 64      // px of PULLED distance that commits a refresh
const MAX_PULL = 96       // px the indicator can travel, however hard you drag
const RESISTANCE = 0.45   // finger travel → indicator travel

export default function ScreenScroll({ children, onRefresh, className, style }) {
  const { t } = useTranslation()
  const ref = useRef(null)
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef(null)
  const passedThreshold = useRef(false)

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const run = useCallback(async () => {
    setBusy(true)
    setPull(THRESHOLD)
    try { await onRefresh?.() } finally {
      setBusy(false)
      setPull(0)
    }
  }, [onRefresh])

  useEffect(() => {
    const el = ref.current
    if (!el || !onRefresh) return

    const onStart = (e) => {
      if (busy || el.scrollTop > 0) return
      start.current = e.touches[0].clientY
      passedThreshold.current = false
    }

    const onMove = (e) => {
      if (start.current == null || busy) return
      const dy = e.touches[0].clientY - start.current
      // Scrolled away from the top mid-drag, or dragging up — hand it back to the list.
      if (dy <= 0 || el.scrollTop > 0) { start.current = null; setPull(0); return }
      // Only now do we own the gesture, so a normal scroll is never swallowed.
      if (e.cancelable) e.preventDefault()
      const next = Math.min(dy * RESISTANCE, MAX_PULL)
      setPull(next)
      if (next >= THRESHOLD && !passedThreshold.current) {
        passedThreshold.current = true
        vibrate(10) // the commit point, felt
      } else if (next < THRESHOLD) {
        passedThreshold.current = false
      }
    }

    const onEnd = () => {
      if (start.current == null) return
      const commit = passedThreshold.current
      start.current = null
      passedThreshold.current = false
      if (commit) run(); else setPull(0)
    }

    // passive:false on move only — we may need to preventDefault to stop the scroll
    // chaining into the page while the indicator is open.
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [busy, onRefresh, run])

  const armed = pull >= THRESHOLD
  const open = pull > 0 || busy

  return (
    <div
      ref={ref}
      className={cn(
        'absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar',
        className,
      )}
      // pan-y: this scroller owns vertical panning, so the browser never waits to see
      // whether a drag was meant to be a horizontal swipe before it starts scrolling.
      style={{ touchAction: 'pan-y', ...style }}
    >
      {onRefresh && (
        <div
          className="absolute left-0 right-0 top-0 flex justify-center pointer-events-none z-20"
          style={{
            height: open ? Math.max(pull, busy ? THRESHOLD : 0) : 0,
            opacity: open ? 1 : 0,
            transition: start.current != null && !reduced ? 'none' : 'height .24s cubic-bezier(.2,0,0,1), opacity .18s',
          }}
        >
          <div className="self-center">
            <span
              className="w-8 h-8 rounded-full grid place-items-center"
              style={{
                background: 'var(--bg-iconbtn)',
                border: '1px solid var(--border-glass)',
                transform: reduced ? 'none' : `rotate(${busy ? 0 : pull * 3}deg)`,
              }}
            >
              <RefreshCcw
                size={15}
                className={busy ? 'spin-icon' : ''}
                style={{ color: armed || busy ? '#0070FC' : 'var(--text-tertiary)' }}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      )}

      {/* Announced, not just drawn — the spinner is invisible to anyone using a screen
          reader, and "did that do anything?" is the worst state to leave them in. */}
      <div role="status" aria-live="polite" className="sr-only">
        {busy ? t('common.refreshing', { defaultValue: 'Refreshing' }) : ''}
      </div>

      <div
        style={{
          transform: open && !reduced ? `translateY(${Math.max(pull, busy ? THRESHOLD : 0)}px)` : 'none',
          transition: start.current != null && !reduced ? 'none' : 'transform .24s cubic-bezier(.2,0,0,1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
