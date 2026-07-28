import React, { useState } from 'react'
import { FEATURES } from '../lib/features.js'
import {
  Bell, LogOut, ChevronRight, Sparkles, Building2,
  Layers, Check, Plus, Images, Shield, Users,
  RefreshCcw, Globe, Moon, Sun
} from 'lucide-react'
import { LargeTitle } from '../components/TopBar.jsx'
import { Card, AIBadge, PrimaryButton, Avatar } from '../components/UI.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import { getCurrentUser, ROLES, locationNeedsVerification, getStoreLocations, getStoreTeam, getAllStoreTeams, storeLabelOf } from '@connect/core'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n/index.js'
import { languagesByRegion, getLanguage } from '@connect/core/i18n/languages.js'

const PRIMARY_USER = getCurrentUser()
import ManageMedia from './ManageMedia.jsx'
import LocationVerify from './LocationVerify.jsx'
import BusinessProfile from './BusinessProfile.jsx'
import { useToast } from '../components/Toast.jsx'
import { useTheme } from '../lib/theme.jsx'
import { vibrate } from '../lib/utils.js'
import NotificationBell from '../components/NotificationBell.jsx'

export default function Profile({ role, store, onChangeRole, onLogout, onSwitchStore }) {
  const [sheet, setSheet] = useState(null)
  const { t, i18n } = useTranslation()
  // A Google listing, its photo library and its staff all belong to ONE branch, so on
  // the All-locations view there is no store to open them for. Silently falling back to
  // the flagship (which this screen did) meant tapping "Business profile" from the
  // network view edited Indiranagar's listing without ever saying so. Now it ASKS —
  // one extra tap, and the dealer knows whose listing they are looking at.
  const aggregate = !!store?.aggregate
  const [picked, setPicked] = useState(null)   // the branch chosen through the picker
  const [pickFor, setPickFor] = useState(null) // which sheet that pick is for
  const realStore = aggregate ? picked : store
  /** Per-store sheets go through the picker on the aggregate view, straight through otherwise. */
  const openStoreSheet = (kind) => {
    if (aggregate) { setPickFor(kind); setSheet('pick') } else setSheet(kind)
  }
  const s = aggregate
    ? { name: t('stores.allLocations', { defaultValue: 'All locations' }), branch: t('stores.nStoresShort', { count: getStoreLocations().length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' }) }
    : (store || PRIMARY_USER.store)
  const flagged = store ? locationNeedsVerification(store) : false
  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      <LargeTitle title={t('profile.title')} sub={t('profile.subtitle')} right={<NotificationBell />} />

      {/* Identity */}
      <div className="px-4">
        <Card className="!p-3.5">
          <div className="flex items-center gap-3">
            <Avatar initials={PRIMARY_USER.initials} size={48} color="#0070FC" />
            <div className="flex-1 min-w-0">
              <div className="m-headline text-white">{PRIMARY_USER.name}</div>
              <button onClick={onSwitchStore} className="m-caption text-white/55 press inline-flex items-center gap-1">
                {s.name} — {s.branch} <RefreshCcw size={10} /> <span className="text-white/40">{t('common.switch')}</span>
              </button>
              <div className="m-caption text-white/45 m-tabular">{PRIMARY_USER.phone}</div>
            </div>
            <span className="px-2 h-6 rounded-full m-caption font-semibold" style={{ background: 'rgba(0,112,252,.12)', color: 'var(--si-primary-text)', border: '1px solid rgba(0,112,252,.30)' }}>
              {role === 'single' ? t('profile.manager') : role === 'cluster' ? t('profile.cluster') : role.charAt(0).toUpperCase() + role.slice(1)}
            </span>
          </div>
        </Card>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          {FEATURES.businessProfile && (
            <QuickTile icon={Building2} label={t('profile.businessProfile')} sub={flagged ? t('profile.needsVerification') : t('profile.businessProfileSub')} onClick={() => openStoreSheet('gbp')} accent="#0070FC" alert={flagged} />
          )}
          {FEATURES.manageMedia && (
            <QuickTile icon={Images} label={t('profile.manageMedia')} sub={t('profile.manageMediaSub')} onClick={() => openStoreSheet('media')} accent="#0070FC" />
          )}
          {/* Team is the ONE per-store sheet that does not need a picker: a roster is a
              list, so the aggregate view simply shows every branch's, grouped. */}
          <QuickTile icon={Users} label={t('profile.team')} sub={t('profile.teamSub')} onClick={() => setSheet('team')} accent="#16A34A" />
          <QuickTile icon={Layers} label={t('profile.switchRole')} sub={t('profile.switchRoleSub')} onClick={() => setSheet('role')} accent="#F97316" />
        </div>

        {/* Appearance */}
        <div className="mt-4 mb-2 m-subhead text-white/55 px-1">{t('profile.appearance')}</div>
        <ThemeSwitcher />

        {/* Settings list */}
        <Card className="mt-3 !p-0 overflow-hidden">
          {/* Alerts configures the notification system, so it goes when that does —
              a settings row for a feature the build does not contain is worse than
              no row at all. */}
          {FEATURES.notifications && (
            <SettingsRow icon={Bell} label={t('profile.alerts')} sub={t('profile.alertsSub')} trailing={t('profile.on')} onClick={() => setSheet('alerts')} />
          )}
          <Divider />
          <SettingsRow icon={Globe} label={t('profile.language')} sub={getLanguage(i18n.resolvedLanguage || i18n.language || 'en').native} trailing={<ChevronRight size={16} className="text-white/45" />} onClick={() => setSheet('language')} />
          <Divider />
          <SettingsRow icon={Shield} label={t('profile.privacy')} sub={t('profile.privacySub')} trailing={t('profile.privacyOk')} />
          <Divider />
          <SettingsRow icon={LogOut} label={t('profile.logout')} sub="" trailing="" danger onClick={onLogout} />
        </Card>

        <div className="mt-4 mb-1 m-caption text-white/40 text-center">
          {t('profile.footer')}
        </div>
      </div>

      {/* Which branch? — only ever reached from the All-locations view. */}
      <BottomSheet open={sheet === 'pick'} onClose={() => setSheet(null)} label={t(pickFor === 'media' ? 'profile.manageMedia' : 'profile.businessProfile')}>
        <StorePickerSheet
          titleKey={pickFor === 'media' ? 'profile.manageMedia' : 'profile.businessProfile'}
          onPick={(loc) => { setPicked(loc); setSheet(pickFor) }}
        />
      </BottomSheet>
      <BottomSheet open={sheet === 'gbp'} onClose={() => setSheet(null)} fullHeight label={t('profile.businessProfile')}>
        <BusinessProfile store={realStore} onStartVerify={() => setSheet('verify')} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === 'media'} onClose={() => setSheet(null)} fullHeight label={t('profile.manageMedia')}>
        {/* The branch whose listing these photos are on — named in the sheet, and the
            library itself is that branch's (getMediaLibrary(storeId)). */}
        <ManageMedia storeId={realStore?.id} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === 'verify'} onClose={() => setSheet(null)} fullHeight label={t('verify.title')}>
        <LocationVerify location={realStore} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === 'team'} onClose={() => setSheet(null)} label={t('profile.team')}>
        <TeamSheet store={store} aggregate={aggregate} />
      </BottomSheet>
      <BottomSheet open={sheet === 'role'} onClose={() => setSheet(null)} label={t('profile.roleSheetTitle')}>
        <RoleSheet current={role} onChange={(r) => { onChangeRole(r); setSheet(null) }} />
      </BottomSheet>
      <BottomSheet open={sheet === 'language'} onClose={() => setSheet(null)} fullHeight label={t('language.title')}>
        <LanguageSheet onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === 'alerts'} onClose={() => setSheet(null)} label={t('profile.alerts')}>
        <AlertsSheet />
      </BottomSheet>
    </div>
  )
}

