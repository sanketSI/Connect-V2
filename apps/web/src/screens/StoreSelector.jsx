import React from 'react'
import { motion } from 'framer-motion'
import { Building2, MapPin, ChevronRight, AlertTriangle, PhoneMissed, ShieldCheck, ChevronLeft, Navigation, Check, Layers } from 'lucide-react'
import {
  DEALER_PHONE, maskPhone,
  BRAND_NAME, brandTree,
} from '@connect/core'
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
  const fullIds = fullStores.map(l => l.id)

  // ONE LIST, THE WHOLE TREE. The level-by-level drill made a manager walk four taps
  // to reach a shop; this holding fits on one screen, so every node is one tap away.
  // Selecting a row scopes to that node — its ancestors are auto-selected by
  // construction, because a city's ids are a subset of its state's.
  const rows = brandTree(fullIds)
  const missedFor = (ids) => fullStores.filter(l => ids.includes(l.id)).reduce((n, l) => n + (l.missed || 0), 0)

  const isCurrent = (row) => row.store
    ? current?.id === row.store.id
    : !!current?.aggregate
      && (current.label === row.name || (!current.label && row.level === 'brand'))
      && (current.ids ? current.ids.length === row.ids.length : row.ids.length === fullIds.length)

  const ICONS = { brand: Layers, subBrand: Building2, state: MapPin, city: MapPin, store: Building2 }

  function choose(row) {
    vibrate(10)
    onPick?.(row)
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

        <div className="mt-5 flex-1 overflow-y-auto no-scrollbar space-y-1.5">
          {rows.map((row, i) => {
            const on = isCurrent(row)
            const Icon = ICONS[row.level] || Building2
            const leaf = !!row.store
            return (
              <motion.button
                key={`${row.level}:${row.name}:${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02, duration: 0.22 }}
                onClick={() => choose(row)}
                aria-current={on ? 'true' : undefined}
                className="w-full text-left rounded-xl px-3 py-2.5 glass press flex items-center gap-2.5"
                style={{
                  marginLeft: row.depth * 16,
                  width: `calc(100% - ${row.depth * 16}px)`,
                  ...(on ? { borderColor: 'rgba(0,112,252,.45)', boxShadow: '0 0 0 3px rgba(0,112,252,.10), var(--shadow-card)' } : {}),
                }}
              >
                <span
                  className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                  style={{ background: on ? '#0070FC' : 'rgba(0,112,252,.12)', border: on ? 'none' : '1px solid rgba(0,112,252,.25)' }}
                >
                  <Icon size={14} style={{ color: on ? '#fff' : '#0070FC' }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={leaf ? 'm-callout text-white truncate' : 'm-headline text-white truncate'}>
                      {leaf ? `${row.store.name} — ${row.store.branch}` : row.name}
                    </span>
                    {on && (
                      <span className="px-1.5 h-5 rounded-full m-caption font-semibold shrink-0 inline-flex items-center gap-0.5" style={{ background: '#0070FC', color: '#fff' }}>
                        <Check size={10} /> {t('store.current')}
                      </span>
                    )}
                  </span>
                  <span className="block m-caption text-white/50 truncate">
                    {leaf
                      ? t('store.missedCount', { count: row.store.missed })
                      : `${t('stores.nStoresShort', { count: row.ids.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })} · ${t('store.missedCount', { count: missedFor(row.ids) })}`}
                  </span>
                </span>
                {on ? <Check size={16} className="shrink-0" style={{ color: '#0070FC' }} /> : <ChevronRight size={14} className="text-white/30 shrink-0" />}
              </motion.button>
            )
          })}
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
