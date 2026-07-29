// ============================================================
// THE TAB BAR — the native counterpart of apps/web/src/components/BottomTabBar.jsx,
// and it keeps that file's rules rather than inventing native ones.
//
//   • PROFILE IS NOT A TAB, on either platform. It lives behind the avatar in the top
//     right — the "who am I / settings / my listing" corner, not one of the jobs the
//     bar is for. That is what frees the fourth slot for the roll-up.
//   • "Your locations" appears on TWO conditions, not one: the manager must hold more
//     than one store AND have "All locations" selected. A roll-up over a single branch
//     is a leaderboard with one row — Home with extra steps.
//   • Labels come from the shared catalogs (nav.home, nav.leads, …), so the native bar
//     reads in all 13 languages from day one without a single new string.
//
// What native gets for free that the web hand-rolled: the safe-area inset under the
// home indicator (react-native-safe-area-context, via the Tabs bar itself) and a real
// platform tab bar with its own press states.
// ============================================================
import { Tabs, Redirect } from 'expo-router'
import { useColorScheme } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Home, Users, Star, Building2 } from 'lucide-react-native'
import { isMultiLocation } from '@connect/core'
import { themeFor, BRAND } from '../../lib/tokens.js'
import { useSession } from '../../lib/session.js'

export default function TabsLayout() {
  const { t } = useTranslation()
  const theme = themeFor(useColorScheme())
  const session = useSession()

  // THE GUARD. Without it the tabs are reachable by URL/deep link with no session, and
  // every scoped selector would fall back to the whole fixture — a manager would be
  // looking at other branches' calls. Redirect, not a blank state: there is exactly one
  // thing to do without a session, and that is sign in.
  if (!session.authed) return <Redirect href="/" />

  // Per render, not per module load: the assignment belongs to whoever signed in, so a
  // module-level snapshot would freeze the first session's shape for the life of the tab.
  const showRollup = isMultiLocation()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND.blue,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home', { defaultValue: 'Home' }),
          tabBarIcon: ({ color, focused }) => <Home size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          title: t('nav.leads', { defaultValue: 'Leads' }),
          tabBarIcon: ({ color, focused }) => <Users size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          title: t('nav.reviews', { defaultValue: 'Reviews' }),
          tabBarIcon: ({ color, focused }) => <Star size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: t('nav.network', { defaultValue: 'Your locations' }),
          tabBarIcon: ({ color, focused }) => <Building2 size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />,
          // href:null removes the tab entirely rather than disabling it — the web bar
          // filters the entry out for the same reason: a dead tab advertising a screen
          // this manager has no use for is worse than no tab.
          href: showRollup ? undefined : null,
        }}
      />
    </Tabs>
  )
}
