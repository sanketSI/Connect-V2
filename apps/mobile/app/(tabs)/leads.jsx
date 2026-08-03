// LEADS — ported from apps/web/src/screens/Leads.jsx (the spec). One list, every
// source, one lifecycle; status and source are FILTER chip rows with live counts; a
// missed call is the one row with an action on it. Deviation, documented: relative
// times use the compact form (12m/3h) — core's relativeTime() needs
// Intl.RelativeTimeFormat, Hermes sharp edge #1.
import { useEffect, useMemo, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PhoneCall, FileText, Store as StoreIcon, Users as UsersIcon, CalendarRange, UserPlus,
} from 'lucide-react-native'
import { getLeads, leadCounts, groupByStore, LEAD_STATUSES, LEAD_SOURCES } from '@connect/core'
import { Screen, Card, Title, Body, Caption, Chip } from '../../components/UI.jsx'
import LeadCard from '../../components/LeadCard.jsx'
import ScopePill from '../../components/ScopePill.jsx'
import TimeFilterSheet, { windowLabelFor } from '../../components/TimeFilterSheet.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { refreshDerived } from '../../lib/refresh.js'
import { vibrate } from '../../lib/haptics.js'

const SOURCE_ICON = { call: PhoneCall, form: FileText, walk_in: StoreIcon }

export default function LeadsTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const version = useDataVersion()
  const aggregate = !!session.store?.aggregate
  const scopeId = aggregate ? undefined : session.store?.id

  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  // THE GLOBAL TIME FILTER (PM feedback 8). Leads had no period control at all.
  // Default 'all': hiding anything older than 30 days would make the lifecycle chips
  // lie, and Expired leads are by definition the old ones.
  const [win, setWin] = useState('all')
  const [timeOpen, setTimeOpen] = useState(false)

  // Preset contract: Home's "Call now" opens this tab ON missed (web: goTab preset).
  const params = useLocalSearchParams()
  useEffect(() => {
    if (typeof params.status === 'string' && params.status) setStatus(params.status)
    if (typeof params.source === 'string' && params.source) setSource(params.source)
  }, [params.status, params.source])

  // Counts from the store scope only — not the filters, or every chip but the active
  // one would read zero.
  // The window feeds the COUNTS as well as the list — narrow one and not the other and
  // the chips promise rows the list will not show.
  const counts = useMemo(() => leadCounts({ storeId: scopeId, win }), [scopeId, win, version])
  const list = useMemo(() => getLeads({ storeId: scopeId, status, source, win }), [scopeId, status, source, win, version])
  // Grouped BEFORE the branch filter — the picker reads its counts off this, and a
  // filtered grouping would show every other branch as 0.
  const allGroups = useMemo(
    () => (aggregate ? groupByStore(list) : [{ storeId: null, label: null, count: list.length, items: list }]),
    [aggregate, list],
  )
  const groups = useMemo(
    // No screen-local branch filter any more: the SCOPE PILL above is the one location
    // control and it narrows the list at source, through assignedStoreIds(). Filtering
    // twice would let this screen disagree with the pill's own label.
    () => allGroups,
    [allGroups],
  )

  // EVERY card opens. It passes the LEAD id, not the customer id: core's
  // resolveSubject() finds the real contact when one exists and projects the lead when
  // it does not — 42 of the 62 leads in this fixture have no contact record, and five
  // more name one that is gone. Gating the tap on lead.customerId left those cards dead
  // on tap, which is exactly what iOS showed.
  const openLead = (lead) => router.push(`/customer/${encodeURIComponent(lead.id)}`)

  return (
    <Screen onRefresh={refreshDerived}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title>{t('leads.title', { defaultValue: 'Leads' })}</Title>
          <Caption className="mt-0.5">{t('leads.subtitle', { defaultValue: 'Every enquiry, whatever brought it in' })}</Caption>
        </View>
        <HeaderRight />
      </View>

      {/* SCOPE — location then period, the two things every count below is measured
          over. ALWAYS shown, never gated on `aggregate`: a switcher that vanishes once
          you narrow to one store cannot take you back out. */}
      <View className="flex-row flex-wrap items-center gap-2 mt-3 -mb-1">
        <ScopePill />
        <Chip icon={CalendarRange} active={win !== 'all'} onPress={() => { vibrate(6); setTimeOpen(true) }}>
          {windowLabelFor(t, win)}
        </Chip>
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
          <Chip key={s.id} icon={SOURCE_ICON[s.id]} active={source === s.id} onPress={() => setSource(s.id)}>
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

      <TimeFilterSheet
        open={timeOpen}
        value={win}
        defaultWindow="all"
        onClose={() => setTimeOpen(false)}
        onApply={setWin}
      />

      {/* ADD A LEAD BY HAND. A walk-in and a referral never ring the phone and never
          fill the microsite form, so without this the only leads in the book are the
          ones the platform happened to observe. Floating over the list rather than in
          the header: it is an action on the whole screen, and the header already carries
          the bell and the avatar.
          Translator TODO: the catalogs have customers.addCustomer but nothing for a lead. */}
      <Pressable
        onPress={() => { vibrate(8); router.push('/add-lead') }}
        accessibilityRole="button"
        accessibilityLabel="Add a lead"
        className="absolute right-4 bottom-5 h-14 w-14 rounded-full bg-brand-blue items-center justify-center"
        style={{ shadowColor: '#0070FC', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
      >
        <UserPlus size={26} color="#fff" />
      </Pressable>
    </Screen>
  )
}
