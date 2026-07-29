// ============================================================
// BUSINESS PROFILE — ported from apps/web/src/screens/BusinessProfile.jsx (the spec).
// A read-only mirror of the Google listing: strength meter, About, Contact, Location &
// areas (with the needs-verification card when flags exist), Opening hours (main +
// named sets + special), and From-the-business attribute groups — empty groups dropped,
// empty fields shown as "Not added" because absence is what the strength meter counts.
//
// On the All-locations view the web version ASKS which branch before opening (a listing
// belongs to ONE store; silently falling back to the flagship edited Indiranagar's
// listing without saying so). Same rule here: no ?store param on the aggregate view
// renders the branch list first.
// ============================================================
import { useMemo, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Shield, Navigation, AlertTriangle, Clock, Building2, ChevronRight } from 'lucide-react-native'
import {
  getBusinessProfile, ATTRIBUTE_GROUPS, DAYS, profileCompleteness,
  computeLocationFlags, assignedStores, getStoreLocations,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { FEATURES } from '../lib/features.js'
import { useSession } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

const DAY_KEYS = {
  Monday: 'profile.bpDayMonday', Tuesday: 'profile.bpDayTuesday', Wednesday: 'profile.bpDayWednesday',
  Thursday: 'profile.bpDayThursday', Friday: 'profile.bpDayFriday', Saturday: 'profile.bpDaySaturday',
  Sunday: 'profile.bpDaySunday',
}
const ATTR_GROUP_KEYS = {
  service: 'profile.bpAttrService', accessibility: 'profile.bpAttrAccessibility',
  amenities: 'profile.bpAttrAmenities', payments: 'profile.bpAttrPayments',
  parking: 'profile.bpAttrParking', offerings: 'profile.bpAttrOfferings',
  highlights: 'profile.bpAttrHighlights', planning: 'profile.bpAttrPlanning',
  crowd: 'profile.bpAttrCrowd', children: 'profile.bpAttrChildren',
  pets: 'profile.bpAttrPets', identity: 'profile.bpAttrIdentity',
}

export default function BusinessProfileScreen() {
  const { t } = useTranslation()
  const session = useSession()
  const params = useLocalSearchParams()
  const aggregate = !!session.store?.aggregate
  const [pickedId, setPickedId] = useState(typeof params.store === 'string' ? params.store : null)

  const store = aggregate
    ? (pickedId ? getStoreLocations().find(s => s.id === pickedId) : null)
    : session.store

  // Which branch? — the aggregate view must ask, never silently pick the flagship.
  if (aggregate && !store) {
    return (
      <Screen>
        <BackButton />
        <Title className="mt-4">{t('profile.businessProfile', { defaultValue: 'Business profile' })}</Title>
        <Caption className="mt-1 mb-4">{t('profile.bpSubtitleReadOnly', { defaultValue: 'What customers see on Google' })}</Caption>
        {assignedStores().map(s => (
          <Card key={s.id} onPress={() => { vibrate(8); setPickedId(s.id) }} label={`${s.name} — ${s.branch}`} className="mb-2.5">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-blue/10 items-center justify-center">
                <Building2 size={17} color="#0355DB" />
              </View>
              <View className="flex-1 min-w-0">
                <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{s.name} — {s.branch}</Body>
                <Caption numberOfLines={1} className="mt-0.5">{s.address}</Caption>
              </View>
              <ChevronRight size={16} color="#93A0C8" />
            </View>
          </Card>
        ))}
      </Screen>
    )
  }

  return <BusinessProfileBody store={store} t={t} />
}

function BusinessProfileBody({ store, t }) {
  const p = useMemo(() => getBusinessProfile(store?.id), [store])
  const flags = store ? computeLocationFlags(store) : []
  const strength = profileCompleteness(p)
  const strengthColor = strength >= 80 ? '#13764E' : strength >= 50 ? '#0355DB' : '#CA8A04'

  const { about, contact, location: loc, hours } = p
  const moreSets = hours.more || []
  const attrGroups = ATTRIBUTE_GROUPS
    .map(g => ({ ...g, values: p.attributes[g.key] || [] }))
    .filter(g => g.values.length > 0)

  return (
    <Screen>
      <BackButton />
      <Title className="mt-4">{t('profile.businessProfile', { defaultValue: 'Business profile' })}</Title>
      <Caption className="mt-1">{t('profile.bpSubtitleReadOnly', { defaultValue: 'What customers see on Google' })}</Caption>

      {/* Strength meter */}
      <View className="mt-3">
        <View className="flex-row items-center justify-between mb-1.5">
          <Caption>{t('profile.bpStrength', { defaultValue: 'Profile strength' })}</Caption>
          <Text className="text-xs font-hk-semi" style={{ color: strengthColor }}>
            {t('profile.bpPctComplete', { pct: strength, defaultValue: '{{pct}}% complete' })}
          </Text>
        </View>
        <View className="h-1.5 rounded-pill bg-brand-blue/10 overflow-hidden">
          <View className="h-full rounded-pill" style={{ width: `${strength}%`, backgroundColor: strengthColor }} />
        </View>
      </View>

      <Section label={t('profile.bpSecAbout', { defaultValue: 'About your business' })}>
        <Card className="!p-0 overflow-hidden">
          <Row t={t} label={t('profile.bpBusinessName', { defaultValue: 'Business name' })} value={about.name} />
          <Row t={t} label={t('profile.bpPrimaryCategory', { defaultValue: 'Primary category' })} value={about.primaryCategory} />
          <ChipsRow t={t} label={t('profile.bpAdditionalCategories', { defaultValue: 'Additional categories' })} values={about.secondaryCategories} />
          <Row t={t} label={t('profile.bpDescription', { defaultValue: 'Description' })} value={about.description} />
          <Row t={t} label={t('profile.bpOpeningDate', { defaultValue: 'Opening date' })} value={about.openingDate} last />
        </Card>
      </Section>

      <Section label={t('profile.bpSecContact', { defaultValue: 'Contact information' })}>
        <Card className="!p-0 overflow-hidden">
          <Row t={t} label={t('profile.bpPhoneNumber', { defaultValue: 'Phone number' })} value={contact.phone} />
          <Row t={t} label={t('profile.bpChat', { defaultValue: 'Chat' })} value={contact.chat} />
          <Row t={t} label={t('profile.bpWebsite', { defaultValue: 'Website' })} value={contact.website} />
          <Row t={t} label={t('profile.bpMenuLink', { defaultValue: 'Menu link' })} value={contact.menuLink} last />
        </Card>
      </Section>

      <Section label={t('profile.bpSecLocation', { defaultValue: 'Location & areas' })}>
        <Card className="!p-0 overflow-hidden">
          <Row t={t} label={t('profile.bpBusinessLocation', { defaultValue: 'Business location' })} value={loc.address} />
          <ChipsRow t={t} label={t('profile.bpServiceArea', { defaultValue: 'Service area' })} values={loc.serviceArea} last />
        </Card>

        {flags.length > 0 && (
          <View className="rounded-card p-3.5 mt-3 bg-[#CA8A04]/10 border border-[#CA8A04]/35">
            <View className="flex-row items-center gap-2 mb-1.5">
              <AlertTriangle size={16} color="#CA8A04" />
              <Body className="font-hk-semi text-ink dark:text-d-ink">
                {t('profile.gbpNeedsVerification', { defaultValue: 'Needs location verification' })}
              </Body>
            </View>
            {flags.map((f, i) => (
              <View key={i} className="flex-row items-start gap-1.5 mb-1">
                <View className="mt-1.5 w-1 h-1 rounded-full" style={{ backgroundColor: f.type === 'address' ? '#DC2626' : '#CA8A04' }} />
                <Caption className="flex-1">{f.reason}</Caption>
              </View>
            ))}
            {/* The verify FLOW is not in the MVP build (FEATURES.locationVerify) — the
                flags still print, but a button into a screen that does not exist would
                be the dead affordance this port keeps refusing to ship. */}
            {FEATURES.locationVerify && (
              <Pressable
                onPress={() => vibrate(10)}
                accessibilityRole="button"
                className="mt-3 h-10 rounded-xl bg-brand-blue items-center justify-center flex-row gap-2"
              >
                <Navigation size={16} color="#fff" />
                <Text className="text-base font-hk-semi text-white">{t('profile.bpStartVerify', { defaultValue: 'Verify now' })}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Section>

      <Section label={t('profile.bpSecHours', { defaultValue: 'Opening hours' })}>
        <Card className="!p-0 overflow-hidden">
          <View className="px-3.5 py-3 flex-row items-center gap-3 border-b border-hairline dark:border-d-hairline">
            <View className="w-8 h-8 rounded-lg bg-brand-blue/10 items-center justify-center">
              <Clock size={14} color="#0070FC" />
            </View>
            <View className="flex-1 min-w-0">
              <Caption>{t('profile.bpHours', { defaultValue: 'Hours' })}</Caption>
              <Body numberOfLines={1}>{hours.status}</Body>
            </View>
          </View>

          <HoursBlock t={t} label={t('profile.bpMainHours', { defaultValue: 'Main hours' })} hours={hours.main} />
          {moreSets.map(set => (
            <HoursBlock key={set.label} t={t} label={t('profile.bpNamedHours', { name: set.label, defaultValue: '{{name}} hours' })} hours={set.hours} />
          ))}
          <Row
            t={t}
            label={t('profile.bpSpecialHours', { defaultValue: 'Special hours' })}
            value={(hours.special && hours.special.length) ? hours.special.join(' · ') : null}
            last
          />
        </Card>
      </Section>

      {attrGroups.length > 0 && (
        <Section label={t('profile.bpSecFromBusiness', { defaultValue: 'From the business' })}>
          <Card className="!p-0 overflow-hidden">
            {attrGroups.map((g, i) => (
              <ChipsRow
                key={g.key} t={t}
                label={ATTR_GROUP_KEYS[g.key] ? t(ATTR_GROUP_KEYS[g.key]) : g.label}
                values={g.values}
                last={i === attrGroups.length - 1}
              />
            ))}
          </Card>
        </Section>
      )}

      <View className="flex-row items-start gap-1.5 mt-5 px-1">
        <Shield size={12} color="#93A0C8" />
        <Caption className="flex-1">{t('profile.bpReadOnlyNote', { defaultValue: 'Read-only. Changes go through the SingleInterface team.' })}</Caption>
      </View>
    </Screen>
  )
}

function Section({ label, children }) {
  return (
    <View className="mt-5">
      <Text className="text-[13px] font-hk-medium text-ink-3 dark:text-d-ink3 uppercase tracking-wide px-1 mb-2">{label}</Text>
      {children}
    </View>
  )
}

function Row({ label, value, last, t }) {
  const empty = value == null || value === ''
  return (
    <View className={`px-3.5 py-3 ${last ? '' : 'border-b border-hairline dark:border-d-hairline'}`}>
      <Caption>{label}</Caption>
      {empty
        ? <Body className="text-ink-3/60 dark:text-d-ink3">{t('profile.bpNotAdded', { defaultValue: 'Not added' })}</Body>
        : <Body>{value}</Body>}
    </View>
  )
}

function ChipsRow({ label, values, last, t }) {
  const list = values || []
  return (
    <View className={`px-3.5 py-3 ${last ? '' : 'border-b border-hairline dark:border-d-hairline'}`}>
      <Caption className="mb-1.5">{label}</Caption>
      {list.length === 0
        ? <Body className="text-ink-3/60 dark:text-d-ink3">{t('profile.bpNotAdded', { defaultValue: 'Not added' })}</Body>
        : (
          <View className="flex-row flex-wrap gap-1.5">
            {list.map(v => (
              <View key={v} className="h-6 px-2 rounded-pill bg-brand-blue/5 border border-hairline dark:border-d-hairline items-center justify-center">
                <Text className="text-[11px] font-hk-medium text-ink-2 dark:text-d-ink2">{v}</Text>
              </View>
            ))}
          </View>
        )}
    </View>
  )
}

function HoursBlock({ label, hours, t }) {
  return (
    <View className="px-3.5 py-3 border-b border-hairline dark:border-d-hairline">
      <Caption>{label}</Caption>
      <View className="mt-2">
        {DAYS.map(d => {
          const v = hours[d] || 'Closed'
          const off = v === 'Closed' || v === 'Not set'
          const display = off
            ? t(v === 'Not set' ? 'profile.bpNotSet' : 'profile.bpClosed', { defaultValue: v })
            : v.replace('–', ' – ')
          return (
            <View key={d} className="flex-row items-center justify-between mb-1">
              <Caption>{DAY_KEYS[d] ? t(DAY_KEYS[d], { defaultValue: d }) : d}</Caption>
              <Caption className={off ? 'opacity-60' : ''}>{display}</Caption>
            </View>
          )
        })}
      </View>
    </View>
  )
}
