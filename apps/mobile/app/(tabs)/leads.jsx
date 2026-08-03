// LEADS — ported from apps/web/src/screens/Leads.jsx (the spec). One list, every
// source, one lifecycle; status and source are FILTER chip rows with live counts; a
// missed call is the one row with an action on it. Deviation, documented: relative
// times use the compact form (12m/3h) — core's relativeTime() needs
// Intl.RelativeTimeFormat, Hermes sharp edge #1.
import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, Linking } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PhoneCall, FileText, Store as StoreIcon, Users as UsersIcon, Lock, Repeat2, ChevronRight, CalendarRange, Star as StarIcon, MessageSquare, Plus,
} from 'lucide-react-native'
import {
  getLeads, leadCounts, groupByStore, LEAD_STATUSES, LEAD_SOURCES, rupees,
  getCustomerById, customerDialDigits, updateLeadStatus, dayClock,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption, Chip } from '../../components/UI.jsx'
import ScopePill from '../../components/ScopePill.jsx'
import TimeFilterSheet, { windowLabelFor } from '../../components/TimeFilterSheet.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { refreshDerived } from '../../lib/refresh.js'
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
        <Plus size={26} color="#fff" />
      </Pressable>
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

/**
 * THE FIVE FACTS EVERY LEAD CARD CARRIES (PM feedback 8) — native twin of LeadFacts in
 * apps/web/src/screens/Leads.jsx; the reasoning lives there.
 *
 * Four as one chip row: status, source, reason, review-requested. The fifth
 * (hot/warm/cold) is the band pill in the card's top-right corner, where the brief asks
 * for it and where it already was.
 *
 * ONE COMPONENT FOR BOTH CARDS, so the missed card and the rest cannot drift into
 * disagreeing about what a lead is. The missed card previously showed NEITHER status nor
 * source.
 */
function LeadFacts({ lead, t, minimal }) {
  const src = LEAD_SOURCES.find(s => s.id === lead.source)
  const SrcIcon = SOURCE_ICON[lead.source] || PhoneCall

  return (
    <View className="mt-2 flex-row items-center gap-1.5 flex-wrap">
      <StatusPill status={lead.status} t={t} />

      {/* A MISSED CALL SHOWS ONLY ITS STATUS — see the web note. The row carries the
          number, when it last rang, how many times, and "Missed". Nothing else. */}
      {!minimal && src ? (
        <View className="h-6 px-2 rounded-pill flex-row items-center gap-1 bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline">
          <SrcIcon size={10} color="#5F6878" />
          <Text className="text-[11px] font-hk-medium text-ink-2 dark:text-d-ink2">
            {t(src.labelKey, { defaultValue: src.label })}
          </Text>
        </View>
      ) : null}

      {/* Null on a walk-in and a form — nobody rang — so the chip is absent rather than
          a placeholder. */}
      {!minimal && lead.callReason ? (
        <View className="h-6 px-2 rounded-pill flex-row items-center gap-1 bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline">
          <MessageSquare size={10} color="#5F6878" />
          <Text className="text-[11px] font-hk-medium text-ink-2 dark:text-d-ink2">
            {t(lead.callReasonKey, { defaultValue: lead.callReason })}
          </Text>
        </View>
      ) : null}

      {/* Only when a review HAS been asked for: "not requested" is the default state of
          almost every lead, and a chip on all of them says nothing.
          Translator TODO — the catalogs carry no string for this. */}
      {!minimal && lead.reviewRequested ? (
        <View className="h-6 px-2 rounded-pill flex-row items-center gap-1 bg-ok/10 border border-ok/30">
          <StarIcon size={10} color="#15803D" />
          <Text className="text-[11px] font-hk-semi text-[#15803D]">Review requested</Text>
        </View>
      ) : null}
    </View>
  )
}

function LeadCard({ lead, t, onOpen }) {
  // A missed call is the one row with an action on it — the web gives it its own card
  // shape (MissedCallCard), so it gets the same here, not a padded-out generic row.
  if (lead.source === 'call' && lead.status === 'missed') {
    return <MissedCallCard lead={lead} t={t} onOpen={onOpen} />
  }
  const Icon = SOURCE_ICON[lead.source] || PhoneCall
  const who = lead.name || lead.masked
  const src = LEAD_SOURCES.find(s => s.id === lead.source)

  return (
    <Card onPress={onOpen} label={who} className="mb-2.5">
      <View className="flex-row items-start gap-3">
        <View className="w-11 h-11 rounded-2xl items-center justify-center bg-brand-blue/10">
          <Icon size={18} color="#0070FC" />
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
      <LeadFacts lead={lead} t={t} />
    </Card>
  )
}

