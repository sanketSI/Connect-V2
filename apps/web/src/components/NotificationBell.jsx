import React, { useMemo } from 'react'
import { FEATURES } from '../lib/features.js'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { unreadNotificationCount } from '@connect/core'
import { useDataVersion } from '../lib/useDataVersion.js'
import { useNotifications } from '../lib/notifications.js'
import { cn, vibrate } from '../lib/utils'

// ============================================================
// The global notification bell. Same 44×44 hit box / 40px painted circle as UI.jsx's
// IconBtn, plus a live unread badge in the #DC2626 idiom the tab bar uses.
//
// The count re-derives on every data-version bump (useDataVersion), so calling a lead
// back or posting a reply — which resolves the underlying notification and fires
// emitChange() — drops this badge without the bell knowing what changed.
// ============================================================
export default function NotificationBell({ className }) {
  // Absent from the MVP build, not disabled in it — see lib/features.js.
  if (!FEATURES.notifications) return null
  const { t } = useTranslation()
  const { open, storeId } = useNotifications()
  const v = useDataVersion()
  const count = useMemo(() => unreadNotificationCount(storeId), [v, storeId])

  // The label IS the accessible name and it carries the count, so a screen reader
  // announces "Notifications, 6 unread" rather than an unnamed icon button.
  const label = count > 0
    ? t('notif.bellLabelCount', { count, defaultValue: 'Notifications, {{count}} unread' })
    : t('notif.title', { defaultValue: 'Notifications' })

  return (
    <button
      type="button"
      onClick={() => { vibrate(8); open() }}
      aria-label={label}
      title={t('notif.title', { defaultValue: 'Notifications' })}
      className={cn(
        'relative grid place-items-center press shrink-0',
        'w-[var(--m-touch-min)] h-[var(--m-touch-min)]',
        className,
      )}
    >
      <span
        className="w-10 h-10 rounded-full grid place-items-center md-state"
        style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
      >
        <Bell size={18} className="text-white/85" aria-hidden="true" />
      </span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full m-micro flex items-center justify-center px-1"
          style={{ background: '#DC2626', color: 'white', boxShadow: '0 2px 6px rgba(220,38,38,.4)' }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
