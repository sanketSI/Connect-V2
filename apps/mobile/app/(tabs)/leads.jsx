// LEADS — ported from apps/web/src/screens/Leads.jsx (the spec). One list, every
// source, one lifecycle; status and source are FILTER chip rows with live counts; a
// missed call is the one row with an action on it. Deviation, documented: relative
// times use the compact form (12m/3h) — core's relativeTime() needs
// Intl.RelativeTimeFormat, Hermes sharp edge #1.
import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, Linking } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PhoneCall, FileText, Store as StoreIcon, Users as UsersIcon, PhoneMissed } from 'lucide-react-native'
import {
  getLeads, leadCounts, groupByStore, LEAD_STATUSES, LEAD_SOURCES, rupees,
  getCustomerById,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption, Chip } from '../../components/UI.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { vibrate } from '../../lib/haptics.js'

const SOURCE_ICON = { call: PhoneCall, form: FileText, walk_in: StoreIcon }

function since(atMs) {
  const m = Math.max(1, Math.round((Date.now() - atMs) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export default function LeadsTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const version = useDataVersion()
  const aggregate = !!session.store?.aggregate
  const scopeId = aggregate ? undefined : session.store?.id

  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')

  // Preset contract: Home's "Call now" opens this tab ON missed (web: goTab preset).
  const params = useLocalSearchParams()
  useEffect(() => {
    if (typeof params.status === 'string' && params.status) setStatus(params.status)
    if (typeof params.source === 'string' && params.source) setSource(params.source)
  }, [params.status, params.source])

  // Counts from the store scope only — not the filters, or every chip but the active
  // one would read zero.
  const counts = useMemo(() => leadCounts({ storeId: scopeId }), [scopeId, version])
  const list = useMemo(() => getLeads({ storeId: scopeId, status, source }), [scopeId, status, source, version])
  const groups = useMemo(
    () => (aggregate ? groupByStore(list) : [{ storeId: null, label: null, count: list.length, items: list }]),
    [aggregate, list],
  )

  const openLead = (lead) => { if (lead.customerId) router.push(`/customer/${lead.customerId}`) }

  return (
    <Screen>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title>{t('leads.title', { defaultValue: 'Leads' })}</Title>
          <Caption className="mt-0.5">{t('leads.subtitle', { defaultValue: 'Every enquiry, whatever brought it in' })}</Caption>
        </View>
        <HeaderRight />
      </View>

      {/* WHERE THE LEAD HAS GOT TO — chips carry live counts, exactly as web. */}
      <View className="flex-row flex-wrap gap-2 mt-4 mb-2.5">
        <Chip active={status === 'all'} onPress={() => setStatus('all')}>
          {t('common.all', { defaultValue: 'All' })} {counts.total}
        </Chip>
        {LEAD_STATUSES.map(s => (
          <Chip key={s.id} active={status === s.id} onPress={() => setStatus(s.id)}>
            {t(s.labelKey, { defaultValue: s.label })} {counts[s.id] ?? 0}
          </Chip>
        ))}
      </View>

      {/* WHERE IT CAME FROM. */}
      <View className="flex-row flex-wrap gap-2 mb-3">
        <Chip active={source === 'all'} onPress={() => setSource('all')}>
          {t('leads.allSources', { defaultValue: 'All sources' })}
        </Chip>
        {LEAD_SOURCES.map(s => (
          <Chip key={s.id} active={source === s.id} onPress={() => setSource(s.id)}>
            {t(s.labelKey, { defaultValue: s.label })}
          </Chip>
        ))}
      </View>

      {groups.map(g => (
        <View key={g.storeId ?? 'all'}>
          {g.label ? (
            <View className="flex-row items-center justify-between mt-2 mb-2">
              <Caption className="font-hk-semi">{g.label}</Caption>
              <Caption>{g.count}</Caption>
            </View>
          ) : null}
          {g.items.map(lead => <LeadCard key={lead.id} lead={lead} t={t} onOpen={() => openLead(lead)} />)}
        </View>
      ))}

      {list.length === 0 && (
        <Card className="!p-6 items-center">
          <UsersIcon size={26} color="#93A0C8" />
          <Body className="font-hk-semi text-ink dark:text-d-ink mt-2">{t('leads.emptyTitle', { defaultValue: 'Nothing here' })}</Body>
          <Caption className="mt-0.5">{t('leads.emptySub', { defaultValue: 'No leads match this status and source.' })}</Caption>
        </Card>
      )}
    </Screen>
  )
}

/** Chance-to-buy pill, banded exactly as the web CLIPill. */
function CLIPill({ score }) {
  const tone = score >= 80 ? 'bg-bad/10 text-bad' : score >= 60 ? 'bg-[#CA8A04]/10 text-[#CA8A04]' : 'bg-brand-blue/10 text-primaryText'
  return (
    <View className={`h-6 px-2 rounded-pill items-center justify-center ${tone.split(' ')[0]}`}>
      <Text className={`text-[11px] font-hk-semi ${tone.split(' ')[1]}`}>{score}</Text>
    </View>
  )
}

/** Status pill — colour says problem / win / in-flight, not five arbitrary colours. */
function StatusPill({ status, t }) {
  const meta = LEAD_STATUSES.find(s => s.id === status)
  if (!meta) return null
  const tone = status === 'missed'
    ? 'bg-bad/10 text-bad'
    : status === 'converted' || status === 'review_requested'
      ? 'bg-ok/10 text-ok'
      : 'bg-ink-3/10 text-ink-2'
  return (
    <View className={`h-6 px-2 rounded-pill items-center justify-center self-start ${tone.split(' ')[0]}`}>
      <Text className={`text-[11px] font-hk-semi ${tone.split(' ')[1]}`}>{t(meta.labelKey, { defaultValue: meta.label })}</Text>
    </View>
  )
}

function LeadCard({ lead, t, onOpen }) {
  const missedCall = lead.source === 'call' && lead.status === 'missed'
  const Icon = missedCall ? PhoneMissed : (SOURCE_ICON[lead.source] || PhoneCall)
  const who = lead.name || lead.masked
  const src = LEAD_SOURCES.find(s => s.id === lead.source)
  const customer = lead.customerId ? getCustomerById(lead.customerId) : null
  const digits = (customer?.phone || '').replace(/\D/g, '')

  return (
    <Card onPress={lead.customerId ? onOpen : undefined} label={who} className="mb-2.5">
      <View className="flex-row items-start gap-3">
        <View className={`w-11 h-11 rounded-2xl items-center justify-center ${missedCall ? 'bg-bad/10' : 'bg-brand-blue/10'}`}>
          <Icon size={18} color={missedCall ? '#DC2626' : '#0070FC'} />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center justify-between gap-2">
            <Body className="font-hk-semi text-ink dark:text-d-ink flex-1" numberOfLines={1}>{who}</Body>
            {lead.cli != null && <CLIPill score={lead.cli} />}
          </View>
          <Caption numberOfLines={1} className="mt-0.5">
            {[t(src?.labelKey, { defaultValue: src?.label }), lead.value ? rupees(lead.value) : null, lead.category]
              .filter(Boolean).join(' · ')}
          </Caption>
          <Caption className="mt-0.5">{since(lead.atMs)}</Caption>
        </View>
      </View>
      <View className="mt-2 flex-row items-center justify-between gap-2">
        <StatusPill status={lead.status} t={t} />
        {/* The missed call is somebody still waiting to be rung back — the one row with
            an action on it, exactly the web's treatment. */}
        {missedCall && digits ? (
          <Pressable
            onPress={() => { vibrate(15); Linking.openURL(`tel:+91${digits}`) }}
            accessibilityRole="button"
            accessibilityLabel={t('common.callBack', { defaultValue: 'Call back' })}
            className="h-8 px-3 rounded-pill bg-brand-blue items-center justify-center"
          >
            <Text className="text-[13px] font-hk-semi text-white">{t('common.callBack', { defaultValue: 'Call back' })}</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  )
}
