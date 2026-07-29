// TEAM — Profile's Team tile, on getAllStoreTeams(): every branch's roster, grouped by
// store, exactly the aggregate behaviour the web sheet has ("a roster is a list, so the
// aggregate view simply shows every branch's, grouped").
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getAllStoreTeams } from '@connect/core'
import { Screen, Card, Title, Caption, Body } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession } from '../lib/session.js'

export default function TeamScreen() {
  const { t } = useTranslation()
  const session = useSession()
  const aggregate = !!session.store?.aggregate
  const teams = getAllStoreTeams().filter(g => aggregate || g.storeId === session.store?.id)

  return (
    <Screen>
      <BackButton />
      <Title className="mt-4 mb-3">{t('profile.team', { defaultValue: 'Team' })}</Title>
      {teams.map(g => (
        <View key={g.storeId}>
          {aggregate && <Caption className="mt-3 mb-2 font-hk-semi">{g.branch}</Caption>}
          <Card className="!p-0 overflow-hidden mb-2.5">
            {g.members.map((m, i) => (
              <View key={m.name}>
                {i > 0 && <View className="h-px bg-hairline dark:bg-d-hairline" />}
                <View className="flex-row items-center gap-3 px-4 py-3">
                  <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: m.color }}>
                    <Text className="text-xs font-hk-bold text-white">{m.initials}</Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Body className="font-hk-semi text-ink dark:text-d-ink">{m.name}</Body>
                    <Caption className="mt-0.5">{t(m.roleKey, { defaultValue: m.roleKey })}</Caption>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  )
}
