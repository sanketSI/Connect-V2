// REVIEWS — real reviews now, from getReviews(): stars, body, tags, platform, and the
// reply state. The reply flow itself (AI drafts, posting) is Phase 3.
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react-native'
import { getReviews, reviewsWaitingCount, networkRollup } from '@connect/core'
import { Screen, Card, Stat, Title, Body, Caption } from '../../components/UI.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'

function Stars({ n }) {
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} color={i <= n ? '#F59E0B' : '#DEE7F2'} fill={i <= n ? '#F59E0B' : 'none'} />
      ))}
    </View>
  )
}

export default function ReviewsTab() {
  const { t } = useTranslation()
  const session = useSession()
  useDataVersion()
  const scopeId = session.store?.aggregate ? undefined : session.store?.id
  const waiting = reviewsWaitingCount(undefined, scopeId)
  const net = networkRollup()

  // getReviews() takes no scope — the records carry storeId, so the branch filter is
  // ours. Verified: 35 total, 3 for lks-kor.
  const list = getReviews().filter(r => !scopeId || r.storeId === scopeId).slice(0, 30)

  const rated = net.perStore.filter(s => s.reviews > 0)
  const totalReviews = rated.reduce((n, s) => n + s.reviews, 0)
  const avg = totalReviews
    ? (rated.reduce((n, s) => n + s.rating * s.reviews, 0) / totalReviews).toFixed(1)
    : '—'

  return (
    <Screen>
      <View className="flex-row items-start justify-between gap-3">
        <Title>{t('nav.reviews', { defaultValue: 'Reviews' })}</Title>
        <HeaderRight />
      </View>

      <View className="mt-4">
        <Card>
          <View className="flex-row gap-2 items-start">
            <Stat value={waiting} label={t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })} tone="bad" />
            <Stat value={totalReviews} label={t('nav.reviews', { defaultValue: 'Reviews' })} />
            <Stat value={`${avg}★`} label={t('reviews.avgRating', { defaultValue: 'Average' })} />
          </View>
        </Card>
      </View>

      <View className="mt-4">
        {list.map(r => (
          <Card key={r.id} className="mb-2.5">
            <View className="flex-row items-center justify-between gap-2">
              <Body className="font-hk-semi text-ink dark:text-d-ink flex-1" numberOfLines={1}>
                {r.customer}
              </Body>
              <Stars n={r.rating} />
            </View>
            <Caption className="mt-0.5">{r.platform} · {r.time}</Caption>
            {r.body ? <Body numberOfLines={3} className="mt-2">{r.body}</Body> : null}
            {(!r.replies || r.replies.length === 0) && (
              <View className="self-start mt-2 h-6 px-2 rounded-pill bg-bad/10 items-center justify-center">
                <Text className="text-[11px] font-hk-semi text-bad">
                  {t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })}
                </Text>
              </View>
            )}
          </Card>
        ))}
      </View>
    </Screen>
  )
}
