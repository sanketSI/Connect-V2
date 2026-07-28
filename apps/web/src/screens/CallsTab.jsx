// ============================================================
// CALLS — the tab shell.
//
// Owns the three questions the manager opens this screen with, in order:
//   1. how many calls, and how many did we miss?   → callCounts(window)
//   2. why were they calling?                      → callingReasons(window)
//   3. show me them                                → the list, in Missed.jsx
//
// The time window and the filters are the single source of truth for all three: the
// counters, the reason roll-up, the segment badges and the list all read the same
// window, so a number on this screen can never disagree with the rows under it.
//
// AI is on request only (the summary button) — it is not what greets you.
//
// ONE PREDICATE, ONE WINDOW, NAMED EVERYWHERE (audit: "Home says 8 missed, the tab badge
// says 8, Calls says 11 — three figures, never explained"). Two rules hold here now:
//
//   1. Every count on this screen is derived from the SAME selectCalls() call the list
//      runs — window + filters — so the KPI card, the segment badges and the list header
//      move together and cannot contradict each other, filtered or not.
//   2. Every count SAYS which window it is for. A bare "11 missed" is what let this
//      screen and Home disagree without either of them being wrong.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SlidersHorizontal, X, PhoneMissed, PhoneCall,
} from 'lucide-react'
import { LargeTitle } from '../components/TopBar.jsx'
import { IconBtn, Chip, PrimaryButton } from '../components/UI.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import { useTranslation } from 'react-i18next'
import { cn, vibrate } from '../lib/utils.js'
import {
  callCounts, storeLabelOf,
  selectCalls, DEFAULT_CALL_FILTERS, LEAD_BANDS, groupByStore,
  CALL_OUTCOMES, CALL_SENTIMENTS, LEAD_STATUSES, CALL_REASONS, CALL_REASON_KEYS,
  SOURCES, TIME_WINDOWS,
} from '@connect/core'
// The list only. selectCalls / DEFAULT_CALL_FILTERS / LEAD_BANDS used to be imported
// from this screen too — a screen importing a screen for domain rules. They live in
// @connect/core now (packages/core/data/calls.js).
import CallsList from './Missed.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'

/**
 * The windows this screen offers.
 *
 * 'last24h' is the day-to-day question a store manager actually has ("what happened
 * since yesterday?") and is the data layer's DEFAULT_CALL_WINDOW, but it is not in
 * TIME_WINDOWS because that list is the analytics picker. It leads here.
 * 'custom' is dropped: it needs a date-range picker this screen has no idiom for.
 */
const WINDOWS = [
  { id: 'last24h', label: 'Last 24 hours', labelKey: 'window.last24h' },
  ...TIME_WINDOWS.filter(w => w.id !== 'custom'),
]

const OUTCOME_ICONS = { missed: PhoneMissed, attended: PhoneCall }

/**
 * WHICH FILTERS APPLY TO WHICH SEGMENT — PM: "would there be common filters for both
 * missed and attended?"
 *
 * Four of the five are genuinely COMMON: lead status, calling reason, chance to buy and
 * source are fields every record carries whether anyone picked up or not.
 *
 * "How the caller sounded" is NOT. It is read off the call script, and a missed call has
 * no script — which is why the list deliberately refuses to paint a sentiment tag on one
 * (see SentimentTag in Missed.jsx). Offered on the Missed segment it is worse than
 * useless: Positive and Negative can only ever return zero, and Neutral silently means
 * "all" because that is the placeholder value every un-spoken-to record carries. So it is
 * declared attended-only here, drawn visibly disabled on Missed, and dropped from the
 * active set the moment the segment changes — see the effect in CallsTab.
 *
 * DESIGN REVIEW 3, item 9 puts the CALLING REASON in the same category. A reason is read
 * off what the caller actually said, so a missed call — where nobody said anything — can
 * never carry one. Offered on Missed it would empty the list for a reason the screen
 * never shows, so it is attended-only too, and switching to Missed drops it.
 */
const FILTER_SCOPE = { sentiment: 'attended', reason: 'attended' }

/** Filters that cannot say anything true about this segment. */
const inapplicableFilters = (outcome) =>
  Object.keys(FILTER_SCOPE).filter(key => FILTER_SCOPE[key] !== outcome)

