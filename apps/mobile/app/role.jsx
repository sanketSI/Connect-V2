// SWITCH ROLE — the web's RoleSheet (Profile.jsx), as a pushed screen: the demo
// persona list off core's ROLES, current marked, pick applies and returns.
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Building2, Check } from 'lucide-react-native'
import { ROLES } from '@connect/core'
import { Screen, Card, Title, Body, Caption } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession, setRole } from '../lib/session.js'
import { vibrate, notifySuccess } from '../lib/haptics.js'

export default function RoleScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()

  return (
    <Screen>
      <BackButton />
      <Title className="mt-4">{t('profile.roleSheetTitle', { defaultValue: 'Switch viewing role' })}</Title>
      <Caption className="mt-1 mb-3">{t('profile.roleSheetSub', { defaultValue: 'Demo: see the app as different roles' })}</Caption>
      <Card className="!p-2">
        {ROLES.map((r, i) => {
          const active = session.role === r.id
          return (
            <View key={r.id}>
              {i > 0 && <View className="h-px bg-hairline dark:bg-d-hairline" />}
              <Pressable
                onPress={() => { vibrate(10); setRole(r.id); notifySuccess(); router.back() }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="flex-row items-center gap-3 px-3 py-3"
              >
                <View className={`w-9 h-9 rounded-lg items-center justify-center ${active ? 'bg-brand-blue' : 'bg-brand-blue/10'}`}>
                  <Building2 size={16} color={active ? '#fff' : '#0355DB'} />
                </View>
                <View className="flex-1 min-w-0">
                  <Body className="font-hk-semi text-ink dark:text-d-ink">{t(r.labelKey, { defaultValue: r.label })}</Body>
                  <Caption className="mt-0.5" numberOfLines={1}>{t(r.descKey, { defaultValue: r.desc })}</Caption>
                </View>
                {active && <Check size={16} color="#16A34A" />}
              </Pressable>
            </View>
          )
        })}
      </Card>
    </Screen>
  )
}
