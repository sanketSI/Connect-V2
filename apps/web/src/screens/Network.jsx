import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, ChevronLeft, PhoneCall, PhoneIncoming, Star, ArrowDownWideNarrow, ArrowUpNarrowWide, MapPin, Lock, Repeat2, FileText, Store as StoreIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  networkRows, rankRows, assignedStoreIds, assignmentLevels,
  getCalls, getLeads, LEAD_SOURCES, storeLabelOf, dayClock, relativeTime,
} from '@connect/core'
import { Card, Chip, CLIPill } from '../components/UI.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
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

  // ALWAYS THE WHOLE ASSIGNMENT — because this screen only exists when that is what the
  // manager is looking at. The tab is offered on two conditions (see BottomTabBar):
  // more than one store assigned, AND "All locations" in the picker. Narrow to one
  // branch and the tab goes away rather than degrading into a leaderboard with a single
  // row, which is Home with extra steps.
  //
  // Depends on `version` rather than [] — the assignment is session state now (see
  // setSessionAssignments), and a value cached against no dependency at all is the first
  // thing to go stale when someone signs out and back in as somebody else.
  const storeIds = useMemo(() => assignedStoreIds(), [version])
  const levels = useMemo(() => assignmentLevels(storeIds), [storeIds])

  // Where we are in the drill. `path` holds the choices made so far, so the depth of
  // `path` picks the level out of `levels` — the two can never disagree.
  const [path, setPath] = useState([])
  const [board, setBoard] = useState('calls')
  const [dir, setDir] = useState('desc')
  // Which store's calls are open, at the last level of the drill. Store id, or null.
  const [openStore, setOpenStore] = useState(null)

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
                // THE LAST LEVEL IS NOT A DEAD END. Drilling state → city → store used
                // to stop on a row that ranked a shop and then refused to say anything
                // about it. At store level the row opens the calls behind the number.
                onOpen={atStore ? () => { vibrate(8); setOpenStore(r.key) } : undefined}
              />
            </motion.div>
          ))}
          <div className="h-4" />
        </div>
      </div>

      <BottomSheet
        open={!!openStore}
        onClose={() => setOpenStore(null)}
        fullHeight
        label={openStore ? storeLabelOf(openStore) : undefined}
      >
        {openStore && <StoreCallsSheet storeId={openStore} />}
      </BottomSheet>
    </div>
  )
}

/**
 * WHAT THE RANKING WAS MADE OF — one store's calls, split by what happened to them.
 *
 * The two halves answer different questions, so they carry different facts rather than
 * one row shape padded out with blanks:
 *
 *   MISSED    how often they tried and how long ago they gave up — the two things that
 *             decide who to ring first. No reason: nobody spoke, so we do not have one,
 *             and printing the seed's campaign guess would claim we heard them (the same
 *             rule the Calls screen applies).
 *   ATTENDED  where the lead came from, how warm it was, and what they rang about —
 *             which only exists BECAUSE somebody picked up.
 */
