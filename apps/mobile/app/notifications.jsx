// ============================================================
// NOTIFICATIONS — the native counterpart of components/NotificationCenter.jsx on web.
//
// Same data, same rules: getNotifications() scoped to the branch in session (undefined on
// All locations = every store), titles resolved through the keys the records carry
// (titleKey/ctaKey — already translated in all 13 catalogs), tapping a row marks it read
// through the core mutator so every badge in the app re-derives, and "mark all read"
// clears the lot. Nothing here owns state — it is all core's, which is why the bell on
// Home updates the moment a row is tapped.
// ============================================================
import { View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PhoneMissed, Star, Zap, CheckCheck } from 'lucide-react-native'
import {
  getNotifications, markNotificationRead, markAllNotificationsRead, unreadNotificationCount,
} from '@connect/core'
import { Screen, Card, Title, Caption, Body } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useDataVersion } from '../lib/useDataVersion.js'
import { useSession } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

const KIND_ICON = { missed_call: PhoneMissed, review: Star }

// Compact relative time, deliberately NOT via i18n: core has no time.* keys and its own
// relativeTime() needs Intl.RelativeTimeFormat — the Hermes gap named as sharp edge #1
// in EXPO-MIGRATION.md. '12m' reads in every catalog; the polyfill can replace this.
function since(atMs) {
  const m = Math.max(1, Math.round((Date.now() - atMs) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export default function NotificationsScreen() {
  const { t } = useTranslation()
  const session = useSession()
  useDataVersion()
  const scopeId = session.store?.aggregate ? undefined : session.store?.id
  const items = getNotifications(scopeId)
  const unread = unreadNotificationCount(scopeId)

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BackButton />
        {unread > 0 && (
          <Pressable
            onPress={() => { vibrate(10); markAllNotificationsRead(scopeId) }}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 h-11 px-3 rounded-pill bg-brand-blue/10"
          >
            <CheckCheck size={14} color="#0355DB" />
            <Text className="text-[13px] font-hk-medium text-primaryText dark:text-d-primaryText">
              {t('notif.markAllRead', { defaultValue: 'Mark all read' })}
            </Text>
          </Pressable>
        )}
      </View>

      <Title className="mt-4">{t('notif.title', { defaultValue: 'Notifications' })}</Title>
      <Caption className="mt-1 mb-4">
        {t('notif.unreadCount', { count: unread, defaultValue: '{{count}} unread' })}
      </Caption>

      {items.map(n => {
        const Icon = KIND_ICON[n.kind] || Zap
        return (
          <Card
            key={n.id}
            onPress={n.read ? undefined : () => markNotificationRead(n.id)}
            label={t(n.titleKey, { ...n, defaultValue: n.titleKey })}
            className={`mb-2.5 ${n.read ? 'opacity-60' : ''}`}
          >
            <View className="flex-row items-start gap-3">
              <View className={`w-9 h-9 rounded-xl items-center justify-center ${n.urgent ? 'bg-bad/10' : 'bg-brand-blue/10'}`}>
                <Icon size={16} color={n.urgent ? '#DC2626' : '#0355DB'} />
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-2">
                  {!n.read && <View className="w-2 h-2 rounded-full bg-brand-blue" />}
                  <Body numberOfLines={2} className="flex-1 font-hk-semi text-ink dark:text-d-ink">
                    {t(n.titleKey, { ...n, defaultValue: n.titleKey })}
                  </Body>
                </View>
                <Caption className="mt-1">
                  {n.masked ? `${n.masked} · ` : ''}{since(n.atMs)}
                </Caption>
              </View>
            </View>
          </Card>
        )
      })}
    </Screen>
  )
}
