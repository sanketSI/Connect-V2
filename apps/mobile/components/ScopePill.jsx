// ============================================================
// THE GLOBAL LOCATION SWITCHER — one control, the same on every screen.
//
// Native twin of apps/web/src/components/ScopePill.jsx; the full reasoning lives there.
// In short (PM feedback 6): Home carried this pill, which opens the TATA Location
// Selector and sets the SESSION SCOPE, while Leads and Reviews each carried their own
// LocationPicker dropdown filtering that one list out of local useState. Picking a
// location on Leads left Home, the tab badges and Reviews on the old scope. This is the
// survivor because it is the one wired to setSessionAssignments — a screen-local filter
// is not "global" however it is styled.
// ============================================================
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RefreshCcw } from 'lucide-react-native'
import { networkRollup } from '@connect/core'
import { useSession } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

export default function ScopePill({ className = '' }) {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const store = session.store
  const aggregate = !!store?.aggregate

  return (
    <Pressable
      onPress={() => { vibrate(8); router.push('/switch') }}
      accessibilityRole="button"
      accessibilityLabel={t('store.switchTitle', { defaultValue: 'Switch location' })}
      // shrink-0: this sits in a wrapping chip row beside the period chip, and without
      // it flex squeezed the pill until the store label wrapped mid-word.
      className={`flex-row items-center gap-1.5 self-start shrink-0 h-9 px-3 rounded-pill bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline ${className}`}
    >
      <Text className="text-[13px] font-hk-medium text-ink-2 dark:text-d-ink2" numberOfLines={1}>
        {aggregate
          ? `${store?.label || t('stores.allLocations', { defaultValue: 'All locations' })} · ${t('stores.nStoresShort', { count: networkRollup().stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}`
          : `${store?.name} · ${store?.branch}`}
      </Text>
      <RefreshCcw size={12} color="#5F6878" />
      <Text className="text-[13px] font-hk-medium text-ink-3 dark:text-d-ink3">
        {t('common.switch', { defaultValue: 'Switch' })}
      </Text>
    </Pressable>
  )
}
