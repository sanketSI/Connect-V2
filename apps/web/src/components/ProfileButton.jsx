import React from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from './UI.jsx'
import { vibrate } from '../lib/utils.js'
import { getCurrentUser } from '@connect/core'

const USER = getCurrentUser()

// ============================================================
// PROFILE, TOP RIGHT — on every tab, on both builds.
//
// Profile stopped being a bottom tab in scope round 2: it is the "who am I / settings /
// my listing" corner, not one of the jobs the bar is for, and the freed slot went to the
// roll-up. This is the one way in, so it has to be present on every tab a manager can
// land on — an entry point that exists on some screens is worse than a tab.
//
// Goes in LargeTitle's `right` slot rather than floating over the page, so it composes
// with whatever else lives there (NotificationBell on Reviews and Profile) instead of
// overlapping it, and scrolls with the header exactly like the rest of the title block.
//
// aria-label reuses nav.profile — the string the tab bar used for the same destination,
// so the accessible name did not change when the control moved.
// ============================================================
export default function ProfileButton({ onClick }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => { vibrate(6); onClick?.() }}
      aria-label={t('nav.profile')}
      // Chip idiom (see UI.jsx): the BUTTON is the full 44px touch target, the painted
      // avatar stays 36px inside it.
      className="grid place-items-center shrink-0 press min-w-[var(--m-touch-min)] min-h-[var(--m-touch-min)]"
    >
      <Avatar initials={USER.initials} size={36} color="#0070FC" />
    </button>
  )
}