function QuickTile({ icon: Icon, label, sub, onClick, accent, ai, alert }) {
  return (
    <button onClick={onClick} className="press text-left rounded-2xl p-3.5 glass relative overflow-hidden">
      <div
        className="w-10 h-10 rounded-xl grid place-items-center"
        style={{ background: ai ? 'var(--si-ai-gradient-warm)' : `${accent}20`, border: ai ? 'none' : `1px solid ${accent}40` }}
      >
        <Icon size={18} style={{ color: ai ? '#fff' : accent }} />
      </div>
      <div className="mt-2.5 m-headline text-white">{label}</div>
      <div className={'m-caption ' + (alert ? '' : 'text-white/55')} style={alert ? { color: 'var(--si-warning-text)' } : undefined}>{sub}</div>
      {ai && (
        <span className="absolute top-2.5 right-2.5">
          <AIBadge>AI</AIBadge>
        </span>
      )}
      {alert && (
        <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full" style={{ background: '#CA8A04', boxShadow: '0 0 0 3px rgba(202,138,4,.18)' }} />
      )}
    </button>
  )
}

function SettingsRow({ icon: Icon, label, sub, trailing, danger, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3.5 py-3 press text-left">
      <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: danger ? 'rgba(255,107,126,.10)' : 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.06)' }}>
        <Icon size={16} className={danger ? 'text-[#FF6B7E]' : 'text-white/80'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={'m-headline ' + (danger ? 'text-[#FF6B7E]' : 'text-white')}>{label}</div>
        {sub && <div className="m-caption text-white/50">{sub}</div>}
      </div>
      {typeof trailing === 'string' ? <span className="m-callout text-white/65">{trailing}</span> : trailing}
    </button>
  )
}

