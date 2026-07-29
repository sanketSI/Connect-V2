// REVIEWS. Counts from core; the reply flow, Nova filter sheet and time windows are
// Phase 3.
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react-native'
import { reviewsWaitingCount, networkRollup } from '@connect/core'
import { Screen, Card, Stat, Title, Caption } from '../../components/UI.jsx'

export default function ReviewsTab() {
  const { t } = useTranslation()
  const waiting = reviewsWaitingCount()
  const net = networkRollup()

  // Weighted by how many reviews each store actually carries — a plain mean over stores
  // would let a 3-review branch outvote a 16-review one.
  const rated = net.perStore.filter(s => s.reviews > 0)
  const totalReviews = rated.reduce((n, s) => n + s.reviews, 0)
  const avg = totalReviews
    ? (rated.reduce((n, s) => n + s.rating * s.reviews, 0) / totalReviews).toFixed(1)
    : '—'

  return (
    <Screen>
      <Title>{t('nav.reviews', { defaultValue: 'Reviews' })}</Title>

      <View className="mt-4">
        <Card>
          <View className="flex-row gap-2 items-start">
            <Stat value={waiting} label={t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })} tone="bad" />
            <Stat value={totalReviews} label={t('nav.reviews', { defaultValue: 'Reviews' })} />
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-1">
                <Text className="text-2xl font-hk-bold text-ink dark:text-d-ink">{avg}</Text>
                <Star size={16} color="#111827" fill="#111827" />
              </View>
              <Caption numberOfLines={1} className="mt-0.5">
                {t('reviews.avgRating', { defaultValue: 'Average' })}
              </Caption>
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  )
}
