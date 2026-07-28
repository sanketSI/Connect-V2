import React, { useState } from 'react'
import { MapPin, ChevronDown, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getStoreLocations } from '@connect/core'
import { vibrate } from '../lib/utils.js'
import BottomSheet from './BottomSheet.jsx'

// ============================================================
// WHICH BRANCH AM I LOOKING AT — the one control on a cumulative list.
//
// Grouping answers "how is each branch doing"; this answers "show me just this one".
// They are the same control in two positions: All keeps the branch headings and every
// group, a branch drops to that branch's rows alone.
//
// A DROPDOWN, not a chip row. Customers and Reviews already carry a chip row for their
// own filters, so a second one directly above it would read as more of the same thing —
// and a dealer with twenty outlets cannot use a row they have to scroll sideways
// through. A trigger plus a picker stays one line wide whatever the account size.
//
// EVERY branch is listed, including ones with nothing in the current view, and each
// carries its count. "HSR Layout 0" is an answer; a branch silently missing from the
// list is a question. It also makes the picker double as the roll-up — you can read
// where the volume is without opening anything.
// ============================================================
export default function LocationPicker({ value = 'all', onChange, groups = [], total = 0 }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // Counts come from the list BEFORE this filter is applied — otherwise selecting a
  // branch would zero every other row and the picker could not be used to switch.
  const countFor = (id) => groups.find(g => g.storeId === id)?.count ?? 0
  const locations = getStoreLocations()
  const current = value === 'all'
    ? t('stores.allLocations', { defaultValue: 'All locations' })
    : (locations.find(l => l.id === value)?.branch || value)

  function pick(next) {
    vibrate(6)
    onChange?.(next)
    setOpen(false)
  }

  const Row = ({ id, label, count }) => {
    const on = value === id
    return (
      <button
        onClick={() => pick(id)}
        className="w-full flex items-center gap-3 px-3 h-12 rounded-xl press text-left"
        style={{
          background: on ? 'rgba(0,112,252,.10)' : 'var(--bg-subtle)',
          border: on ? '1px solid rgba(0,112,252,.40)' : '1px solid var(--border-glass)',
        }}
      >
        <MapPin size={14} className="shrink-0" style={{ color: on ? '#0070FC' : 'var(--text-tertiary)' }} />
        <span className="flex-1 min-w-0 m-callout text-white truncate">{label}</span>
        <span className="m-caption m-tabular shrink-0" style={{ color: 'var(--text-tertiary)' }}>{count}</span>
        {on && <Check size={15} className="shrink-0" style={{ color: '#0070FC' }} />}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => { vibrate(6); setOpen(true) }}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full press min-w-0 max-w-full"
        style={{
          background: value === 'all' ? 'var(--bg-subtle)' : 'rgba(0,112,252,.10)',
          border: value === 'all' ? '1px solid var(--border-glass)' : '1px solid rgba(0,112,252,.40)',
          color: value === 'all' ? 'var(--text-secondary)' : 'var(--si-primary-text)',
        }}
      >
        <MapPin size={13} className="shrink-0" />
        <span className="m-subhead font-medium truncate">{current}</span>
        <ChevronDown size={13} className="shrink-0 opacity-70" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} label={t('stores.pickBranch', { defaultValue: 'Which branch?' })}>
        <div className="px-4 pb-6">
          <div className="m-title2 text-white">{t('stores.pickBranch', { defaultValue: 'Which branch?' })}</div>
          <div className="m-caption text-white/55 mt-0.5 mb-3">
            {t('stores.nStoresShort', { count: locations.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
          </div>
          <div className="space-y-2">
            <Row id="all" label={t('stores.allLocations', { defaultValue: 'All locations' })} count={total} />
            {locations.map(loc => (
              <Row key={loc.id} id={loc.id} label={loc.branch} count={countFor(loc.id)} />
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