function StoreCallsSheet({ storeId }) {
  const { t } = useTranslation()
  const version = useDataVersion()
  const [outcome, setOutcome] = useState('missed')

  // LEADS, not just calls — because "where did this come from" is only a question worth
  // printing if the answer can be something other than "a call". A form submission and a
  // walk-in are this shop's enquiries too, and they never rang the phone.
  const leads = useMemo(() => getLeads({ storeId }), [storeId, version])
  // The reason someone rang lives on the CALL record, not the lead, so the two are
  // joined here rather than duplicating the field into the lead projection.
  const callById = useMemo(
    () => new Map(getCalls('all', { storeId }).map(c => [c.id, c])),
    [storeId, version],
  )

  // A missed call is the only row that is still outstanding on the phone. Everything
  // else — answered, filled a form, walked in — is an enquiry somebody has engaged with.
  const missed = useMemo(
    () => leads.filter(l => l.source === 'call' && l.status === 'missed'),
    [leads],
  )
  const attended = useMemo(
    () => leads.filter(l => !(l.source === 'call' && l.status === 'missed')),
    [leads],
  )
  const list = outcome === 'missed' ? missed : attended

  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white truncate">{storeLabelOf(storeId)}</div>

      <div className="flex items-center gap-2 mt-3 mb-3">
        <Chip active={outcome === 'missed'} onClick={() => { vibrate(6); setOutcome('missed') }}>
          {t('calls.outcomeMissed', { defaultValue: 'Missed' })} {missed.length}
        </Chip>
        <Chip active={outcome === 'attended'} onClick={() => { vibrate(6); setOutcome('attended') }}>
          {t('calls.outcomeAttended', { defaultValue: 'Attended' })} {attended.length}
        </Chip>
      </div>

      <div className="space-y-2.5">
        {list.map(l => (
          outcome === 'missed'
            ? <MissedRow key={l.id} lead={l} />
            : <AttendedRow key={l.id} lead={l} call={l.recordKind === 'call' ? callById.get(l.recordId) : null} />
        ))}
        {list.length === 0 && (
          <Card className="!p-6 text-center">
            <div className="m-callout text-white/70">
              {t('leads.emptyTitle', { defaultValue: 'Nothing here' })}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * WHEN IT CAME IN, said once.
 *
 * dayClock() already prefixes the day for anything that is not today ("3 days ago ·
 * 4:31 pm"), so pasting relativeTime() after it produced "3 days ago · 4:31 pm · 3 days
 * ago". Today's calls are the ones that need the relative half — "4:26 pm" alone does
 * not tell you it was five minutes back — and older ones already carry it.
 */
function whenLine(atMs) {
  const clock = dayClock(atMs)
  // The separator is present only when dayClock has prefixed a day.
  return clock.includes('·') ? clock : `${clock} · ${relativeTime(atMs)}`
}

/** Missed: how often they tried, and how long they have been waiting. */
function MissedRow({ lead }) {
  const { t } = useTranslation()
  return (
    <Card className="!p-3.5">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
          style={{ background: 'rgba(220,38,38,.10)', border: '1px solid rgba(220,38,38,.30)' }}
        >
          <PhoneCall size={15} style={{ color: '#DC2626' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* The padlock means "this number is masked". A lead the book has NAMED
                  shows no number, so there is nothing for it to be saying. */}
              {!lead.name && <Lock size={10} className="shrink-0 text-white/45" aria-hidden="true" />}
              <span className="m-headline text-white m-tabular truncate">{lead.name || lead.masked}</span>
            </div>
            {lead.cli != null && <CLIPill score={lead.cli} size="sm" showScore={false} />}
          </div>
          {/* HOW OFTEN — a second and third attempt is the strongest signal on the row. */}
          <div className="m-subhead text-white/55 mt-0.5 inline-flex items-center gap-1">
            <Repeat2 size={11} className="shrink-0" />
            {t('vmn.calledCount', { count: lead.repeats ?? 1, defaultValue: 'Called {{count}}×' })}
          </div>
          {/* HOW LONG AGO — clock time for "when", relative for "how stale". */}
          <div className="m-caption text-white/45 mt-0.5 m-tabular">
            {whenLine(lead.atMs)}
          </div>
        </div>
      </div>
    </Card>
  )
}

const SOURCE_ICON = { call: PhoneIncoming, form: FileText, walk_in: StoreIcon }

/** Attended: how it arrived, how warm it is, and what they wanted. */
function AttendedRow({ lead, call }) {
  const { t } = useTranslation()
  const src = LEAD_SOURCES.find(s => s.id === lead.source)
  const Icon = SOURCE_ICON[lead.source] || PhoneIncoming
  // WHY THEY GOT IN TOUCH. A call that was answered has a spoken reason; a form or a
  // walk-in has no call to have a reason ON, so the category they enquired about is the
  // honest equivalent — it is the same question ("what do they want"), answered by the
  // record that exists. Never the seed's guess on a MISSED call: nobody spoke.
  const reason = call?.callReasonKey
    ? t(call.callReasonKey, { defaultValue: call.callReason })
    : (call?.callReason
      || (lead.category ? t(lead.categoryKey, { defaultValue: lead.category }) : null))

  return (
    <Card className="!p-3.5">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
          style={{ background: 'rgba(34,211,139,.10)', border: '1px solid rgba(34,211,139,.30)' }}
        >
          <Icon size={15} style={{ color: 'var(--si-success-text)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* The padlock means "this number is masked". A lead the book has NAMED
                  shows no number, so there is nothing for it to be saying. */}
              {!lead.name && <Lock size={10} className="shrink-0 text-white/45" aria-hidden="true" />}
              <span className="m-headline text-white m-tabular truncate">{lead.name || lead.masked}</span>
            </div>
            {/* HOW WARM — band only; the score is not the decision on a list like this. */}
            {lead.cli != null && <CLIPill score={lead.cli} size="sm" showScore={false} />}
          </div>

          {/* WHAT THEY WANTED. */}
          {reason && <div className="m-subhead text-white/70 mt-0.5 truncate">{reason}</div>}

          <div className="m-caption text-white/45 mt-1 flex items-center gap-1.5 flex-wrap">
            {/* HOW IT ARRIVED — call, form or walk-in. The whole point of listing leads
                rather than calls: this field only says something when it can vary. */}
            {src && (
              <span
                className="px-1.5 h-5 rounded-md inline-flex items-center gap-1"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
              >
                <Icon size={9} aria-hidden="true" />
                {t(src.labelKey, { defaultValue: src.label })}
              </span>
            )}
            {/* The channel it came through, when we know it (calls only). */}
            {call?.source && <span>{call.source}</span>}
            <span className="m-tabular">{relativeTime(lead.atMs)}</span>
          </div>
        </div>
      </div>
    </Card>
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

function RowCard({ row, rank, metric, drillable, onDrill, onOpen }) {
  const { t } = useTranslation()
  const pct = row[metric]
  // Both boards rank a PROBLEM, so a high number is bad on either. One colour rule for
  // both keeps the reading identical when you switch between them.
  const tone = pct == null ? 'var(--text-tertiary)' : pct >= 50 ? '#DC2626' : pct >= 25 ? '#B45309' : '#15803D'
  const sub = metric === 'missedPct'
    ? t('network.ofCalls', { missed: row.missed, total: row.total, defaultValue: '{{missed}} missed of {{total}} calls' })
    : t('network.ofReviews', { negative: row.negative, total: row.reviews, defaultValue: '{{negative}} negative of {{total}} reviews' })

  return (
    <Card onClick={drillable ? onDrill : onOpen} className="!p-4">
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
