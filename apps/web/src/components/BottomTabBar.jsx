import React from 'react'
import { Home, PhoneCall, Users, Star, User2, Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn, vibrate } from '../lib/utils'
import { IS_MVP } from '../lib/features.js'
import { isMultiLocation } from '@connect/core'

// MVP — Home · Leads · Profile. Calls and Customers collapse into one Leads list (a
// missed call IS a call-sourced lead, and splitting them meant a lead's status lived on
// whichever of two screens you happened to open), and the reviews INBOX is out of scope.
// Review requests and review counts stay; they just are not a tab.
//
// FULL — the north-star five: Home · Calls · Customers · Reviews · Profile.
const MVP_TABS = [
  { id: 'home', Icon: Home },
  { id: 'leads', Icon: Users, badgeKey: 'leads' },
  // Only for a manager who actually holds more than one shop — see isMultiLocation().
  { id: 'network', Icon: Building2, multiOnly: true },
  { id: 'profile', Icon: User2 },
]

const FULL_TABS = [
  { id: 'home', Icon: Home },
  { id: 'vmn', Icon: PhoneCall, badgeKey: 'vmn' },
  { id: 'customers', Icon: Users },
  { id: 'reviews', Icon: Star, badgeKey: 'reviews' },
  { id: 'profile', Icon: User2 },
]

const BASE = IS_MVP ? MVP_TABS : FULL_TABS
// One store means nothing to roll up and nothing to compare, so the tab is not there.
const TABS = BASE.filter(tb => !tb.multiOnly || isMultiLocation())
// Written out, not interpolated: Tailwind scans the source for literal class names, so
// `grid-cols-${n}` produces a class that never reaches the stylesheet and a tab bar that
// silently stacks into one column.
// Literal class names: Tailwind scans source text, so `grid-cols-${n}` never reaches
// the stylesheet and the bar silently stacks into one column.
const COLS = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }[TABS.length] || 'grid-cols-4'

export default function BottomTabBar({ active, onChange, badges = {} }) {
  const { t } = useTranslation()
  return (
    <nav
      className="absolute bottom-0 left-0 right-0 z-40 glass-tabbar"
      style={{ paddingBottom: 'var(--m-homeind)' }}
      aria-label={t('nav.mainLabel', { defaultValue: 'Main navigation' })}
    >
      <div className={cn('grid', COLS)} style={{ height: 'var(--m-tabbar-h)' }}>
        {TABS.map(({ id, Icon, badgeKey }) => {
          const isActive = active === id
          const count = badges[badgeKey]
          const label = t(`nav.${id}`)
          return (
            <button
              key={id}
              type="button"
              onClick={() => { vibrate(6); onChange(id) }}
              // The icon+label are decorative for AT (aria-hidden below); this label is
              // the whole accessible name, and it carries the unread count so a screen
              // reader announces "Calls, 8 new" instead of an unnamed button.
              aria-label={count > 0
                ? t('nav.tabWithCount', { label, count, defaultValue: '{{label}}, {{count}} new' })
                : label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 press min-h-[var(--m-touch-min)]"
            >
              <div className="relative" aria-hidden="true">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.4 : 1.8}
                  className="transition-all"
                  style={{
                    color: isActive ? '#0070FC' : 'var(--text-tertiary)',
                    filter: isActive ? 'drop-shadow(0 0 8px rgba(0,112,252,.45))' : 'none',
                  }}
                />
                {count > 0 && (
                  <span
                    className="absolute -top-2 -right-3 min-w-[18px] h-[18px] rounded-full m-micro flex items-center justify-center px-1"
                    style={{ background: '#DC2626', color: 'white', boxShadow: '0 2px 6px rgba(220,38,38,.4)' }}
                  >
                    {count}
                  </span>
                )}
              </div>
              <span
                className={cn('m-caption transition-colors truncate max-w-full px-0.5')}
                aria-hidden="true"
                style={{
                  // The LABEL is 13px text, so it takes the accessible variant; the icon
                  // above keeps the brand blue (a graphical object, 3:1, and it clears it).
                  color: isActive ? 'var(--si-primary-text)' : 'var(--text-tertiary)',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {label}
              </span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-7 h-[2px] rounded-full"
                  style={{ background: '#0070FC' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
