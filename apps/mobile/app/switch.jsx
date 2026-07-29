// ============================================================
// SWITCH LOCATION — the native StoreSelector, same rules as the web one after the
// "choose your store" gate was removed: it is only ever the switcher. There is always a
// session, `current` always marks a store, and backing out returns to the app — leaving
// a switch must never sign anyone out. All locations rides first, because "how is the
// whole network doing" is the question a multi-store owner opens this screen with.
// ============================================================
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Layers, Building2, Check, PhoneMissed } from 'lucide-react-native'
import { assignedStores, networkRollup, makeAllLocationsStore, AGGREGATE_STORE_ID } from '@connect/core'
import { Screen, Card, Title, Body, Caption } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession, setStore } from '../lib/session.js'

export default function SwitchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const myStores = assignedStores()
  const net = networkRollup()
  const currentId = session.store?.aggregate ? AGGREGATE_STORE_ID : session.store?.id

  function pick(store) {
    setStore(store)
    router.back()
  }

  return (
    <Screen>
      <BackButton />
      <Title className="mt-4">{t('store.switchTitle', { defaultValue: 'Switch location' })}</Title>
      <Body className="mt-2 mb-5">
        {/* The web renders this key through <Trans> for the bold count; native strips
            the markers instead of inventing a parallel string in 13 catalogs. */}
        {t('store.switchSubtitle', {
          count: myStores.length,
          defaultValue: 'This number manages {{count}} locations. Switching moves your calls, reviews and insights to that store.',
        }).replace(/<\/?1>/g, '')}
      </Body>

      {myStores.length > 1 && (
        <StoreCard
          icon={Layers}
          title={t('stores.allLocations', { defaultValue: 'All locations' })}
          sub={t('stores.nStores', { count: net.stores, defaultValue_one: '{{count}} store, one combined view', defaultValue_other: '{{count}} stores, one combined view' })}
          missed={net.missed}
          current={currentId === AGGREGATE_STORE_ID}
          onPress={() => pick(makeAllLocationsStore())}
          t={t}
        />
      )}

      {myStores.map(s => (
        <StoreCard
          key={s.id}
          icon={Building2}
          title={`${s.name} — ${s.branch}`}
          sub={s.address}
          missed={s.missed}
          current={currentId === s.id}
          onPress={() => pick(s)}
          t={t}
        />
      ))}
    </Screen>
  )
}

function StoreCard({ icon: Icon, title, sub, missed, current, onPress, t }) {
  return (
    <Card
      onPress={onPress}
      label={title}
      className={`mb-2.5 ${current ? 'border-brand-blue' : ''}`}
    >
      <View className="flex-row items-start gap-3">
        <View className={`w-10 h-10 rounded-xl items-center justify-center ${current ? 'bg-brand-blue' : 'bg-brand-blue/10'}`}>
          <Icon size={17} color={current ? '#fff' : '#0355DB'} />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Body numberOfLines={1} className="font-hk-semi text-ink dark:text-d-ink flex-shrink">{title}</Body>
            {current && (
              <View className="flex-row items-center gap-0.5 h-5 px-1.5 rounded-pill bg-brand-blue">
                <Check size={10} color="#fff" />
                <Text className="text-[11px] font-hk-semi text-white">{t('store.current', { defaultValue: 'Current' })}</Text>
              </View>
            )}
          </View>
          {sub ? <Caption numberOfLines={1} className="mt-0.5">{sub}</Caption> : null}
          <View className="flex-row items-center gap-1 mt-1.5">
            <PhoneMissed size={11} color="#5F6878" />
            <Caption>{t('store.missedCount', { count: missed, defaultValue: '{{count}} missed' })}</Caption>
          </View>
        </View>
      </View>
    </Card>
  )
}
