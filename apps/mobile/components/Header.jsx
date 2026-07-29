// ============================================================
// THE HEADER CHROME — bell and avatar, the two controls the web app keeps in the top
// right of every screen (TopBar's right slot). Their absence was the most visible gap
// between the native build and the web one: the dashboard opened with no way into
// notifications and no "who am I" corner at all.
//
// The bell carries the unread count, scoped exactly as the web NotificationBell is —
// the branch in session, or every store on All locations — and re-derives through
// useDataVersion so reading a notification clears the badge immediately.
// ============================================================
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Bell, ChevronLeft } from 'lucide-react-native'
import { getCurrentUser, unreadNotificationCount } from '@connect/core'
import { useDataVersion } from '../lib/useDataVersion.js'
import { useSession } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

export function NotificationBell() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  useDataVersion() // marking one read must clear the badge now, not next render
  const scopeId = session.store?.aggregate ? undefined : session.store?.id
  const unread = unreadNotificationCount(scopeId)

  return (
    <Pressable
      onPress={() => { vibrate(8); router.push('/notifications') }}
      accessibilityRole="button"
      accessibilityLabel={t('notif.bellLabelCount', { count: unread, defaultValue: 'Notifications, {{count}} unread' })}
      className="w-11 h-11 rounded-full bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline items-center justify-center"
    >
      <Bell size={19} color="#374151" />
      {unread > 0 && (
        <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-bad items-center justify-center px-1">
          <Text className="text-[10px] font-hk-semi text-white">{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  )
}

export function ProfileButton() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = getCurrentUser()
  return (
    <Pressable
      onPress={() => { vibrate(8); router.push('/profile') }}
      accessibilityRole="button"
      accessibilityLabel={t('nav.profile', { defaultValue: 'Profile' })}
      className="w-11 h-11 rounded-full bg-brand-blue items-center justify-center"
    >
      <Text className="text-sm font-hk-bold text-white">{user.initials}</Text>
    </Pressable>
  )
}

/** The right-hand cluster every tab shows. */
export function HeaderRight() {
  return (
    <View className="flex-row items-center gap-2">
      <NotificationBell />
      <ProfileButton />
    </View>
  )
}

/** Back chevron for pushed screens — 44pt target, accessible name, haptic. */
export function BackButton({ onPress }) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => { vibrate(8); onPress ? onPress() : router.back() }}
      accessibilityRole="button"
      accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
      className="w-11 h-11 rounded-full bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline items-center justify-center"
    >
      <ChevronLeft size={20} color="#374151" />
    </Pressable>
  )
}