export default function CallsTab({ store, onOpenProfile }) {
  const { t } = useTranslation()
  const [win, setWin] = useState('last24h')
  const [outcome, setOutcome] = useState('missed')
  const [filters, setFilters] = useState(DEFAULT_CALL_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  // Bumped by every mutation. The records behind getCalls() are mutated in place, so this
  // is what tells the counters, the badges and the list to read them again.
  const [version, setVersion] = useState(0)
  const bump = () => setVersion(v => v + 1)
  const s = store || {}
  // WHICH BRANCH THIS SCREEN IS ABOUT. A single-store session scopes every selector to
  // its own store; the All-locations view passes nothing (= every store) and instead
  // offers the branch FILTER below, so you can narrow to one branch without leaving the
  // network view. Session scope always wins over the filter.
  const aggregate = !!store?.aggregate
  const scopeId = aggregate
    ? (filters.storeId !== 'all' ? filters.storeId : undefined)
    : store?.id

  const winMeta = WINDOWS.find(w => w.id === win) || WINDOWS[0]
  const winLabel = t(winMeta.labelKey, { defaultValue: winMeta.label })

  // Per-branch counts for the picker: this segment and these filters, but across every
  // branch — deliberately NOT scoped by the branch already chosen, or picking one would
  // zero the others and you could not see where to go next.
  const branchGroups = useMemo(
    () => (aggregate
      ? groupByStore(selectCalls(win, outcome, { ...filters, storeId: 'all' }, undefined))
      : []),
    [aggregate, win, outcome, filters, version],
  )
  const branchTotal = useMemo(
    () => branchGroups.reduce((n, g) => n + g.count, 0),
    [branchGroups],
  )

  const activeFilters = useMemo(() => activeFilterChips(t, filters), [t, filters])
  const filtered = activeFilters.length > 0
  const clearFilters = () => setFilters(DEFAULT_CALL_FILTERS)
  // Whether anything the KPI CARD counts is being narrowed. The card ignores the calling
  // reason (item 8), so a reason on its own must not make it announce "Filtered: 17 of
  // 17" — a reconciliation line that reconciles nothing.
  const kpiFiltered = useMemo(
    () => activeFilterChips(t, { ...filters, reason: 'all' }).length > 0,
    [t, filters],
  )

  /**
   * Switching segment drops any filter that cannot apply to the one you landed on.
   *
   * Disabling the control in the sheet is only half an answer: a sentiment already set on
   * Attended would otherwise ride along into Missed and empty the list with no visible
   * cause. It is not silent either — the filter's chip disappears from the row below in
   * the same frame the segment moves, which is the app already saying "that one is gone".
   */
  useEffect(() => {
    const drop = inapplicableFilters(outcome).filter(k => filters[k] !== 'all')
    if (!drop.length) return
    setFilters(f => ({ ...f, ...Object.fromEntries(drop.map(k => [k, 'all'])) }))
  }, [outcome, filters])

  /**
   * EVERY number on this screen, from one predicate.
   *
   * Each segment's badge is the count IT would show if you tapped it — the same
   * selectCalls() the list runs, so "Missed 0" is a promise the list keeps. The KPI card
   * above then reads off those same two arrays instead of its own callCounts() call:
   * unfiltered they are identical (callCounts = missed + attended over the same window,
   * spam excluded), and FILTERED they no longer disagree — which is the bug, because the
   * card used to say "Missed 11" over a segment that said "Missed 3".
   */
  const shown = useMemo(() => {
    const missed = selectCalls(win, 'missed', filters, scopeId)
    const attended = selectCalls(win, 'attended', filters, scopeId)
    return {
      missed: missed.length,
      attended: attended.length,
      total: missed.length + attended.length,
      // Half of the "8 vs 11" gap: a caller who hung up inside the phone menu never
      // spoke to anyone, so core counts them as missed. Say so rather than let the
      // number look inflated next to a screen that only counts ringing calls.
      ivr: missed.filter(c => c.kind === 'ivr').length,
      // The other half of the trust problem: the tab badge counts missed calls that are
      // STILL OPEN, so it legitimately falls behind this number the moment a lead is
      // marked converted or lost. That is not a disagreement — but it looks like one
      // unless the screen says it, which is what the reconciliation line below does.
      open: missed.filter(c => c.leadStatus === 'open').length,
    }
  }, [win, filters, version, scopeId])

  /**
   * The KPI trio — the same predicate MINUS the calling reason.
   *
   * DESIGN REVIEW 3, item 8: tapping "Price enquiry" used to move Total / Missed /
   * Answered, which reads as "only 9 calls came in" when 17 did. Those three answer "how
   * much came in during this window", and a reason chip does not change that — it narrows
   * WHICH ANSWERED CALLS you are looking at. So the card counts with the reason stripped
   * out, while the segment badges and the list below keep every filter (a badge has to
   * stay a promise the list keeps).
   */
  const kpi = useMemo(() => {
    const bare = { ...filters, reason: 'all' }
    const missed = selectCalls(win, 'missed', bare, scopeId)
    const attended = selectCalls(win, 'attended', bare, scopeId)
    return {
      missed: missed.length,
      attended: attended.length,
      total: missed.length + attended.length,
      ivr: missed.filter(c => c.kind === 'ivr').length,
      open: missed.filter(c => c.leadStatus === 'open').length,
    }
  }, [win, filters, version, scopeId])

  const badges = { missed: shown.missed, attended: shown.attended }
  // The window's UNFILTERED total — the denominator the KPI card shows when a filter is
  // narrowing things.
  const windowTotal = useMemo(() => callCounts(win, { storeId: scopeId }).total, [win, version, scopeId])

  const segments = CALL_OUTCOMES.map(o => ({
    id: o.id,
    label: t(o.labelKey, { defaultValue: o.label }),
    Icon: OUTCOME_ICONS[o.id],
    badge: badges[o.id],
  }))

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      <LargeTitle
        title={t('vmn.title', { defaultValue: 'Calls' })}
        sub={t('vmn.subtitleSimple', {
          defaultValue: 'Virtual number · {{branch}}',
          // "All locations" is only true while it IS all of them. With a branch chosen
          // in the picker below, the header has to say the same thing the picker does.
          branch: store?.aggregate
            ? (scopeId
                ? (storeLabelOf(scopeId) || t('stores.allLocations', { defaultValue: 'All locations' }))
                : t('stores.allLocations', { defaultValue: 'All locations' }))
            : (s.branch || t('vmn.yourStoreFallback', { defaultValue: 'your store' })),
        })}
        right={
          <div className="flex items-center gap-2">
            <NotificationBell />
            {/* ONE entry point for narrowing this screen: the time period and the current
                segment's own filters now live in the same sheet (design review 3, item
                10). Lit whenever either of them is doing something. */}
            <DotBtn
              icon={SlidersHorizontal}
              label={t('calls.filtersTitle', { defaultValue: 'Filters' })}
              active={filtered || win !== 'last24h'}
              onClick={() => { vibrate(6); setFilterOpen(true) }}
            />
            <ProfileButton onClick={onOpenProfile} />
          </div>
        }
      />

      <div className="px-4">
        <SummaryCard
          counts={kpi}
          windowTotal={windowTotal}
          filtered={kpiFiltered}
          winLabel={winLabel}
        />

        {/* WHICH BRANCH — cumulative view only, and ABOVE the segment: it chooses the
            set of calls, Missed/Attended then splits whatever it chose. It writes the
            same filters.storeId the sheet used to own, so there is one setting and one
            place to change it. */}
        {aggregate && (
          <div className="mt-4">
            <LocationPicker
              value={filters.storeId}
              onChange={(id) => setFilters(prev => ({ ...prev, storeId: id }))}
              groups={branchGroups}
              total={branchTotal}
            />
          </div>
        )}

        <div className="mt-4 mb-3">
          <Segmented value={outcome} onChange={setOutcome} segments={segments} />
        </div>

        {/* What is currently narrowing the list, and how to undo it. */}
        <AnimatePresence initial={false}>
          {filtered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
                {activeFilters.map(f => (
                  <Chip key={f.key} active onClick={() => setFilters(prev => ({ ...prev, [f.key]: 'all' }))}>
                    {f.label} <X size={11} />
                  </Chip>
                ))}
                <Chip onClick={clearFilters}>{t('calls.clearFilters', { defaultValue: 'Clear filters' })}</Chip>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={outcome}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="px-4"
        >
          <CallsList
            embedded
            win={win}
            winLabel={winLabel}
            outcome={outcome}
            filters={filters}
            version={version}
            storeId={scopeId}
            aggregate={aggregate}
            onMutate={bump}
            onClearFilters={filtered ? clearFilters : undefined}
            store={store}
          />
        </motion.div>
      </AnimatePresence>

      {/* ONE combined filter (design review 3, item 10). The time period is COMMON to both
          segments and leads the sheet; everything under it is scoped to the segment you
          are on, which the sheet names. The separate time button is gone — two filter
          entry points for one list was exactly what the review objected to. */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} fullHeight label={t('calls.filtersTitle', { defaultValue: 'Filters' })}>
        <FilterSheet
          filters={filters}
          setFilters={setFilters}
          onClear={clearFilters}
          onApply={() => setFilterOpen(false)}
          count={badges[outcome]}
          outcome={outcome}
          outcomeLabel={segments.find(s => s.id === outcome)?.label || outcome}
          aggregate={aggregate}
          win={win}
          setWin={setWin}
          /* What you would actually SEE at that window — current filters included, since
             they survive the switch. A preview that ignored them would be one more
             number on this screen contradicting the others. */
          windowCount={id => selectCalls(id, 'missed', filters, scopeId).length + selectCalls(id, 'attended', filters, scopeId).length}
        />
      </BottomSheet>
    </div>
  )
}

/** An IconBtn that can say "there is something switched on behind me". */
function DotBtn({ icon, label, active, onClick }) {
  return (
    <span className="relative inline-flex">
      <IconBtn icon={icon} label={label} onClick={onClick} />
      {active && (
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
          style={{ background: '#0070FC', border: '2px solid var(--bg-screen)' }}
        />
      )}
    </span>
  )
}

/* ============================================================
 * THE SUMMARY SECTION — PM: "combine 'why people called' in the summary section".
 *
 * It used to be two cards stacked on each other: a KPI card (three counts + the on-request
 * AI paragraph) and, right under it, a second card repeating the same window caption to
 * introduce the reason bars. Two headers, two window labels, two glass surfaces — for one
 * question with two halves ("how many, and why?").
 *
 * ONE BLOCK NOW, top to bottom in the order the manager reads it:
 *   window control + AI-summary button   ← what all the numbers are for, and the way to
 *                                          get the paragraph if he wants one
 *   total / missed / answered            ← how many
 *   the reconciliation line              ← what those three numbers actually mean
 *   the AI paragraph, when asked for     ← inside the block, not floating under it
 *   why people called                    ← the same window, so no second caption needed
 *
 * The bars stay the picker for the reason filter, and keep their ≥44px hit area.
 * ============================================================ */
function SummaryCard({ counts, windowTotal, filtered, winLabel }) {
  const { t } = useTranslation()

  const stats = [
    { key: 'total', value: counts.total, label: t('calls.statTotal', { defaultValue: 'Total calls' }), color: 'var(--text-primary)' },
    { key: 'missed', value: counts.missed, label: t('calls.statMissed', { defaultValue: 'Missed' }), color: '#DC2626' },
    { key: 'answered', value: counts.attended, label: t('calls.statAnswered', { defaultValue: 'Answered' }), color: 'var(--si-success-text)' },
  ]

  return (
    <div className="rounded-2xl p-3.5 glass">
      <div>
        {/* No window control in here. The header's Filters button is the ONE entry point
            for narrowing this screen, and it lights up whenever the period is off its
            default — so the card is just the numbers. `winLabel` stays because the
            footnote below still has to name the period it is talking about. */}
        <div className="grid grid-cols-3">
          {stats.map((st, i) => (
            <div key={st.key} className={cn('text-center', i > 0 && 'border-l')} style={i > 0 ? { borderColor: 'var(--border-glass)' } : undefined}>
              <div className="m-title1 m-tabular" style={{ color: st.color }}>{st.value}</div>
              <div className="m-caption text-white/55 mt-0.5">{st.label}</div>
            </div>
          ))}
        </div>

        {/* Only the facts a manager CANNOT read off the time filter: that a filter is
            narrowing the list, that Missed folds in IVR hang-ups, and that the tab badge
            counts just the still-open ones. The bare "every count is for <window>"
            restatement was removed (design review 3, item 6) — the time control above
            already states the window, so repeating it under every data point is noise.
            Renders nothing at all when none of the three apply. */}
        {(() => {
          const parts = []
          if (filtered) {
            parts.push(t('calls.countsFilteredNote', {
              defaultValue: 'Filtered: {{shown}} of {{total}} calls in {{window}}.',
              shown: counts.total,
              total: windowTotal,
              window: winLabel,
            }))
          }
          if (counts.ivr > 0) {
            parts.push(t('calls.missedIncludesIvr', {
              defaultValue_one: 'Missed includes {{count}} caller who hung up in the phone menu.',
              defaultValue_other: 'Missed includes {{count}} callers who hung up in the phone menu.',
              count: counts.ivr,
            }))
          }
          if (counts.open !== counts.missed) {
            parts.push(t('calls.missedStillOpen', {
              defaultValue_one: '{{count}} is still open — that is the number on the Calls tab.',
              defaultValue_other: '{{count}} are still open — that is the number on the Calls tab.',
              count: counts.open,
            }))
          }
          if (!parts.length) return null
          return (
            <div className="mt-3 pt-2.5 m-caption text-white/45" style={{ borderTop: '1px solid var(--border-glass)' }}>
              {parts.join(' ')}
            </div>
          )
        })()}
      </div>

    </div>
  )
}

/* ------- PM 5 + 11: the filters that replaced the search icon ------- */
function FilterSheet({
  filters, setFilters, onClear, onApply, count, outcome, outcomeLabel,
  aggregate, win, setWin, windowCount,
}) {
  const { t } = useTranslation()
  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }))
  // PM: "would there be common filters for both missed and attended?" — answered on the
  // sheet itself. See FILTER_SCOPE at the top of this file for the reasoning.
  const sentimentApplies = FILTER_SCOPE.sentiment === outcome
  // Design review 3, item 9: a calling reason is read off what the caller actually said,
  // so it can only ever narrow calls somebody answered.
  const reasonApplies = FILTER_SCOPE.reason === outcome

  return (
    // pt-5 clears the sheet's own close button — "Clear filters" sits top-right, under it.
    <div className="px-4 pb-6 pt-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="m-title2 text-white">{t('calls.filtersTitle', { defaultValue: 'Filters' })}</div>
          {/* The sheet NAMES the segment it is narrowing. Without it, "Filters" over a
              sheet that behaves differently on each tab is the whole confusion. */}
          <div className="m-callout text-white/55">
            {t('calls.filtersSubSegment', {
              defaultValue: 'Narrowing the {{segment}} list',
              segment: outcomeLabel,
            })}
          </div>
        </div>
        <Chip onClick={onClear}>{t('calls.clearFilters', { defaultValue: 'Clear filters' })}</Chip>
      </div>

      <div className="mt-2 m-caption text-white/40">
        {t('calls.filtersSharedNote', {
          defaultValue: 'Time period, lead status, chance to buy and source apply to both Missed and Attended.',
        })}
      </div>

      {/* Branch is NOT here any more. It moved to the picker on the screen itself,
          where you can see which branch you are in without opening anything — the same
          reason the window chip came off this sheet's card. Two controls for one
          setting is how they start disagreeing. */}

      {/* TIME PERIOD — the one control common to BOTH segments, so it leads the sheet
          (design review 3, item 10). It used to be a second button in the header; one
          list deserves one place you go to narrow it. */}
      <FilterGroup title={t('calls.timeTitle', { defaultValue: 'Time period' })}>
        <div className="w-full space-y-2">
          {WINDOWS.map(w => {
            const on = win === w.id
            return (
              <button
                key={w.id}
                onClick={() => { vibrate(6); setWin(w.id) }}
                aria-pressed={on}
                className="w-full h-12 px-3.5 rounded-xl flex items-center justify-between gap-2 press md-state"
                style={{
                  background: on ? 'rgba(0,112,252,.12)' : 'var(--bg-subtle)',
                  border: `1px solid ${on ? 'rgba(0,112,252,.45)' : 'var(--border-glass)'}`,
                }}
              >
                <span className="m-headline" style={{ color: on ? 'var(--si-primary-text)' : 'var(--text-primary)' }}>
                  {t(w.labelKey, { defaultValue: w.label })}
                </span>
                <span className="m-subhead text-white/45 m-tabular">
                  {t('calls.listCount', {
                    defaultValue_one: '{{count}} call',
                    defaultValue_other: '{{count}} calls',
                    count: windowCount(w.id),
                  })}
                </span>
              </button>
            )
          })}
        </div>
      </FilterGroup>

      {/* PM 11 — reach the unhappy callers first. "Call sentiment" is analyst-speak;
          the question a shop owner is actually asking is how the caller sounded.
          ATTENDED ONLY, and visibly so: on Missed the chips are drawn dead rather than
          quietly handed over to return zero rows. */}
      <FilterGroup
        title={t('calls.filterCallerMood', { defaultValue: 'How the caller sounded' })}
        disabled={!sentimentApplies}
        badge={!sentimentApplies ? t('calls.filterAttendedOnly', { defaultValue: 'Attended only' }) : null}
      >
        <Chip active={filters.sentiment === 'all'} onClick={sentimentApplies ? () => set('sentiment', 'all') : undefined}>
          {t('common.all', { defaultValue: 'All' })}
        </Chip>
        {CALL_SENTIMENTS.map(s => (
          <Chip
            key={s.id}
            active={filters.sentiment === s.id}
            onClick={sentimentApplies ? () => set('sentiment', s.id) : undefined}
          >
            {t(s.labelKey, { defaultValue: s.label })}
          </Chip>
        ))}
      </FilterGroup>
      <div className="m-caption text-white/40 -mt-3 mb-4">
        {sentimentApplies
          ? t('calls.filterSentimentNote', { defaultValue: 'Read from the call script — only answered calls have one.' })
          : t('calls.filterSentimentOffNote', {
            defaultValue: 'Nobody spoke to a missed caller, so there is no tone to filter on. Switch to Attended to use this.',
          })}
      </div>

      <FilterGroup title={t('calls.leadStatusTitle', { defaultValue: 'Lead status' })}>
        <Chip active={filters.leadStatus === 'all'} onClick={() => set('leadStatus', 'all')}>
          {t('common.all', { defaultValue: 'All' })}
        </Chip>
        {LEAD_STATUSES.map(s => (
          <Chip key={s.id} active={filters.leadStatus === s.id} onClick={() => set('leadStatus', s.id)}>
            {t(s.labelKey, { defaultValue: s.label })}
          </Chip>
        ))}
      </FilterGroup>

      {/* ATTENDED ONLY (design review 3, item 9) — nobody said anything on a missed call,
          so there is no reason to filter by. Drawn dead on Missed for the same reason the
          sentiment group is, rather than quietly returning zero rows. */}
      <FilterGroup
        title={t('calls.filterReason', { defaultValue: 'Calling reason' })}
        disabled={!reasonApplies}
        badge={!reasonApplies ? t('calls.filterAttendedOnly', { defaultValue: 'Attended only' }) : null}
      >
        <Chip active={filters.reason === 'all'} onClick={reasonApplies ? () => set('reason', 'all') : undefined}>
          {t('common.all', { defaultValue: 'All' })}
        </Chip>
        {CALL_REASONS.map(r => (
          <Chip key={r} active={filters.reason === r} onClick={reasonApplies ? () => set('reason', r) : undefined}>
            {t(CALL_REASON_KEYS[r], { defaultValue: r })}
          </Chip>
        ))}
      </FilterGroup>

      {/* Hot / Warm / Cool / Cold are bands of the chance-to-buy score. "Lead type" said
          nothing about what sorts them; the app's own phrase for the score does. */}
      <FilterGroup title={t('calls.filterChanceToBuy', { defaultValue: 'Chance to buy' })}>
        <Chip active={filters.band === 'all'} onClick={() => set('band', 'all')}>
          {t('common.all', { defaultValue: 'All' })}
        </Chip>
        {LEAD_BANDS.map(b => (
          <Chip key={b.id} active={filters.band === b.id} onClick={() => set('band', b.id)}>
            {t(b.labelKey, { defaultValue: b.label })}
          </Chip>
        ))}
      </FilterGroup>

      {/* Source names (Google, Justdial, Times of India…) are business names, not copy —
          they stay as they are in every language. */}
      <FilterGroup title={t('vmn.filterSource', { defaultValue: 'Source' })}>
        <Chip active={filters.source === 'all'} onClick={() => set('source', 'all')}>
          {t('vmn.allSources', { defaultValue: 'All sources' })}
        </Chip>
        {Object.keys(SOURCES).map(src => (
          <Chip key={src} active={filters.source === src} onClick={() => set('source', src)} dot={SOURCES[src].dot}>{src}</Chip>
        ))}
      </FilterGroup>

      <PrimaryButton onClick={onApply}>
        {t('calls.showCount', {
          defaultValue_one: 'Show {{count}} call',
          defaultValue_other: 'Show {{count}} calls',
          count,
        })}
      </PrimaryButton>
    </div>
  )
}

