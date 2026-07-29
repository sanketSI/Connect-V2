// YOUR LOCATIONS — the per-store roll-up, from core's networkRollup().perStore. Reached
// only when the manager holds more than one store (see the tab layout). The drill-down
// (state → city → store → calls → customer) is Phase 3/4.
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { networkRollup } from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Row, Title } from '../../components/UI.jsx'
import { HeaderRight } from '../../components/Header.jsx'

export default function LocationsTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const net = networkRollup()

  // Worst recovery first: this screen exists to find the branch losing calls, and
  // alphabetical order buries it.
  const stores = [...net.perStore].sort((a, b) => a.recovery - b.recovery)

  return (
    <Screen>
      <View className="flex-row items-start justify-between gap-3">
        <Title>{t('nav.network', { defaultValue: 'Your locations' })}</Title>
        <HeaderRight />
      </View>

      <View className="mt-4">
        <Card>
          <View className="flex-row gap-2">
            <Stat value={net.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} tone="primary" />
            <Stat value={net.missed} label={t('calls.statMissed', { defaultValue: 'Missed' })} tone="bad" />
            <Stat value={`${net.recovery}%`} label={t('stores.recoveryRate', { defaultValue: 'Recovery' })} tone="ok" />
          </View>
        </Card>
      </View>

      <SectionLabel>{t('stores.allLocations', { defaultValue: 'All locations' })}</SectionLabel>

      {stores.map(s => (
        <Row
          key={s.storeId}
          title={s.branch}
          sub={t('store.missedCount', { count: s.missed, defaultValue: '{{count}} missed' })}
          onPress={() => router.push(`/store/${s.storeId}`)}
          right={
            <Text className={`text-base font-hk-semi ${s.recovery >= 50 ? 'text-ok dark:text-d-ok' : 'text-bad dark:text-d-bad'}`}>
              {s.recovery}%
            </Text>
          }
        />
      ))}
    </Screen>
  )
}
