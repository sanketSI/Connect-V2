import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, ChevronLeft, PhoneCall, Star, ArrowDownWideNarrow, ArrowUpNarrowWide, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  networkRows, rankRows, assignedStoreIds, assignmentLevels,
} from '@connect/core'
import { Card, Chip } from '../components/UI.jsx'
import { LargeTitle } from '../components/TopBar.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
import { useDataVersion } from '../lib/useDataVersion.js'
import { vibrate } from '../lib/utils.js'

// ============================================================
// MULTI-LOCATION — the roll-up, the drill-down and the two leaderboards.
//
// THE DEPTH IS NOT A SETTING. assignmentLevels() derives it from what the brand admin
// granted: one city drills straight to stores, one state drills city → store, several
// states drill state → city → store. A manager with two Bangalore shops is never asked
// to walk through a state with one child.
//
// This replaces the demo role switcher, which asked the user to pick a persona
// ('cluster', 'regional', 'head') and then showed roll-ups seeded independently of the
// records underneath. Both halves of that were wrong: the persona is not the user's to
// choose, and a roll-up that does not sum the records it claims to summarise is how the
// same store shows two different missed counts on two screens.
//
// RANKED WORST FIRST by default, for both boards. The product exists to find the branch
// losing business, so the branch losing the most is the one to open.
// ============================================================

const BOARDS = [
  { id: 'calls', metric: 'missedPct', Icon: PhoneCall, labelKey: 'network.boardCalls', label: 'Calls' },
  { id: 'reviews', metric: 'negativePct', Icon: Star, labelKey: 'network.boardReviews', label: 'Reviews' },
]

export default function Network({ onOpenProfile }) {
  const { t } = useTranslation()
  const version = useDataVersion()

  const storeIds = useMemo(() => assignedStoreIds(), [])
  const levels = useMemo(() => assignmentLevels(), [])

  // Where we are in the drill. `path` holds the choices made so far, so the depth of
  // `path` picks the level out of `levels` — the two can never disagree.
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
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      <LargeTitle
        title={t('network.title', { defaultValue: 'Your locations' })}
        sub={t('network.subtitle', {
          count: storeIds.length,
          defaultValue_one: '{{count}} store assigned to you',
          defaultValue_other: '{{count}} stores assigned to you',
        })}
        right={<div className="flex items-center"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>}
      />

      <div className="px-4">
        {/* WHERE YOU ARE. Only shown once you have drilled — at the top level the
            title already says it. */}
        {path.length > 0 && (
          <button
            onClick={() => { vibrate(6); setPath(p => p.slice(0, -1)) }}
            className="mb-3 inline-flex items-center gap-1.5 px-3 h-9 rounded-full press"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft size={14} className="shrink-0" />
            <span className="m-subhead font-medium truncate">{path[path.length - 1]}</span>
          </button>
        )}

        {/* WHICH BOARD, and which way it is sorted. */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          {BOARDS.map(b => (
            <Chip key={b.id} icon={b.Icon} active={board === b.id} onClick={() => { vibrate(6); setBoard(b.id) }}>
              {t(b.labelKey, { defaultValue: b.label })}
            </Chip>
          ))}
          <Chip
            icon={dir === 'desc' ? ArrowDownWideNarrow : ArrowUpNarrowWide}
            onClick={() => { vibrate(6); setDir(d => (d === 'desc' ? 'asc' : 'desc')) }}
          >
            {dir === 'desc'
              ? t('network.worstFirst', { defaultValue: 'Worst first' })
              : t('network.bestFirst', { defaultValue: 'Best first' })}
          </Chip>
        </div>

        {/* The level's own totals, so a drill never loses the context it came from. */}
        <Card className="!p-3.5 mb-3">
          <div className="grid grid-cols-3">
            <Stat value={totals.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} />
            <Stat
              value={totals.total ? `${Math.round((totals.missed / totals.total) * 100)}%` : '—'}
              label={t('network.missedPct', { defaultValue: 'Missed' })} color="#DC2626" bordered
            />
            <Stat
              value={totals.reviews ? `${Math.round((totals.negative / totals.reviews) * 100)}%` : '—'}
              label={t('network.negativePct', { defaultValue: 'Negative' })} color="#B45309" bordered
            />
          </div>
        </Card>

        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <motion.div
              key={r.key}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.24, ease: [0.2, 0, 0, 1] }}
            >
              <RowCard
                row={r} rank={i + 1} metric={meta.metric}
                drillable={!atStore}
                onDrill={() => { vibrate(8); setPath(p => [...p, r.key]) }}
              />
            </motion.div>
          ))}
          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, color, bordered }) {
  return (
    <div className={bordered ? 'text-center border-l' : 'text-center'} style={bordered ? { borderColor: 'var(--border-glass)' } : undefined}>
      <div className="m-title2 m-tabular" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      <div className="m-caption text-white/55 mt-0.5">{label}</div>
    </div>
  )
}

function RowCard({ row, rank, metric, drillable, onDrill }) {
  const { t } = useTranslation()
  const pct = row[metric]
  // Both boards rank a PROBLEM, so a high number is bad on either. One colour rule for
  // both keeps the reading identical when you switch between them.
  const tone = pct == null ? 'var(--text-tertiary)' : pct >= 50 ? '#DC2626' : pct >= 25 ? '#B45309' : '#15803D'
  const sub = metric === 'missedPct'
    ? t('network.ofCalls', { missed: row.missed, total: row.total, defaultValue: '{{missed}} missed of {{total}} calls' })
    : t('network.ofReviews', { negative: row.negative, total: row.reviews, defaultValue: '{{negative}} negative of {{total}} reviews' })

  return (
    <Card onClick={drillable ? onDrill : undefined} className="!p-4">
      <div className="flex items-center gap-3">
        <div className="w-7 shrink-0 m-subhead m-tabular text-center" style={{ color: 'var(--text-tertiary)' }}>#{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <span className="m-headline text-white truncate">{row.label}</span>
          </div>
          <div className="m-caption text-white/55 mt-0.5 truncate">
            {row.level !== 'store'
              ? `${t('stores.nStoresShort', { count: row.stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })} · ${sub}`
              : sub}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="m-title3 m-tabular" style={{ color: tone }}>{pct == null ? '—' : `${pct}%`}</div>
        </div>
        {drillable && <ChevronRight size={16} className="text-white/45 shrink-0" />}
      </div>
    </Card>
  )
}
