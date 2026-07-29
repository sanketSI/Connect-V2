// REVIEWS (Phase 1). Counts from core; the reply flow, Nova filter sheet and time
// windows are Phase 3.
import { View, Text, useColorScheme } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react-native'
import { reviewsWaitingCount, networkRollup } from '@connect/core'
import { Screen, Card, Stat } from '../../components/UI.jsx'
import { themeFor, TYPE } from '../../lib/tokens.js'

export default function ReviewsTab() {
  const { t } = useTranslation()
  const theme = themeFor(useColorScheme())
  const waiting = reviewsWaitingCount()
  const net = networkRollup()

  // The estate-wide rating, weighted by how many reviews each store actually carries —
  // a plain mean over stores would let a 3-review branch outvote a 16-review one.
  const rated = net.perStore.filter(s => s.reviews > 0)
  const totalReviews = rated.reduce((n, s) => n + s.reviews, 0)
  const avg = totalReviews
    ? (rated.reduce((n, s) => n + s.rating * s.reviews, 0) / totalReviews).toFixed(1)
    : '—'

  return (
    <Screen>
      <Text style={[TYPE.largeTitle, { color: theme.textPrimary }]}>
        {t('nav.reviews', { defaultValue: 'Reviews' })}
      </Text>

      <View style={{ marginTop: 16 }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Stat value={waiting} label={t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })} tint={theme.errorText} />
            <Stat value={totalReviews} label={t('nav.reviews', { defaultValue: 'Reviews' })} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[TYPE.stat, { color: theme.textPrimary }]}>{avg}</Text>
                <Star size={16} color={theme.textPrimary} fill={theme.textPrimary} />
              </View>
              <Text style={[TYPE.caption, { color: theme.textTertiary }]} numberOfLines={1}>
                {t('reviews.avgRating', { defaultValue: 'Average' })}
              </Text>
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  )
}
