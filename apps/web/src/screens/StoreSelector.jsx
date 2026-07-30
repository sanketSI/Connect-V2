import React from 'react'
import { motion } from 'framer-motion'
import { Building2, MapPin, AlertTriangle, ShieldCheck, Check, CheckCheck, Store, Map as MapIcon, Search, X } from 'lucide-react'
import {
  DEALER_PHONE, maskPhone, BRAND_NAME, subBrandOf,
  scopeMatches, toggleScope, scopeLabel, selectorRows,
} from '@connect/core'
import { PrimaryButton } from '../components/UI.jsx'
import { vibrate } from '../lib/utils.js'
import { FEATURES } from '../lib/features.js'
import { useTranslation, Trans } from 'react-i18next'

// ===========================================================================
// THE STORE SWITCHER — reached from Home/Profile via App's onSwitchStore.
//
// It had a second job once: a "Choose your store" gate between the OTP and the app,
// for a number holding several outlets. That gate is gone — sign-in opens All
// locations and this is where a manager narrows to one branch, by choice rather than
// before they have seen anything. So there is always a session now, `current` always
// marks a store, and backing out returns to the app: leaving a switch must never
// sign anyone out.
//
// It owns no session state. App owns the `store` and decides what opening one means
// (a flagged store goes to verification first).
// ===========================================================================

// The selector's tabs ARE the hierarchy's rungs, named as such — no invented product
// vocabulary between the manager and the tree they already know. Broadest first, so
// the rail reads down the way the tree does.
// Labels are English for now: the catalogs carry no structural names for these, and a
// near-miss key would read worse than a labelled gap. Translator TODO.
const TABS = [
  { id: 'subBrands', label: 'Sub-brand', Icon: Building2 },
  { id: 'states', label: 'State', Icon: MapIcon },
  { id: 'cities', label: 'City', Icon: MapPin },
  { id: 'locations', label: 'Location', Icon: Store },
]

