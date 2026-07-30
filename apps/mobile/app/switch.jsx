// ============================================================
// LOCATION SELECTOR — tabbed, searchable, multi-select, Apply at the bottom.
//
// The four tabs are ways into rungs of the TATA hierarchy the scope model already has,
// not new concepts:
//   Locations → individual stores      Groups → sub-brands (Tetley, Tata Motors)
//   Zones     → states and cities      Brand  → the whole holding
//
// Rows come from core's selectorRows() and carry the scope key they toggle, so this
// screen and the web one render the same facts and cannot drift. Selection is the
// intersection model: an untouched level means "all of it", so cross-branch picks
// (Mumbai + Mysore) resolve to their union. The Verified pill is real —
// computeLocationFlags() on the listing, not decoration.
// ============================================================
import { useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  MapPin, Folder, Map as MapIcon, Globe, Search, X, Check, CheckCheck,
  ShieldCheck, AlertTriangle,
} from 'lucide-react-native'
import {
  subBrandOf, scopeMatches, toggleScope, scopeLabel, selectorRows,
} from '@connect/core'
import { Screen, Title, Body, Caption, PrimaryButton } from '../components/UI.jsx'
import { useSession, setScope } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

// English for now: the catalogs carry no structural names for these tabs, and a
// near-miss key would read worse than a labelled gap. Translator TODO.
const TABS = [
  { id: 'locations', label: 'Locations', Icon: MapPin },
  { id: 'groups', label: 'Groups', Icon: Folder },
  { id: 'zones', label: 'Zones', Icon: MapIcon },
  { id: 'brand', label: 'Brand', Icon: Globe },
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
  const [tab, setTab] = useState('locations')
  const [query, setQuery] = useState('')

  const rows = selectorRows(fullIds, tab, sel)
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter(r => [r.title, r.subtitle, r.meta].filter(Boolean).join(' ').toLowerCase().includes(q))
    : rows

  const matched = scopeMatches(fullIds, sel)
  const label = scopeLabel(fullIds, sel)
  const isOn = (row) => row.level === 'brand'
    ? !sel.subBrands.length && !sel.states.length && !sel.cities.length && !sel.locations.length
    : (sel[row.level] || []).includes(row.value)

  function toggle(row) {
    vibrate(6)
    if (row.level === 'brand') { setSel({ subBrands: [], states: [], cities: [], locations: [] }); return }
    setSel(s => toggleScope(fullIds, s, row.level, row.value))
  }

  /** Add every row currently listed — the bulk move a long filtered list needs. */
  function selectAllShown() {
    vibrate(8)
    setSel(s => shown.reduce(
      (acc, r) => (r.level === 'brand' || (acc[r.level] || []).includes(r.value) ? acc : toggleScope(fullIds, acc, r.level, r.value)),
      s,
    ))
  }

  function apply() {
    vibrate(10)
    if (sel.locations.length === 1 && matched.length === 1) setScope({ store: matched[0], sel })
    else setScope({ name: label, ids: matched.map(l => l.id), sel })
    router.back()
  }

  return (
    <Screen scroll={false}>
      {/* Tab rail — horizontal pills, the selected one solid brand blue. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0 mb-3">
        <View className="flex-row gap-2">
          {TABS.map(tb => {
            const on = tab === tb.id
            return (
              <Pressable
                key={tb.id}
                onPress={() => { vibrate(6); setTab(tb.id); setQuery('') }}
                accessibilityRole="tab"
                accessibilityState={{ selected: !!on }}
                accessibilityLabel={tb.label}
                className={`h-10 px-3.5 rounded-pill flex-row items-center gap-1.5 border ${on ? 'bg-brand-blue border-brand-blue' : 'bg-card dark:bg-white/5 border-hairline dark:border-d-hairline'}`}
              >
                <tb.Icon size={15} color={on ? '#fff' : '#5F6878'} />
                <Text className={`text-[13px] font-hk-semi ${on ? 'text-white' : 'text-ink-2 dark:text-d-ink2'}`}>{tb.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      {/* Title + the two header actions. */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title className="text-[22px] leading-7">{t('store.switchTitle', { defaultValue: 'Switch location' })}</Title>
          <Caption className="mt-0.5" numberOfLines={1}>
            {label} · {t('stores.nStoresShort', { count: matched.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
          </Caption>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={selectAllShown}
            accessibilityRole="button"
            accessibilityLabel={t('common.all', { defaultValue: 'All' })}
            className="w-11 h-11 rounded-xl bg-brand-blue items-center justify-center"
          >
            <CheckCheck size={18} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            className="w-11 h-11 rounded-xl bg-brand-blue/5 border border-hairline dark:border-d-hairline items-center justify-center"
          >
            <X size={18} color="#5F6878" />
          </Pressable>
        </View>
      </View>

      {/* Search — reads every line the cards show. */}
      <View className="h-11 rounded-xl flex-row items-center gap-2 px-3 mt-3 bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline">
        <Search size={16} color="#93A0C8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('common.search', { defaultValue: 'Search' })}
          placeholderTextColor="#93A0C8"
          accessibilityLabel={t('common.search', { defaultValue: 'Search' })}
          className="flex-1 text-[15px] text-ink dark:text-d-ink"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.close', { defaultValue: 'Close' })}>
            <X size={14} color="#93A0C8" />
          </Pressable>
        ) : null}
      </View>

      {/* The rows. */}
      <ScrollView className="flex-1 mt-3" showsVerticalScrollIndicator={false}>
        {shown.map(row => {
          const on = isOn(row)
          const flagged = row.flags && row.flags.length > 0
          return (
            <Pressable
              key={`${row.level}:${row.value}`}
              onPress={() => toggle(row)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!on }}
              accessibilityLabel={row.title}
              className={`rounded-card p-3.5 mb-2 flex-row items-start gap-3 border ${on ? 'bg-brand-blue/10 border-brand-blue/45' : 'bg-card dark:bg-white/5 border-hairline dark:border-d-hairline'}`}
            >
              <View className={`w-5 h-5 rounded-md items-center justify-center mt-0.5 border ${on ? 'bg-brand-blue border-brand-blue' : 'border-hairline dark:border-d-hairline'}`}>
                {on ? <Check size={13} color="#fff" /> : null}
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <Body className="font-hk-semi text-ink dark:text-d-ink flex-shrink" numberOfLines={1}>{row.title}</Body>
                  {row.level === 'locations' ? (
                    flagged ? (
                      <View className="h-6 px-2 rounded-pill flex-row items-center gap-1 bg-[#CA8A04]/12 border border-[#CA8A04]/30">
                        <AlertTriangle size={11} color="#B45309" />
                        <Text className="text-[11px] font-hk-semi text-[#B45309]">{t('store.needsVerification', { defaultValue: 'Needs verification' })}</Text>
                      </View>
                    ) : (
                      <View className="h-6 px-2 rounded-pill flex-row items-center gap-1 bg-ok/12 border border-ok/30">
                        <ShieldCheck size={11} color="#15803D" />
                        <Text className="text-[11px] font-hk-semi text-[#15803D]">{t('verify.verified', { defaultValue: 'Verified' })}</Text>
                      </View>
                    )
                  ) : (
                    <Caption>
                      {t('stores.nStoresShort', { count: row.count, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
                    </Caption>
                  )}
                </View>
                {row.subtitle ? <Body className="mt-0.5" numberOfLines={1}>{row.subtitle}</Body> : null}
                {row.meta ? <Caption className="mt-0.5" numberOfLines={1}>{row.meta}</Caption> : null}
              </View>
            </Pressable>
          )
        })}

        {shown.length === 0 && (
          <View className="items-center py-8">
            <Body className="font-hk-semi text-ink dark:text-d-ink">{t('leads.emptyTitle', { defaultValue: 'Nothing here' })}</Body>
            <Caption className="mt-0.5">{t('customers.emptySub', { defaultValue: 'Try another filter.' })}</Caption>
          </View>
        )}
        <View className="h-2" />
      </ScrollView>

      {/* Apply. */}
      <View className="py-3">
        <PrimaryButton onPress={apply} disabled={matched.length === 0}>
          {t('common.done', { defaultValue: 'Done' })}
        </PrimaryButton>
      </View>
    </Screen>
  )
}
