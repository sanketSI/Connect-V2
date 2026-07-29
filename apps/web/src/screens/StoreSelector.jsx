import React from 'react'
import { motion } from 'framer-motion'
import { Building2, MapPin, ChevronRight, AlertTriangle, PhoneMissed, ShieldCheck, ChevronLeft, Navigation, Check, Layers } from 'lucide-react'
import {
  assignedStores, DEALER_PHONE, maskPhone, locationNeedsVerification,
  makeAllLocationsStore, networkRollup, AGGREGATE_STORE_ID,
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

export default function StoreSelector({ current, onPick, onBack }) {
  const { t } = useTranslation()
  // The stores THIS manager holds, read per render rather than snapshotted at module
  // load: the set belongs to whoever signed in. It used to be getStoreLocations(), which
  // is every location in the fixture — that is why the header said "6 locations" one
  // screen after sign-in had said "3 stores on this number".
  const myStores = assignedStores()

  function choose(loc) {
    vibrate(10)
    onPick?.(loc)
  }

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--bg-screen)' }}>
      <Wash />

      <div className="relative h-full flex flex-col pt-[52px] px-4 pb-6">
        {/* header */}
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
          <div className="m-largeTitle text-white">
            {t('store.switchTitle')}
          </div>
          <p className="m-body text-white/65 mt-2">
            <Trans
              i18nKey="store.switchSubtitle"
              count={myStores.length}
              components={{ 1: <b className="text-white/90" /> }}
              values={{ count: myStores.length }}
            />
          </p>
        </motion.div>

        <div className="mt-5 flex-1 overflow-y-auto no-scrollbar space-y-2.5">
          {/* ALL LOCATIONS — the cumulative view (feedback round 4). One card, first,
              because "how is the whole network doing" is the question a multi-store
              owner opens this screen with. Numbers are the summed network rollup. */}
          {myStores.length > 1 && (() => {
            const net = networkRollup()
            const isCurrent = current?.id === AGGREGATE_STORE_ID
            return (
              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.06, duration: 0.4 }}
                onClick={() => choose(makeAllLocationsStore())}
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
                      <div className="m-headline text-white truncate">{t('stores.allLocations', { defaultValue: 'All locations' })}</div>
                      {isCurrent && (
                        <span className="px-1.5 h-5 rounded-full m-caption font-semibold shrink-0 inline-flex items-center gap-0.5" style={{ background: '#0070FC', color: '#fff' }}>
                          <Check size={10} /> {t('store.current')}
                        </span>
                      )}
                    </div>
                    <div className="m-caption text-white/55 mt-0.5">
                      {t('stores.nStores', { count: net.stores, defaultValue_one: '{{count}} store, one combined view', defaultValue_other: '{{count}} stores, one combined view' })}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Stat icon={PhoneMissed} label={t('store.missedCount', { count: net.missed })} />
                      <Stat label={t('store.recoveredPct', { pct: net.recovery })} />
                    </div>
                  </div>
                  {isCurrent
                    ? <Check size={18} className="mt-1 shrink-0" style={{ color: '#0070FC' }} />
                    : <ChevronRight size={18} className="text-white/40 mt-1 shrink-0" />}
                </div>
              </motion.button>
            )
          })()}

          {myStores.map((loc, i) => {
            // App refuses to open the verification sheet in MVP (see openStore), so
            // without the same gate here the card advertises "Verify now" for a flow
            // this build does not contain — the disabled-control-hinting-at-a-tier
            // pattern features.js exists to prevent.
            const flagged = FEATURES.locationVerify && locationNeedsVerification(loc)
            const isCurrent = loc.id === current?.id
            return (
              <motion.button
                key={loc.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                onClick={() => choose(loc)}
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
                        <span className="m-caption font-semibold inline-flex items-center gap-0.5" style={{ color: '#0070FC' }}>
                          {t('store.verifyNow')} <ChevronRight size={12} />
                        </span>
                      </div>
                    )}
                  </div>
                  {flagged
                    ? <Navigation size={18} className="mt-1 shrink-0" style={{ color: '#0070FC' }} />
                    : isCurrent
                      ? <Check size={18} className="mt-1 shrink-0" style={{ color: '#0070FC' }} />
                      : <ChevronRight size={18} className="text-white/40 mt-1 shrink-0" />}
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
