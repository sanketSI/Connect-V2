// ============================================================
// SWITCH LOCATION — the whole brand tree as ONE indented dropdown list:
//
//   TATA
//     Tetley
//       Karnataka
//         Bangalore
//           Indiranagar …
//
// This replaced the level-by-level drill: four taps of ceremony for a holding that
// fits on one screen. Every row is directly selectable — picking a city scopes to it
// and its ancestors are auto-selected by construction (a city's ids are a subset of
// its state's). The default rule is untouched: a fresh session still opens on the
// sub-brand with the most locations.
// ============================================================
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Layers, Building2, Check, MapPin, ChevronRight } from 'lucide-react-native'
import { brandTree } from '@connect/core'
import { Screen, Card, Title, Body, Caption } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession, setScope } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

const ICONS = { brand: Layers, subBrand: Building2, state: MapPin, city: MapPin, store: Building2 }

export default function SwitchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const fullStores = session.stores
  const fullIds = fullStores.map(l => l.id)
  const current = session.store

  const rows = brandTree(fullIds)
  const missedFor = (ids) => fullStores.filter(l => ids.includes(l.id)).reduce((n, l) => n + (l.missed || 0), 0)

  const isCurrent = (row) => row.store
    ? current?.id === row.store.id
    : !!current?.aggregate
      && (current.label === row.name || (!current.label && row.level === 'brand'))
      && (current.ids ? current.ids.length === row.ids.length : row.ids.length === fullIds.length)

  function pick(row) {
    vibrate(10)
    setScope(row)
    router.back()
  }

  return (
    <Screen>
      <BackButton />
      <Title className="mt-4">{t('store.switchTitle', { defaultValue: 'Switch location' })}</Title>
      <Body className="mt-2 mb-4">
        {t('store.switchSubtitle', {
          count: fullStores.length,
          defaultValue: 'This number manages {{count}} locations. Switching moves your calls, reviews and insights to that store.',
        }).replace(/<\/?1>/g, '')}
      </Body>

      {rows.map((row, i) => {
        const on = isCurrent(row)
        const Icon = ICONS[row.level] || Building2
        const leaf = !!row.store
        return (
          <View key={`${row.level}:${row.name}:${i}`} style={{ marginLeft: row.depth * 14 }}>
            <Card
              onPress={() => pick(row)}
              label={leaf ? `${row.store.name} — ${row.store.branch}` : row.name}
              className={`mb-1.5 !p-2.5 ${on ? 'border-brand-blue' : ''}`}
            >
              <View className="flex-row items-center gap-2.5">
                <View className={`w-8 h-8 rounded-lg items-center justify-center ${on ? 'bg-brand-blue' : 'bg-brand-blue/10'}`}>
                  <Icon size={14} color={on ? '#fff' : '#0355DB'} />
                </View>
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2">
                    <Body className={`text-ink dark:text-d-ink flex-shrink ${leaf ? '' : 'font-hk-semi'}`} numberOfLines={1}>
                      {leaf ? `${row.store.name} — ${row.store.branch}` : row.name}
                    </Body>
                    {on && (
                      <View className="flex-row items-center gap-0.5 h-5 px-1.5 rounded-pill bg-brand-blue">
                        <Check size={10} color="#fff" />
                        <Text className="text-[11px] font-hk-semi text-white">{t('store.current', { defaultValue: 'Current' })}</Text>
                      </View>
                    )}
                  </View>
                  <Caption numberOfLines={1} className="mt-0.5">
                    {leaf
                      ? t('store.missedCount', { count: row.store.missed, defaultValue: '{{count}} missed' })
                      : `${t('stores.nStoresShort', { count: row.ids.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })} · ${t('store.missedCount', { count: missedFor(row.ids), defaultValue: '{{count}} missed' })}`}
                  </Caption>
                </View>
                {on ? <Check size={15} color="#0070FC" /> : <ChevronRight size={13} color="#93A0C8" />}
              </View>
            </Card>
          </View>
        )
      })}
    </Screen>
  )
}
