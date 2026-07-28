import React, { createContext, useEffect, useContext, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, X } from 'lucide-react'
import { SheetPortalContext } from './PhoneFrame.jsx'
import { useTranslation } from 'react-i18next'

// ============================================================
// ONE SHEET LAYER, EVER.
//
// A sheet is a modal over the screen, and a modal over a modal buries the context you
// opened it from — on a 375pt screen the second layer covers the record the first one
// was about. It also broke concretely: every BottomSheet installs its own `window`
// keydown listener, so ONE Escape closed BOTH layers and dropped the user two levels
// back instead of one. Two grab handles, two close buttons and two scrims on top of
// that.
//
// Depth is NAVIGATED instead — swap the sheet's content for a SheetSubview with a back
// chevron. Same layer, one handle, one scrim, one focus trap, and back means back.
//
// This context makes the rule self-enforcing rather than something a reviewer has to
// remember: a sheet that opens inside another says so, loudly, in dev.
// ============================================================
const SheetDepthContext = createContext(0)

export default function BottomSheet({ open, onClose, children, label, height = 'auto', fullHeight = false }) {
  const depth = useContext(SheetDepthContext)

  useEffect(() => {
    if (!open || depth === 0) return
    if (!import.meta.env?.DEV) return
    console.error(
      `[BottomSheet] A sheet opened inside another sheet (depth ${depth + 1}). ` +
      'Stacked sheets bury the record they were opened from, and one Escape closes ' +
      'every layer at once. Swap this sheet\'s content for a <SheetSubview> in the ' +
      'parent instead — see the note at the top of BottomSheet.jsx.',
    )
  }, [open, depth])

  // Render into the phone-screen-level host so the sheet always anchors to the
  // phone's bottom edge — never trapped inside a scrolled/transformed container.
  const { t } = useTranslation()
  const portalHost = useContext(SheetPortalContext)
  const panelRef = useRef(null)
  const prevFocusRef = useRef(null)
  const scrollRef = useRef(null)

  // Reset on OPEN rather than on close: the panel unmounts through an exit animation,
  // so scrolling it back on the way out is visible as a jump.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = 0
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Escape closes the sheet — the keyboard equivalent of tapping the scrim.
  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus management: on open, remember what had focus and move focus into the sheet;
  // restore it on close. Tab is trapped inside so keyboard / screen-reader users cannot
  // wander to the inert content behind the scrim.
  //
  // Focus lands on the PANEL, not on the first control in it. The first control is the
  // close button, so every sheet used to open by announcing "Close" — the way out named
  // before the thing itself — and by drawing a focus ring on the dismiss control. The
  // panel is role="dialog" + aria-modal, so focusing it announces the sheet and leaves
  // Tab to walk the content in order.
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement
    const panel = panelRef.current
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    // A disabled or hidden control cannot take focus, so leaving it in the ring breaks
    // the wrap: .focus() on it is a no-op and the trap leaks to the page behind.
    const focusables = () => (panel ? [...panel.querySelectorAll(sel)] : [])
      .filter(el => !el.disabled && el.offsetParent !== null)
    const raf = requestAnimationFrame(() => panel?.focus({ preventScroll: true }))
    const onTab = (e) => {
      if (e.key !== 'Tab' || !panel) return
      const f = focusables()
      // Nothing focusable inside: keep focus on the panel rather than letting Tab
      // escape to the inert page under the scrim.
      if (!f.length) { e.preventDefault(); panel.focus({ preventScroll: true }); return }
      const first = f[0], last = f[f.length - 1]
      const active = document.activeElement
      // Focus starts ON the panel, which is at neither end of the ring — so the first
      // Tab has to be placed explicitly, or Shift+Tab would step out of the sheet.
      if (active === panel || !panel.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onTab)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onTab)
      const prev = prevFocusRef.current
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [open])

  const tree = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 z-40 sheet-scrim pointer-events-auto"
            style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            /* aria-modal is what tells a screen reader the page behind the scrim is
               inert — the assistive-tech half of the focus trap below. `label` names
               the sheet; without it this announces only as "dialog". */
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.35 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120) onClose?.() }}
            className="absolute left-0 right-0 bottom-0 z-50 rounded-t-[28px] glass-strong pointer-events-auto flex flex-col overflow-hidden"
            style={{
              maxHeight: fullHeight ? 'calc(100% - 44px)' : '85%',
              height: height === 'auto' ? 'auto' : height,
              background: 'var(--bg-sheet)',
              boxShadow: 'var(--shadow-sheet)',
              borderTop: '1px solid var(--border-glass-strong)',
            }}
          >
            <div className="relative flex justify-center pt-2 pb-1 shrink-0">
              <span className="w-9 h-1 rounded-full" style={{ background: 'var(--border-glass-strong)' }} />
              {onClose && (
                <button
                  onClick={onClose}
                  aria-label={t('common.close', { defaultValue: 'Close' })}
                  className="absolute right-3 top-1.5 w-8 h-8 rounded-full grid place-items-center press"
                  style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
                >
                  <X size={15} style={{ color: 'var(--text-tertiary)' }} />
                </button>
              )}
            </div>
            {/* Every sheet opens at the TOP. The scroller is reused between openings, so
                without this the next record opens wherever the last one was left — open
                a lead, scroll to its notes, close, open another, and you land halfway
                down a different person with their name scrolled off the screen. */}
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-y-auto no-scrollbar"
              style={{ paddingBottom: 'var(--m-homeind)' }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  // The provider wraps the portal CALL, not the DOM node: context follows the React
  // tree, so anything rendered as `children` sees the new depth even though it lands
  // in the phone-screen host.
  return (
    <SheetDepthContext.Provider value={depth + 1}>
      {portalHost ? createPortal(tree, portalHost) : tree}
    </SheetDepthContext.Provider>
  )
}

/**
 * A view pushed INSIDE a sheet, in place of a second sheet on top of it.
 *
 * Carries the only chrome a pushed view needs: a back chevron and the title of where
 * you are. No close button and no grab handle — the sheet it lives in already has
 * exactly one of each, which is the entire point.
 *
 * The header is sticky, so on a long sub-view (the image-protection scan runs to a few
 * screens) the way back does not scroll off the top.
 */
export function SheetSubview({ title, onBack, children }) {
  const { t } = useTranslation()
  return (
    <div>
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-4 pt-1 pb-2"
        style={{ background: 'var(--bg-sheet)' }}
      >
        <button
          onClick={onBack}
          aria-label={t('common.back', { defaultValue: 'Back' })}
          className="w-9 h-9 rounded-full grid place-items-center press shrink-0"
          style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
        >
          <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="m-headline text-white truncate">{title}</div>
      </div>
      {children}
    </div>
  )
}

/**
 * The push/pop transition for a sheet's own views. Forward slides in from the right,
 * back from the left — the same read as a nav stack, on the app's emphasized curve.
 *
 * `dir` is +1 pushing deeper, -1 coming back.
 */
export function SheetViews({ viewKey, dir = 1, children }) {
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={viewKey}
        custom={dir}
        initial={{ x: dir * 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: dir * -24, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
