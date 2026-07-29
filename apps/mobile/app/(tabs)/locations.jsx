// YOUR LOCATIONS (Phase 1) — the per-store roll-up, from core's networkRollup().perStore.
// Reached only when the manager holds more than one store (see the tab layout). The
// drill-down (state → city → store → calls → customer) is Phase 3/4.
import { View, Text, useColorScheme } from 'react-native'
import { useTranslation } from 'react-i18next'
import { networkRollup } from '@connect/core'
import { Screen, Card, Stat, SectionLabel, Row } from '../../components/UI.jsx'
import { themeFor, TYPE } from '../../lib/tokens.js'

export default function LocationsTab() {
  const { t } = useTranslation()
  const theme = themeFor(useColorScheme())
  const net = networkRollup()

  // Worst recovery first: this screen exists to find the branch that is losing calls,
  // and alphabetical order buries it. Same ranking the web roll-up uses.
  const stores = [...net.perStore].sort((a, b) => a.recovery - b.recovery)

  return (
    <Screen>
      <Text style={[TYPE.largeTitle, { color: theme.textPrimary }]}>
        {t('nav.network', { defaultValue: 'Your locations' })}
      </Text>

      <View style={{ marginTop: 16 }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat value={net.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} tint={theme.primaryText} />
            <Stat value={net.missed} label={t('calls.statMissed', { defaultValue: 'Missed' })} tint={theme.errorText} />
            <Stat value={`${net.recovery}%`} label={t('stores.recoveryRate', { defaultValue: 'Recovery' })} tint={theme.successText} />
          </View>
        </Card>
      </View>

      <SectionLabel>{t('stores.allLocations', { defaultValue: 'All locations' })}</SectionLabel>

      {stores.map(s => (
        <Row
          key={s.storeId}
          title={s.branch}
          sub={t('store.missedCount', { count: s.missed, defaultValue: '{{count}} missed' })}
          right={
            <Text style={[TYPE.headline, { color: s.recovery >= 50 ? theme.successText : theme.errorText }]}>
              {s.recovery}%
            </Text>
          }
        />
      ))}
    </Screen>
  )
}
