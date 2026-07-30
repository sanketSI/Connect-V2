// ============================================================
// SWITCH LOCATION — level tabs down the left, smart chips on the right.
//
// The rail is the hierarchy (Sub-brand → State → City → Location); the pane is that
// level's values as MULTI-SELECT chips, each carrying its store count. A manager can
// hold Bangalore AND Mumbai at once — four stores across two states — which no
// single-node drill could express.
//
// Empty at a level means "all of it", so the scope is the intersection of the levels
// that were actually filtered, and the brand default needs no special case. There is
// deliberately no ancestor back-fill: writing Karnataka when Bangalore is picked would
// narrow the very city list the pick came from and hide Mumbai. What a selection
// IMPLIES is shown on the rail instead, muted, as feedback rather than filter.
//
// Every rule (cascade, prune, resolve, label) is a pure core helper, shared with web.
// ============================================================
import { useState } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, MapPin, Building2 } from 'lucide-react-native'
import {
  BRAND_NAME, subBrandOf,
  scopeMatches, scopeOptions, toggleScope, scopeLabel, impliedAt,
} from '@connect/core'
import { Screen, Title, Body, Caption, PrimaryButton } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession, setScope } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

// Captions are English for now — the catalogs carry no structural level names, and
// reusing a near-miss key would be worse than a labelled gap. Translator TODO.
const LEVELS = [
  { key: 'subBrands', label: 'Sub-brand', Icon: Building2 },
  { key: 'states', label: 'State', Icon: MapPin },
  { key: 'cities', label: 'City', Icon: MapPin },
  { key: 'locations', label: 'Location', Icon: Building2 },
]

export default function SwitchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const fullStores = session.stores
  const fullIds = fullStores.map(l => l.id)
  const current = session.store

  const seed = () => {
    if (!current) return { subBrands: [], states: [], cities: [], locations: [] }
    if (!current.aggregate) {
      return { subBrands: [subBrandOf(current)], states: [current.state], cities: [current.city], locations: [current.id] }
    }
    return current.sel || { subBrands: [], states: [], cities: [], locations: [] }
  }
  const [sel, setSel] = useState(seed)
  const [level, setLevel] = useState('subBrands')

  const options = scopeOptions(fullIds, sel)
  const matched = scopeMatches(fullIds, sel)
  const label = scopeLabel(fullIds, sel)
  const chips = options[level] || []
  const chosen = sel[level] || []

  const impliedLabel = (key) => {
    const all = (options[key] || []).length
    const vals = impliedAt(fullIds, sel, key)
    if (!vals.length || vals.length >= all) return t('common.all', { defaultValue: 'All' })
    return vals.length === 1 ? vals[0] : `${vals.length} implied`
  }

  function apply() {
    vibrate(10)
    if (sel.locations.length === 1 && matched.length === 1) setScope({ store: matched[0], sel })
    else setScope({ name: label, ids: matched.map(l => l.id), sel })
    router.back()
  }

  return (
    <Screen scroll={false}>
      <BackButton />
      <Title className="mt-3 text-[22px] leading-7">{t('store.switchTitle', { defaultValue: 'Switch location' })}</Title>
      <Caption className="mt-0.5">
        {BRAND_NAME} · {t('stores.nStoresShort', { count: fullStores.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
      </Caption>

      {/* THE SPLIT: level rail | value chips */}
      <View className="flex-1 flex-row gap-2.5 mt-3">
        <View className="w-[104px]" accessibilityRole="tablist">
          {LEVELS.map(lv => {
            const on = level === lv.key
            const n = (sel[lv.key] || []).length
            return (
              <Pressable
                key={lv.key}
                onPress={() => { vibrate(6); setLevel(lv.key) }}
                accessibilityRole="tab"
                accessibilityState={{ selected: !!on }}
                accessibilityLabel={lv.label}
                className={`rounded-xl px-2.5 py-2.5 mb-1.5 border ${on ? 'bg-brand-blue/15 border-brand-blue/45' : 'bg-brand-blue/5 border-hairline dark:border-d-hairline'}`}
              >
                <View className="flex-row items-center gap-1.5">
                  <lv.Icon size={12} color={on ? '#0070FC' : '#93A0C8'} />
                  <Text
                    numberOfLines={1}
                    className={`text-[12px] font-hk-semi flex-1 ${on ? 'text-primaryText dark:text-d-primaryText' : 'text-ink-2 dark:text-d-ink2'}`}
                  >
                    {lv.label}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  className={`text-[11px] mt-0.5 ${n ? 'text-primaryText dark:text-d-primaryText' : 'text-ink-3 dark:text-d-ink3'}`}
                >
                  {n ? `${n} selected` : impliedLabel(lv.key)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} accessibilityRole="tabpanel">
          <View className="flex-row flex-wrap gap-1.5">
            <Pressable
              onPress={() => { vibrate(6); setSel(s => ({ ...s, [level]: [] })) }}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen.length === 0 }}
              className={`h-8 px-2.5 rounded-pill items-center justify-center border ${chosen.length === 0 ? 'bg-brand-blue border-brand-blue' : 'bg-brand-blue/5 border-hairline dark:border-d-hairline'}`}
            >
              <Text className={`text-[12px] font-hk-semi ${chosen.length === 0 ? 'text-white' : 'text-ink-2 dark:text-d-ink2'}`}>
                {t('common.all', { defaultValue: 'All' })}
              </Text>
            </Pressable>
            {chips.map(o => {
              const on = chosen.includes(o.value)
              return (
                <Pressable
                  key={o.value}
                  onPress={() => { vibrate(6); setSel(s => toggleScope(fullIds, s, level, o.value)) }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !!on }}
                  accessibilityLabel={o.label}
                  className={`h-8 px-2.5 rounded-pill flex-row items-center gap-1 border ${on ? 'bg-brand-blue border-brand-blue' : 'bg-brand-blue/5 border-hairline dark:border-d-hairline'}`}
                  style={{ maxWidth: '100%' }}
                >
                  {on ? <Check size={11} color="#fff" /> : null}
                  <Text numberOfLines={1} className={`text-[12px] font-hk-semi flex-shrink ${on ? 'text-white' : 'text-ink-2 dark:text-d-ink2'}`}>
                    {o.label}
                  </Text>
                  {level !== 'locations' ? (
                    <Text className={`text-[11px] ${on ? 'text-white/70' : 'text-ink-3 dark:text-d-ink3'}`}>{o.count}</Text>
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        </ScrollView>
      </View>

      {/* What the picks resolve to — named before it is applied. */}
      <View className="rounded-xl px-3.5 py-2.5 mt-3 flex-row items-center gap-2 bg-brand-blue/10 border border-brand-blue/30">
        <MapPin size={14} color="#0355DB" />
        <Body className="flex-1" numberOfLines={1}>{label}</Body>
        <Caption>
          {t('stores.nStoresShort', { count: matched.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
        </Caption>
      </View>

      <View className="mt-2.5">
        <PrimaryButton onPress={apply} disabled={matched.length === 0}>
          {t('common.done', { defaultValue: 'Done' })}
        </PrimaryButton>
      </View>
    </Screen>
  )
}
