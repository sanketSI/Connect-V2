// ============================================================
// DESIGN TOKENS — the SI palette, lifted verbatim from apps/web/src/index.css.
//
// These are the SAME hex values the web app ships, both themes, so a screen ported
// to native cannot quietly drift a shade away from the one in the browser. The web
// file remains the source of truth: it carries the measured contrast ratios in its
// comments (--si-primary-text 6.19, --si-error-text 4.74, ink-min 4.88 …) and those
// floors only hold if these stay in step with it.
//
// NativeWind is the Phase 2 item (see EXPO-MIGRATION.md §3). Until it lands, screens
// consume these through plain StyleSheet objects — same values, different plumbing.
// ============================================================

/** Brand constants — identical in both themes. */
export const BRAND = {
  indigo: '#0E0071',   // deep brand
  blue: '#0070FC',     // primary action
  white: '#FFFFFF',
}

const light = {
  scheme: 'light',
  screen: '#F4FBFF',
  card: '#FFFFFF',
  subtle: 'rgba(0,112,252,.05)',
  subtleStrong: 'rgba(0,112,252,.10)',
  border: '#DEE7F2',
  borderStrong: '#C7D5E8',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textTertiary: '#5F6878',
  primaryText: '#0355DB',
  successText: '#13764E',
  errorText: '#DC2626',
  onBrand: '#FFFFFF',
}

const dark = {
  scheme: 'dark',
  screen: '#0A0E24',
  card: 'rgba(255,255,255,.05)',
  subtle: 'rgba(255,255,255,.04)',
  subtleStrong: 'rgba(255,255,255,.08)',
  border: 'rgba(255,255,255,.08)',
  borderStrong: 'rgba(255,255,255,.14)',
  textPrimary: '#F4F6FF',
  textSecondary: '#CBD5F0',
  textTertiary: '#93A0C8',
  primaryText: '#5CA4FF',
  successText: '#22D38B',
  errorText: '#F87171',
  onBrand: '#FFFFFF',
}

export const THEMES = { light, dark }

/** Resolve a token set from RN's useColorScheme() value (null → light). */
export function themeFor(scheme) {
  return scheme === 'dark' ? dark : light
}

/**
 * Type ramp, mapped from the web's m-* classes. The web sets these in rem against a
 * 16px root; RN sizes are density-independent points, so the numbers carry over 1:1.
 */
export const TYPE = {
  largeTitle: { fontSize: 30, fontWeight: '700', lineHeight: 36 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  headline: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  subhead: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  footnote: { fontSize: 11, fontWeight: '400', lineHeight: 15 },
  stat: { fontSize: 24, fontWeight: '700', lineHeight: 28 },
}

/** The 44pt floor Apple's HIG and WCAG 2.5.5 both ask for. */
export const TAP_TARGET = 44
