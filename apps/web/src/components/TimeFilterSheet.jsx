import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TIME_WINDOWS } from '@connect/core'
import BottomSheet from './BottomSheet.jsx'
import { PrimaryButton, GhostButton } from './UI.jsx'
import { vibrate } from '../lib/utils.js'

// ============================================================
// THE GLOBAL TIME FILTER — one sheet, shared by Leads and Reviews.
//
// PM feedback 8: "Add a global time filter which can help filter leads and reviews based
// on time. Earlier, it was there in the previous version, but somehow it has got
// stripped. Please add it again."
//
// Reviews still had one; LEADS had none at all, which is the half that went missing. So
// rather than write a second sheet, Reviews' own was lifted out here and both screens now
// open the same control — the same reason the location switcher was unified in
// ScopePill.jsx. Two time filters would drift the same way two location filters did.
//
// The layout follows the supplied screenshot: a VERTICAL radio list (it was a two-column
// grid), the "Time Range" and "Custom Range" headings, and Reset · Cancel · Apply.
//
// THE PRESETS ARE core's TIME_WINDOWS, not a local copy — the same list resolveWindow()
// honours, so a period this sheet offers is always one the selectors can actually apply.
//
// WHAT THIS DOES NOT TOUCH: the CANONICAL windows. The tab badges, Home's hero and the
// all-clear line run on CANONICAL_MISSED_WINDOW / CANONICAL_REVIEW_WINDOW and must keep
// doing so — a badge has nowhere to print a window, so it has to mean what you see when
// you tap it. This filter narrows the LIST on the screen you are standing on. That
// separation is why the "8 vs 11" reconciliation still holds with a period picker on.
// ============================================================

const pad2 = (n) => String(n).padStart(2, '0')
export const toDateInput = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
export const startOfDayMs = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}
export const endOfDayMs = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

export const isCustomWindow = (win) => typeof win === 'object' && win !== null

/** The label for whatever `win` currently is — a preset id, or a custom {startMs,endMs}. */
export function useWindowLabeller() {
  const { t } = useTranslation()
  return (win) => {
    if (isCustomWindow(win)) {
      return `${toDateInput(win.startMs)} → ${toDateInput(win.endMs)}`
    }
    const w = TIME_WINDOWS.find(x => x.id === win)
    return w ? t(w.labelKey, { defaultValue: w.label }) : String(win)
  }
}

export default function TimeFilterSheet({ open, value, defaultWindow = 'last30', onClose, onApply }) {
  const { t } = useTranslation()
  const presets = TIME_WINDOWS.filter(w => w.id !== 'custom')

  const [sel, setSel] = useState(isCustomWindow(value) ? 'custom' : value)
  const [start, setStart] = useState(isCustomWindow(value) ? toDateInput(value.startMs) : '')
  const [end, setEnd] = useState(isCustomWindow(value) ? toDateInput(value.endMs) : '')

  // Re-seed each time it opens: the sheet is a draft of the filter, and reopening after
  // a cancel must show what is actually applied rather than the abandoned edit.
  useEffect(() => {
    if (!open) return
    setSel(isCustomWindow(value) ? 'custom' : value)
    setStart(isCustomWindow(value) ? toDateInput(value.startMs) : '')
    setEnd(isCustomWindow(value) ? toDateInput(value.endMs) : '')
  }, [open, value])

  const rangeValid = !!start && !!end && startOfDayMs(start) <= endOfDayMs(end)
  const canApply = sel !== 'custom' || rangeValid

  function apply() {
    vibrate(12)
    onApply(sel === 'custom' ? { startMs: startOfDayMs(start), endMs: endOfDayMs(end) } : sel)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} label={t('reviews.timePeriod', { defaultValue: 'Time period' })}>
      <div className="px-4 pb-2">
        <div className="m-title3 text-white mb-3">{t('reviews.timePeriod', { defaultValue: 'Time period' })}</div>

        {/* TIME RANGE — a vertical radio list, one per line, as specified. A two-column
            grid put "Last 7 days" beside "Last 30 days" where the eye compares them as a
            pair rather than reading a single ordered scale. */}
        <div className="m-subhead text-white/55 mb-2">
          {t('calls.timeTitle', { defaultValue: 'Time period' })}
        </div>
        <div className="space-y-2">
          {presets.map(w => (
            <RadioRow
              key={w.id}
              selected={sel === w.id}
              onClick={() => setSel(w.id)}
              label={t(w.labelKey, { defaultValue: w.label })}
            />
          ))}
        </div>

        <div className="mt-4 m-subhead text-white/55 mb-2">
          {t('window.custom', { defaultValue: 'Custom range' })}
        </div>
        <RadioRow
          selected={sel === 'custom'}
          onClick={() => setSel('custom')}
          label={t('reviews.pickDates', { defaultValue: 'Pick your own dates' })}
        />
        <AnimatePresence initial={false}>
          {sel === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 mt-2">
                <DateField label={t('reviews.startDate', { defaultValue: 'Start Date' })} value={start} onChange={setStart} />
                <DateField label={t('reviews.endDate', { defaultValue: 'End Date' })} value={end} onChange={setEnd} />
              </div>
              {!rangeValid && (
                <div className="m-caption text-[#FF6B7E] mt-2">
                  {t('reviews.rangeInvalid', { defaultValue: 'Pick a start date on or before the end date.' })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="sticky bottom-0 mt-5 pt-3 pb-1 grid grid-cols-3 gap-2"
          style={{ background: 'linear-gradient(180deg, transparent 0%, var(--bg-sheet) 30%)' }}
        >
          <GhostButton icon={RotateCcw} onClick={() => { setSel(defaultWindow); setStart(''); setEnd('') }}>
            {t('reviews.reset', { defaultValue: 'Reset' })}
          </GhostButton>
          <GhostButton onClick={onClose}>{t('common.cancel')}</GhostButton>
          <PrimaryButton onClick={apply} disabled={!canApply}>{t('reviews.apply', { defaultValue: 'Apply' })}</PrimaryButton>
        </div>
      </div>
    </BottomSheet>
  )
}

/** One period, with a real radio dot — the control the screenshot shows. */
function RadioRow({ selected, onClick, label }) {
  return (
    <button
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      className={'w-full h-11 px-3 rounded-xl flex items-center gap-3 m-callout press text-left '
        + (selected ? 'text-white' : 'text-white/75')}
      style={{
        background: selected ? 'rgba(0,112,252,.14)' : 'var(--bg-subtle)',
        border: `1px solid ${selected ? 'rgba(0,112,252,.55)' : 'var(--border-subtle)'}`,
      }}
    >
      <span
        className="w-[18px] h-[18px] rounded-full grid place-items-center shrink-0"
        style={{ border: `2px solid ${selected ? '#0070FC' : 'var(--border-glass-strong)'}` }}
      >
        {selected && <span className="w-2 h-2 rounded-full" style={{ background: '#0070FC' }} />}
      </span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
    </button>
  )
}

function DateField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="m-caption text-white/55 block mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-11 px-3 rounded-xl bg-transparent outline-none text-white m-callout m-tabular"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', colorScheme: 'dark' }}
      />
    </label>
  )
}