/**
 * `disabled` draws the group as unusable rather than hiding it — the manager still learns
 * the filter exists and which segment it belongs to, which is the actual answer to "are
 * the filters common?". `aria-disabled` + pointer-events-none, so a screen reader says so
 * too and a tap does nothing.
 */
function FilterGroup({ title, children, disabled, badge }) {
  return (
    <div className={cn('mt-4 mb-4', disabled && 'opacity-40')} aria-disabled={disabled || undefined}>
      <div className="m-subhead text-white/55 mb-2 flex items-center gap-2 flex-wrap">
        <span>{title}</span>
        {badge && (
          <span
            className="m-caption px-2 h-5 rounded-full inline-flex items-center"
            style={{ background: 'var(--bg-subtle-strong)', color: 'var(--text-tertiary)', border: '1px solid var(--border-glass)' }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className={cn('flex flex-wrap gap-2', disabled && 'pointer-events-none')}>{children}</div>
    </div>
  )
}

/** The filters currently narrowing the list, as removable chips. */
function activeFilterChips(t, filters) {
  // Branch is deliberately absent: it has its own control on the screen, which is
  // always visible and already says which branch. Repeating it as a removable chip
  // would put the same setting in two places again — and `filtered` drives the
  // "Filtered: N of M" note, which should not fire just because you are looking at
  // one branch of the network.
  const out = []
  if (filters.sentiment !== 'all') {
    const m = CALL_SENTIMENTS.find(s => s.id === filters.sentiment)
    out.push({ key: 'sentiment', label: t(m.labelKey, { defaultValue: m.label }) })
  }
  if (filters.leadStatus !== 'all') {
    const m = LEAD_STATUSES.find(s => s.id === filters.leadStatus)
    out.push({ key: 'leadStatus', label: t(m.labelKey, { defaultValue: m.label }) })
  }
  if (filters.reason !== 'all') {
    out.push({ key: 'reason', label: t(CALL_REASON_KEYS[filters.reason], { defaultValue: filters.reason }) })
  }
  if (filters.band !== 'all') {
    const m = LEAD_BANDS.find(b => b.id === filters.band)
    out.push({ key: 'band', label: t(m.labelKey, { defaultValue: m.label }) })
  }
  if (filters.source !== 'all') out.push({ key: 'source', label: filters.source })
  return out
}

/* ------- Segmented control — PM 15: exactly two ------- */
function Segmented({ value, onChange, segments }) {
  const activeIdx = segments.findIndex(s => s.id === value)
  const n = segments.length
  return (
    <div
      className="relative h-11 rounded-2xl p-1 grid gap-0"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      <motion.div
        className="absolute top-1 bottom-1 rounded-xl"
        animate={{ left: `calc(${(activeIdx * 100) / n}% + 4px)` }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        style={{ width: `calc(${100 / n}% - 8px)`, background: '#0070FC', boxShadow: '0 4px 14px rgba(0,112,252,.35)' }}
      />
      {segments.map(s => {
        const active = value === s.id
        const Icon = s.Icon
        return (
          <button
            key={s.id}
            onClick={() => { vibrate(6); onChange(s.id) }}
            /* The 44px-tall track leaves each button only ~34px after the p-1 inset — under
               the touch floor. min-h lifts the hit box to 44px and -my-1 pulls that back
               into the padding so the track height and the 36px thumb are untouched. */
            className="relative z-10 min-w-0 px-1 min-h-[var(--m-touch-min)] -my-1 m-subhead font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap press"
            style={{ color: active ? '#fff' : 'var(--text-secondary)' }}
          >
            {Icon && <Icon size={14} className="shrink-0" />}
            <span className="truncate">{s.label}</span>
            <span
              className="shrink-0 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold inline-flex items-center justify-center px-1 m-tabular"
              style={{ background: active ? 'rgba(255,255,255,.25)' : 'var(--bg-subtle-strong)', color: active ? '#fff' : 'var(--text-tertiary)' }}
            >
              {s.badge}
            </span>
          </button>
        )
      })}
    </div>
  )
}
