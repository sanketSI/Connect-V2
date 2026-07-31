// ============================================================
// THE GLOBAL TIME FILTER — one sheet, shared by Leads and Reviews.
//
// Native twin of apps/web/src/components/TimeFilterSheet.jsx; the reasoning lives there.
// In short (PM feedback 8): Leads had no period control at all and Reviews had a flat
// chip row with no custom range. Both now open this, laid out as the supplied screenshot
// specifies — a vertical radio list, a Custom Range section, and Reset · Cancel · Apply.
//
// The presets are core's TIME_WINDOWS, the same list resolveWindow() honours, so a period
// offered here is always one the selectors can actually apply.
//
// CANONICAL WINDOWS ARE UNTOUCHED. The tab badges and Home's hero run on
// CANONICAL_MISSED_WINDOW / CANONICAL_REVIEW_WINDOW and must keep doing so — a badge has
// nowhere to print a window, so it has to mean what you see when you tap it. This filter
// narrows the LIST on the screen you are standing on, and nothing else.
//
// DOCUMENTED DEVIATION: the two custom-range fields are TextInputs taking YYYY-MM-DD
// rather than a native date picker, the same deviation already recorded for the other
// date/time fields in this port. Typed dates are validated before Apply will enable.
// ============================================================
import { useEffect, useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'
import { RotateCcw, X } from 'lucide-react-native'
import { TIME_WINDOWS } from '@connect/core'
import { Body, Caption, PrimaryButton } from './UI.jsx'
import { vibrate } from '../lib/haptics.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const pad2 = n => String(n).padStart(2, '0')

export const toDateInput = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const startOfDayMs = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}
const endOfDayMs = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

export const isCustomWindow = win => typeof win === 'object' && win !== null

/** The label for whatever `win` is now — a preset id, or a custom {startMs,endMs}. */
export function windowLabelFor(t, win) {
  if (isCustomWindow(win)) return `${toDateInput(win.startMs)} → ${toDateInput(win.endMs)}`
  const w = TIME_WINDOWS.find(x => x.id === win)
  return w ? t(w.labelKey, { defaultValue: w.label }) : String(win)
}

export default function TimeFilterSheet({ open, value, defaultWindow = 'all', onClose, onApply }) {
  const { t } = useTranslation()
  const presets = TIME_WINDOWS.filter(w => w.id !== 'custom')

  const [sel, setSel] = useState(isCustomWindow(value) ? 'custom' : value)
  const [start, setStart] = useState(isCustomWindow(value) ? toDateInput(value.startMs) : '')
  const [end, setEnd] = useState(isCustomWindow(value) ? toDateInput(value.endMs) : '')

  // Re-seed on open: the sheet is a DRAFT, so reopening after a cancel must show what is
  // actually applied rather than the edit that was abandoned.
  useEffect(() => {
    if (!open) return
    setSel(isCustomWindow(value) ? 'custom' : value)
    setStart(isCustomWindow(value) ? toDateInput(value.startMs) : '')
    setEnd(isCustomWindow(value) ? toDateInput(value.endMs) : '')
  }, [open, value])

  const rangeValid = DATE_RE.test(start) && DATE_RE.test(end) && startOfDayMs(start) <= endOfDayMs(end)
  const canApply = sel !== 'custom' || rangeValid

  function apply() {
    vibrate(12)
    onApply(sel === 'custom' ? { startMs: startOfDayMs(start), endMs: endOfDayMs(end) } : sel)
    onClose()
  }

  return (
    <Modal visible={!!open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel={t('common.close', { defaultValue: 'Close' })} />
      <View className="bg-screen dark:bg-d-screen rounded-t-3xl px-4 pt-4 pb-6 max-h-[85%]">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-[19px] font-hk-bold text-ink dark:text-d-ink">
            {t('reviews.timePeriod', { defaultValue: 'Time period' })}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            className="w-9 h-9 rounded-full items-center justify-center border border-hairline dark:border-d-hairline"
          >
            <X size={16} color="#5F6878" />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <Caption className="mb-2">{t('calls.timeTitle', { defaultValue: 'Time period' })}</Caption>
          {presets.map(w => (
            <RadioRow
              key={w.id}
              selected={sel === w.id}
              onPress={() => { vibrate(6); setSel(w.id) }}
              label={t(w.labelKey, { defaultValue: w.label })}
            />
          ))}

          <Caption className="mt-4 mb-2">{t('window.custom', { defaultValue: 'Custom range' })}</Caption>
          <RadioRow
            selected={sel === 'custom'}
            onPress={() => { vibrate(6); setSel('custom') }}
            label={t('reviews.pickDates', { defaultValue: 'Pick your own dates' })}
          />
          {sel === 'custom' && (
            <View className="flex-row gap-2 mt-2">
              <DateField label={t('reviews.startDate', { defaultValue: 'Start Date' })} value={start} onChange={setStart} />
              <DateField label={t('reviews.endDate', { defaultValue: 'End Date' })} value={end} onChange={setEnd} />
            </View>
          )}
          {sel === 'custom' && !rangeValid && (
            <Caption className="mt-2 text-bad dark:text-d-bad">
              {t('reviews.rangeInvalid', { defaultValue: 'Pick a start date on or before the end date.' })}
            </Caption>
          )}
        </ScrollView>

        <View className="flex-row gap-2 mt-4">
          <Pressable
            onPress={() => { vibrate(6); setSel(defaultWindow); setStart(''); setEnd('') }}
            accessibilityRole="button"
            className="flex-1 h-12 rounded-xl flex-row items-center justify-center gap-1.5 border border-hairline dark:border-d-hairline"
          >
            <RotateCcw size={14} color="#5F6878" />
            <Text className="text-[15px] font-hk-semi text-ink-2 dark:text-d-ink2">
              {t('reviews.reset', { defaultValue: 'Reset' })}
            </Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="flex-1 h-12 rounded-xl items-center justify-center border border-hairline dark:border-d-hairline"
          >
            <Text className="text-[15px] font-hk-semi text-ink-2 dark:text-d-ink2">
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Text>
          </Pressable>
          <View className="flex-1">
            <PrimaryButton onPress={apply} disabled={!canApply}>
              {t('reviews.apply', { defaultValue: 'Apply' })}
            </PrimaryButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}

/** One period, with a real radio dot — the control the screenshot shows. */
function RadioRow({ selected, onPress, label }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      className={`h-11 px-3 mb-2 rounded-xl flex-row items-center gap-3 border ${
        selected ? 'bg-brand-blue/10 border-brand-blue/55' : 'bg-card dark:bg-white/5 border-hairline dark:border-d-hairline'
      }`}
    >
      <View
        className={`w-[18px] h-[18px] rounded-full items-center justify-center border-2 ${
          selected ? 'border-brand-blue' : 'border-hairline dark:border-d-hairline'
        }`}
      >
        {selected ? <View className="w-2 h-2 rounded-full bg-brand-blue" /> : null}
      </View>
      <Body className={`flex-1 ${selected ? 'text-ink dark:text-d-ink' : ''}`} numberOfLines={1}>{label}</Body>
    </Pressable>
  )
}

function DateField({ label, value, onChange }) {
  return (
    <View className="flex-1">
      <Caption className="mb-1">{label}</Caption>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#93A0C8"
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        className="h-11 rounded-xl border border-hairline dark:border-d-hairline bg-card dark:bg-white/5 px-3 text-[15px] text-ink dark:text-d-ink"
      />
    </View>
  )
}
