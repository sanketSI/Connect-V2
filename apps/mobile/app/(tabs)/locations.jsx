// YOUR LOCATIONS — the roll-up and the two leaderboards, ranked WORST FIRST by default
// because the product exists to find the branch losing business.
//
// WHAT IT RANKS is a choice of grouping, not a journey: the same four rungs the
// Location Selector names (Sub-brand · State · City · Location) sit as tabs, so "which
// city is losing calls" is one tap rather than a drill you have to walk back out of.
// Rows respect the scope in session, so the board and the switcher always agree. A
// group row drops to the level below; a store row opens the calls behind the number.
import { useMemo, useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight, PhoneCall, Star, MapPin, Building2, Store as StoreIcon,
  Map as MapIcon, ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X,
} from 'lucide-react-native'
import { networkRows, rankRows, assignedStoreIds } from '@connect/core'
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

// The hierarchy's rungs, same four the selector names. English for now, as there.
const LEVELS = [
  { id: 'subBrand', label: 'Sub-brand', Icon: Building2 },
  { id: 'state', label: 'State', Icon: MapIcon },
  { id: 'city', label: 'City', Icon: MapPin },
  { id: 'store', label: 'Location', Icon: StoreIcon },
]

export default function LocationsTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const version = useDataVersion()

  const storeIds = useMemo(() => assignedStoreIds(), [version])

  const [level, setLevel] = useState('city')
  const [board, setBoard] = useState('calls')
  const [dir, setDir] = useState('desc')

  const atStore = level === 'store'
  const meta = BOARDS.find(b => b.id === board)

  // The scope in session already narrows storeIds, so the board needs no path of its
  // own — pick a level and it ranks every group at that level, inside scope.
  const filter = useMemo(() => ({ level, storeIds, win: 'all' }), [level, storeIds])

  const rows = useMemo(
    () => rankRows(networkRows(filter), meta.metric, dir),
    [filter, meta.metric, dir, version],
  )

  // Search over the ranked rows — every line a card prints, so what you can see you can
  // find. The selector's field, doing the selector's job on a read screen.
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter(r => [r.label, r.subBrands.join(' '), r.states.join(' '), r.cities.join(' '), r.address]
      .filter(Boolean).join(' ').toLowerCase().includes(q))
    : rows

  const totals = useMemo(() => rows.reduce((a, r) => ({
    missed: a.missed + r.missed, total: a.total + r.total,
    negative: a.negative + r.negative, reviews: a.reviews + r.reviews,
    stores: a.stores + r.stores,
  }), { missed: 0, total: 0, negative: 0, reviews: 0, stores: 0 }), [rows])

  return (
    <Screen onRefresh={refreshDerived}>
      {/* TITLE FIRST, then the controls that act on it. There is no scope dropdown here
          on purpose: scope is chosen in ONE place (the Location Selector, off Home's
          pill), and this page is a VIEW of it. Two hierarchy controls on one screen — a
          dropdown that restricts and tabs that group, side by side and looking alike —
          is the confusion this removes. The subtitle still SAYS what is restricting the
          page, which was the dropdown's only honest job. */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title>{t('network.title', { defaultValue: 'Your locations' })}</Title>
          <Caption className="mt-0.5" numberOfLines={1}>
            {session.store?.aggregate
              ? (session.store.label || t('stores.allLocations', { defaultValue: 'All locations' }))
              : `${session.store?.name} · ${session.store?.branch}`}
            {' · '}
            {t('stores.nStoresShort', { count: storeIds.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
          </Caption>
        </View>
        <HeaderRight />
      </View>

      {/* WHAT THE BOARD RANKS — the hierarchy's rungs. The one hierarchy control here. */}
      <View className="flex-row flex-wrap gap-2 mt-3">
        {LEVELS.map(lv => (
          <Chip key={lv.id} icon={lv.Icon} active={level === lv.id} onPress={() => { setLevel(lv.id); setQuery('') }}>
            {lv.label}
          </Chip>
        ))}
      </View>

      {/* Search — reads every line a card prints. */}
      <View className="h-11 rounded-xl flex-row items-center gap-2 px-3 mt-2.5 bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline">
        <Search size={16} color="#93A0C8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('common.search', { defaultValue: 'Search' })}
          placeholderTextColor="#93A0C8"
          accessibilityLabel={t('common.search', { defaultValue: 'Search' })}
          className="flex-1 text-[15px] text-ink dark:text-d-ink"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.close', { defaultValue: 'Close' })}>
            <X size={14} color="#93A0C8" />
          </Pressable>
        ) : null}
      </View>

      {/* WHICH BOARD, and which way it is sorted. */}
      <View className="flex-row flex-wrap gap-2 mt-2.5 mb-3">
        {BOARDS.map(b => (
          <Chip key={b.id} icon={b.Icon} active={board === b.id} onPress={() => setBoard(b.id)}>
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

      {/* The level's own totals — the context the ranked rows are a breakdown of. */}
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

      {shown.map((r, i) => (
        <RowCard
          key={r.key}
          row={r} rank={i + 1} metric={meta.metric} t={t}
          drillable={false}
          // A group row drops the board one level; a store row opens the calls behind
          // the number. Neither is a dead end, and the tabs still jump anywhere.
          onOpen={atStore
            ? () => router.push(`/store/${r.key}`)
            : () => { vibrate(8); setLevel(level === 'subBrand' ? 'state' : level === 'state' ? 'city' : 'store') }}
        />
      ))}

      {shown.length === 0 && (
        <Card className="!p-6 items-center">
          <Body className="font-hk-semi text-ink dark:text-d-ink">{t('leads.emptyTitle', { defaultValue: 'Nothing here' })}</Body>
          <Caption className="mt-0.5">{t('customers.emptySub', { defaultValue: 'Try another filter.' })}</Caption>
        </Card>
      )}
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
  const counts = metric === 'missedPct'
    ? t('network.ofCalls', { missed: row.missed, total: row.total, defaultValue: '{{missed}} missed of {{total}} calls' })
    : t('network.ofReviews', { negative: row.negative, total: row.reviews, defaultValue: '{{negative}} negative of {{total}} reviews' })

  // The Location Selector's card rhythm: title, the context it sits in, then the facts.
  const context = row.level === 'store'
    ? `${row.city}, ${row.state}`
    : row.level === 'city'
      ? [row.subBrands.join(' · '), row.state].filter(Boolean).join(' · ')
      : row.level === 'state'
        ? row.subBrands.join(' · ')
        : row.states.join(', ')
  const meta = row.level === 'store'
    ? [row.address, counts].filter(Boolean).join(' · ')
    : `${t('stores.nStoresShort', { count: row.stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })} · ${counts}`

  return (
    <Card onPress={drillable ? onDrill : onOpen} label={row.label} className="mb-2.5 !p-3.5">
      <View className="flex-row items-start gap-3">
        <Text className="w-7 text-center text-[13px] font-hk-medium text-ink-3 dark:text-d-ink3">#{rank}</Text>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            <MapPin size={11} color="#93A0C8" />
            <Body className="font-hk-semi text-ink dark:text-d-ink flex-1" numberOfLines={1}>{row.label}</Body>
          </View>
          {context ? <Body className="mt-0.5" numberOfLines={1}>{context}</Body> : null}
          <Caption className="mt-0.5" numberOfLines={1}>{meta}</Caption>
        </View>
        <Text className="text-[17px] font-hk-bold" style={{ color: tone }}>
          {pct == null ? '—' : `${pct}%`}
        </Text>
        {drillable ? <ChevronRight size={16} color="#93A0C8" /> : null}
      </View>
    </Card>
  )
}
