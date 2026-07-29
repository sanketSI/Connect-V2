// ============================================================
// PROFILE — ported from apps/web/src/screens/Profile.jsx (the spec): identity card with
// the switch link and role pill, the Team quick tile, then the settings card (Alerts ·
// Language · Privacy · Log out) and the footer line.
//
// Named, not hidden: the role switcher tile is NOT drawn yet, and Manage media's Posts
// segment and camera/gallery uploads are still to come; a control that opens nothing is
// a dead affordance, the one thing this port keeps refusing to ship. Appearance follows the system scheme on
// native (useColorScheme); the web's manual toggle has no native counterpart yet.
// ============================================================
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Bell, LogOut, ChevronRight, Users, RefreshCcw, Globe, Shield, Building2, Images } from 'lucide-react-native'
import { getCurrentUser, assignedStores, locationNeedsVerification } from '@connect/core'
import { FEATURES } from '../lib/features.js'
import { getLanguage } from '@connect/core/i18n/languages.js'
import { Screen, Card, Title, Body, Caption } from '../components/UI.jsx'
import { BackButton, NotificationBell } from '../components/Header.jsx'
import { useSession, signOut } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const user = getCurrentUser()
  const store = session.store
  const aggregate = !!store?.aggregate

  const s = aggregate
    ? {
      name: t('stores.allLocations', { defaultValue: 'All locations' }),
      branch: t('stores.nStoresShort', { count: assignedStores().length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' }),
    }
    : (store || user.store)

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BackButton />
        <NotificationBell />
      </View>

      <Title className="mt-4">{t('profile.title', { defaultValue: 'Profile' })}</Title>
      <Caption className="mt-0.5 mb-4">{t('profile.subtitle', { defaultValue: 'Store · Settings · Brand' })}</Caption>

      {/* Identity */}
      <Card className="!p-3.5">
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-full bg-brand-blue items-center justify-center">
            <Text className="text-base font-hk-bold text-white">{user.initials}</Text>
          </View>
          <View className="flex-1 min-w-0">
            <Body className="font-hk-semi text-ink dark:text-d-ink">{user.name}</Body>
            <Pressable onPress={() => { vibrate(8); router.push('/switch') }} accessibilityRole="button" className="flex-row items-center gap-1">
              <Caption numberOfLines={1}>{s.name} — {s.branch}</Caption>
              <RefreshCcw size={10} color="#93A0C8" />
              <Caption>{t('common.switch', { defaultValue: 'Switch' })}</Caption>
            </Pressable>
            <Caption>{user.phone}</Caption>
          </View>
          <View className="h-6 px-2 rounded-pill bg-brand-blue/10 border border-brand-blue/30 items-center justify-center">
            <Text className="text-[11px] font-hk-semi text-primaryText dark:text-d-primaryText">
              {t('profile.manager', { defaultValue: 'Manager' })}
            </Text>
          </View>
        </View>
      </Card>

      {/* Quick actions — drawn only once their destinations exist natively. */}
      {FEATURES.businessProfile && (
        <Card
          onPress={() => router.push('/business-profile')}
          label={t('profile.businessProfile', { defaultValue: 'Business profile' })}
          className="mt-3"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-xl bg-brand-blue/10 items-center justify-center">
              <Building2 size={17} color="#0070FC" />
            </View>
            <View className="flex-1 min-w-0">
              <Body className="font-hk-semi text-ink dark:text-d-ink">{t('profile.businessProfile', { defaultValue: 'Business profile' })}</Body>
              <Caption className="mt-0.5" numberOfLines={1}>
                {!aggregate && store && locationNeedsVerification(store)
                  ? t('profile.needsVerification', { defaultValue: 'Needs verification' })
                  : t('profile.businessProfileSub', { defaultValue: 'Hours, category, description' })}
              </Caption>
            </View>
            <ChevronRight size={16} color="#93A0C8" />
          </View>
        </Card>
      )}

      {FEATURES.manageMedia && (
        <Card
          onPress={() => router.push('/manage-media')}
          label={t('profile.manageMedia', { defaultValue: 'Manage media' })}
          className="mt-3"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-xl bg-brand-blue/10 items-center justify-center">
              <Images size={17} color="#0070FC" />
            </View>
            <View className="flex-1 min-w-0">
              <Body className="font-hk-semi text-ink dark:text-d-ink">{t('profile.manageMedia', { defaultValue: 'Manage media' })}</Body>
              <Caption className="mt-0.5">{t('profile.manageMediaSub', { defaultValue: 'Cover photo, gallery, posts' })}</Caption>
            </View>
            <ChevronRight size={16} color="#93A0C8" />
          </View>
        </Card>
      )}

      <Card onPress={() => router.push('/team')} label={t('profile.team', { defaultValue: 'Team' })} className="mt-3">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-ok/10 items-center justify-center">
            <Users size={17} color="#16A34A" />
          </View>
          <View className="flex-1 min-w-0">
            <Body className="font-hk-semi text-ink dark:text-d-ink">{t('profile.team', { defaultValue: 'Team' })}</Body>
            <Caption className="mt-0.5">{t('profile.teamSub', { defaultValue: 'Add people' })}</Caption>
          </View>
          <ChevronRight size={16} color="#93A0C8" />
        </View>
      </Card>

      {/* Settings list — one card, hairline dividers, exactly the web order. */}
      <Card className="mt-3 !p-0 overflow-hidden">
        <SettingsRow
          icon={Bell} tint="#0355DB"
          label={t('profile.alerts', { defaultValue: 'Alerts' })}
          sub={t('profile.alertsSub', { defaultValue: 'Missed call & bad review pings' })}
          trailing={<Caption>{t('profile.on', { defaultValue: 'On' })}</Caption>}
        />
        <Hairline />
        <SettingsRow
          icon={Globe} tint="#0355DB"
          label={t('profile.language', { defaultValue: 'Language' })}
          sub={getLanguage(i18n.resolvedLanguage || i18n.language || 'en').native}
          trailing={<ChevronRight size={16} color="#93A0C8" />}
          onPress={() => router.push('/language')}
        />
        <Hairline />
        <SettingsRow
          icon={Shield} tint="#0355DB"
          label={t('profile.privacy', { defaultValue: 'Privacy & data' })}
          sub={t('profile.privacySub', { defaultValue: 'GDPR · numbers stay masked' })}
          trailing={<Caption>{t('profile.privacyOk', { defaultValue: 'OK' })}</Caption>}
        />
        <Hairline />
        <SettingsRow
          icon={LogOut} tint="#DC2626" danger
          label={t('profile.logout', { defaultValue: 'Log out' })}
          onPress={() => { vibrate(15); signOut(); router.replace('/') }}
        />
      </Card>

      <Caption className="text-center mt-4 mb-1">
        {t('profile.footer', { defaultValue: 'SingleInterface Connect · Zero Business Loss · Built with Gemini' })}
      </Caption>
    </Screen>
  )
}

function Hairline() {
  return <View className="h-px bg-hairline dark:bg-d-hairline" />
}

function SettingsRow({ icon: Icon, tint, label, sub, trailing, onPress, danger }) {
  const body = (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <Icon size={17} color={tint} />
      <View className="flex-1 min-w-0">
        <Body className={`font-hk-semi ${danger ? 'text-bad dark:text-d-bad' : 'text-ink dark:text-d-ink'}`}>{label}</Body>
        {sub ? <Caption className="mt-0.5" numberOfLines={1}>{sub}</Caption> : null}
      </View>
      {trailing}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable
      onPress={() => { vibrate(8); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {body}
    </Pressable>
  )
}
