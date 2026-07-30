// ============================================================
// THE UI KIT — Phase 2.
//
// Written in NativeWind classes, not because they are shorter but because apps/web is
// 1,458 className strings and every primitive that answers to the SAME class name is a
// screen that can be ported instead of redesigned.
//
// The geometry is lifted from apps/web/src/components/UI.jsx rather than reinvented:
// cards are rounded-2xl (16px) with a 1px hairline and the soft blue-cast shadow, the
// primary button is a 48px pill-ish rounded-xl in #0070FC, ghost buttons are the same
// height on a 5%-blue wash. Where the web uses `glass` (a backdrop blur over a tinted
// surface), native uses the flat card colour: RN has no cheap backdrop-filter, and a
// fake blur that costs frames on a mid-range Android is a bad trade for a dealer's phone.
//
// Card keeps the one rule the web kit learned the hard way: a card with an onPress is a
// CONTROL — real Pressable, real press state, real accessible name. A card that looks
// tappable and is not is worse than no card, which is exactly what the Phase 1 tabs got
// wrong.
// ============================================================
import { useCallback, useState } from 'react'
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronRight } from 'lucide-react-native'
import { vibrate } from '../lib/haptics.js'

/** Screen body: safe-area at the top, tab-bar clearance at the bottom. `onRefresh`
    arms the native pull-to-refresh — the platform gesture the web's hand-written
    ScreenScroll had to build itself. */
export function Screen({ children, scroll = true, onRefresh, className = '' }) {
  const insets = useSafeAreaInsets()
  const pad = { paddingTop: insets.top + 8, paddingBottom: 28 }
  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await onRefresh?.() } finally { setRefreshing(false) }
  }, [onRefresh])

  if (!scroll) {
    return (
      <View className={`flex-1 bg-screen dark:bg-d-screen px-4 ${className}`} style={pad}>
        {children}
      </View>
    )
  }
  return (
    <ScrollView
      className={`flex-1 bg-screen dark:bg-d-screen ${className}`}
      contentContainerStyle={{ ...pad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh
        ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0070FC" colors={['#0070FC']} />
        : undefined}
    >
      {children}
    </ScrollView>
  )
}

/** The soft blue-cast card shadow the web app uses (--shadow-card), in RN terms. */
export const CARD_SHADOW = {
  shadowColor: '#0070FC',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
}

/**
 * `style` composes ON TOP of CARD_SHADOW rather than replacing it, so a caller can tint
 * the border (the missed-call hero's red, its all-clear green) without losing the shadow
 * every other card has. The web Card has taken a `style` prop all along; native silently
 * dropping it meant a hero border that was written, reviewed and simply never drawn.
 */