function Divider() {
  return <div className="h-px bg-white/5 mx-3.5" />
}

/**
 * WHICH BRANCH? — the step between the All-locations view and a per-store sheet.
 *
 * A listing and its photo library belong to one shop. Rather than guess, this asks, and
 * shows enough of each branch (address, and whether its address is under question) for
 * the choice to be made without opening them one by one.
 */
function StorePickerSheet({ titleKey, onPick }) {
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t(titleKey)}</div>
      <div className="m-callout text-white/55 mb-3">
        {t('stores.pickBranch', { defaultValue: 'Which branch?' })}
      </div>
      <div className="space-y-2">
        {getStoreLocations().map(loc => {
          const flagged = locationNeedsVerification(loc)
          return (
            <button
              key={loc.id}
              onClick={() => { vibrate(8); onPick(loc) }}
              className="w-full text-left rounded-2xl p-3 press md-state flex items-center gap-3"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
            >
              <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(0,112,252,.12)', border: '1px solid rgba(0,112,252,.28)' }}>
                <Building2 size={16} style={{ color: '#0070FC' }} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block m-headline text-white truncate">{loc.branch}</span>
                <span className="block m-caption text-white/55 truncate">{loc.address}</span>
              </span>
              {flagged && (
                <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: '#CA8A04' }} aria-label={t('profile.needsVerification')} />
              )}
              <ChevronRight size={16} className="text-white/40 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The roster. Staff belong to a shop floor, so this reads per branch — and on the
 * All-locations view it stacks every branch's, which is more useful than a picker
 * would be: a list of lists is still one screen.
 */
function TeamSheet({ store, aggregate }) {
  const { t } = useTranslation()
  const groups = aggregate
    ? getAllStoreTeams()
    : [{ storeId: store?.id, branch: storeLabelOf(store?.id), members: getStoreTeam(store?.id) }]

  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('profile.team')}</div>
      <div className="m-callout text-white/55 mb-3">{t('profile.teamSub')}</div>
      {groups.map(g => (
        <div key={g.storeId || 'one'} className="mb-3">
          {aggregate && (
            <div className="m-subhead text-white/55 mb-1.5 ml-1">{g.branch}</div>
          )}
          <Card className="!p-0 overflow-hidden">
            {g.members.map((m, i) => (
              <div key={m.name} className="flex items-center gap-3 px-3.5 py-3" style={i ? { borderTop: '1px solid var(--border-hairline)' } : undefined}>
                <Avatar initials={m.initials} size={36} color={m.color} />
                <div className="flex-1 min-w-0">
                  <div className="m-headline text-white truncate">{m.name}</div>
                  <div className="m-caption text-white/55 truncate">{t(m.roleKey)}</div>
                </div>
              </div>
            ))}
            {!g.members.length && (
              <div className="px-3.5 py-4 m-caption text-white/45">{t('profile.teamEmpty', { defaultValue: 'Nobody added here yet.' })}</div>
            )}
          </Card>
        </div>
      ))}
    </div>
  )
}
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  const opts = [
    { id: 'light', label: t('profile.light'), icon: Sun, sub: t('profile.lightSub') },
    { id: 'dark', label: t('profile.dark'), icon: Moon, sub: t('profile.darkSub') },
  ]
  return (
    <Card className="!p-2">
      <div className="grid grid-cols-2 gap-2">
        {opts.map(o => {
          const active = theme === o.id
          const Icon = o.icon
          return (
            <button
              key={o.id}
              onClick={() => { vibrate(8); setTheme(o.id) }}
              className="press text-left rounded-xl p-3 relative overflow-hidden"
              style={{
                background: active ? 'rgba(0,112,252,.12)' : 'var(--bg-subtle)',
                border: active ? '1px solid rgba(0,112,252,.55)' : '1px solid var(--border-glass)',
                boxShadow: active ? '0 0 0 3px rgba(0,112,252,.10)' : 'none',
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="w-8 h-8 rounded-lg grid place-items-center"
                  style={{
                    background: o.id === 'dark'
                      ? 'linear-gradient(135deg, #0A0E24, #14206b)'
                      : 'linear-gradient(135deg, #FFFFFF, #F9FAFD)',
                    border: '1px solid rgba(0,112,252,.18)',
                  }}
                >
                  <Icon size={15} style={{ color: o.id === 'dark' ? '#4D9AFF' : '#F97316' }} />
                </div>
                {active && <Check size={14} style={{ color: '#0070FC' }} />}
              </div>
              <div className="mt-2 m-headline text-white">{o.label}</div>
              <div className="m-caption text-white/55">{o.sub}</div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function LanguageSheet({ onClose }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const current = i18n.resolvedLanguage || i18n.language || 'en'

  // Switching lazy-loads that language's catalog, swaps the Noto webfont for its
  // script, and flips <html dir> for RTL — then every t() re-renders.
  async function pick(l) {
    if (l.code === current) return onClose()
    setBusy(l.code)
    await setLanguage(l.code)
    setBusy(null)
    toast.push({
      kind: 'success',
      title: t('language.switched', { language: l.native }),
      body: t('language.switchedBody', { language: l.native }),
    })
    onClose()
  }

  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('language.title')}</div>
      <div className="m-callout text-white/55 mb-3">{t('language.subtitle')}</div>

      {languagesByRegion().map(group => (
        <div key={group.region} className="mb-3">
          <div className="m-subhead text-white/55 mb-1.5 px-1">
            {group.region === 'Indian languages' ? t('language.indian') : t('language.other')}
          </div>
          <Card className="!p-1.5">
            {group.items.map((l, i) => {
              const active = current === l.code
              return (
                <button
                  key={l.code}
                  onClick={() => pick(l)}
                  className={'w-full flex items-center gap-3 px-2.5 py-2.5 text-left press rounded-xl ' + (i < group.items.length - 1 ? 'mb-0.5' : '')}
                  style={active ? { background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.40)' } : { border: '1px solid transparent' }}
                >
                  <div className="flex-1 min-w-0">
                    {/* endonym first — a language picker must be readable in its own language */}
                    <div className="m-headline text-white" style={{ direction: l.dir }}>{l.native}</div>
                    <div className="m-caption text-white/55">{l.label}{l.dir === 'rtl' ? ' · RTL' : ''}</div>
                  </div>
                  {busy === l.code ? <span className="spin" /> : active ? <Check size={16} style={{ color: '#0070FC' }} /> : null}
                </button>
              )
            })}
          </Card>
        </div>
      ))}

      <div className="mt-1 m-caption text-white/55 px-1 flex items-start gap-1.5">
        <Sparkles size={11} className="ai-text mt-0.5 shrink-0" />
        <span>{t('language.aiNote')}</span>
      </div>
    </div>
  )
}

function AlertsSheet() {
  const [missed, setMissed] = useState(true)
  const [reviews, setReviews] = useState(true)
  const [daily, setDaily] = useState(true)
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('profile.alerts')}</div>
      <div className="m-callout text-white/55 mb-3">{t('profile.alertsSheetSub')}</div>
      <Card className="!p-0 overflow-hidden">
        <ToggleRow icon={Bell} label={t('profile.alertMissedCall')} sub={t('profile.alertMissedCallSub')} value={missed} onChange={setMissed} accent="#0070FC" />
        <div className="h-px bg-white/5 mx-3.5" />
        <ToggleRow icon={Bell} label={t('profile.alertBadReview')} sub={t('profile.alertBadReviewSub')} value={reviews} onChange={setReviews} accent="#F97316" />
        <div className="h-px bg-white/5 mx-3.5" />
        <ToggleRow icon={Bell} label={t('profile.alertDaily')} sub={t('profile.alertDailySub')} value={daily} onChange={setDaily} accent="#0070FC" />
      </Card>
    </div>
  )
}

function ToggleRow({ icon: Icon, label, sub, value, onChange, accent = '#0070FC' }) {
  return (
    <div className="w-full px-3.5 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: `${accent}18`, border: `1px solid ${accent}40` }}>
        <Icon size={15} style={{ color: accent }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="m-headline text-white">{label}</div>
        <div className="m-caption text-white/55">{sub}</div>
      </div>
      <button
        onClick={() => { vibrate(6); onChange(!value) }}
        className="relative w-11 h-7 rounded-full transition-colors press"
        style={{ background: value ? '#0070FC' : 'var(--bg-subtle-strong)' }}
      >
        <span
          className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all"
          style={{ left: value ? 18 : 2, boxShadow: '0 2px 6px rgba(0,0,0,.2)' }}
        />
      </button>
    </div>
  )
}

function RoleSheet({ current, onChange }) {
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('profile.roleSheetTitle')}</div>
      <div className="m-callout text-white/55 mb-3">{t('profile.roleSheetSub')}</div>
      <Card className="!p-2">
        {ROLES.map((r, i) => {
          const active = current === r.id
          return (
            <button
              key={r.id}
              onClick={() => onChange(r.id)}
              className={'w-full flex items-center gap-3 px-3 py-3 text-left press ' + (i < ROLES.length - 1 ? 'border-b border-white/5' : '')}
            >
              <div className={'w-9 h-9 rounded-lg grid place-items-center' + (active ? ' on-dark' : '')} style={{ background: active ? 'var(--si-ai-gradient-warm)' : 'rgba(255,255,255,.05)' }}>
                <Building2 size={16} className={active ? 'text-white' : 'text-white/70'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="m-headline text-white">{r.label}</div>
                <div className="m-caption text-white/55">{r.desc}</div>
              </div>
              {active && <Check size={16} className="text-[#7BE3B2]" />}
            </button>
          )
        })}
      </Card>
    </div>
  )
}