export default function StoreSelector({ current, fullStores = [], onPick, onBack }) {
  const { t } = useTranslation()
  const fullIds = fullStores.map(l => l.id)

  const seed = () => {
    if (!current) return { subBrands: [], states: [], cities: [], locations: [] }
    if (!current.aggregate) {
      return { subBrands: [subBrandOf(current)], states: [current.state], cities: [current.city], locations: [current.id] }
    }
    return current.sel || { subBrands: [], states: [], cities: [], locations: [] }
  }
  const [sel, setSel] = React.useState(seed)
  const [tab, setTab] = React.useState('subBrands')
  const [query, setQuery] = React.useState('')

  const rows = selectorRows(fullIds, tab, sel)
  const q = query.trim().toLowerCase()
  // Search reads every line the card shows, so what you can see you can find.
  const shown = q
    ? rows.filter(r => [r.title, r.subtitle, r.meta].filter(Boolean).join(' ').toLowerCase().includes(q))
    : rows

  const matched = scopeMatches(fullIds, sel)
  const label = scopeLabel(fullIds, sel)
  const isOn = (row) => (sel[row.level] || []).includes(row.value)
  const anySel = !!(sel.subBrands.length || sel.states.length || sel.cities.length || sel.locations.length)

  function toggle(row) {
    vibrate(6)
    setSel(s => toggleScope(fullIds, s, row.level, row.value))
  }

  /** Add every row currently listed — the bulk move a long filtered list needs. */
  function selectAllShown() {
    vibrate(8)
    setSel(s => shown.reduce((acc, r) => ((acc[r.level] || []).includes(r.value) ? acc : toggleScope(fullIds, acc, r.level, r.value)), s))
  }

  function apply() {
    vibrate(10)
    if (sel.locations.length === 1 && matched.length === 1) onPick?.({ store: matched[0], sel })
    else onPick?.({ name: label, ids: matched.map(l => l.id), sel })
  }

  return (
    <div className="absolute inset-0 overflow-hidden flex flex-col" style={{ background: 'var(--bg-screen)' }}>
      <Wash />

      {/* Tab rail — horizontal pills, the selected one solid brand blue. */}
      <div className="relative pt-[52px] px-4 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        {TABS.map(tb => {
          const on = tab === tb.id
          return (
            <button
              key={tb.id}
              role="tab"
              aria-selected={on}
              onClick={() => { vibrate(6); setTab(tb.id); setQuery('') }}
              className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-full press shrink-0"
              style={on
                ? { background: '#0070FC', color: '#fff', border: '1px solid #0070FC' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}
            >
              <tb.Icon size={15} className="shrink-0" />
              <span className="m-subhead font-semibold">{tb.label}</span>
            </button>
          )
        })}
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col px-4">
        {/* Title row + the two header actions. */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <div className="m-title2 text-white">{t('store.switchTitle')}</div>
            <div className="m-caption text-white/55 mt-0.5 flex items-center gap-2 min-w-0">
              <span className="truncate">
                {label} · {t('stores.nStoresShort', { count: matched.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
              </span>
              {/* The way back to the whole brand, now that there is no Brand tab:
                  an empty selection IS the brand, so this is one tap to everything. */}
              {anySel && (
                <button
                  onClick={() => { vibrate(6); setSel({ subBrands: [], states: [], cities: [], locations: [] }) }}
                  className="shrink-0 press m-caption font-semibold"
                  style={{ color: 'var(--si-primary-text)' }}
                >
                  {t('reviews.reset', { defaultValue: 'Reset' })}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={selectAllShown}
              aria-label={t('common.all', { defaultValue: 'All' })}
              className="w-11 h-11 rounded-xl grid place-items-center press"
              style={{ background: '#0070FC' }}
            >
              <CheckCheck size={18} color="#fff" />
            </button>
            <button
              onClick={() => onBack?.()}
              aria-label={t('common.close', { defaultValue: 'Close' })}
              className="w-11 h-11 rounded-xl grid place-items-center press"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
            >
              <X size={18} className="text-white/70" />
            </button>
          </div>
        </div>

        {/* Search — reads every line the cards show. */}
        <div
          className="mt-3 h-11 rounded-xl flex items-center gap-2 px-3 shrink-0"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)' }}
        >
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('common.search', { defaultValue: 'Search' })}
            aria-label={t('common.search', { defaultValue: 'Search' })}
            className="flex-1 bg-transparent text-white m-callout outline-none placeholder:text-white/30"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label={t('common.close', { defaultValue: 'Close' })} className="press shrink-0">
              <X size={14} className="text-white/40" />
            </button>
          )}
        </div>

        {/* The rows. */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar mt-3 space-y-2">
          {shown.map(row => {
            const on = isOn(row)
            const flagged = row.flags && row.flags.length > 0
            return (
              <button
                key={`${row.level}:${row.value}`}
                onClick={() => toggle(row)}
                role="checkbox"
                aria-checked={on}
                className="w-full text-left rounded-2xl p-3.5 press flex items-start gap-3"
                style={{
                  background: on ? 'rgba(0,112,252,.10)' : 'var(--bg-card)',
                  border: on ? '1px solid rgba(0,112,252,.45)' : '1px solid var(--border-glass)',
                }}
              >
                <span
                  className="w-5 h-5 rounded-md grid place-items-center shrink-0 mt-0.5"
                  style={on
                    ? { background: '#0070FC', border: '1px solid #0070FC' }
                    : { background: 'transparent', border: '1px solid var(--border-glass-strong)' }}
                >
                  {on && <Check size={13} color="#fff" />}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="m-headline text-white">{row.title}</span>
                    {row.level === 'locations' && (
                      flagged ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold"
                          style={{ background: 'rgba(202,138,4,.12)', color: 'var(--si-warning-text)', border: '1px solid rgba(202,138,4,.30)' }}
                        >
                          <AlertTriangle size={11} /> {t('store.needsVerification')}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold"
                          style={{ background: 'rgba(22,163,74,.12)', color: '#15803D', border: '1px solid rgba(22,163,74,.30)' }}
                        >
                          <ShieldCheck size={11} /> {t('verify.verified', { defaultValue: 'Verified' })}
                        </span>
                      )
                    )}
                    {row.level !== 'locations' && (
                      <span className="m-caption text-white/45">
                        {t('stores.nStoresShort', { count: row.count, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
                      </span>
                    )}
                  </span>
                  {row.subtitle && <span className="block m-callout text-white/70 mt-0.5 truncate">{row.subtitle}</span>}
                  {row.meta && <span className="block m-caption text-white/40 mt-0.5 truncate">{row.meta}</span>}
                </span>
              </button>
            )
          })}

          {shown.length === 0 && (
            <div className="text-center py-8">
              <div className="m-headline text-white">{t('leads.emptyTitle', { defaultValue: 'Nothing here' })}</div>
              <div className="m-caption text-white/55 mt-0.5">{t('customers.emptySub', { defaultValue: 'Try another filter.' })}</div>
            </div>
          )}
          <div className="h-2" />
        </div>

        {/* Apply. */}
        <div className="py-3 shrink-0">
          <PrimaryButton icon={Check} disabled={matched.length === 0} onClick={apply}>
            {t('common.done', { defaultValue: 'Done' })}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// Soft brand wash behind the cards.
function Wash() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-70"
      style={{ background: 'radial-gradient(60% 40% at 20% 0%, rgba(0,112,252,.14) 0%, transparent 60%), radial-gradient(50% 40% at 100% 100%, rgba(14,0,113,.10) 0%, transparent 60%)' }}
    />
  )
}

function Stat({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1 m-caption text-white/60">
      {Icon && <Icon size={11} />} {label}
    </span>
  )
}
