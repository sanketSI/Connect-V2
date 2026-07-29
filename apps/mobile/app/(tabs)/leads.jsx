// LEADS (Phase 1). The status breakdown straight from core's leadCounts() — the same
// numbers the web Leads tab filters on. The list itself, its filters and the lead detail
// are Phase 3; what is here is real, not a placeholder.
import { View, Text, useColorScheme } from 'react-native'
import { useTranslation } from 'react-i18next'
import { leadCounts } from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Row } from '../../components/UI.jsx'
import { themeFor, TYPE } from '../../lib/tokens.js'

export default function LeadsTab() {
  const { t } = useTranslation()
  const theme = themeFor(useColorScheme())
  const c = leadCounts()

  return (
    <Screen>
      <Text style={[TYPE.largeTitle, { color: theme.textPrimary }]}>
        {t('nav.leads', { defaultValue: 'Leads' })}
      </Text>

      <View style={{ marginTop: 16 }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat value={c.total} label={t('common.all', { defaultValue: 'All' })} />
            <Stat value={c.missed} label={t('leads.statusMissed', { defaultValue: 'Missed' })} tint={theme.errorText} />
            <Stat value={c.converted} label={t('leads.statusConverted', { defaultValue: 'Converted' })} tint={theme.successText} />
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
  const theme = themeFor(useColorScheme())
  return <Text style={[TYPE.headline, { color: theme.textSecondary }]}>{n}</Text>
}
