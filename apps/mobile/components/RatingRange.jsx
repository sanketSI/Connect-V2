// ============================================================
// RATING RANGE — the web FilterSheet's dual-thumb slider, natively. Two draggable
// thumbs on a track, snapping to whole stars 1–5; the painted span between them is the
// selected range. PanResponder rather than a dependency: a single-thumb community
// slider cannot express a RANGE, and this is forty lines.
//
// Accessibility: each thumb is adjustable — a screen reader can increment/decrement it
// without the drag (WCAG 2.5.1's single-pointer alternative).
// ============================================================
import { useRef, useState } from 'react'
import { View, Text, PanResponder } from 'react-native'
import { vibrate } from '../lib/haptics.js'

const MIN = 1
const MAX = 5
const THUMB = 24

export default function RatingRange({ value = { min: 1, max: 5 }, onChange }) {
  const [width, setWidth] = useState(0)
  // Refs mirror the props so the PanResponders (created once) always see live values.
  const live = useRef(value); live.current = value
  const widthRef = useRef(0)

  const usable = () => Math.max(1, widthRef.current - THUMB)
  const xFor = (star) => ((star - MIN) / (MAX - MIN)) * usable()
  const starFor = (x) => Math.min(MAX, Math.max(MIN, Math.round((x / usable()) * (MAX - MIN)) + MIN))

  const makeResponder = (which) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => vibrate(6),
    onPanResponderMove: (_e, g) => {
      const { min, max } = live.current
      const startX = xFor(which === 'min' ? min : max)
      const star = starFor(startX + g.dx)
      if (which === 'min' && star !== min && star <= max) onChange({ min: star, max })
      if (which === 'max' && star !== max && star >= min) onChange({ min, max: star })
    },
  })
  const minPan = useRef(makeResponder('min')).current
  const maxPan = useRef(makeResponder('max')).current

  const step = (which, delta) => {
    const { min, max } = live.current
    if (which === 'min') {
      const next = Math.min(max, Math.max(MIN, min + delta))
      if (next !== min) { vibrate(6); onChange({ min: next, max }) }
    } else {
      const next = Math.max(min, Math.min(MAX, max + delta))
      if (next !== max) { vibrate(6); onChange({ min, max: next }) }
    }
  }

  const Thumb = ({ which, star, pan }) => (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${which === 'min' ? 'Minimum' : 'Maximum'} rating`}
      accessibilityValue={{ min: MIN, max: MAX, now: star }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(which, e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      className="absolute -top-[9px] w-6 h-6 rounded-full bg-card dark:bg-d-ink border-2 border-brand-blue items-center justify-center"
      style={{ left: xFor(star), elevation: 3, shadowColor: '#0070FC', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
    >
      <Text className="text-[10px] font-hk-bold text-primaryText">{star}</Text>
    </View>
  )

  return (
    <View className="pt-2 pb-1">
      <View
        className="h-1.5 rounded-pill bg-brand-blue/10"
        onLayout={e => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width) }}
      >
        {width > 0 && (
          <View
            className="absolute top-0 bottom-0 rounded-pill bg-brand-blue"
            style={{ left: xFor(value.min) + THUMB / 2, width: Math.max(0, xFor(value.max) - xFor(value.min)) }}
          />
        )}
        {width > 0 && <Thumb which="min" star={value.min} pan={minPan} />}
        {width > 0 && <Thumb which="max" star={value.max} pan={maxPan} />}
      </View>
      <View className="flex-row justify-between mt-3">
        <Text className="text-xs text-ink-3 dark:text-d-ink3">{value.min}★</Text>
        <Text className="text-xs text-ink-3 dark:text-d-ink3">{value.max}★</Text>
      </View>
    </View>
  )
}
