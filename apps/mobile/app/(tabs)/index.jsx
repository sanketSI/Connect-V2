// HOME (Phase 1). Real selectors, no stand-ins: the greeting, the roll-up strip and the
// triage counts all come from @connect/core — the same functions apps/web/src/screens/
// Home.jsx calls, which is the entire point of the core split.
import { View, Text, useColorScheme } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react-native'
import {
  getCurrentUser, networkRollup, isMultiLocation,
  openMissedCount, leadCounts, reviewsWaitingCount,
} from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Row } from '../../components/UI.jsx'
import { themeFor, TYPE } from '../../lib/tokens.js'

export default function HomeTab() {
  const { t } = useTranslation()
  const theme = themeFor(useColorScheme())

  const user = getCurrentUser()
  const multi = isMultiLocation()
  const net = networkRollup()
  const missed = openMissedCount()
  const leads = leadCounts().missed
  const reviews = reviewsWaitingCount()

  return (
    <Screen>
      <Text style={[TYPE.largeTitle, { color: theme.textPrimary }]}>
        {t('home.greeting', { name: user.name.split(' ')[0], defaultValue: 'Welcome back, {{name}}.' })}
      </Text>

      {multi && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 8 }}>
            <Layers size={13} color={theme.primaryText} />
            <Text style={[TYPE.subhead, { color: theme.textTertiary }]}>
              {t('stores.acrossStores', { defaultValue: 'Across your stores' })}
            </Text>
          </View>

          {/* The four facts a multi-store owner scans first — and the chevron rides the
              right edge, centred, exactly as it now does on web (commit a8260c1). */}
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={net.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} tint={theme.primaryText} />
              <Stat value={net.missed} label={t('calls.statMissed', { defaultValue: 'Missed' })} tint={theme.errorText} />
              <Stat value={net.answered} label={t('calls.statAnswered', { defaultValue: 'Answered' })} tint={theme.successText} />
              <Stat value={`${net.recovery}%`} label={t('stores.recoveryRate', { defaultValue: 'Recovery' })} tint={theme.successText} />
            </View>
          </Card>
        </>
      )}

      <SectionLabel>{t('home.needsYouNow', { defaultValue: 'Needs you now' })}</SectionLabel>

      <Row
        title={t('home.missedCalls', {
          count: missed,
          defaultValue_one: '{{count}} missed call',
          defaultValue_other: '{{count}} missed calls',
        })}
        sub={t('window.last24h', { defaultValue: 'Last 24 hours' })}
      />
      <Row
        title={t('nav.leads', { defaultValue: 'Leads' })}
        sub={`${leads} ${t('leads.statusMissed', { defaultValue: 'Missed' })}`}
      />
      <Row
        title={t('nav.reviews', { defaultValue: 'Reviews' })}
        sub={t('home.reviewsWaiting', {
          count: reviews,
          defaultValue_one: '{{count}} review waiting for a reply',
          defaultValue_other: '{{count}} reviews waiting for a reply',
        })}
      />
    </Screen>
  )
}
