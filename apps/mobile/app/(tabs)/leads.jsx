// LEADS — a real list now, not a summary. getLeads() scoped to the branch in session,
// a working status filter (the chip row the web tab uses), and each row showing what
// the web card leads with: who, when, status, and the chance-to-buy band.
import { useEffect, useState } from 'react'
import { View, Text } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getLeads, leadCounts, LEAD_STATUSES } from '@connect/core'
import { Screen, Card, Stat, Title, Body, Caption, Chip } from '../../components/UI.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'

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

export default function LeadsTab() {
  const { t } = useTranslation()
  const session = useSession()
  useDataVersion()
  const scopeId = session.store?.aggregate ? undefined : session.store?.id
  const [status, setStatus] = useState(null) // null = all

  // A tab can be opened ON something — Home's "Call now" pushes ?status=missed so the
  // manager lands on exactly the rows that CTA counted, the same preset contract
  // App.jsx's goTab(preset) keeps on web.
  const params = useLocalSearchParams()
  useEffect(() => {
    if (typeof params.status === 'string' && params.status) setStatus(params.status)
  }, [params.status])

  const c = leadCounts({ storeId: scopeId })
  const leads = getLeads({ storeId: scopeId })
    .filter(l => !status || l.status === status)
    .sort((a, b) => b.atMs - a.atMs)

  return (
    <Screen>
      <View className="flex-row items-start justify-between gap-3">
        <Title>{t('nav.leads', { defaultValue: 'Leads' })}</Title>
        <HeaderRight />
      </View>

      <View className="mt-4">
        <Card>
          <View className="flex-row gap-2">
            <Stat value={c.total} label={t('common.all', { defaultValue: 'All' })} />
            <Stat value={c.missed} label={t('leads.statusMissed', { defaultValue: 'Missed' })} tone="bad" />
            <Stat value={c.converted} label={t('leads.statusConverted', { defaultValue: 'Converted' })} tone="ok" />
          </View>
        </Card>
      </View>

      {/* The status filter — same idiom as the web tab's chip row. */}
      <View className="flex-row flex-wrap gap-2 mt-4 mb-3">
        <Chip active={!status} onPress={() => setStatus(null)}>
          {t('common.all', { defaultValue: 'All' })}
        </Chip>
        {LEAD_STATUSES.map(s => (
          <Chip key={s.id} active={status === s.id} onPress={() => setStatus(status === s.id ? null : s.id)}>
            {t(s.labelKey, { defaultValue: s.label })}
          </Chip>
        ))}
      </View>

      {leads.map(l => (
        <Card key={l.id} className="mb-2.5">
          <View className="flex-row items-center gap-3">
            <View className="flex-1 min-w-0">
              <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>
                {l.name || l.masked}
              </Body>
              <Caption className="mt-0.5">
                {since(l.atMs)}
                {l.value ? ` · ₹${(l.value / 1000).toFixed(0)}K` : ''}
                {l.cli ? ` · CLI ${l.cli}` : ''}
              </Caption>
            </View>
            <StatusPill status={l.status} t={t} />
          </View>
        </Card>
      ))}
      {leads.length === 0 && (
        <Caption className="text-center mt-6">{t('leads.emptyTitle', { defaultValue: 'No leads here' })}</Caption>
      )}
    </Screen>
  )
}

function StatusPill({ status, t }) {
  const s = LEAD_STATUSES.find(x => x.id === status)
  const tones = {
    missed: 'bg-bad/10 text-bad',
    contacted: 'bg-brand-blue/10 text-primaryText',
    converted: 'bg-ok/10 text-ok',
    review_requested: 'bg-brand-blue/10 text-primaryText',
    expired: 'bg-ink-3/10 text-ink-3',
  }
  const tone = tones[status] || tones.expired
  return (
    <View className={`h-6 px-2 rounded-pill items-center justify-center ${tone.split(' ')[0]}`}>
      <Text className={`text-[11px] font-hk-semi ${tone.split(' ')[1]}`}>
        {s ? t(s.labelKey, { defaultValue: s.label }) : status}
      </Text>
    </View>
  )
}
