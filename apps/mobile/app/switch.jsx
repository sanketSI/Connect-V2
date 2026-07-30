// ============================================================
// SWITCH LOCATION — cascading dropdowns, one per level:
//   Brand → Sub-brand → State → City → Location.
// Each select narrows the ones below; picking a DEEPER level first back-fills its
// ancestors from the record (choose Mumbai with nothing set and State becomes
// Maharashtra, Sub-brand becomes Tata Motors — the vice-versa rule). "All" at any
// level means "stop here": the scope is the deepest chosen node. Draft + Done, so
// several levels can be adjusted without bouncing home after each change. The
// default rule lives at sign-in and is untouched.
// RN has no <select>, so each level is a pill that opens a Modal option list —
// the same dropdown idiom LocationPicker already uses.
// ============================================================
import { useState } from 'react'
import { View, Text, Pressable, Modal, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, MapPin } from 'lucide-react-native'
import { BRAND_NAME, subBrandOf } from '@connect/core'
import { Screen, Title, Body, Caption, PrimaryButton } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession, setScope } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

export default function SwitchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const fullStores = session.stores
  const current = session.store

  const seed = () => {
    if (!current) return { subBrand: '', state: '', city: '', storeId: '' }
    if (!current.aggregate) {
      return { subBrand: subBrandOf(current), state: current.state || '', city: current.city || '', storeId: current.id }
    }
    const byCity = fullStores.find(l => l.city === current.label)
    if (byCity) return { subBrand: subBrandOf(byCity), state: byCity.state, city: current.label, storeId: '' }
    const bySt = fullStores.find(l => l.state === current.label)
    if (bySt) return { subBrand: subBrandOf(bySt), state: current.label, city: '', storeId: '' }
    if (fullStores.some(l => subBrandOf(l) === current.label)) return { subBrand: current.label, state: '', city: '', storeId: '' }
    return { subBrand: '', state: '', city: '', storeId: '' }
  }
  const [draft, setDraft] = useState(seed)
  const [openLevel, setOpenLevel] = useState(null) // which dropdown's option list is up

  const matches = (d) => fullStores.filter(l =>
    (!d.subBrand || subBrandOf(l) === d.subBrand)
    && (!d.state || l.state === d.state)
    && (!d.city || l.city === d.city))
  const distinct = (list, fn) => [...new Set(list.map(fn))]

  const OPTIONS = {
    subBrand: distinct(fullStores, subBrandOf).map(v => ({ value: v, label: v })),
    state: distinct(matches({ subBrand: draft.subBrand }), l => l.state).map(v => ({ value: v, label: v })),
    city: distinct(matches({ subBrand: draft.subBrand, state: draft.state }), l => l.city).map(v => ({ value: v, label: v })),
    store: matches(draft).map(l => ({ value: l.id, label: `${l.name} — ${l.branch}` })),
  }

  function pickLevel(level, value) {
    vibrate(6)
    setOpenLevel(null)
    setDraft(d => {
      if (level === 'subBrand') return { subBrand: value, state: '', city: '', storeId: '' }
      if (level === 'state') {
        if (!value) return { ...d, state: '', city: '', storeId: '' }
        const loc = fullStores.find(l => l.state === value && (!d.subBrand || subBrandOf(l) === d.subBrand))
          || fullStores.find(l => l.state === value)
        return { subBrand: subBrandOf(loc), state: value, city: '', storeId: '' }
      }
      if (level === 'city') {
        if (!value) return { ...d, city: '', storeId: '' }
        const loc = fullStores.find(l => l.city === value && (!d.state || l.state === d.state))
          || fullStores.find(l => l.city === value)
        return { subBrand: subBrandOf(loc), state: loc.state, city: value, storeId: '' }
      }
      if (!value) return { ...d, storeId: '' }
      const loc = fullStores.find(l => l.id === value)
      return { subBrand: subBrandOf(loc), state: loc.state, city: loc.city, storeId: value }
    })
  }

  const resolved = draft.storeId
    ? { store: fullStores.find(l => l.id === draft.storeId) }
    : draft.city
      ? { name: draft.city, ids: matches(draft).map(l => l.id) }
      : draft.state
        ? { name: draft.state, ids: matches(draft).map(l => l.id) }
        : draft.subBrand
          ? { name: draft.subBrand, ids: matches(draft).map(l => l.id) }
          : { name: BRAND_NAME, ids: fullStores.map(l => l.id) }

  const summary = resolved.store
    ? `${resolved.store.name} — ${resolved.store.branch}`
    : `${resolved.name} · ${t('stores.nStoresShort', { count: resolved.ids.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}`

  const valueLabel = (level) => {
    if (level === 'store') return OPTIONS.store.find(o => o.value === draft.storeId)?.label
    return draft[level]
  }

  const LevelSelect = ({ level, label }) => {
    const val = valueLabel(level)
    return (
      <View className="flex-1 min-w-0">
        <Caption className="mb-1 ml-1">{label}</Caption>
        <Pressable
          onPress={() => { vibrate(6); setOpenLevel(level) }}
          accessibilityRole="button"
          accessibilityLabel={label}
          className={`h-11 rounded-xl px-3 flex-row items-center gap-1.5 bg-brand-blue/5 border ${val ? 'border-brand-blue/45' : 'border-hairline dark:border-d-hairline'}`}
        >
          <Text className="flex-1 text-[15px] text-ink dark:text-d-ink" numberOfLines={1}>
            {val || t('common.all', { defaultValue: 'All' })}
          </Text>
          <ChevronDown size={13} color="#5F6878" />
        </Pressable>
      </View>
    )
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

      {/* Brand is the fixed root — shown, not chooseable, because there is one. */}
      <Caption className="mb-1 ml-1">{BRAND_NAME}</Caption>

      {/* Structural level names, English for now — translator TODO alongside
          common.refreshing; wrong-meaning key reuse would be worse than untranslated. */}
      <View className="flex-row gap-2 mb-3">
        <LevelSelect level="subBrand" label="Sub-brand" />
        <LevelSelect level="state" label="State" />
      </View>
      <View className="flex-row gap-2 mb-3">
        <LevelSelect level="city" label="City" />
        <LevelSelect level="store" label="Location" />
      </View>

      <View className="rounded-xl px-3.5 py-3 mb-4 flex-row items-center gap-2 bg-brand-blue/10 border border-brand-blue/30">
        <MapPin size={14} color="#0355DB" />
        <Body className="flex-1" numberOfLines={1}>{summary}</Body>
      </View>

      <PrimaryButton onPress={() => { vibrate(10); setScope(resolved); router.back() }}>
        {t('common.done', { defaultValue: 'Done' })}
      </PrimaryButton>

      {/* The option list for whichever level is open — the LocationPicker idiom. */}
      <Modal visible={!!openLevel} transparent animationType="slide" onRequestClose={() => setOpenLevel(null)}>
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-black/40" onPress={() => setOpenLevel(null)} accessibilityRole="button" accessibilityLabel={t('common.close', { defaultValue: 'Close' })} />
          <View className="rounded-t-[28px] bg-card dark:bg-d-screen border-t border-hairline dark:border-d-hairline p-4 pb-8" style={{ maxHeight: 480 }}>
            <View className="items-center pb-2"><View className="w-9 h-1 rounded-pill bg-hairline dark:bg-d-hairline" /></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[{ value: '', label: t('common.all', { defaultValue: 'All' }) }, ...(OPTIONS[openLevel] || [])].map(o => {
                // COERCED to a real boolean. When a pick closes the sheet, these rows
                // re-render once with openLevel === null before the Modal unmounts, and
                // `null && …` is null — which iOS Fabric rejects for a boolean prop
                // ("expected dynamic type 'boolean', but had type 'null'"). Android
                // shrugged; the phone that crashed was the honest one.
                const on = !!openLevel && (openLevel === 'store' ? draft.storeId : draft[openLevel]) === o.value
                return (
                  <Pressable
                    key={o.value || '__all'}
                    onPress={() => pickLevel(openLevel, o.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`flex-row items-center gap-3 px-3 h-12 rounded-xl mb-2 border ${on ? 'bg-brand-blue/10 border-brand-blue/40' : 'bg-brand-blue/5 border-hairline dark:border-d-hairline'}`}
                  >
                    <Body className="flex-1" numberOfLines={1}>{o.label}</Body>
                    {on && <Check size={15} color="#0070FC" />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
