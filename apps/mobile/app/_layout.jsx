// ============================================================
// THE BOOT GATE — the native counterpart of apps/web/src/main.jsx.
//
// The ORDER below is the whole design (see packages/core/data/hydrate.js), and it is
// the same order the web boots in, for the same reasons:
//
//   0. Platform seams FIRST, synchronously, at module scope — configureEnv() with
//      EXPO_PUBLIC_* values and configureStorage() with the AsyncStorage-backed
//      driver, BEFORE any dynamic import below can pull in a core data module.
//      customers.js reads storage at module scope, so the driver must already exist.
//      env.js / storage.js are leaves: importing them loads no data code.
//   1. preloadStorage() — native-only, and the reason this gate is async at all.
//      AsyncStorage is a promise API and core reads synchronously; the cache must be
//      warm before step 3 imports anything that reads it (sharp edge #3).
//   2. i18n — must init before the tree renders, exactly as on web.
//   3. hydrate() — with Supabase env present, replaces the seed arrays' contents with
//      backend rows; without it, returns immediately in seed mode.
//   4. ONLY THEN render the routes. expo-router lazy-loads each route file, and screens
//      read data at module scope (`const MISSED_CALLS = getMissedCalls()`), so the
//      routes must not mount until hydration has resolved. This is the same constraint
//      that keeps `import App` dynamic on web — do not "simplify" it to an eager tree.
// ============================================================
import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { configureEnv } from '@connect/core/env.js'
import { configureStorage } from '@connect/core/storage.js'
import { configureAnalytics } from '@connect/core/analytics.js'
import { nativeStorageDriver, preloadStorage } from '../lib/storage.js'
import { initI18n } from '../lib/i18n.js'
import { themeFor, TYPE, BRAND } from '../lib/tokens.js'

// ---- Act 0: the seams, synchronously, before anything below can load core data ----
// EXPO_PUBLIC_* is Expo's public-env convention, the direct analogue of Vite's VITE_*.
// Same posture as web (EXPO-MIGRATION.md sharp edge #7): these values reach the client
// either way, so nothing secret belongs here.
configureEnv({
  geminiKeys: process.env.EXPO_PUBLIC_GEMINI_API_KEYS,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
})

configureStorage(nativeStorageDriver)

configureAnalytics({
  endpoint: process.env.EXPO_PUBLIC_ANALYTICS_URL,
  debug: __DEV__,
  context: { app_version: process.env.EXPO_PUBLIC_APP_VERSION || 'native-dev' },
})

export default function RootLayout() {
  const scheme = useColorScheme()
  const theme = themeFor(scheme)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      // Act 1 — warm the sync cache core reads through.
      const restored = await preloadStorage()

      // Act 2 — strings before the first frame.
      await initI18n()

      // Act 3 — hydrate. Imported by SUBPATH, not through the barrel: loading it must
      // not resolve the data modules, or they would read seed records before the splice.
      const { hydrate } = await import('@connect/core/data/hydrate.js')
      const source = await hydrate() // 'seed' | 'supabase'

      // The Phase 1 gate in EXPO-MIGRATION.md asks for exactly this line.
      console.log(`[data] source: ${source} · storage keys restored: ${restored}`)

      if (!cancelled) setReady(true)
    }

    boot().catch((err) => {
      console.error('[boot] failed to start the app:', err)
      if (!cancelled) setError(err)
    })

    return () => { cancelled = true }
  }, [])

  if (error) return <BootFailure error={error} theme={theme} />
  if (!ready) return <BootSplash theme={theme} />

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.screen } }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/** The brand ring, matching the web splash: indigo track, electric blue arc. */
function BootSplash({ theme }) {
  return (
    <View style={[styles.center, { backgroundColor: theme.screen }]}>
      <ActivityIndicator size="large" color={BRAND.blue} />
    </View>
  )
}

/**
 * Boot failure — English, no i18n, no tokens beyond the hard-coded brand fallbacks.
 * Whatever broke above may have taken the catalogs with it, so this screen assumes
 * nothing. Same posture as renderBootFailure() on web: never leave a spinner turning
 * with nothing to read and nothing to tap.
 */
function BootFailure({ error, theme }) {
  return (
    <View style={[styles.center, { backgroundColor: theme.screen, padding: 24 }]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[TYPE.headline, { color: theme.textPrimary, textAlign: 'center' }]}>
          Connect could not start
        </Text>
        <Text style={[TYPE.subhead, { color: theme.textTertiary, textAlign: 'center', marginTop: 6 }]}>
          Something went wrong while loading the app. Close it and open it again.
        </Text>
        {__DEV__ && (
          <Text style={[TYPE.footnote, { color: theme.errorText, marginTop: 12 }]} selectable>
            {String(error?.stack || error?.message || error)}
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 320, borderRadius: 20, borderWidth: 1, padding: 20 },
})
