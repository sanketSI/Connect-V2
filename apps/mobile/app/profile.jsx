// ============================================================
// PROFILE — ported from apps/web/src/screens/Profile.jsx (the spec): identity card with
// the switch link and role pill, the Team quick tile, then the settings card (Alerts ·
// Language · Privacy · Log out) and the footer line.
//
// Complete against the web spec: identity, the four quick actions (Business profile,
// Manage media, Team, Switch role), Appearance with a working light/dark switcher
// (Appearance.setColorScheme drives RN and NativeWind together, persisted through the
// storage seam and re-applied at boot), the settings card, and the footer.
// ============================================================
import { View, Text, Pressable, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  LogOut, ChevronRight, RefreshCcw, Building2, Images,
  QrCode, ExternalLink, Link as LinkIcon, LifeBuoy,
} from 'lucide-react-native'
import {
  getCurrentUser, assignedStores, locationNeedsVerification, micrositeUrl, googleListingUrl,
} from '@connect/core'
import { FEATURES } from '../lib/features.js'
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

      {/* THE REVIEW QR (PM feedback 10) — "an easy way for a store manager to be able to
          allow buyers to scan the code and to add a review on their Google Business
          Profile. Again, this was there in the previous build. It got stripped."
          Restored, and features.js now carries reviewQr as in-scope rather than !IS_MVP.
          A QR belongs to ONE listing, so it is hidden on the aggregate: there is no
          single review box six stores could share.
          Translator TODO — the catalogs carry no QR strings. */}
      {FEATURES.reviewQr && !aggregate && (
        <Card onPress={() => router.push('/review-qr')} label="Review QR" className="mt-3">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-xl bg-[#7C3AED]/10 items-center justify-center">
              <QrCode size={17} color="#7C3AED" />
            </View>
            <View className="flex-1 min-w-0">
              <Body className="font-hk-semi text-ink dark:text-d-ink">Review QR</Body>
              <Caption className="mt-0.5">Buyers scan to review</Caption>
            </View>
            <ChevronRight size={16} color="#93A0C8" />
          </View>
        </Card>
      )}

      {/* WHERE THIS STORE LIVES ONLINE (PM feedback 10) — the listing and the microsite.
          Both leave the app, so they carry an external-link glyph rather than the chevron
          the in-app rows use. Hidden on the aggregate for the same reason as the QR. */}
      {!aggregate && (
        <Card className="mt-3 !p-0 overflow-hidden">
          <SettingsRow
            icon={Building2} tint="#0070FC"
            label="Google Business Profile"
            sub="Open your public listing"
            trailing={<ExternalLink size={15} color="#93A0C8" />}
            onPress={() => { const u = googleListingUrl(store); if (u) Linking.openURL(u) }}
          />
          <SettingsRow
            icon={LinkIcon} tint="#0070FC"
            label="Microsite"
            sub={micrositeUrl(store) || ''}
            trailing={<ExternalLink size={15} color="#93A0C8" />}
            onPress={() => { const u = micrositeUrl(store); if (u) Linking.openURL(u) }}
          />
        </Card>
      )}

      {/* REMOVED ON INSTRUCTION: Team, Switch role, the light/dark picker, Alerts,
          Language and Privacy & data. Six settings a store manager opens once and never
          again, on the screen that now has to carry the three things they DO reach for —
          the listing, the microsite and the review QR. Switch role was a demo affordance
          in a shipping build, the theme follows the OS, and Language is one tap away in
          system settings. None of the screens are deleted: /team, /role and /language
          still exist for the full build — this is what Profile links to. */}

      <Card className="mt-3 !p-0 overflow-hidden">
        {/* RAISE A TICKET (PM feedback 3) — the support channel. A settings row rather
            than a quick-action card: the cards above are the things a manager does
            weekly, and needing support is not one of them.
            Translator TODO — the catalogs carry no ticketing strings. */}
        <SettingsRow
          icon={LifeBuoy} tint="#0355DB"
          label="Raise a ticket"
          sub="Report an issue or ask for help"
          trailing={<ChevronRight size={16} color="#93A0C8" />}
          onPress={() => router.push('/raise-ticket')}
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


