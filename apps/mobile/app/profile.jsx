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
  Bell, LogOut, ChevronRight, Users, RefreshCcw, Globe, Shield, Building2, Images,
  Layers, Sun, Moon, Check, QrCode, ExternalLink, Link as LinkIcon, LifeBuoy,
} from 'lucide-react-native'
import { useColorScheme } from 'react-native'
import { setTheme } from '../lib/theme.js'
import {
  getCurrentUser, assignedStores, locationNeedsVerification, micrositeUrl, googleListingUrl,
} from '@connect/core'
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

      <Card onPress={() => router.push('/role')} label={t('profile.switchRole', { defaultValue: 'Switch role' })} className="mt-3">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-[#F97316]/10 items-center justify-center">
            <Layers size={17} color="#F97316" />
          </View>
          <View className="flex-1 min-w-0">
            <Body className="font-hk-semi text-ink dark:text-d-ink">{t('profile.switchRole', { defaultValue: 'Switch role' })}</Body>
            <Caption className="mt-0.5">{t('profile.switchRoleSub', { defaultValue: 'Demo other personas' })}</Caption>
          </View>
          <ChevronRight size={16} color="#93A0C8" />
        </View>
      </Card>

      {/* Appearance — the web ThemeSwitcher: two tiles, active ringed in brand blue. */}
      <Caption className="font-hk-medium mt-4 mb-2 px-1">{t('profile.appearance', { defaultValue: 'Appearance' })}</Caption>
      <ThemeSwitcher t={t} />

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


function ThemeSwitcher({ t }) {
  const scheme = useColorScheme()
  const opts = [
    { id: 'light', label: t('profile.light', { defaultValue: 'Light' }), sub: t('profile.lightSub', { defaultValue: 'Bright & clean' }), Icon: Sun, tint: '#F97316' },
    { id: 'dark', label: t('profile.dark', { defaultValue: 'Dark' }), sub: t('profile.darkSub', { defaultValue: 'Easy on the eyes' }), Icon: Moon, tint: '#4D9AFF' },
  ]
  return (
    <Card className="!p-2">
      <View className="flex-row gap-2">
        {opts.map(o => {
          const active = scheme === o.id
          return (
            <Pressable
              key={o.id}
              onPress={() => { vibrate(8); setTheme(o.id) }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-1 rounded-xl p-3 border ${active ? 'bg-brand-blue/10 border-brand-blue/60' : 'bg-brand-blue/5 border-hairline dark:border-d-hairline'}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="w-8 h-8 rounded-lg items-center justify-center bg-card dark:bg-white/10 border border-hairline dark:border-d-hairline">
                  <o.Icon size={15} color={o.tint} />
                </View>
                {active && <Check size={14} color="#0070FC" />}
              </View>
              <Body className="font-hk-semi text-ink dark:text-d-ink mt-2">{o.label}</Body>
              <Caption>{o.sub}</Caption>
            </Pressable>
          )
        })}
      </View>
    </Card>
  )
}
