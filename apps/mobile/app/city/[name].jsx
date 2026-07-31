// ============================================================
// EVERY RECORD IN ONE CITY — where the drill stops summarising (PM feedback 1/2).
//
// Native twin of CityRecordsPage in apps/web/src/screens/Network.jsx.
//
// "Once he has reached the city level, on clicking the city level, the user should be
// redirected to the individual data points within the city": the leads themselves, each
// opening its lead page, or the reviews themselves, each opening its review page.
//
// WHICH ONE opens first depends on the board the manager was already reading — they got
// here by tapping a row ranked on missed calls or on negative reviews, and showing them
// the other kind would answer a question they did not ask. The toggle stays on screen so
// it is one tap either way.
//
// A city is a SET of stores, so everything filters on that set rather than one storeId.
// ============================================================
import { useMemo, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PhoneCall, Star, MapPin, ChevronRight } from 'lucide-react-native'
import {
  getLeads, filterReviews, assignedStores, rupees, relativeTime, dayClock,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption, Chip } from '../../components/UI.jsx'
import { BackButton, HeaderRight } from '../../components/Header.jsx'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { vibrate } from '../../lib/haptics.js'

export default function CityRecordsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const version = useDataVersion()
  const { name, board } = useLocalSearchParams()
  const city = String(name || '')

  const [tab, setTab] = useState(board === 'reviews' ? 'reviews' : 'leads')

  const cityStores = useMemo(
    () => assignedStores().filter(l => l.city === city),
    [city, version],
  )
  const idSet = useMemo(() => new Set(cityStores.map(l => l.id)), [cityStores])

  const leads = useMemo(() => getLeads().filter(l => idSet.has(l.storeId)), [idSet, version])
  const reviews = useMemo(
    () => filterReviews({ window: 'all' }).filter(r => idSet.has(r.storeId)),
    [idSet, version],
  )

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BackButton />
        <HeaderRight />
      </View>

      <Title className="mt-4">{city}</Title>
      <Caption className="mt-0.5">
        {t('stores.nStoresShort', {
          count: cityStores.length,
          defaultValue_one: '{{count}} store',
          defaultValue_other: '{{count}} stores',
        })}
      </Caption>

      <View className="flex-row gap-2 mt-3 mb-3">
        <Chip icon={PhoneCall} active={tab === 'leads'} onPress={() => { vibrate(6); setTab('leads') }}>
          {t('leads.title', { defaultValue: 'Leads' })} {leads.length}
        </Chip>
        <Chip icon={Star} active={tab === 'reviews'} onPress={() => { vibrate(6); setTab('reviews') }}>
          {t('reviews.title', { defaultValue: 'Reviews' })} {reviews.length}
        </Chip>
      </View>

      {tab === 'leads' ? (
        leads.length ? leads.map(lead => (
          <Card
            key={lead.id}
            // The LEAD id, as everywhere else — resolveSubject finds the contact record
            // when one exists and projects the lead when it does not, which is why every
            // row here opens something rather than 42 of them being dead taps.
            onPress={() => router.push(`/customer/${encodeURIComponent(lead.id)}`)}
            label={lead.name || lead.masked}
            className="mb-2.5 !p-3.5"
          >
            <View className="flex-row items-start gap-3">
              <View className="flex-1 min-w-0">
                <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>
                  {lead.name || lead.masked}
                </Body>
                <Caption className="mt-0.5" numberOfLines={1}>
                  {[lead.category, lead.value ? rupees(lead.value) : null, relativeTime(lead.atMs)]
                    .filter(Boolean).join(' · ')}
                </Caption>
              </View>
              <ChevronRight size={15} color="#93A0C8" />
            </View>
          </Card>
        )) : <EmptyNote t={t} />
      ) : (
        reviews.length ? reviews.map(r => (
          <Card
            key={r.id}
            onPress={() => router.push(`/review/${encodeURIComponent(r.id)}`)}
            label={r.customer}
            className="mb-2.5 !p-3.5"
          >
            <View className="flex-row items-start gap-3">
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-1.5">
                  <Star size={12} color="#CA8A04" />
                  <Body className="font-hk-semi text-ink dark:text-d-ink">{r.rating}★</Body>
                  <Body className="flex-1" numberOfLines={1}>{r.customer}</Body>
                </View>
                <Caption className="mt-0.5" numberOfLines={2}>{r.text}</Caption>
                <Caption className="mt-0.5">{dayClock(r.atMs)}</Caption>
              </View>
              <ChevronRight size={15} color="#93A0C8" />
            </View>
          </Card>
        )) : <EmptyNote t={t} />
      )}

      {/* The stores themselves stay one tap away — this view answers "what happened
          here", not "which branch was it". */}
      {cityStores.length > 1 ? (
        <>
          <Caption className="mt-4 mb-2">{t('stores.storesLabel', { defaultValue: 'Stores' })}</Caption>
          {cityStores.map(l => (
            <Card key={l.id} onPress={() => router.push(`/store/${l.id}`)} label={l.branch} className="mb-2 !p-3">
              <View className="flex-row items-center gap-2">
                <MapPin size={13} color="#93A0C8" />
                <Body className="flex-1" numberOfLines={1}>{l.branch}</Body>
                <ChevronRight size={15} color="#93A0C8" />
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  )
}

function EmptyNote({ t }) {
  return (
    <Card className="!p-6 items-center">
      <Body className="font-hk-semi text-ink dark:text-d-ink">
        {t('leads.emptyTitle', { defaultValue: 'Nothing here' })}
      </Body>
      <Caption className="mt-0.5">{t('customers.emptySub', { defaultValue: 'Try another filter.' })}</Caption>
    </Card>
  )
}
