import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PhoneMissed, Star, MapPin, BellOff, ChevronRight, CheckCheck } from 'lucide-react'
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  rupees, relativeTime,
} from '@connect/core'
import BottomSheet from './BottomSheet.jsx'
import { Stars, StoreBadge } from './UI.jsx'
import { useNotifications } from '../lib/notifications.js'
import { useDataVersion } from '../lib/useDataVersion.js'
import { cn, vibrate } from '../lib/utils'

// Icon + accent per kind, escalated to red when the item is urgent (a hot lead or a
// negative review — the ones that cost money if ignored).
function accentFor(n) {
  if (n.urgent) return { Icon: n.kind === 'review' ? Star : PhoneMissed, color: '#F87171', bg: 'rgba(220,38,38,.14)' }
  if (n.kind === 'missed_call') return { Icon: PhoneMissed, color: '#4DA3FF', bg: 'rgba(0,112,252,.14)' }
  if (n.kind === 'review') return { Icon: Star, color: '#F5B301', bg: 'rgba(245,158,11,.14)' }
  return { Icon: MapPin, color: '#F5B301', bg: 'rgba(202,138,4,.14)' } // verify
}

function Row({ n, onPick, aggregate }) {
  const { t } = useTranslation()
  const { Icon, color, bg } = accentFor(n)
  const when = n.atMs != null ? relativeTime(n.atMs) : null

  // Secondary line: real content (never keyed) — masked number, reviewer name +
  // snippet, or the store + the exact geo/address flag (its reason IS keyed).
  let meta = null
  if (n.kind === 'missed_call') {
    meta = (
      <>
        {n.masked && <span className="m-tabular">{n.masked}</span>}
        {n.value != null && <><span className="opacity-40"> · </span>{rupees(n.value)}</>}
      </>
    )
  } else if (n.kind === 'review') {
    meta = (
      <>
        {n.name && <span>{n.name}</span>}
        {n.snippet && <><span className="opacity-40"> · </span><span className="italic opacity-90">“{n.snippet}”</span></>}
      </>
    )
  } else if (n.kind === 'verify') {
    meta = (
      <>
        {n.name && <span>{n.name}</span>}
        {n.flagKey && <><span className="opacity-40"> · </span>{t(n.flagKey, { ...(n.flagVars || {}), defaultValue: t('notif.verifyGenericReason', { defaultValue: 'details do not match your listing' }) })}</>}
      </>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { vibrate(8); onPick(n) }}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left press md-state',
        n.read && 'opacity-60',
      )}
      style={{ borderTop: '1px solid var(--border-glass)' }}
    >
      <span className="mt-0.5 w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: bg }}>
        <Icon size={17} style={{ color }} aria-hidden="true" />
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          {!n.read && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#0070FC' }} aria-label={t('notif.unread', { defaultValue: 'Unread' })} />}
          <span className="m-headline text-white truncate">{t(n.titleKey, { ...(n.titleVars || {}), defaultValue: n.titleKey })}</span>
          {n.kind === 'review' && Number.isFinite(n.rating) && <span className="shrink-0"><Stars value={n.rating} size={11} /></span>}
        </span>
        {meta && <span className="block m-caption text-white/60 truncate mt-0.5">{meta}</span>}
        <span className="flex items-center gap-2 mt-1">
          {/* Which branch this item belongs to — aggregate feed only. */}
          {aggregate && <StoreBadge storeId={n.storeId} />}
          <span className="m-micro font-semibold" style={{ color: 'var(--si-primary-text)' }}>{t(n.ctaKey, { defaultValue: n.ctaKey })}</span>
          {when && <span className="m-micro text-white/40">· {when}</span>}
        </span>
      </span>

      <ChevronRight size={16} className="mt-2 shrink-0 text-white/30" aria-hidden="true" />
    </button>
  )
}

function Section({ titleKey, items, onPick, aggregate }) {
  const { t } = useTranslation()
  if (!items.length) return null
  return (
    <div>
      <div className="px-4 pt-3 pb-1 m-micro uppercase tracking-wide text-white/45">{t(titleKey)}</div>
      {items.map(n => <Row key={n.id} n={n} onPick={onPick} aggregate={aggregate} />)}
    </div>
  )
}

// ============================================================
// The notification center. Reads the derived feed on every data-version bump, so it
// is always live — resolve an item elsewhere and it is gone the next time this opens.
// Tapping a row marks it seen and deep-links to the tab that can action it.
// ============================================================
export default function NotificationCenter({ open, onClose, onNavigate }) {
  const { t } = useTranslation()
  const v = useDataVersion()
  const { storeId, aggregate } = useNotifications()
  const feed = useMemo(() => getNotifications(storeId), [v, open, storeId])
  const unread = feed.reduce((n, item) => n + (item.read ? 0 : 1), 0)
  const urgent = feed.filter(n => n.urgent)
  const rest = feed.filter(n => !n.urgent)

  function pick(n) {
    markNotificationRead(n.id)
    onNavigate?.(n.tab)
  }

  return (
    <BottomSheet open={open} onClose={onClose} fullHeight label={t('notif.title', { defaultValue: 'Notifications' })}>
      <div className="px-4 pt-1 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="m-title2 text-white">{t('notif.title', { defaultValue: 'Notifications' })}</div>
          <div className="m-caption text-white/50">
            {unread > 0
              ? t('notif.unreadCount', { count: unread, defaultValue: '{{count}} unread' })
              : t('notif.allRead', { defaultValue: 'All caught up' })}
          </div>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => { vibrate(8); markAllNotificationsRead(storeId) }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-full m-subhead press md-state"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', color: 'var(--si-primary-text)' }}
          >
            <CheckCheck size={14} aria-hidden="true" />
            {t('notif.markAllRead', { defaultValue: 'Mark all read' })}
          </button>
        )}
      </div>

      {feed.length === 0 ? (
        <div className="px-6 py-16 text-center flex flex-col items-center">
          <span className="w-14 h-14 rounded-full grid place-items-center mb-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}>
            <BellOff size={24} className="text-white/50" aria-hidden="true" />
          </span>
          <div className="m-headline text-white">{t('notif.empty', { defaultValue: 'You’re all caught up' })}</div>
          <div className="m-body text-white/55 mt-1 max-w-[240px]">{t('notif.emptyBody', { defaultValue: 'New missed calls, reviews and store alerts show up here.' })}</div>
        </div>
      ) : (
        <div className="pb-2">
          <Section titleKey="notif.groupUrgent" items={urgent} onPick={pick} aggregate={aggregate} />
          <Section titleKey="notif.groupWaiting" items={rest} onPick={pick} aggregate={aggregate} />
        </div>
      )}
    </BottomSheet>
  )
}
