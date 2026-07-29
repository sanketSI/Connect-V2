// The native counterpart of apps/web/src/lib/utils.js `vibrate()`.
//
// On web that is navigator.vibrate(ms) — a duration, and a no-op on iOS, which has never
// supported it. Native has the real thing, so the duration becomes an INTENSITY: taps get
// the light impact, commits (send, call, submit) the medium one. This is the payoff the
// migration plan lists for going native at all — feedback the browser could not give.
import * as Haptics from 'expo-haptics'

/**
 * @param {number} ms - kept as the web signature so ported screens need no edit.
 *                      ≤10 → light, ≤15 → medium, above → heavy.
 */
export function vibrate(ms = 10) {
  const style = ms <= 10
    ? Haptics.ImpactFeedbackStyle.Light
    : ms <= 15
      ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Heavy
  // Never let feedback break an interaction: an unsupported device simply feels nothing.
  Haptics.impactAsync(style).catch(() => {})
}

export function notifySuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}
