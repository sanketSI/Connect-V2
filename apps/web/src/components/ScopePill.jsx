import React from 'react'
import { RefreshCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { networkRollup } from '@connect/core'

// ============================================================
// THE GLOBAL LOCATION SWITCHER — one control, the same on every screen.
//
// PM feedback 6: "Keep the Global Location filter (location switcher) consistent on each
// of the pages: Home screen, Lead screen, Review screen."
//
// It was not consistent, and not merely cosmetically. There were TWO controls with two
// different models:
//
//   • Home carried this pill, which opens the TATA Location Selector (Sub-brand → State
//     → City → Location, multi-select, Apply) and sets the SESSION SCOPE — the thing
//     every selector, badge and roll-up in the app narrows by.
//   • Leads and Reviews carried LocationPicker: a flat dropdown of assigned stores held
//     in each screen's own `branch` useState, filtering that ONE list and nothing else.
//
// So picking Mumbai on Leads left Home, the tab badges and Reviews on the old scope, and
// picking it on Home did not narrow the Leads list. Two answers to "which location am I
// looking at", on adjacent screens, disagreeing.
//
// This is the survivor because it is the one wired to the single scope authority
// (setSessionAssignments — see apps/mobile/lib/session.js and App.jsx). A screen-local
// filter cannot be "global" however it is styled.
//
// Customers and CallsTab still use LocationPicker. Both are FULL-BUILD screens (the MVP
// tab bar drops them), the feedback names three pages, and converting them means
// unpicking their grouping logic too — deliberately out of scope, not overlooked.
// ============================================================
export default function ScopePill({ store, onSwitchStore, className = '' }) {
  const { t } = useTranslation()
  const aggregate = !!store?.aggregate

  return (
    <button
      onClick={onSwitchStore}
      // shrink-0: this sits in a scrolling chip row beside the period and filter chips,
      // and without it flex squeezed the pill until "Tetley · Indiranagar" wrapped mid-
      // label onto a second line and pushed the row to double height.
      className={`inline-flex items-center shrink-0 min-h-[var(--m-touch-min)] press ${className}`}
    >
      {/* Chip idiom (see UI.jsx): the BUTTON is the full 44px touch target, the painted
          pill stays 32px as an inner span. The hit area grows, the design does not. */}
      <span
        className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full m-subhead md-state whitespace-nowrap"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}
      >
        {aggregate
          ? `${store.label || t('stores.allLocations', { defaultValue: 'All locations' })} · ${t('stores.nStoresShort', { count: networkRollup().stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}`
          : `${store?.name} · ${store?.branch}`}
        <RefreshCcw size={12} />
        <span className="text-white/45">{t('common.switch')}</span>
      </span>
    </button>
  )
}
