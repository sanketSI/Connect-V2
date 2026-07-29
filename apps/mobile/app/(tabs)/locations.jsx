// YOUR LOCATIONS — ported from apps/web/src/screens/Network.jsx (the spec). The roll-up,
// the drill-down and the two leaderboards. THE DEPTH IS NOT A SETTING: assignmentLevels()
// derives it from what this manager holds — several states drill state → city → store.
// Ranked worst first by default on both boards: the product exists to find the branch
// losing business. The last level is a destination, not a peek — a store row opens the
// calls behind the number (/store/[id]).
import { useMemo, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight, ChevronLeft, ChevronDown, PhoneCall, Star, MapPin,
  ArrowDownWideNarrow, ArrowUpNarrowWide,
} from 'lucide-react-native'
import { networkRows, rankRows, assignedStoreIds, assignmentLevels } from '@connect/core'
import { Screen, Card, Title, Body, Caption, Chip } from '../../components/UI.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { refreshDerived } from '../../lib/refresh.js'
import { vibrate } from '../../lib/haptics.js'

const BOARDS = [
  { id: 'calls', metric: 'missedPct', Icon: PhoneCall, labelKey: 'network.boardCalls', label: 'Calls' },
  { id: 'reviews', metric: 'negativePct', Icon: Star, labelKey: 'network.boardReviews', label: 'Reviews' },
]

export default function LocationsTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const version = useDataVersion()

  const storeIds = useMemo(() => assignedStoreIds(), [version])
  const levels = useMemo(() => assignmentLevels(storeIds), [storeIds])

  // Where we are in the drill: path depth picks the level, so they cannot disagree.
  const [path, setPath] = useState([])
  const [board, setBoard] = useState('calls')
  const [dir, setDir] = useState('desc')

  const level = levels[Math.min(path.length, levels.length - 1)]
  const atStore = level === 'store'
  const meta = BOARDS.find(b => b.id === board)

  const filter = useMemo(() => {
    const f = { level, storeIds, win: 'all' }
    levels.slice(0, path.length).forEach((lv, i) => {
      if (lv === 'state') f.state = path[i]
      if (lv === 'city') f.city = path[i]
    })
    return f
  }, [level, levels, path, storeIds])

  const rows = useMemo(
    () => rankRows(networkRows(filter), meta.metric, dir),
    [filter, meta.metric, dir, version],
  )

  const totals = useMemo(() => rows.reduce((a, r) => ({
    missed: a.missed + r.missed, total: a.total + r.total,
    negative: a.negative + r.negative, reviews: a.reviews + r.reviews,
    stores: a.stores + r.stores,
  }), { missed: 0, total: 0, negative: 0, reviews: 0, stores: 0 }), [rows])

  return (
    <Screen onRefresh={refreshDerived}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title>{t('network.title', { defaultValue: 'Your locations' })}</Title>
          <Caption className="mt-0.5">
            {t('network.subtitle', {
              count: storeIds.length,
              defaultValue_one: '{{count}} store assigned to you',
              defaultValue_other: '{{count}} stores assigned to you',
            })}
          </Caption>
        </View>
        <HeaderRight />
      </View>

      {/* THE SCOPE DROPDOWN — which node of Brand → sub-brand → state → city this
          screen is summing. Opens the same drill the Home pill opens (one code path),
          so the two can never disagree about the tree. */}
      <Pressable
        onPress={() => { vibrate(6); router.push('/switch') }}
        accessibilityRole="button"
        accessibilityLabel={t('store.switchTitle', { defaultValue: 'Switch location' })}
        className="flex-row items-center gap-1.5 self-start mt-3 h-9 px-3 rounded-pill bg-brand-blue/10 border border-brand-blue/40"
      >
        <MapPin size={13} color="#0355DB" />
        <Text className="text-[13px] font-hk-medium text-primaryText dark:text-d-primaryText" numberOfLines={1}>
          {session.store?.aggregate
            ? (session.store.label || t('stores.allLocations', { defaultValue: 'All locations' }))
            : `${session.store?.name} · ${session.store?.branch}`}
        </Text>
        <ChevronDown size={13} color="#0355DB" style={{ opacity: 0.7 }} />
      </Pressable>

      {/* WHERE YOU ARE — only once you have drilled; at the top the title says it. */}
      {path.length > 0 && (
        <Pressable
          onPress={() => { vibrate(6); setPath(p => p.slice(0, -1)) }}
          accessibilityRole="button"
          className="flex-row items-center gap-1.5 self-start mt-3 h-9 px-3 rounded-pill bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline"
        >
          <ChevronLeft size={14} color="#374151" />
          <Text className="text-[13px] font-hk-medium text-ink-2 dark:text-d-ink2" numberOfLines={1}>
            {path[path.length - 1]}
          </Text>
        </Pressable>
      )}

      {/* WHICH BOARD, and which way it is sorted. */}
      <View className="flex-row flex-wrap gap-2 mt-3 mb-3">
        {BOARDS.map(b => (
          <Chip key={b.id} active={board === b.id} onPress={() => setBoard(b.id)}>
            {t(b.labelKey, { defaultValue: b.label })}
          </Chip>
        ))}
        <Pressable
          onPress={() => { vibrate(6); setDir(d => (d === 'desc' ? 'asc' : 'desc')) }}
          accessibilityRole="button"
          className="h-9 px-3.5 rounded-pill border border-hairline dark:border-d-hairline flex-row items-center gap-1.5"
        >
          {dir === 'desc' ? <ArrowDownWideNarrow size={13} color="#374151" /> : <ArrowUpNarrowWide size={13} color="#374151" />}
          <Text className="text-[13px] font-hk-medium text-ink-2 dark:text-d-ink2">
            {dir === 'desc'
              ? t('network.worstFirst', { defaultValue: 'Worst first' })
              : t('network.bestFirst', { defaultValue: 'Best first' })}
          </Text>
        </Pressable>
      </View>

      {/* The level's own totals, so a drill never loses the context it came from. */}
      <Card className="!p-3.5 mb-3">
        <View className="flex-row">
          <LevelStat value={totals.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} />
          <LevelStat
            value={totals.total ? `${Math.round((totals.missed / totals.total) * 100)}%` : '—'}
            label={t('network.missedPct', { defaultValue: 'Missed' })} tone="text-bad dark:text-d-bad" bordered
          />
          <LevelStat
            value={totals.reviews ? `${Math.round((totals.negative / totals.reviews) * 100)}%` : '—'}
            label={t('network.negativePct', { defaultValue: 'Negative' })} tone="text-[#B45309]" bordered
          />
        </View>
      </Card>

      {rows.map((r, i) => (
        <RowCard
          key={r.key}
          row={r} rank={i + 1} metric={meta.metric} t={t}
          drillable={!atStore}
          onDrill={() => setPath(p => [...p, r.key])}
          // The last level is not a dead end: at store level the row opens the calls
          // behind the number.
          onOpen={atStore ? () => router.push(`/store/${r.key}`) : undefined}
        />
      ))}
    </Screen>
  )
}