/**
 * MISSED CALL — ported from the web MissedCallCard: blue tile with the repeat badge on
 * its corner, lock + masked number, the BAND pill without the score (on a row whose job
 * is "ring this person back", hot/warm/cold is the whole decision and the number is
 * noise), time · ago · Called N×, value · category, then the full-width Call back —
 * which marks the lead CONTACTED through updateLeadStatus before the dialler opens,
 * exactly as web.
 */
function MissedCallCard({ lead, t, onOpen }) {
  const who = lead.name || lead.masked
  const digits = lead.customerId ? customerDialDigits(lead.customerId) : null
  const band = lead.cli >= 80 ? 'hot' : lead.cli >= 60 ? 'warm' : lead.cli >= 40 ? 'cool' : 'cold'
  const bandCls = {
    hot: 'bg-bad/10 text-bad', warm: 'bg-[#CA8A04]/10 text-[#B45309]',
    cool: 'bg-brand-blue/10 text-primaryText', cold: 'bg-ink-3/10 text-ink-3',
  }[band]

  // Marks the lead CONTACTED first, then dials if we hold a number. The status change
  // is the part that always matters — a masked-only caller still moved on in the
  // lifecycle because the manager acted — so the button is never withheld for the want
  // of digits. Same rule as the web card.
  function callBack() {
    vibrate(15)
    updateLeadStatus(lead, 'contacted')
    if (digits) Linking.openURL(`tel:${digits}`)
  }

  return (
    <Card onPress={onOpen} label={who} className="mb-2.5 !p-0 overflow-hidden">
      <View className="p-4 flex-row items-start gap-3">
        <View className="relative">
          <View className="w-11 h-11 rounded-2xl items-center justify-center bg-brand-blue/15 border border-brand-blue/30">
            <PhoneCall size={18} color="#0070FC" />
          </View>
          {lead.repeats > 1 && (
            <View className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-pill bg-brand-blue items-center justify-center px-1">
              <Text className="text-[10px] font-hk-bold text-white">{lead.repeats}×</Text>
            </View>
          )}
        </View>

        <View className="flex-1 min-w-0">
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
              <Lock size={10} color="#93A0C8" />
              <Body className="font-hk-semi text-ink dark:text-d-ink flex-shrink" numberOfLines={1}>{who}</Body>
            </View>
            {lead.cli != null && (
              <View className={`h-6 px-2 rounded-pill items-center justify-center ${bandCls.split(' ')[0]}`}>
                <Text className={`text-[11px] font-hk-semi ${bandCls.split(' ')[1]}`}>
                  {t(`common.${band}`, { defaultValue: band })}
                </Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center gap-1.5 mt-0.5 flex-wrap">
            <Caption>{dayClock(lead.atMs)}</Caption>
            <Caption className="opacity-50">·</Caption>
            <Caption>{since(lead.atMs)}</Caption>
            {lead.repeats > 1 && (
              <>
                <Caption className="opacity-50">·</Caption>
                <Repeat2 size={10} color="#5F6878" />
                <Caption>{t('vmn.calledCount', { count: lead.repeats, defaultValue: 'Called {{count}}×' })}</Caption>
              </>
            )}
          </View>

          {/* VALUE AND CATEGORY REMOVED from this card on instruction. Both are estimates
              attached to a call nobody answered — we never spoke to this person, so
              "₹38K · Air Conditioner" is a guess presented as fact on the busiest row in
              the app. They remain on the lead DETAIL, where there is room to say where a
              number came from. A deliberate loss, not an oversight. */}

          {/* Status only — see the note in LeadFacts. This card used to show
              NEITHER status nor source — the Call back button implied "missed" and the
              phone icon implied "call", which reads fine alone and badly when scanning a
              mixed list for what is still outstanding. */}
          <LeadFacts lead={lead} t={t} minimal />
        </View>

        <ChevronRight size={16} color="#93A0C8" style={{ alignSelf: 'center' }} />
      </View>

      <View className="px-4 pb-4 pt-3 border-t border-hairline dark:border-d-hairline">
        <Pressable
          onPress={callBack}
          accessibilityRole="button"
          accessibilityLabel={`${t('common.callBack', { defaultValue: 'Call back' })} ${who}`}
          className="h-11 rounded-pill bg-brand-blue items-center justify-center flex-row gap-2"
          style={{ shadowColor: '#0070FC', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}
        >
          <PhoneCall size={16} color="#fff" />
          <Text className="text-base font-hk-semi text-white">{t('common.callBack', { defaultValue: 'Call back' })}</Text>
        </Pressable>
      </View>
    </Card>
  )
}
