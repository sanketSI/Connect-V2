// ============================================================
// WHICH BRANCH AM I LOOKING AT — ported from apps/web/src/components/LocationPicker.jsx.
// A dropdown, not a chip row: a dealer with twenty outlets cannot use a row they have
// to scroll sideways through. EVERY branch is listed with its count — "HSR Layout 0"
// is an answer; a branch silently missing from the list is a question. Counts come
// from the list BEFORE this filter is applied, or selecting a branch would zero every
// other row and the picker could not be used to switch.
// ============================================================
import { useState } from 'react'
import { View, Text, Pressable, ScrollView, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MapPin, ChevronDown, Check } from 'lucide-react-native'
import { assignedStores } from '@connect/core'
import { Body, Caption } from './UI.jsx'
import { vibrate } from '../lib/haptics.js'

export default function LocationPicker({ value = 'all', onChange, groups = [], total = 0 }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const countFor = (id) => groups.find(g => g.storeId === id)?.count ?? 0
  const locations = assignedStores()
  const scoped = value !== 'all'
  const current = value === 'all'
    ? t('stores.allLocations', { defaultValue: 'All locations' })
    : (locations.find(l => l.id === value)?.branch || value)

  function pick(next) {
    vibrate(6)
    onChange?.(next)
    setOpen(false)
  }

  const Row = ({ id, label, count }) => {
    const on = value === id
    return (
      <Pressable
        onPress={() => pick(id)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        className={`flex-row items-center gap-3 px-3 h-12 rounded-xl mb-2 border ${on ? 'bg-brand-blue/10 border-brand-blue/40' : 'bg-brand-blue/5 border-hairline dark:border-d-hairline'}`}
      >
        <MapPin size={14} color={on ? '#0070FC' : '#93A0C8'} />
        <Body className="flex-1" numberOfLines={1}>{label}</Body>
        <Caption>{count}</Caption>
        {on && <Check size={15} color="#0070FC" />}
      </Pressable>
    )
  }

  return (
    <>
      <Pressable
        onPress={() => { vibrate(6); setOpen(true) }}
        accessibilityRole="button"
        accessibilityLabel={t('stores.pickBranch', { defaultValue: 'Which branch?' })}
        className={`h-9 px-3 rounded-pill flex-row items-center gap-1.5 border self-start ${scoped ? 'bg-brand-blue/10 border-brand-blue/40' : 'bg-card dark:bg-white/5 border-hairline dark:border-d-hairline'}`}
      >
        <MapPin size={13} color={scoped ? '#0355DB' : '#5F6878'} />
        <Text className={`text-[13px] font-hk-medium ${scoped ? 'text-primaryText dark:text-d-primaryText' : 'text-ink-2 dark:text-d-ink2'}`} numberOfLines={1}>
          {current}
        </Text>
        <ChevronDown size={13} color={scoped ? '#0355DB' : '#5F6878'} style={{ opacity: 0.7 }} />
      </Pressable>

      {/* Modal, not an absolute overlay: this trigger lives inside a header row, and an
          absolutely-positioned child can never escape that parent to cover the screen. */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-black/40" onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.close', { defaultValue: 'Close' })} />
          <View className="rounded-t-[28px] bg-card dark:bg-d-screen border-t border-hairline dark:border-d-hairline p-4 pb-8" style={{ maxHeight: 520 }}>
            <View className="items-center pb-2"><View className="w-9 h-1 rounded-pill bg-hairline dark:bg-d-hairline" /></View>
            <Text className="text-[22px] leading-7 font-hk-bold text-ink dark:text-d-ink">
              {t('stores.pickBranch', { defaultValue: 'Which branch?' })}
            </Text>
            <Caption className="mt-0.5 mb-3">
              {t('stores.nStoresShort', { count: locations.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
            </Caption>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Row id="all" label={t('stores.allLocations', { defaultValue: 'All locations' })} count={total} />
              {locations.map(loc => (
                <Row key={loc.id} id={loc.id} label={loc.branch} count={countFor(loc.id)} />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  )
}
