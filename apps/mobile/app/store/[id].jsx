// ============================================================
// STORE PAGE — where a row on "Your locations" lands, mirroring the web drill-down
// (Hierarchy → StoreCallsPage): the branch's numbers, then its missed and attended
// calls as real records. Missed shows repeats (the frequency signal the web page
// leads with); attended shows duration and the AI summary line.
//
// Calls are filtered by the storeId the records carry — the attribution work that
// stopped one manager seeing another's calls on web is what makes this filter safe.
// ============================================================
import { View, Text } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PhoneMissed, PhoneIncoming } from 'lucide-react-native'
import {
  getStoreLocations, getMissedCalls, getConnectedCalls, resolveSubject, getCustomerById,
} from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Title, Body, Caption } from '../../components/UI.jsx'
import { BackButton, HeaderRight } from '../../components/Header.jsx'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { refreshDerived } from '../../lib/refresh.js'

export default function StorePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams()
  useDataVersion()
  const store = getStoreLocations().find(s => s.id === id)
  // A call row opens the PERSON behind it — the contact record when the platform holds
  // one, the lead projected into the same shape when it does not. `call:<id>` is the id
  // a call-sourced lead carries, and resolveSubject also walks a customerId back to its
  // lead, so nearly every row leads somewhere. The two calls in this fixture with no
  // lead at all resolve to nothing and stay untappable — a card that opens a blank
  // screen is worse than one that does not move.
  const subjectPress = (c) => {
    const key = `call:${c.id}`
    const target = resolveSubject(key, { getCustomerById })
      ? key
      : (resolveSubject(c.customerId, { getCustomerById }) ? c.customerId : null)
    return target ? () => router.push(`/customer/${encodeURIComponent(target)}`) : undefined
  }

  const missed = getMissedCalls().filter(c => c.storeId === id)
  const attended = getConnectedCalls().filter(c => c.storeId === id)

  if (!store) return null

  return (
    <Screen onRefresh={refreshDerived}>
      <View className="flex-row items-center justify-between">
        <BackButton />
        <HeaderRight />
      </View>

      <Title className="mt-4">{store.branch}</Title>
      <Caption className="mt-1">{store.address}</Caption>

      <View className="mt-4">
        <Card>
          <View className="flex-row gap-2">
            <Stat value={missed.length} label={t('calls.statMissed', { defaultValue: 'Missed' })} tone="bad" />
            <Stat value={attended.length} label={t('calls.statAnswered', { defaultValue: 'Answered' })} tone="ok" />
            <Stat value={`${store.recovery}%`} label={t('stores.recoveryRate', { defaultValue: 'Recovery' })} tone="ok" />
          </View>
        </Card>
      </View>

      {missed.length > 0 && (
        <SectionLabel icon={PhoneMissed}>{t('calls.statMissed', { defaultValue: 'Missed' })}</SectionLabel>
      )}
      {missed.map(c => (
        <Card key={c.id} className="mb-2.5">
          <View className="flex-row items-center gap-3">
            <View className="w-9 h-9 rounded-xl bg-bad/10 items-center justify-center">
              <PhoneMissed size={15} color="#DC2626" />
            </View>
            <View className="flex-1 min-w-0">
              <Body className="font-hk-semi text-ink dark:text-d-ink">{c.masked}</Body>
              <Caption className="mt-0.5">
                {c.repeats > 1
                  ? `${t('vmn.calledCount', { count: c.repeats, defaultValue: 'Called {{count}}×' })} · ${c.time}`
                  : c.time}
              </Caption>
            </View>
          </View>
        </Card>
      ))}
      {attended.length > 0 && (
        <SectionLabel icon={PhoneIncoming}>{t('calls.statAnswered', { defaultValue: 'Answered' })}</SectionLabel>
      )}
      {/* Every attended row IS the customer — it opens the person behind the call,
          exactly the web flow. Reason + source ride on the row: they belong to THIS
          call, not to the person. */}
      {attended.map(c => (
        <Card
          key={c.id}
          onPress={subjectPress(c)}
          label={c.masked}
          className="mb-2.5"
        >
          <View className="flex-row items-start gap-3">
            <View className="w-9 h-9 rounded-xl bg-ok/10 items-center justify-center">
              <PhoneIncoming size={15} color="#13764E" />
            </View>
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <Body className="font-hk-semi text-ink dark:text-d-ink flex-1" numberOfLines={1}>{c.masked}</Body>
                <Caption>{c.duration}</Caption>
              </View>
              {(c.callReasonKey || c.callReason) ? (
                <Caption numberOfLines={1} className="mt-1">
                  {t(c.callReasonKey, { defaultValue: c.callReason })}{c.source ? ` · ${c.source}` : ''}
                </Caption>
              ) : null}
              {c.summary ? (
                <Caption numberOfLines={2} className="mt-1">
                  {c.summaryKey ? t(c.summaryKey, { defaultValue: c.summary }) : c.summary}
                </Caption>
              ) : null}
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  )
}