export function Card({ children, onPress, label, className = '', style }) {
  const base = `rounded-card border border-hairline dark:border-d-hairline bg-card dark:bg-white/5 p-4 ${className}`

  if (!onPress) return <View className={base} style={[CARD_SHADOW, style]}>{children}</View>

  return (
    <Pressable
      onPress={() => { vibrate(10); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [CARD_SHADOW, style, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
      className={base}
    >
      {children}
    </Pressable>
  )
}

export function Title({ children, className = '' }) {
  return <Text className={`text-[30px] leading-9 font-hk-bold text-ink dark:text-d-ink ${className}`}>{children}</Text>
}

export function Headline({ children, className = '', numberOfLines }) {
  return (
    <Text numberOfLines={numberOfLines} className={`text-base font-hk-semi text-ink dark:text-d-ink ${className}`}>
      {children}
    </Text>
  )
}

export function Body({ children, className = '', numberOfLines }) {
  return (
    <Text numberOfLines={numberOfLines} className={`text-[15px] leading-5 text-ink-2 dark:text-d-ink2 ${className}`}>
      {children}
    </Text>
  )
}

export function Caption({ children, className = '', numberOfLines }) {
  return (
    <Text numberOfLines={numberOfLines} className={`text-xs text-ink-3 dark:text-d-ink3 ${className}`}>
      {children}
    </Text>
  )
}

/** Section label above a group — the web's `m-subhead text-white/55` slot. */
export function SectionLabel({ children, icon: Icon }) {
  return (
    <View className="flex-row items-center gap-1.5 mt-5 mb-2">
      {Icon ? <Icon size={13} color="#0355DB" /> : null}
      <Text className="text-[13px] font-hk-medium text-ink-3 dark:text-d-ink3">{children}</Text>
    </View>
  )
}

/** One number over one word. `tone` picks the semantic colour, as on web. */
export function Stat({ value, label, tone = 'ink' }) {
  const tones = {
    ink: 'text-ink dark:text-d-ink',
    primary: 'text-primaryText dark:text-d-primaryText',
    ok: 'text-ok dark:text-d-ok',
    bad: 'text-bad dark:text-d-bad',
  }
  return (
    <View className="flex-1 min-w-0">
      <Text numberOfLines={1} className={`text-2xl font-hk-bold ${tones[tone] || tones.ink}`}>{value}</Text>
      <Text numberOfLines={1} className="text-xs text-ink-3 dark:text-d-ink3 mt-0.5">{label}</Text>
    </View>
  )
}

/**
 * `icon` mirrors the web PrimaryButton's own prop — it already renders a leading glyph and
 * the flex-row/gap-2 here was clearly put in for one, but there was no way to pass it, so
 * every native call site quietly lost the icon the web button shows.
 */
export function PrimaryButton({ children, onPress, disabled, loading, className = '', icon: Icon }) {
  const dead = disabled || loading
  return (
    <Pressable
      onPress={() => { if (dead) return; vibrate(12); onPress?.() }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!dead }}
      className={`h-12 rounded-xl items-center justify-center flex-row gap-2 ${dead ? 'bg-brand-blue/40' : 'bg-brand-blue'} ${className}`}
      style={dead ? undefined : { shadowColor: '#0070FC', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}
    >
      {loading
        ? <ActivityIndicator color="#fff" />
        : (
          <>
            {Icon ? <Icon size={18} color="#fff" /> : null}
            <Text className="text-base font-hk-semi text-white">{children}</Text>
          </>
        )}
    </Pressable>
  )
}

export function GhostButton({ children, onPress, className = '' }) {
  return (
    <Pressable
      onPress={() => { vibrate(10); onPress?.() }}
      accessibilityRole="button"
      className={`h-12 rounded-xl items-center justify-center bg-brand-blue/10 ${className}`}
    >
      <Text className="text-base font-hk-semi text-primaryText dark:text-d-primaryText">{children}</Text>
    </Pressable>
  )
}

export function Chip({ children, active, onPress, icon: Icon }) {
  return (
    <Pressable
      onPress={() => { vibrate(8); onPress?.() }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      className={`h-9 px-3.5 rounded-pill flex-row items-center justify-center gap-1.5 border ${
        active
          ? 'bg-brand-blue border-brand-blue'
          : 'bg-transparent border-hairline dark:border-d-hairline'
      }`}
    >
      {Icon ? <Icon size={13} color={active ? '#fff' : '#5F6878'} /> : null}
      <Text className={`text-[13px] font-hk-medium ${active ? 'text-white' : 'text-ink-2 dark:text-d-ink2'}`}>
        {children}
      </Text>
    </Pressable>
  )
}

/**
 * A list row that opens something. The chevron is the disclosure indicator and rides the
 * right edge, vertically centred — the same fix the web roll-up card needed.
 */
export function Row({ title, sub, right, onPress, label }) {
  const body = (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 min-w-0">
        <Headline numberOfLines={1}>{title}</Headline>
        {sub ? <Caption numberOfLines={1} className="mt-0.5">{sub}</Caption> : null}
      </View>
      {right}
      {onPress ? <ChevronRight size={18} color="#93A0C8" /> : null}
    </View>
  )
  return (
    <Card onPress={onPress} label={label || title} className="mb-2.5">
      {body}
    </Card>
  )
}