function LevelStat({ value, label, tone = 'text-ink dark:text-d-ink', bordered }) {
  return (
    <View className={`flex-1 min-w-0 ${bordered ? 'pl-3 border-l border-hairline dark:border-d-hairline' : ''}`}>
      <Text className={`text-[17px] font-hk-bold ${tone}`} numberOfLines={1}>{value}</Text>
      <Caption numberOfLines={1} className="mt-0.5">{label}</Caption>
    </View>
  )
}

function RowCard({ row, rank, metric, drillable, onDrill, onOpen, t }) {
  const pct = row[metric]
  // Both boards rank a PROBLEM — one colour rule for both, exactly the web thresholds.
  const tone = pct == null ? '#5F6878' : pct >= 50 ? '#DC2626' : pct >= 25 ? '#B45309' : '#15803D'
  const sub = metric === 'missedPct'
    ? t('network.ofCalls', { missed: row.missed, total: row.total, defaultValue: '{{missed}} missed of {{total}} calls' })
    : t('network.ofReviews', { negative: row.negative, total: row.reviews, defaultValue: '{{negative}} negative of {{total}} reviews' })

  return (
    <Card onPress={drillable ? onDrill : onOpen} label={row.label} className="mb-2.5 !p-4">
      <View className="flex-row items-center gap-3">
        <Text className="w-7 text-center text-[13px] font-hk-medium text-ink-3 dark:text-d-ink3">#{rank}</Text>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            <MapPin size={11} color="#93A0C8" />
            <Body className="font-hk-semi text-ink dark:text-d-ink flex-1" numberOfLines={1}>{row.label}</Body>
          </View>
          <Caption numberOfLines={1} className="mt-0.5">
            {row.level !== 'store'
              ? `${t('stores.nStoresShort', { count: row.stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })} · ${sub}`
              : sub}
          </Caption>
        </View>
        <Text className="text-[17px] font-hk-bold" style={{ color: tone }}>
          {pct == null ? '—' : `${pct}%`}
        </Text>
        {drillable ? <ChevronRight size={16} color="#93A0C8" /> : null}
      </View>
    </Card>
  )
}
