import React from 'react'
import { motion } from 'framer-motion'
import { Building2, MapPin, ChevronRight, AlertTriangle, PhoneMissed, ShieldCheck, ChevronLeft, Navigation, Check, Layers } from 'lucide-react'
import {
  DEALER_PHONE, maskPhone, locationNeedsVerification,
  AGGREGATE_STORE_ID, BRAND_NAME, subBrands, scopeChildren, subBrandOf,
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

  // WHERE WE ARE IN THE TREE. [] = sub-brands under the parent brand; then state,
  // city, store. Depth picks the level, so the two cannot disagree — the same rule
  // the Your-locations drill keeps.
  const [path, setPath] = React.useState([])
  const [sb, state, city] = path

  const children = path.length === 0
    ? subBrands(fullIds).map(b => ({ level: 'subBrand', name: b.name, ids: b.ids, count: b.count }))
    : scopeChildren(fullIds, { subBrand: sb, state, city })

  // The node this level AS A WHOLE — the "one combined view" card at the top. At the
  // root that is the parent brand over everything this number holds.
  const hereIds = path.length === 0
    ? fullIds
    : children.flatMap(c => c.ids)
  const hereName = path.length === 0 ? BRAND_NAME : path[path.length - 1]

  const missedFor = (ids) => fullStores.filter(l => ids.includes(l.id)).reduce((n, l) => n + (l.missed || 0), 0)
  const isCurrentNode = (name, ids) =>
    current?.aggregate && (current.label === name || (!current.label && name === BRAND_NAME))
      && (current.ids ? current.ids.length === ids.length : ids.length === fullIds.length)

  function choose(node) {
    vibrate(10)
    onPick?.(node)
  }

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--bg-screen)' }}>
      <Wash />

      <div className="relative h-full flex flex-col pt-[52px] px-4 pb-6">
        {/* header — back pops one level of the tree before it leaves the screen. */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { vibrate(6); path.length ? setPath(p => p.slice(0, -1)) : onBack?.() }}
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
          <div className="m-largeTitle text-white">
            {t('store.switchTitle')}
          </div>
          <p className="m-body text-white/65 mt-2">
            <Trans
              i18nKey="store.switchSubtitle"
              count={fullStores.length}
              components={{ 1: <b className="text-white/90" /> }}
              values={{ count: fullStores.length }}
            />
          </p>
          {/* The breadcrumb — Brand → sub-brand → state → city, tappable back to root. */}
          {path.length > 0 && (
            <div className="mt-2 m-caption text-white/45 truncate">
              {[BRAND_NAME, ...path].join(' → ')}
            </div>
          )}
        </motion.div>

        <div className="mt-5 flex-1 overflow-y-auto no-scrollbar space-y-2.5">
          {/* THIS LEVEL, COMBINED — picking it scopes every screen to all of its
              locations at once ("all 500 Tetley locations" in the brand rule). */}
          {hereIds.length > 1 && (() => {
            const isCurrent = isCurrentNode(hereName, hereIds)
            return (
              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.06, duration: 0.4 }}
                onClick={() => choose({ name: hereName, ids: hereIds })}
                aria-current={isCurrent ? 'true' : undefined}
                className="w-full text-left rounded-2xl p-3.5 glass press relative overflow-hidden"
                style={isCurrent ? { borderColor: 'rgba(0,112,252,.45)', boxShadow: '0 0 0 3px rgba(0,112,252,.10), var(--shadow-card)' } : undefined}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: 'var(--si-ai-gradient-warm)' }}>
                    <Layers size={18} color="#fff" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="m-headline text-white truncate">{hereName}</div>
                      {isCurrent && (
                        <span className="px-1.5 h-5 rounded-full m-caption font-semibold shrink-0 inline-flex items-center gap-0.5" style={{ background: '#0070FC', color: '#fff' }}>
                          <Check size={10} /> {t('store.current')}
                        </span>
                      )}
                    </div>
                    <div className="m-caption text-white/55 mt-0.5">
                      {t('stores.nStores', { count: hereIds.length, defaultValue_one: '{{count}} store, one combined view', defaultValue_other: '{{count}} stores, one combined view' })}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Stat icon={PhoneMissed} label={t('store.missedCount', { count: missedFor(hereIds) })} />
                    </div>
                  </div>
                  {isCurrent
                    ? <Check size={18} className="mt-1 shrink-0" style={{ color: '#0070FC' }} />
                    : <ChevronRight size={18} className="text-white/40 mt-1 shrink-0" />}
                </div>
              </motion.button>
            )
          })()}

          {/* THE CHILDREN. A node drills deeper; a leaf store is picked directly. */}
          {children.map((node, i) => {
            if (node.level === 'store') {
              const loc = node.store
              const flagged = FEATURES.locationVerify && locationNeedsVerification(loc)
              const isCurrent = loc.id === current?.id
              return (
                <motion.button
                  key={loc.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                  onClick={() => choose(node)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className="w-full text-left rounded-2xl p-3.5 glass press relative overflow-hidden"
                  style={isCurrent ? { borderColor: 'rgba(0,112,252,.45)', boxShadow: '0 0 0 3px rgba(0,112,252,.10), var(--shadow-card)' } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: loc.primary ? 'var(--si-ai-gradient-warm)' : 'rgba(0,112,252,.12)', border: loc.primary ? 'none' : '1px solid rgba(0,112,252,.28)' }}>
                      <Building2 size={18} style={{ color: loc.primary ? '#fff' : '#0070FC' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="m-headline text-white truncate">{loc.name} — {loc.branch}</div>
                        {isCurrent && (
                          <span className="px-1.5 h-5 rounded-full m-caption font-semibold shrink-0 inline-flex items-center gap-0.5" style={{ background: '#0070FC', color: '#fff' }}>
                            <Check size={10} /> {t('store.current')}
                          </span>
                        )}
                        {loc.primary && !isCurrent && (
                          <span className="px-1.5 h-5 rounded-full m-caption font-semibold shrink-0" style={{ background: 'rgba(0,112,252,.12)', color: 'var(--si-primary-text)', border: '1px solid rgba(0,112,252,.30)' }}>{t('store.primary')}</span>
                        )}
                      </div>
                      <div className="m-caption text-white/55 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin size={11} className="shrink-0" /> {loc.address}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="px-1.5 h-5 rounded-md m-caption font-semibold m-tabular inline-flex items-center" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', color: 'var(--text-tertiary)' }}>
                          {t('store.codeChip', { code: loc.storeCode })}
                        </span>
                        <Stat icon={PhoneMissed} label={t('store.missedCount', { count: loc.missed })} />
                        <Stat label={t('store.recoveredPct', { pct: loc.recovery })} />
                      </div>
                      {flagged && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-full m-caption font-medium" style={{ background: 'rgba(202,138,4,.12)', color: 'var(--si-warning-text)', border: '1px solid rgba(202,138,4,.30)' }}>
                            <AlertTriangle size={11} /> {t('store.needsVerification')}
                          </span>
                        </div>
                      )}
                    </div>
                    {isCurrent
                      ? <Check size={18} className="mt-1 shrink-0" style={{ color: '#0070FC' }} />
                      : <ChevronRight size={18} className="text-white/40 mt-1 shrink-0" />}
                  </div>
                </motion.button>
              )
            }
            // A tree node: sub-brand / state / city. Tapping DRILLS; the combined card
            // above is how you select the level itself.
            return (
              <motion.button
                key={node.name}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                onClick={() => { vibrate(8); setPath(p => [...p, node.name]) }}
                className="w-full text-left rounded-2xl p-3.5 glass press relative overflow-hidden"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: 'rgba(0,112,252,.12)', border: '1px solid rgba(0,112,252,.28)' }}>
                    {node.level === 'subBrand' ? <Building2 size={18} style={{ color: '#0070FC' }} /> : <MapPin size={18} style={{ color: '#0070FC' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="m-headline text-white truncate">{node.name}</div>
                    <div className="m-caption text-white/55 mt-0.5">
                      {t('stores.nStoresShort', { count: node.count, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
                      {' · '}{t('store.missedCount', { count: missedFor(node.ids) })}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-white/40 shrink-0" />
                </div>
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
