// HOME. Real selectors, no stand-ins — the same functions apps/web/src/screens/Home.jsx
// calls, which is the whole point of the core split.
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Layers, Zap } from 'lucide-react-native'
import {
  getCurrentUser, networkRollup, isMultiLocation,
  openMissedCount, leadCounts, reviewsWaitingCount,
} from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Row, Title } from '../../components/UI.jsx'

export default function HomeTab() {
  const { t } = useTranslation()
  const router = useRouter()

  const user = getCurrentUser()
  const multi = isMultiLocation()
  const net = networkRollup()
  const missed = openMissedCount()
  const leads = leadCounts().missed
  const reviews = reviewsWaitingCount()

  return (
    <Screen>
      <Title>
        {t('home.greeting', { name: user.name.split(' ')[0], defaultValue: 'Welcome back, {{name}}.' })}
      </Title>

      {multi && (
        <>
          <SectionLabel icon={Layers}>
            {t('stores.acrossStores', { defaultValue: 'Across your stores' })}
          </SectionLabel>

          {/* Opens the roll-up — the strip is the way INTO it, not just a read-out. */}
          <Card
            onPress={() => router.push('/(tabs)/locations')}
            label={t('stores.acrossStores', { defaultValue: 'Across your stores' })}
          >
            <View className="flex-row gap-2">
              <Stat value={net.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} tone="primary" />
              <Stat value={net.missed} label={t('calls.statMissed', { defaultValue: 'Missed' })} tone="bad" />
              <Stat value={net.answered} label={t('calls.statAnswered', { defaultValue: 'Answered' })} tone="ok" />
              <Stat value={`${net.recovery}%`} label={t('stores.recoveryRate', { defaultValue: 'Recovery' })} tone="ok" />
            </View>
          </Card>
        </>
      )}

      <SectionLabel icon={Zap}>{t('home.needsYouNow', { defaultValue: 'Needs you now' })}</SectionLabel>

      <Row
        title={t('home.missedCalls', {
          count: missed,
          defaultValue_one: '{{count}} missed call',
          defaultValue_other: '{{count}} missed calls',
        })}
        sub={t('window.last24h', { defaultValue: 'Last 24 hours' })}
        onPress={() => router.push('/(tabs)/leads')}
      />
      <Row
        title={t('nav.leads', { defaultValue: 'Leads' })}
        sub={`${leads} ${t('leads.statusMissed', { defaultValue: 'Missed' })}`}
        onPress={() => router.push('/(tabs)/leads')}
      />
      <Row
        title={t('nav.reviews', { defaultValue: 'Reviews' })}
        sub={t('home.reviewsWaiting', {
          count: reviews,
          defaultValue_one: '{{count}} review waiting for a reply',
          defaultValue_other: '{{count}} reviews waiting for a reply',
        })}
        onPress={() => router.push('/(tabs)/reviews')}
      />
    </Screen>
  )
}
