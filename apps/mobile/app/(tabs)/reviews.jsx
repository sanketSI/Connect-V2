// REVIEWS — ported from apps/web/src/screens/Reviews.jsx (the spec). This iteration
// carries the INBOX: the three-stat card (total / waiting / average), the one-predicate
// "waiting" count taken off the very list rendered below it, and full review cards —
// stars, platform, time, body, tags, reply state. The Review-link tab and the filter
// sheet are the next iteration; the tab chip is not drawn until its screen exists,
// because a tab that opens nothing is worse than none.
import { useMemo } from 'react'
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react-native'
import {
  filterReviews, reviewMetrics, reviewsWaitingCount, CANONICAL_REVIEW_WINDOW,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption } from '../../components/UI.jsx'
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
  const version = useDataVersion()
  const scopeId = session.store?.aggregate ? undefined : session.store?.id

  const scoped = useMemo(() => ({ window: CANONICAL_REVIEW_WINDOW, storeId: scopeId }), [scopeId])
  const metrics = useMemo(() => reviewMetrics(scoped), [scoped, version])
  const list = useMemo(() => filterReviews(scoped), [scoped, version])

  // ONE PREDICATE: counted off the very array rendered below, with the data layer's own
  // responded flag — the headline and the rows can never disagree. See the long audit
  // note in the web file for why this matters (four surfaces once showed four numbers).
  const waiting = useMemo(() => list.filter(r => !r.responded && !r.removed).length, [list])
  const canonicalWaiting = useMemo(() => reviewsWaitingCount(undefined, scopeId), [version, scopeId])

  return (
    <Screen>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title>{t('reviews.title', { defaultValue: 'Reviews' })}</Title>
          <Caption className="mt-0.5">
            {t('reviews.subtitlePlain', { defaultValue: 'What customers are saying, and how fast you reply' })}
          </Caption>
        </View>
        <HeaderRight />
      </View>

      {/* Listing metrics — the CountsCard idiom, three across. */}
      <Card className="mt-4 mb-2 !p-3.5">
        <View className="flex-row">
          <HeadStat value={metrics.total} label={t('reviews.totalReviews', { defaultValue: 'Total reviews' })} />
          <HeadStat
            value={waiting}
            tone="text-[#CA8A04]"
            label={t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })}
            divider
          />
          <HeadStat
            value={metrics.avgRating != null ? metrics.avgRating.toFixed(1) : '—'}
            star={metrics.avgRating != null}
            label={t('reviews.avgRating', { defaultValue: 'Avg rating' })}
            divider
          />
        </View>
        <View className="mt-3 pt-2.5 border-t border-hairline dark:border-d-hairline">
          <Caption>{t('reviews.waitingMeans', { defaultValue: 'Waiting for a reply means live on your listing with no reply posted.' })}</Caption>
          {canonicalWaiting !== waiting && (
            <Caption className="mt-1">
              {t('reviews.waitingBadgeNote', {
                count: canonicalWaiting,
                window: t(`window.${CANONICAL_REVIEW_WINDOW}`, { defaultValue: 'Last 30 days' }),
                defaultValue: 'The Reviews tab badge shows {{count}} — the same count over {{window}}.',
              })}
            </Caption>
          )}
        </View>
      </Card>

      {list.map(r => (
        <Card key={r.id} className="mb-2.5">
          <View className="flex-row items-center justify-between gap-2">
            <Body className="font-hk-semi text-ink dark:text-d-ink flex-1" numberOfLines={1}>{r.customer}</Body>
            <Stars n={r.rating} />
          </View>
          <Caption className="mt-0.5">{r.platform} · {r.time}</Caption>
          {r.body ? <Body numberOfLines={4} className="mt-2">{r.body}</Body> : null}
          {r.tags?.length ? (
            <View className="flex-row flex-wrap gap-1.5 mt-2">
              {r.tags.map(tag => (
                <View key={tag} className="h-6 px-2 rounded-pill bg-brand-blue/5 border border-hairline dark:border-d-hairline items-center justify-center">
                  <Text className="text-[11px] font-hk-medium text-ink-3 dark:text-d-ink3">{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {r.replies?.length ? (
            <View className="mt-2 pl-3 border-l-2 border-brand-blue/30">
              <Caption numberOfLines={3}>{r.replies[r.replies.length - 1].text}</Caption>
            </View>
          ) : (!r.removed && (
            <View className="self-start mt-2 h-6 px-2 rounded-pill bg-[#CA8A04]/10 items-center justify-center">
              <Text className="text-[11px] font-hk-semi text-[#CA8A04]">
                {t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  )
}

function HeadStat({ value, label, tone = 'text-ink dark:text-d-ink', star, divider }) {
  return (
    <View className={`flex-1 min-w-0 ${divider ? 'pl-3 border-l border-hairline dark:border-d-hairline' : ''}`}>
      <View className="flex-row items-center gap-1">
        <Text className={`text-2xl font-hk-bold ${tone}`} numberOfLines={1}>{value}</Text>
        {star ? <Star size={13} color="#F59E0B" fill="#F59E0B" /> : null}
      </View>
      <Caption numberOfLines={2} className="mt-0.5">{label}</Caption>
    </View>
  )
}
