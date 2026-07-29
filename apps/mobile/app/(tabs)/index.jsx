// HOME — now with the chrome the web app opens with: bell + avatar top right, the
// store-switcher pill under the greeting, then the roll-up strip and triage rows.
// Everything reads real core selectors, scoped to the branch in session.
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Layers, Zap, RefreshCcw } from 'lucide-react-native'
import {
  getCurrentUser, networkRollup, isMultiLocation,
  openMissedCount, leadCounts, reviewsWaitingCount,
} from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Row, Title, Caption } from '../../components/UI.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { vibrate } from '../../lib/haptics.js'

export default function HomeTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  useDataVersion()

  const user = getCurrentUser()
  const multi = isMultiLocation()
  const store = session.store
  const aggregate = !!store?.aggregate
  const scopeId = aggregate ? undefined : store?.id

  const net = networkRollup()
  const missed = openMissedCount(undefined, scopeId)
  const leads = leadCounts({ storeId: scopeId }).missed
  const reviews = reviewsWaitingCount(undefined, scopeId)

  return (
    <Screen>
      {/* One row of chrome: greeting left, bell + avatar right — TopBar's layout. */}
      <View className="flex-row items-start justify-between gap-3">
        <Title className="flex-1">
          {t('home.greeting', { name: user.name.split(' ')[0], defaultValue: 'Welcome back, {{name}}.' })}
        </Title>
        <HeaderRight />
      </View>

      {/* The switcher pill — which branch this session is scoped to, and the way out. */}
      <Pressable
        onPress={() => { vibrate(8); router.push('/switch') }}
        accessibilityRole="button"
        accessibilityLabel={t('store.switchTitle', { defaultValue: 'Switch location' })}
        className="flex-row items-center gap-1.5 self-start mt-3 h-9 px-3 rounded-pill bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline"
      >
        <Text className="text-[13px] font-hk-medium text-ink-2 dark:text-d-ink2" numberOfLines={1}>
          {aggregate
            ? `${t('stores.allLocations', { defaultValue: 'All locations' })} · ${t('stores.nStoresShort', { count: net.stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}`
            : `${store?.name} · ${store?.branch}`}
        </Text>
        <RefreshCcw size={12} color="#5F6878" />
        <Text className="text-[13px] font-hk-medium text-ink-3 dark:text-d-ink3">
          {t('common.switch', { defaultValue: 'Switch' })}
        </Text>
      </Pressable>

      {multi && aggregate && (
        <>
          <SectionLabel icon={Layers}>
            {t('stores.acrossStores', { defaultValue: 'Across your stores' })}
          </SectionLabel>
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
