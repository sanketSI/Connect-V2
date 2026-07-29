// ============================================================
// SWITCH LOCATION — the brand-hierarchy drill, mirroring the web StoreSelector:
// Brand → sub-brand → state → city → store. Each level leads with its COMBINED card
// ("N stores, one combined view") — picking it scopes every screen to all of that
// node's locations at once; a child row drills deeper; a store row focuses one
// location. Back pops the tree before it leaves the screen.
// ============================================================
import { useState } from 'react'
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Layers, Building2, Check, PhoneMissed, MapPin, ChevronRight } from 'lucide-react-native'
import { BRAND_NAME, subBrands, scopeChildren } from '@connect/core'
import { Screen, Card, Title, Body, Caption } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession, setScope } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

export default function SwitchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const fullStores = session.stores
  const fullIds = fullStores.map(l => l.id)
  const current = session.store

  const [path, setPath] = useState([])
  const [sb, state, city] = path

  const children = path.length === 0
    ? subBrands(fullIds).map(b => ({ level: 'subBrand', name: b.name, ids: b.ids, count: b.count }))
    : scopeChildren(fullIds, { subBrand: sb, state, city })
  const hereIds = path.length === 0 ? fullIds : children.flatMap(c => c.ids)
  const hereName = path.length === 0 ? BRAND_NAME : path[path.length - 1]

  const missedFor = (ids) => fullStores.filter(l => ids.includes(l.id)).reduce((n, l) => n + (l.missed || 0), 0)
  const isCurrentNode = (name, ids) =>
    !!current?.aggregate && (current.label === name || (!current.label && name === BRAND_NAME))
      && (current.ids ? current.ids.length === ids.length : ids.length === fullIds.length)

  function pick(node) {
    vibrate(10)
    setScope(node)
    router.back()
  }

  return (
    <Screen>
      <BackButton onPress={() => (path.length ? setPath(p => p.slice(0, -1)) : router.back())} />
      <Title className="mt-4">{t('store.switchTitle', { defaultValue: 'Switch location' })}</Title>
      <Body className="mt-2 mb-1">
        {t('store.switchSubtitle', {
          count: fullStores.length,
          defaultValue: 'This number manages {{count}} locations. Switching moves your calls, reviews and insights to that store.',
        }).replace(/<\/?1>/g, '')}
      </Body>
      {path.length > 0 && (
        <Caption className="mb-3" numberOfLines={1}>{[BRAND_NAME, ...path].join(' → ')}</Caption>
      )}

      {/* THIS LEVEL, COMBINED. */}
      {hereIds.length > 1 && (() => {
        const on = isCurrentNode(hereName, hereIds)
        return (
          <Card
            onPress={() => pick({ name: hereName, ids: hereIds })}
            label={hereName}
            className={`mt-2 mb-2.5 ${on ? 'border-brand-blue' : ''}`}
          >
            <View className="flex-row items-start gap-3">
              <View className={`w-10 h-10 rounded-xl items-center justify-center ${on ? 'bg-brand-blue' : 'bg-brand-blue/10'}`}>
                <Layers size={17} color={on ? '#fff' : '#0355DB'} />
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-2">
                  <Body className="font-hk-semi text-ink dark:text-d-ink flex-shrink" numberOfLines={1}>{hereName}</Body>
                  {on && (
                    <View className="flex-row items-center gap-0.5 h-5 px-1.5 rounded-pill bg-brand-blue">
                      <Check size={10} color="#fff" />
                      <Text className="text-[11px] font-hk-semi text-white">{t('store.current', { defaultValue: 'Current' })}</Text>
                    </View>
                  )}
                </View>
                <Caption className="mt-0.5">
                  {t('stores.nStores', { count: hereIds.length, defaultValue_one: '{{count}} store, one combined view', defaultValue_other: '{{count}} stores, one combined view' })}
                </Caption>
                <View className="flex-row items-center gap-1 mt-1.5">
                  <PhoneMissed size={11} color="#5F6878" />
                  <Caption>{t('store.missedCount', { count: missedFor(hereIds), defaultValue: '{{count}} missed' })}</Caption>
                </View>
              </View>
            </View>
          </Card>
        )
      })()}

      {children.map(node => {
        if (node.level === 'store') {
          const loc = node.store
          const on = current?.id === loc.id
          return (
            <Card key={loc.id} onPress={() => pick(node)} label={`${loc.name} — ${loc.branch}`} className={`mb-2.5 ${on ? 'border-brand-blue' : ''}`}>
              <View className="flex-row items-start gap-3">
                <View className={`w-10 h-10 rounded-xl items-center justify-center ${on ? 'bg-brand-blue' : 'bg-brand-blue/10'}`}>
                  <Building2 size={17} color={on ? '#fff' : '#0355DB'} />
                </View>
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2">
                    <Body className="font-hk-semi text-ink dark:text-d-ink flex-shrink" numberOfLines={1}>{loc.name} — {loc.branch}</Body>
                    {on && (
                      <View className="flex-row items-center gap-0.5 h-5 px-1.5 rounded-pill bg-brand-blue">
                        <Check size={10} color="#fff" />
                        <Text className="text-[11px] font-hk-semi text-white">{t('store.current', { defaultValue: 'Current' })}</Text>
                      </View>
                    )}
                  </View>
                  <Caption numberOfLines={1} className="mt-0.5">{loc.address}</Caption>
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <PhoneMissed size={11} color="#5F6878" />
                    <Caption>{t('store.missedCount', { count: loc.missed, defaultValue: '{{count}} missed' })}</Caption>
                  </View>
                </View>
              </View>
            </Card>
          )
        }
        return (
          <Card key={node.name} onPress={() => { setPath(p => [...p, node.name]) }} label={node.name} className="mb-2.5">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-blue/10 items-center justify-center">
                {node.level === 'subBrand'
                  ? <Building2 size={17} color="#0355DB" />
                  : <MapPin size={17} color="#0355DB" />}
              </View>
              <View className="flex-1 min-w-0">
                <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{node.name}</Body>
                <Caption className="mt-0.5">
                  {t('stores.nStoresShort', { count: node.count, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
                  {' · '}{t('store.missedCount', { count: missedFor(node.ids), defaultValue: '{{count}} missed' })}
                </Caption>
              </View>
              <ChevronRight size={16} color="#93A0C8" />
            </View>
          </Card>
        )
      })}
    </Screen>
  )
}
