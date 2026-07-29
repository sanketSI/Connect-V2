// THEME — the native counterpart of the web's useTheme()/ThemeSwitcher pair.
//
// One mechanism, chosen because it moves EVERYTHING at once: RN's
// Appearance.setColorScheme() overrides the app-wide scheme, which drives both
// react-native's useColorScheme (the tab bar, tokens.themeFor) and NativeWind's dark:
// variants (darkMode 'media' reads the same signal). A NativeWind-only override would
// have split the app into two themes.
//
// Persisted through the core storage facade — same seam as everything else — and
// applied in the boot gate before first render, so a dark-mode dealer never sees a
// light flash.
import { Appearance } from 'react-native'
import { storage } from '@connect/core/storage.js'

const KEY = 'si-theme'

/** 'light' | 'dark' | null (system). */
export function savedTheme() {
  const v = storage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : null
}

export function setTheme(theme) {
  storage.setItem(KEY, theme)
  Appearance.setColorScheme(theme)
}

/** Boot: re-apply the saved override, if any. Called after preloadStorage(). */
export function applySavedTheme() {
  const v = savedTheme()
  if (v) Appearance.setColorScheme(v)
}
