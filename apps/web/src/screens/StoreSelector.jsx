import React from 'react'
import { motion } from 'framer-motion'
import { Building2, MapPin, ChevronRight, AlertTriangle, PhoneMissed, ShieldCheck, ChevronLeft, Navigation, Check, Layers } from 'lucide-react'
import {
  DEALER_PHONE, maskPhone, BRAND_NAME, subBrandOf,
  scopeMatches, scopeOptions, toggleScope, scopeLabel, impliedAt,
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

// The four levels, in tree order. Captions are English for now — the catalogs carry
// no structural level names, and reusing a near-miss key would be worse than a
// labelled gap. Translator TODO alongside common.refreshing.
const LEVELS = [
  { key: 'subBrands', label: 'Sub-brand', Icon: Building2 },
  { key: 'states', label: 'State', Icon: MapPin },
  { key: 'cities', label: 'City', Icon: MapPin },
  { key: 'locations', label: 'Location', Icon: Building2 },
]

export default function StoreSelector({ current, fullStores = [], onPick, onBack }) {
  const { t } = useTranslation()
  const fullIds = fullStores.map(l => l.id)

  // ============================================================
  // LEVEL TABS + SMART CHIPS. The rail on the left is the hierarchy; the pane on the
  // right is that level's values, MULTI-SELECT — so a manager can hold Bangalore and
  // Mysore at once, which no single-node drill could express. Empty at a level means
  // "all of it", which is why the brand default needs no special case.
  //
  // All the rules (cascade, ancestor back-fill, pruning) live in core so this screen
  // and the native one cannot drift.
  // ============================================================
  const seed = () => {
    if (!current) return { subBrands: [], states: [], cities: [], locations: [] }
    if (!current.aggregate) {
      return { subBrands: [subBrandOf(current)], states: [current.state], cities: [current.city], locations: [current.id] }
    }
    if (Array.isArray(current.sel)) return current.sel
    return current.sel || { subBrands: [], states: [], cities: [], locations: [] }
  }
  const [sel, setSel] = React.useState(seed)
  const [level, setLevel] = React.useState('subBrands')

  const options = scopeOptions(fullIds, sel)
  const matched = scopeMatches(fullIds, sel)
  const label = scopeLabel(fullIds, sel)
  const chips = options[level] || []
  const chosen = sel[level] || []

  /** For an unfiltered level: what the current picks span there. */
  const impliedLabel = (key) => {
    const all = (options[key] || []).length
    const vals = impliedAt(fullIds, sel, key)
    if (!vals.length || vals.length >= all) return t('common.all', { defaultValue: 'All' })
    return vals.length === 1 ? vals[0] : `${vals.length} implied`
  }

  function apply() {
    vibrate(10)
    // One location and nothing broader → focus that store, the shape every screen
    // already understands. Otherwise an aggregate carrying the resolved id set.
    if (chosen.length === 0 && sel.locations.length === 1 && matched.length === 1) {
      onPick?.({ store: matched[0], sel })
      return
    }
    if (sel.locations.length === 1 && matched.length === 1) {
      onPick?.({ store: matched[0], sel })
      return
    }
    onPick?.({ name: label, ids: matched.map(l => l.id), sel })
  }

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--bg-screen)' }}>
      <Wash />
      <div className="relative h-full flex flex-col pt-[52px] px-4 pb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onBack?.()}
            className="w-9 h-9 rounded-full grid place-items-center press"
            style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
            aria-label={t('common.back')}
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
          <div className="flex items-center gap-1.5 px-2.5 h-8 rounded-full m-subhead m-tabular" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={13} /> {maskPhone(DEALER_PHONE)}
          </div>
        </div>

        <div className="mt-4">
          <div className="m-title2 text-white">{t('store.switchTitle')}</div>
          <div className="m-caption text-white/50 mt-0.5">
            {BRAND_NAME} · {t('stores.nStoresShort', { count: fullStores.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
          </div>
        </div>

        {/* THE SPLIT: level rail | value chips */}
        <div className="mt-3 flex-1 min-h-0 flex gap-2.5">
          <div className="w-[104px] shrink-0 space-y-1.5" role="tablist" aria-orientation="vertical">
            {LEVELS.map(lv => {
              const on = level === lv.key
              const n = (sel[lv.key] || []).length
              return (
                <button
                  key={lv.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => { vibrate(6); setLevel(lv.key) }}
                  className="w-full text-left rounded-xl px-2.5 py-2.5 press"
                  style={{
                    background: on ? 'rgba(0,112,252,.14)' : 'var(--bg-subtle)',
                    border: on ? '1px solid rgba(0,112,252,.45)' : '1px solid var(--border-glass)',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <lv.Icon size={12} style={{ color: on ? '#0070FC' : 'var(--text-tertiary)' }} className="shrink-0" />
                    <span className="m-caption font-semibold truncate" style={{ color: on ? 'var(--si-primary-text)' : 'var(--text-secondary)' }}>
                      {lv.label}
                    </span>
                  </div>
                  {/* Explicit picks in brand blue; otherwise what the OTHER levels
                      imply for this one, muted — the vice-versa feedback, without
                      pretending the manager filtered here. */}
                  <div className="m-micro mt-0.5 truncate" style={{ color: n ? 'var(--si-primary-text)' : 'var(--text-tertiary)' }}>
                    {n ? `${n} selected` : impliedLabel(lv.key)}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar" role="tabpanel">
            <div className="flex flex-wrap gap-1.5">
              {/* "All" clears this level — the honest way back to unfiltered. */}
              <button
                onClick={() => { vibrate(6); setSel(s => ({ ...s, [level]: [] })) }}
                className="px-2.5 h-8 rounded-full m-caption font-semibold press"
                style={chosen.length === 0
                  ? { background: '#0070FC', color: '#fff', border: '1px solid #0070FC' }
                  : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}
              >
                {t('common.all', { defaultValue: 'All' })}
              </button>
              {chips.map(o => {
                const on = chosen.includes(o.value)
                return (
                  <button
                    key={o.value}
                    aria-pressed={on}
                    onClick={() => { vibrate(6); setSel(s => toggleScope(fullIds, s, level, o.value)) }}
                    className="px-2.5 h-8 rounded-full m-caption font-semibold press inline-flex items-center gap-1 max-w-full"
                    style={on
                      ? { background: '#0070FC', color: '#fff', border: '1px solid #0070FC' }
                      : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}
                  >
                    {on && <Check size={11} className="shrink-0" />}
                    <span className="truncate">{o.label}</span>
                    {level !== 'locations' && <span className="opacity-60 m-tabular">{o.count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* What the picks resolve to — named before it is applied. */}
        <div className="mt-3 rounded-xl px-3.5 py-2.5 flex items-center gap-2" style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}>
          <MapPin size={14} style={{ color: 'var(--si-primary-text)' }} className="shrink-0" />
          <span className="m-callout text-white truncate flex-1">{label}</span>
          <span className="m-caption text-white/60 shrink-0">
            {t('stores.nStoresShort', { count: matched.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
          </span>
        </div>

        <div className="mt-2.5">
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
