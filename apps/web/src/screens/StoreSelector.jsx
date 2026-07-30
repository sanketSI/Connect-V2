import React from 'react'
import { motion } from 'framer-motion'
import { Building2, MapPin, ChevronRight, AlertTriangle, PhoneMissed, ShieldCheck, ChevronLeft, Navigation, Check, Layers } from 'lucide-react'
import {
  DEALER_PHONE, maskPhone,
  BRAND_NAME, subBrandOf,
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

export default function StoreSelector({ current, fullStores = [], onPick, onBack }) {
  const { t } = useTranslation()

  // ============================================================
  // CASCADING SELECTS — one plain dropdown per level, stacked:
  //   Brand → Sub-brand → State → City → Location.
  // Each select narrows the ones below it, and picking a DEEPER level first
  // back-fills its ancestors from the record (choose Mumbai with nothing else set and
  // State becomes Maharashtra, Sub-brand becomes Tata Motors — the vice-versa rule).
  // "All" at any level means "stop here": the scope is the deepest chosen node.
  // Draft + Done, so several levels can be adjusted without being bounced to Home
  // after every change. The default rule lives at sign-in and is untouched here.
  // ============================================================
  const seed = () => {
    if (!current) return { subBrand: '', state: '', city: '', storeId: '' }
    if (!current.aggregate) {
      return { subBrand: subBrandOf(current), state: current.state || '', city: current.city || '', storeId: current.id }
    }
    // Re-open showing the node in force: match the label against each level's values.
    const bySub = fullStores.some(l => subBrandOf(l) === current.label)
    const bySt = fullStores.some(l => l.state === current.label)
    const byCity = fullStores.some(l => l.city === current.label)
    if (byCity) {
      const loc = fullStores.find(l => l.city === current.label)
      return { subBrand: subBrandOf(loc), state: loc.state, city: current.label, storeId: '' }
    }
    if (bySt) {
      const loc = fullStores.find(l => l.state === current.label)
      return { subBrand: subBrandOf(loc), state: current.label, city: '', storeId: '' }
    }
    if (bySub) return { subBrand: current.label, state: '', city: '', storeId: '' }
    return { subBrand: '', state: '', city: '', storeId: '' }
  }
  const [draft, setDraft] = React.useState(seed)

  const matches = (d) => fullStores.filter(l =>
    (!d.subBrand || subBrandOf(l) === d.subBrand)
    && (!d.state || l.state === d.state)
    && (!d.city || l.city === d.city))

  const distinct = (list, fn) => [...new Set(list.map(fn))]
  // Options per level: narrowed by the levels ABOVE it only, so a select never offers
  // a value its ancestors exclude — and never hides values you could still jump to.
  const subBrandOpts = distinct(fullStores, subBrandOf)
  const stateOpts = distinct(matches({ subBrand: draft.subBrand }), l => l.state)
  const cityOpts = distinct(matches({ subBrand: draft.subBrand, state: draft.state }), l => l.city)
  const locOpts = matches(draft)

  function pickLevel(level, value) {
    vibrate(6)
    setDraft(d => {
      if (level === 'subBrand') return { subBrand: value, state: '', city: '', storeId: '' }
      if (level === 'state') {
        if (!value) return { ...d, state: '', city: '', storeId: '' }
        const loc = fullStores.find(l => l.state === value && (!d.subBrand || subBrandOf(l) === d.subBrand))
          || fullStores.find(l => l.state === value)
        return { subBrand: subBrandOf(loc), state: value, city: '', storeId: '' }
      }
      if (level === 'city') {
        if (!value) return { ...d, city: '', storeId: '' }
        const loc = fullStores.find(l => l.city === value && (!d.state || l.state === d.state))
          || fullStores.find(l => l.city === value)
        return { subBrand: subBrandOf(loc), state: loc.state, city: value, storeId: '' }
      }
      // location — the record back-fills everything.
      if (!value) return { ...d, storeId: '' }
      const loc = fullStores.find(l => l.id === value)
      return { subBrand: subBrandOf(loc), state: loc.state, city: loc.city, storeId: value }
    })
  }

  // The scope the draft resolves to: the deepest chosen node.
  const resolved = draft.storeId
    ? { store: fullStores.find(l => l.id === draft.storeId) }
    : draft.city
      ? { name: draft.city, ids: matches(draft).map(l => l.id) }
      : draft.state
        ? { name: draft.state, ids: matches(draft).map(l => l.id) }
        : draft.subBrand
          ? { name: draft.subBrand, ids: matches(draft).map(l => l.id) }
          : { name: BRAND_NAME, ids: fullStores.map(l => l.id) }

  const summary = resolved.store
    ? `${resolved.store.name} — ${resolved.store.branch}`
    : `${resolved.name} · ${t('stores.nStoresShort', { count: resolved.ids.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}`

  const Select = ({ label, value, options, onChange, disabled }) => (
    <div className="flex-1 min-w-0">
      <div className="m-caption text-white/50 mb-1 ml-1">{label}</div>
      <div
        className="h-11 rounded-xl px-3 flex items-center"
        style={{ background: 'var(--bg-subtle)', border: value ? '1px solid rgba(0,112,252,.45)' : '1px solid var(--border-glass)', opacity: disabled ? 0.5 : 1 }}
      >
        <select
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          aria-label={label}
          className="w-full bg-transparent text-white m-callout outline-none appearance-none pr-5"
          style={{ background: 'transparent' }}
        >
          <option value="" style={{ color: '#111' }}>{t('common.all', { defaultValue: 'All' })}</option>
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ color: '#111' }}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )

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

        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }} className="mt-5">
          <div className="m-largeTitle text-white">{t('store.switchTitle')}</div>
          <p className="m-body text-white/65 mt-2">
            <Trans
              i18nKey="store.switchSubtitle"
              count={fullStores.length}
              components={{ 1: <b className="text-white/90" /> }}
              values={{ count: fullStores.length }}
            />
          </p>
        </motion.div>

        <div className="mt-5 flex-1 overflow-y-auto no-scrollbar">
          {/* Brand is the fixed root — shown, not chooseable, because there is one. */}
          <div className="m-caption text-white/50 mb-1 ml-1">{BRAND_NAME}</div>

          <div className="flex gap-2 mb-3">
            {/* Structural level names, English for now — translator TODO alongside
                common.refreshing; wrong-meaning key reuse would be worse than untranslated. */}
            <Select
              label="Sub-brand"
              value={draft.subBrand}
              options={subBrandOpts.map(v => ({ value: v, label: v }))}
              onChange={v => pickLevel('subBrand', v)}
            />
            <Select
              label="State"
              value={draft.state}
              options={stateOpts.map(v => ({ value: v, label: v }))}
              onChange={v => pickLevel('state', v)}
            />
          </div>
          <div className="flex gap-2 mb-3">
            <Select
              label="City"
              value={draft.city}
              options={cityOpts.map(v => ({ value: v, label: v }))}
              onChange={v => pickLevel('city', v)}
            />
            <Select
              label="Location"
              value={draft.storeId}
              options={locOpts.map(l => ({ value: l.id, label: `${l.name} — ${l.branch}` }))}
              onChange={v => pickLevel('store', v)}
            />
          </div>

          {/* What the current picks resolve to — said before it is applied. */}
          <div className="rounded-xl px-3.5 py-3 mb-4 flex items-center gap-2" style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}>
            <MapPin size={14} style={{ color: 'var(--si-primary-text)' }} className="shrink-0" />
            <span className="m-callout text-white truncate">{summary}</span>
          </div>

          <PrimaryButton icon={Check} onClick={() => { vibrate(10); onPick?.(resolved) }}>
            {t('common.done', { defaultValue: 'Done' })}
          </PrimaryButton>
        </div>

        <div className="mt-3 m-footnote text-white/40 text-center flex items-center justify-center gap-1.5">
          <ShieldCheck size={11} /> {t('store.maskedFooter')}
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
