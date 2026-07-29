// LEADS. The status breakdown from core's leadCounts() — the same numbers the web Leads
// tab filters on. The list itself, its filters and the lead detail are Phase 3.
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { leadCounts } from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Row, Title } from '../../components/UI.jsx'

export default function LeadsTab() {
  const { t } = useTranslation()
  const c = leadCounts()

  return (
    <Screen>
      <Title>{t('nav.leads', { defaultValue: 'Leads' })}</Title>

      <View className="mt-4">
        <Card>
          <View className="flex-row gap-2">
            <Stat value={c.total} label={t('common.all', { defaultValue: 'All' })} />
            <Stat value={c.missed} label={t('leads.statusMissed', { defaultValue: 'Missed' })} tone="bad" />
            <Stat value={c.converted} label={t('leads.statusConverted', { defaultValue: 'Converted' })} tone="ok" />
          </View>
        </Card>
      </View>

      <SectionLabel>{t('leads.statusTitle', { defaultValue: 'Where is this lead?' })}</SectionLabel>

      <Row title={t('leads.statusContacted', { defaultValue: 'Contacted' })} right={<Count n={c.contacted} />} />
      <Row title={t('leads.statusReviewRequested', { defaultValue: 'Review link sent' })} right={<Count n={c.review_requested} />} />
      <Row title={t('leads.statusExpired', { defaultValue: 'Expired' })} right={<Count n={c.expired} />} />
    </Screen>
  )
}

function Count({ n }) {
  return <Text className="text-base font-hk-semi text-ink-2 dark:text-d-ink2">{n}</Text>
}
