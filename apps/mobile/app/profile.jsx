// ============================================================
// PROFILE — reached from the avatar, exactly as on web (it is not a tab on either
// platform; see BottomTabBar's header comment). Phase 1 scope: who is signed in, which
// store the session is scoped to, and the two actions that must exist for the app to be
// honest — switch location and sign out. Listing management, language and the AI token
// ledger are the web Profile's deeper sections and follow in Phase 3.
// ============================================================
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Building2, MapPin, LogOut, RefreshCcw } from 'lucide-react-native'
import { getCurrentUser } from '@connect/core'
import { Screen, Card, Title, Body, Caption, GhostButton } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession, signOut } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

export default function ProfileScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const user = getCurrentUser()
  const store = session.store

  return (
    <Screen>
      <BackButton />

      <View className="items-center mt-6 mb-6">
        <View className="w-20 h-20 rounded-full bg-brand-blue items-center justify-center">
          <Text className="text-2xl font-hk-bold text-white">{user.initials}</Text>
        </View>
        <Title className="mt-3 text-[24px] leading-7">{user.name}</Title>
        <Caption className="mt-1">{user.phone}</Caption>
      </View>

      <Card className="mb-2.5">
        <View className="flex-row items-start gap-3">
          <View className="w-9 h-9 rounded-xl bg-brand-blue/10 items-center justify-center">
            <Building2 size={16} color="#0355DB" />
          </View>
          <View className="flex-1 min-w-0">
            <Body className="font-hk-semi text-ink dark:text-d-ink">
              {store?.aggregate
                ? t('stores.allLocations', { defaultValue: 'All locations' })
                : `${store?.name} — ${store?.branch}`}
            </Body>
            {!store?.aggregate && store?.address ? (
              <View className="flex-row items-center gap-1 mt-1">
                <MapPin size={11} color="#5F6878" />
                <Caption numberOfLines={1} className="flex-1">{store.address}</Caption>
              </View>
            ) : (
              <Caption className="mt-1">
                {t('stores.nStores', { count: session.stores.length, defaultValue_one: '{{count}} store, one combined view', defaultValue_other: '{{count}} stores, one combined view' })}
              </Caption>
            )}
          </View>
        </View>
      </Card>

      <GhostButton onPress={() => router.push('/switch')} className="mb-2.5">
        {t('common.switch', { defaultValue: 'Switch' })}
      </GhostButton>

      <GhostButton
        onPress={() => { vibrate(15); signOut(); router.replace('/') }}
        className="bg-bad/10"
      >
        <Text className="text-base font-hk-semi text-bad dark:text-d-bad">
          {t('profile.logout', { defaultValue: 'Log out' })}
        </Text>
      </GhostButton>
    </Screen>
  )
}
