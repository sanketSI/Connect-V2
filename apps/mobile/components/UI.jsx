// ============================================================
// THE UI KIT, PHASE 1 SUBSET.
//
// Card / Stat / Screen / SectionLabel — the four primitives every screen below needs.
// The full kit (AICard, Chip, pills, Stars, Avatar, Skeleton, AIShimmer, TopBar, Toast,
// the gorhom BottomSheet wrapper) is Phase 2 in EXPO-MIGRATION.md; this is deliberately
// the smallest set that lets Phase 1's screens be real rather than mock-ups.
//
// Card mirrors one hard-won decision from the web kit: a card with an onPress is a
// CONTROL, so it gets a real Pressable with a native press state and an accessible
// label — not a tappable View. On web that fix was "a clickable card is a control"
// (commit eb97e24); the same reasoning applies here, and RN makes it cheaper.
// ============================================================
import { View, Text, Pressable, StyleSheet, ScrollView, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { themeFor, TYPE, TAP_TARGET } from '../lib/tokens.js'

/** A screen body: safe-area aware at the top, tab-bar aware at the bottom. */
export function Screen({ children, scroll = true }) {
  const theme = themeFor(useColorScheme())
  const insets = useSafeAreaInsets()
  const pad = { paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 24 }

  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: theme.screen }, pad]}>{children}</View>
  }
  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: theme.screen }]}
      contentContainerStyle={pad}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  )
}

export function Card({ children, onPress, label, style }) {
  const theme = themeFor(useColorScheme())
  const base = [styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]

  if (!onPress) return <View style={base}>{children}</View>

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  )
}

/** One number over one word — the unit the roll-up cards are built from. */
export function Stat({ value, label, tint }) {
  const theme = themeFor(useColorScheme())
  return (
    <View style={styles.stat}>
      <Text style={[TYPE.stat, { color: tint || theme.textPrimary }]} numberOfLines={1}>{value}</Text>
      <Text style={[TYPE.caption, { color: theme.textTertiary }]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

export function SectionLabel({ children }) {
  const theme = themeFor(useColorScheme())
  return (
    <Text style={[TYPE.subhead, { color: theme.textTertiary, marginBottom: 8, marginTop: 20 }]}>
      {children}
    </Text>
  )
}

export function Row({ title, sub, right, onPress }) {
  const theme = themeFor(useColorScheme())
  const body = (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={[TYPE.headline, { color: theme.textPrimary }]} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={[TYPE.caption, { color: theme.textTertiary, marginTop: 2 }]} numberOfLines={1}>{sub}</Text>}
      </View>
      {right}
    </View>
  )
  return onPress ? <Card onPress={onPress} label={title} style={styles.rowCard}>{body}</Card>
    : <Card style={styles.rowCard}>{body}</Card>
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  rowCard: { marginBottom: 10 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  stat: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP_TARGET - 16 },
})
