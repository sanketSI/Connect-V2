import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star, Sparkles, Send, MessageCircle, Copy, Link as LinkIcon,
  Trophy, Check, SlidersHorizontal, CalendarRange, X,
  Trash2, Pencil, EyeOff, RotateCcw, Info, Inbox as InboxIcon, Bot, ChevronRight, AlertTriangle,
} from 'lucide-react'
import { LargeTitle } from '../components/TopBar.jsx'
import ScopePill from '../components/ScopePill.jsx'
import TimeFilterSheet from '../components/TimeFilterSheet.jsx'
import { FEATURES } from '../lib/features.js'
import { Card, AICard, AIBadge, Chip, PrimaryButton, GhostButton, Avatar, IconBtn, AIShimmer, SourceChip, StoreBadge, StoreGroupHeader } from '../components/UI.jsx'
import ScreenScroll from '../components/ScreenScroll.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import {
  getReviewLeaderboard, getCurrentUser, getReviewById, getReviewReplies,
  updateReviewReply, deleteReviewReply, reportReview, unreportReview,
  filterReviews, reviewMetrics, canPublishReply, reviewTag, askAI, postReviewReply,
  relativeTime, dayClock, calendarDate, dataStore, emitChange,
  reviewsWaitingCount, storeReviewLink, groupByStore, CANONICAL_REVIEW_WINDOW,
  REVIEW_SENTIMENTS, REVIEW_RATING_TYPES, REVIEW_STATUSES, REVIEW_TAGS, PUBLISHING_PLATFORMS,
  DEFAULT_REVIEW_FILTERS, TIME_WINDOWS,
} from '@connect/core'
import { altLanguage } from '@connect/core/i18n/languages.js'
import { vibrate, cn } from '../lib/utils.js'
import { useToast } from '../components/Toast.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'

const REVIEW_LEADERBOARD = getReviewLeaderboard()
const PRIMARY_USER = getCurrentUser()
const STORE = PRIMARY_USER.store

// PM: "Remove 'generate', we will not be having different forms of messages for now. Add
// Review link." The Generate tab — a per-customer form that asked the AI to write a
// DIFFERENT request message every time — is gone, along with its message-template flow.
// What replaced it is the store's ONE link: the same one, every time, ready to copy or
// hand to WhatsApp. (Per-customer links still exist, on the Customers screen, where the
// customer is already on screen and the link can be attributed to them.)
//
// `label` alongside `labelKey`: t() here has no room for an inline defaultValue, and a key
// the catalog has not landed yet must not render as "reviews.reviewLink" on the tab.
const ALL_TABS = [
  { id: 'inbox', label: 'Inbox', labelKey: 'reviews.inbox', icon: Star },
  { id: 'link', label: 'Review link', labelKey: 'reviews.reviewLink', icon: LinkIcon },
  { id: 'leaderboard', label: 'Leaderboard', labelKey: 'reviews.leaderboard', icon: Trophy },
]

const STAR_MIN = 1
const STAR_MAX = 5

export default function Reviews({ role, store, onOpenProfile, onSwitchStore }) {
  // PULL TO REFRESH — re-derive from the store every selector here reads. The short
  // await is not theatre: a spinner that vanishes in the same frame reads as a control
  // that did nothing.
  const refresh = useCallback(async () => {
    emitChange()
    await new Promise(r => setTimeout(r, 450))
  }, [])
  const { t } = useTranslation()
  // Leaderboard is a brand / roll-up feature — hidden for a single or multi-store manager.
  const isBrand = ['cluster', 'city', 'regional', 'state', 'head'].includes(role)
  const tabs = useMemo(
    () => ALL_TABS.filter(tb => tb.id !== 'leaderboard' || isBrand),
    [isBrand],
  )
  const [tab, setTab] = useState('inbox')

  // If the role drops below brand while Leaderboard is active, fall back to Inbox.
  useEffect(() => {
    if (tab === 'leaderboard' && !isBrand) setTab('inbox')
  }, [isBrand, tab])

  return (
    <ScreenScroll onRefresh={refresh}>
      <LargeTitle
        title={t('reviews.title')}
        // Plain shop-floor language, not the desktop analyst subtitle this replaced
        // ("First-party data · sentiment · response time" — reviews.subtitle).
        sub={t('reviews.subtitlePlain', {
          defaultValue: 'What customers are saying, and how fast you reply',
        })}
        right={<div className="flex items-center"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>}
      />
      <div className="px-4">
        <div className="flex items-center gap-2 mb-3">
          {tabs.map(tb => (
            <Chip key={tb.id} active={tab === tb.id} onClick={() => setTab(tb.id)} icon={tb.icon}>
              {t(tb.labelKey, { defaultValue: tb.label })}
            </Chip>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'inbox' && <motion.div key="inbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Inbox store={store} onSwitchStore={onSwitchStore} /></motion.div>}
          {tab === 'link' && <motion.div key="link" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><ReviewLink /></motion.div>}
          {tab === 'leaderboard' && <motion.div key="leaderboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Leaderboard /></motion.div>}
        </AnimatePresence>
      </div>
    </ScreenScroll>
  )
}

// ============================================================
// SHARED HELPERS
// ============================================================

/**
 * Review records carry the platform's DISPLAY name ('Google', 'Justdial'); replies carry a
 * PUBLISHING_PLATFORMS id ('gbp', 'justdial'). Bridge the two so we can ask the data layer
 * canPublishReply() about the review we are looking at.
 */
function platformIdFor(source) {
  if (!source) return null
  const s = String(source).toLowerCase()
  const hit = PUBLISHING_PLATFORMS.find(p =>
    p.id === s
    || p.short.toLowerCase() === s
    || p.label.toLowerCase() === s
    || p.label.toLowerCase().startsWith(s),
  )
  return hit?.id || null
}

/** t() a PUBLISHING_PLATFORMS id to its localised label. */
function usePlatformLabel() {
  const { t } = useTranslation()
  return (id) => {
    const p = PUBLISHING_PLATFORMS.find(x => x.id === id)
    return p ? t(p.labelKey, { defaultValue: p.label }) : id
  }
}

/** Where a reply was published. SourceChip is the app's themed chip for naming a source. */
function PlatformChip({ id }) {
  const label = usePlatformLabel()(id)
  return <SourceChip src={id} sources={{ [id]: { label, dot: '#0070FC', text: '#9DC2FF' } }} />
}

/** reviewMetrics() hands us raw ms — pick the unit a human would say it in. */
function useDuration() {
  const { t } = useTranslation()
  return (ms) => {
    if (ms == null) return '—'
    const mins = Math.round(ms / 60e3)
    if (mins < 60) return t('reviews.durMin', { count: mins, defaultValue: '{{count}} min' })
    const hrs = ms / 3600e3
    if (hrs < 48) return t('reviews.durHr', { count: Math.round(hrs), defaultValue: '{{count}} hr' })
    return t('reviews.durDay', { count: Math.round(ms / 864e5), defaultValue: '{{count}} days' })
  }
}

/** The label for anything resolveWindow() takes — a preset id or a custom {startMs,endMs}. */
function useWindowLabel() {
  const { t } = useTranslation()
  return (win) => {
    if (typeof win === 'string') {
      const w = TIME_WINDOWS.find(x => x.id === win)
      return w ? t(w.labelKey, { defaultValue: w.label }) : win
    }
    if (win?.startMs != null && win?.endMs != null) {
      return `${calendarDate(win.startMs)} – ${calendarDate(win.endMs)}`
    }
    return t('window.all', { defaultValue: 'All time' })
  }
}

/**
 * The filters currently narrowing the list, as removable chips — the same pattern the
 * Calls screen uses, for the same reason: applying a filter from a sheet that then closes
 * leaves no trace on screen, so a shorter list reads as a broken one.
 *
 * Each chip carries the `patch` that UNDOES just itself, so removing one filter never
 * disturbs the others (and never touches the window, which has its own chip).
 * Window is excluded throughout — same reason.
 */
function activeFilterChips(t, f) {
  const out = []
  const pick = (list, id) => list.find(o => o.id === id)

  if (f.rating.min !== STAR_MIN || f.rating.max !== STAR_MAX) {
    out.push({
      key: 'rating',
      label: t('reviews.chipRating', { min: f.rating.min, max: f.rating.max, defaultValue: '{{min}}★–{{max}}★' }),
      patch: { rating: { min: STAR_MIN, max: STAR_MAX } },
    })
  }
  if (f.sentiment !== 'all') {
    const o = pick(REVIEW_SENTIMENTS, f.sentiment)
    out.push({ key: 'sentiment', label: t(o.labelKey, { defaultValue: o.label }), patch: { sentiment: 'all' } })
  }
  if (f.ratingType !== 'both') {
    const o = pick(REVIEW_RATING_TYPES, f.ratingType)
    out.push({ key: 'ratingType', label: t(o.labelKey, { defaultValue: o.label }), patch: { ratingType: 'both' } })
  }
  if (f.status !== 'both') {
    const o = pick(REVIEW_STATUSES, f.status)
    out.push({ key: 'status', label: t(o.labelKey, { defaultValue: o.label }), patch: { status: 'both' } })
  }
  if (f.showRemoved) {
    out.push({ key: 'showRemoved', label: t('reviews.removedFlag', { defaultValue: 'Removed from Google' }), patch: { showRemoved: false } })
  }
  if (f.editedOnly) {
    out.push({ key: 'editedOnly', label: t('reviews.editedOnly', { defaultValue: 'Edited reviews' }), patch: { editedOnly: false } })
  }
  for (const id of f.tags) {
    const tag = reviewTag(id)
    out.push({
      key: `tag-${id}`,
      label: tag ? t(tag.labelKey, { defaultValue: tag.label }) : id,
      patch: { tags: f.tags.filter(x => x !== id) },
    })
  }
  return out
}

// The date helpers and the period sheet moved to components/TimeFilterSheet.jsx when
// Leads needed the same control — see the note there.

// ============================================================
// INBOX
// ============================================================

function Inbox({ store, onSwitchStore }) {
  const { t } = useTranslation()
  const windowLabel = useWindowLabel()
  const dur = useDuration()

  const [filters, setFilters] = useState(DEFAULT_REVIEW_FILTERS)
  const [selectedId, setSelectedId] = useState(null)
  const [filterSheet, setFilterSheet] = useState(false)
  const [timeSheet, setTimeSheet] = useState(false)
  const [pitch, setPitch] = useState(false)

  // postReviewReply() mutates the shared review record in place, which React cannot see.
  // This is the subscription that tells every derived read below to run again — and it is
  // why a posted reply survives leaving this tab: the reply lives in the data layer now,
  // not in this component's state.
  const version = useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot)

  // WHICH BRANCH'S REVIEWS. A single-store session sees only its own listing's reviews;
  // All-locations passes nothing, which the data layer reads as every store. Folded into
  // the filter object once, so every number on this screen — metrics, mix, list and the
  // denominator — describes the same set by construction.
  const aggregate = !!store?.aggregate
  const scopeId = aggregate ? undefined : store?.id
  const scoped = useMemo(() => ({ ...filters, storeId: scopeId }), [filters, scopeId])

  const metrics = useMemo(() => reviewMetrics(scoped), [scoped, version])

  // The sentiment mix over the SAME set reviewMetrics() describes, so every number on the
  // header card is talking about the same reviews. `sentiment` is the data layer's own
  // derivation (sentimentForRating) — already resolved onto each record.
  const mix = useMemo(() => {
    const set = filterReviews(scoped)
    if (!set.length) return null
    const c = { positive: 0, neutral: 0, negative: 0 }
    set.forEach(r => { c[r.sentiment] += 1 })
    return {
      positive: Math.round((c.positive / set.length) * 100),
      neutral: Math.round((c.neutral / set.length) * 100),
      negative: Math.round((c.negative / set.length) * 100),
    }
  }, [scoped, version])

  // filterReviews() is the SOLE authority over which reviews show — status included — so the
  // count on the metrics card always describes exactly the rows underneath it, and a reply
  // posted through postReviewReply() is visible to both at the same instant.
  const list = useMemo(() => filterReviews(scoped), [scoped, version])

  // One group per listing in the cumulative view; a single unlabelled group otherwise,
  // so the markup below has one shape. After `list`, which it reads.
  //
  // Grouped BEFORE the branch filter: the picker reads its counts off this, and a
  // filtered grouping would show every other branch as 0.
  const allGroups = useMemo(
    () => (aggregate ? groupByStore(list) : [{ storeId: null, label: null, count: list.length, items: list }]),
    [aggregate, list],
  )
  // No screen-local branch filter any more: the SCOPE PILL above is the one location
  // control and it narrows `list` at source, through assignedStoreIds(). Filtering a
  // second time here would mean this screen could disagree with the pill's own label.
  const groups = allGroups

  // How many reviews the WINDOW holds before the other filters narrow it — the denominator
  // in "showing 3 of 16", so the shortened list is accounted for rather than just short.
  //
  // `showRemoved` rides along deliberately. It is not a narrowing filter like the others,
  // it WIDENS the set — and leaving it off the denominator printed "Showing 17 of 16
  // reviews", a numerator larger than its own total.
  const windowTotal = useMemo(
    () => filterReviews({ window: filters.window, showRemoved: filters.showRemoved, storeId: scopeId }).length,
    [filters.window, filters.showRemoved, version, scopeId],
  )

  // ── THE ONE "WAITING FOR A REPLY" NUMBER ─────────────────────────────────
  // Audit: one session showed four figures for this single fact — Home said 4, the tab
  // badge said 2, the AI summary said "ten", the response-time tile implied ten. Two of
  // them were simply wrong; the other two were right about DIFFERENT windows and neither
  // said so. CallsTab.jsx fixed the equivalent problem with two rules, and they apply here
  // unchanged:
  //
  //   1. ONE PREDICATE. `waiting` below is counted off `list` — the very array rendered
  //      underneath — using the data layer's own `responded` flag (derived once, in
  //      replyMirrors(), from the live reply list). So the headline number and the rows
  //      can never disagree, filtered or not, and a reply posted in the sheet moves both
  //      in the same render.
  //   2. EVERY COUNT NAMES ITS WINDOW. The reconciliation line under the stats does that,
  //      and prints the badge's own number whenever the two legitimately differ.
  //
  // THE CANONICAL DEFINITION (reviewsWaitingCount() in packages/core/data/reviews.js, and
  // what Home and the tab badge both call): a review is waiting for a reply when it is
  // LIVE ON THE LISTING (Google has not removed it) and carries NO reply we have not since
  // deleted — measured over CANONICAL_REVIEW_WINDOW, the last 30 days, which is the window
  // this screen opens on.
  // `!r.removed` is not redundant: the "Show removed from Google" filter puts taken-down
  // reviews INTO `list`, and one of them is unreplied. Counting it would push this stat to
  // 11 while the sentence directly beneath still read "live on your listing with no reply
  // posted" — and the detail sheet for that very review says there is nothing to reply to.
  // Holding the predicate identical to reviewsWaitingCount()'s means this figure only ever
  // moves because the manager changed the WINDOW or narrowed the set, never because he
  // asked to look at reviews that are not on the listing.
  const waiting = useMemo(() => list.filter(r => !r.responded && !r.removed).length, [list])
  // What the tab badge and Home show. Identical to `waiting` on an untouched screen; it
  // diverges the moment the manager changes the window or a filter, which is exactly when
  // the line below has to explain itself.
  // Scoped exactly as the tab badge is (App.jsx passes the same scopeId): unscoped,
  // this counted every branch's unreplied reviews and the sentence below told a
  // single-branch manager his badge read 15 while the badge — and the figure directly
  // above it — both said 10.
  const canonicalWaiting = useMemo(() => reviewsWaitingCount(undefined, scopeId), [version, scopeId])
  const canonicalWindowLabel = t(`window.${CANONICAL_REVIEW_WINDOW}`)

  // Resolved off the id, not the list, so the detail sheet survives its review dropping out
  // of the filtered list the moment you reply to it (with `status: 'unreplied'` on, it does).
  const selected = useMemo(() => (selectedId ? getReviewById(selectedId) : null), [selectedId, version])


  const chips = useMemo(() => activeFilterChips(t, filters), [t, filters])
  const nActive = chips.length
  const clearFilters = () => setFilters(f => ({ ...DEFAULT_REVIEW_FILTERS, window: f.window }))

  return (
    <>
      {/* Scope controls — everything below is scoped by these. The branch picker leads:
          it chooses WHICH listings are in play, and the period and filters then narrow
          whatever it selected. (On Customers the picker sits on its own line instead,
          because that screen's chip row is value filters, not scope.) */}
      <div className="flex items-center gap-2 mb-2.5 overflow-x-auto no-scrollbar">
        {/* ALWAYS, never gated on `aggregate`. This is the GLOBAL switcher, and a
            control that disappears once you narrow to one store is a control you cannot
            use to get back out — the manager's only route to the whole brand became
            Home. Home's own pill has never hidden; that is the consistency asked for. */}
        <ScopePill store={store} onSwitchStore={onSwitchStore} />
        <Chip icon={CalendarRange} active={filters.window !== DEFAULT_REVIEW_FILTERS.window} onClick={() => setTimeSheet(true)}>
          {windowLabel(filters.window)}
        </Chip>
        <Chip icon={SlidersHorizontal} active={nActive > 0} onClick={() => setFilterSheet(true)}>
          {nActive > 0
            ? t('reviews.filtersN', { count: nActive, defaultValue: 'Filters · {{count}}' })
            : t('reviews.filters', { defaultValue: 'Filters' })}
        </Chip>
      </div>

      {/* What is currently narrowing the list, how much it narrowed it, and how to undo it.
          Without this the sheet closes and a shorter list is indistinguishable from a
          broken one — the Calls screen already solves it this way. */}
      <AnimatePresence initial={false}>
        {nActive > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="m-caption text-white/55 mb-1.5">
              {t('reviews.showingOf', {
                count: list.length,
                total: windowTotal,
                defaultValue: 'Showing {{count}} of {{total}} reviews',
              })}
            </div>
            <div className="flex items-center gap-2 mb-2.5 overflow-x-auto no-scrollbar">
              {chips.map(c => (
                <Chip key={c.key} active onClick={() => { vibrate(6); setFilters(f => ({ ...f, ...c.patch })) }}>
                  {c.label} <X size={11} />
                </Chip>
              ))}
              <Chip onClick={() => { vibrate(6); clearFilters() }}>
                {t('reviews.clearFilters', { defaultValue: 'Clear filters' })}
              </Chip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Listing metrics — every number is reviewMetrics() over the filters above.
          Three stats across, the CallsTab CountsCard idiom: "waiting for a reply" is the
          number the manager came for and the one four surfaces used to disagree about, so
          it sits on the card as a figure in its own right rather than being left for him
          to subtract out of "6 of 16 replied". */}
      <Card className="mb-2 !p-3.5">
        <div className="grid grid-cols-3">
          <HeadStat
            value={metrics.total}
            label={t('reviews.totalReviews', { defaultValue: 'Total reviews' })}
          />
          <HeadStat
            value={waiting}
            color="var(--si-warning-text)"
            label={t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })}
            divider
          />
          <HeadStat
            // The data layer rounds to 1dp and hands back a Number, so a flat 4 arrives as
            // `4` — a rating reads as "4.0". null (empty set) stays an em dash, never 0.0.
            value={metrics.avgRating != null ? metrics.avgRating.toFixed(1) : '—'}
            icon={metrics.avgRating != null ? <Star size={13} fill="#F59E0B" stroke="#F59E0B" /> : null}
            label={t('reviews.avgRating')}
            divider
          />
        </div>

        {/* The facts the time control does NOT already state: that a filter is narrowing
            the list, and what "waiting for a reply" actually means. The bare "every count
            is for <window>" restatement was removed (design review 3, item 6) — the time
            filter above says the window, so repeating it per data point is noise. */}
        <div className="mt-3 pt-2.5 m-caption text-white/45" style={{ borderTop: '1px solid var(--border-glass)' }}>
          {nActive > 0 && t('reviews.countsFilteredNote', {
            shown: list.length,
            total: windowTotal,
            window: windowLabel(filters.window),
            defaultValue: 'Filtered: {{shown}} of {{total}} reviews in {{window}}.',
          }) + ' '}
          {t('reviews.waitingMeans', {
            defaultValue: 'Waiting for a reply means live on your listing with no reply posted.',
          })}
          {/* And the badge — printed only once it can actually differ, so it stays a fact
              rather than a permanent footnote. */}
          {canonicalWaiting !== waiting && ' ' + t('reviews.waitingBadgeNote', {
            count: canonicalWaiting,
            window: canonicalWindowLabel,
            defaultValue: 'The Reviews tab badge shows {{count}} — the same count over {{window}}.',
          })}
        </div>

        {mix ? (
          <>
            <div className="mt-3 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,.05)' }}>
              {mix.positive > 0 && <div style={{ width: `${mix.positive}%`, background: 'linear-gradient(90deg, #22D38B 0%, #16A34A 100%)' }} />}
              {mix.neutral > 0 && <div style={{ width: `${mix.neutral}%`, background: '#F59E0B' }} />}
              {mix.negative > 0 && <div style={{ width: `${mix.negative}%`, background: '#FF6B7E' }} />}
            </div>
            <div className="mt-2 flex items-center justify-between m-caption text-white/55">
              <span className="text-[#22D38B]">{t('reviews.sharePositive', { pct: mix.positive, defaultValue: '{{pct}}% positive' })}</span>
              <span style={{ color: 'var(--si-warning-text)' }}>{t('reviews.shareNeutral', { pct: mix.neutral, defaultValue: '{{pct}}% neutral' })}</span>
              <span className="text-[#FF6B7E]">{t('reviews.shareNegative', { pct: mix.negative, defaultValue: '{{pct}}% negative' })}</span>
            </div>
          </>
        ) : null}

      </Card>

      {/* Reviews. In the cumulative view these landed on several different listings,
          so they are grouped under the one they belong to rather than interleaved with a
          badge per card. */}
      <div className="space-y-2.5">
        {groups.map(g => (
          <div key={g.storeId ?? 'all'} className="space-y-2.5">
            {g.label && <StoreGroupHeader label={g.label} count={g.count} />}
            {g.items.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
                <ReviewCard review={r} aggregate={false} onOpen={() => setSelectedId(r.id)} onPitchAutoReply={() => setPitch(true)} />
              </motion.div>
            ))}
          </div>
        ))}
        {list.length === 0 && (
          <Card className="!p-6 text-center">
            <InboxIcon size={28} className="mx-auto text-white/40 mb-2" />
            <div className="m-headline text-white">{t('reviews.emptyTitle', { defaultValue: 'No reviews match these filters' })}</div>
            <div className="m-caption text-white/60 mt-0.5">{t('reviews.emptySub', { defaultValue: 'Widen the rating range or the time window to see more.' })}</div>
            {nActive > 0 && (
              <div className="mt-3 flex justify-center">
                <Chip onClick={() => { vibrate(6); clearFilters() }} icon={RotateCcw}>
                  {t('reviews.clearFilters', { defaultValue: 'Clear filters' })}
                </Chip>
              </div>
            )}
          </Card>
        )}
        <div className="h-4" />
      </div>

      <FilterSheet
        open={filterSheet}
        value={filters}
        onClose={() => setFilterSheet(false)}
        onApply={(next) => setFilters(next)}
      />

      <TimeFilterSheet
        open={timeSheet}
        value={filters.window}
        onClose={() => setTimeSheet(false)}
        onApply={(win) => setFilters(f => ({ ...f, window: win }))}
      />

      <BottomSheet open={!!selected} onClose={() => setSelectedId(null)} fullHeight label={selected?.customer}>
        {selected && <ReviewDetail review={selected} onClose={() => setSelectedId(null)} />}
      </BottomSheet>

      {/* Gated at the sheet too, not just the chip that opens it — so no future caller
          can re-open the upsell in a build that is not meant to carry it. */}
      <BottomSheet open={pitch && FEATURES.reviewsAutoReplyPitch} onClose={() => setPitch(false)} label={t('reviews.autoReplyPitchChip', { defaultValue: 'Auto-reply with AI · Premium' })}>
        <AutoResponderPitch onClose={() => setPitch(false)} />
      </BottomSheet>
    </>
  )
}

// ============================================================
// AI AUTO-RESPONDER — A PITCH, NOT A CONTROL.
//
// Reached from the "AI reply draft ready" chip on a review card. It sells the thing that
// would make that chip unnecessary: an AI that POSTS the reply instead of drafting it for
// you.
//
// Two rules hold this sheet honest, and both are load-bearing:
//
//   1. NOTHING HERE WORKS YET. There is no toggle, no tone picker, no "reply to 4★ and
//      above" rule — because scope-1 feedback was explicit that managers do not configure
//      autoresponder settings. A switch that silently did nothing would be worse than no
//      switch. The only control is "register interest", and it says so.
//   2. IT SAYS IT IS NOT ON. "Not enabled for this store yet" is on the card, above the
//      fold, in the same words the Voice Outbound Agent upsell uses on the Calls detail —
//      same tone, same Premium badge, same quiet register-interest link.
// ============================================================
function AutoResponderPitch({ onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [registered, setRegistered] = useState(false)

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(0,112,252,.12)', border: '1px solid rgba(0,112,252,.30)' }}>
          {/* Colour, not `.ai-text` — see the note on the draft chip: that class clips a
              gradient to text and leaves an icon stroked in transparent. */}
          <Bot size={18} style={{ color: 'var(--si-primary-text)' }} />
        </span>
        <span className="m-title3 text-white">
          {t('reviews.autoResponderTitle', { defaultValue: 'AI Auto-Responder' })}
        </span>
        <AIBadge>{t('common.premium', { defaultValue: 'Premium' })}</AIBadge>
      </div>

      <AICard className="mt-3 !p-3.5">
        <p className="m-callout text-white/85">
          {t('reviews.autoResponderLead', {
            defaultValue: 'Today Connect writes the reply and waits for you to press post.',
          })}
        </p>
        <p className="m-callout text-white/75 mt-2">
          {t('reviews.autoResponderBody', {
            defaultValue: 'The AI Auto-Responder would post it for you — every new review answered within minutes, in your store’s voice, at midnight or on a Sunday. Not enabled for this store yet.',
          })}
        </p>
      </AICard>

      <div className="mt-3 flex items-start gap-2">
        <Info size={14} className="text-white/45 mt-0.5 shrink-0" />
        <p className="m-caption text-white/55">
          {t('reviews.autoResponderNoSettings', {
            defaultValue: 'There is nothing to switch on here yet — no settings, no rules. Register your interest and our team will set it up with you before it goes live.',
          })}
        </p>
      </div>

      <div className="mt-5">
        {registered ? (
          <div
            className="h-12 rounded-xl m-headline inline-flex w-full items-center justify-center gap-2"
            style={{ background: 'rgba(34,211,139,.10)', color: 'var(--si-success-text)', border: '1px solid rgba(34,211,139,.30)' }}
          >
            <Check size={18} /> {t('reviews.autoResponderRegistered', { defaultValue: 'Interest registered' })}
          </div>
        ) : (
          <PrimaryButton
            icon={Sparkles}
            onClick={() => {
              vibrate(12)
              setRegistered(true)
              toast.push({
                kind: 'ai',
                title: t('reviews.autoResponderSentTitle', { defaultValue: 'Interest registered' }),
                body: t('reviews.autoResponderSentBody', {
                  store: STORE.name,
                  branch: STORE.branch,
                  defaultValue: 'We will get in touch about the AI Auto-Responder for {{store}}, {{branch}}.',
                }),
              })
            }}
          >
            {t('reviews.autoResponderCta', { defaultValue: 'Register interest' })}
          </PrimaryButton>
        )}
      </div>

      <div className="mt-2">
        <GhostButton full onClick={onClose}>{t('common.close', { defaultValue: 'Close' })}</GhostButton>
      </div>
    </div>
  )
}

/**
 * One of the three headline figures on the metrics card. Same shape as the CallsTab
 * CountsCard stats: big tabular number, small label under it, hairline divider between.
 *
 * `color` is an INLINE colour and only ever an accent (#F59E0B on the waiting count) —
 * the default is `var(--text-primary)`, the theme token, never a text-white/* utility
 * that index.css would remap out from under an inline style.
 */
function HeadStat({ value, label, icon, color = 'var(--text-primary)', divider }) {
  return (
    <div
      className={'text-center px-1 ' + (divider ? 'border-l' : '')}
      style={divider ? { borderColor: 'var(--border-glass)' } : undefined}
    >
      <div className="inline-flex items-baseline gap-1 justify-center">
        {icon && <span className="translate-y-px">{icon}</span>}
        <span className="m-title1 m-tabular" style={{ color }}>{value}</span>
      </div>
      <div className="m-caption text-white/55 mt-0.5 line-clamp-2">{label}</div>
    </div>
  )
}

// Three of these sit across a 378px screen — ~110px each, so the label gets the full width
// (no icon) and is allowed TWO lines before it truncates: the plain-language labels
// ("Detailed reviews", "Reviews a week") are longer than the analyst words they replaced,
// and every tile in a grid row stretches to the tallest, so wrapping costs nothing.
//
// `subClass` is a CLASS, never an inline colour: index.css remaps the text-white/* utilities
// per theme, and an inline rgba(255,255,255,…) would survive that remap and go invisible on
// the light theme. It goes on an inner span, not alongside `m-caption` — .m-caption carries
// its own `color` at equal specificity and, being declared later, beats a colour utility
// sitting on the same element. Same wrapper/inner split the sentiment legend below uses.
function FilterSheet({ open, value, onClose, onApply }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)

  // Re-seed from the applied filters each time the sheet opens, so Cancel/dismiss discards.
  useEffect(() => { if (open) setDraft(value) }, [open, value])

  const matches = useMemo(() => (open ? filterReviews(draft).length : 0), [open, draft])
  const set = (patch) => setDraft(d => ({ ...d, ...patch }))

  return (
    <BottomSheet open={open} onClose={onClose} fullHeight label={t('reviews.filters', { defaultValue: 'Filters' })}>
      <div className="px-4 pb-2">
        <div className="m-title3 text-white mb-3">{t('reviews.filters', { defaultValue: 'Filters' })}</div>

        {/* Rating range */}
        <Section label={t('reviews.ratingRange', { defaultValue: 'Rating Range' })}>
          <RatingRange value={draft.rating} onChange={(rating) => set({ rating })} />
        </Section>

        {/* Sentiment */}
        <Section label={t('reviews.sentiment', { defaultValue: 'Sentiment' })}>
          <OptionChips
            options={REVIEW_SENTIMENTS}
            selected={draft.sentiment}
            onSelect={(sentiment) => set({ sentiment })}
          />
        </Section>

        {/* Rating type */}
        <Section label={t('reviews.ratingType', { defaultValue: 'Rating Type' })}>
          <OptionChips
            options={REVIEW_RATING_TYPES}
            selected={draft.ratingType}
            onSelect={(ratingType) => set({ ratingType })}
          />
        </Section>

        {/* Review status */}
        <Section label={t('reviews.reviewStatus', { defaultValue: 'Review Status' })}>
          <OptionChips
            options={REVIEW_STATUSES}
            selected={draft.status}
            onSelect={(status) => set({ status })}
          />
        </Section>

        {/* Toggles */}
        <div className="mt-4 space-y-1">
          <CheckRow
            checked={draft.showRemoved}
            onChange={(showRemoved) => set({ showRemoved })}
            icon={EyeOff}
            label={t('reviews.showRemoved', { defaultValue: 'Show Removed From Google' })}
            hint={t('reviews.showRemovedHint', { defaultValue: 'Reviews Google has taken down — not on your listing.' })}
          />
          <CheckRow
            checked={draft.editedOnly}
            onChange={(editedOnly) => set({ editedOnly })}
            icon={Pencil}
            label={t('reviews.editedOnly', { defaultValue: 'Edited reviews' })}
            hint={t('reviews.editedOnlyHint', { defaultValue: 'Only reviews the customer changed after posting.' })}
          />
        </div>

        {/* Tags */}
        <Section label={t('reviews.tags', { defaultValue: 'Tags' })}>
          {REVIEW_TAGS.length === 0 ? (
            <div className="m-callout text-white/45">{t('reviews.noTags', { defaultValue: 'No tags available' })}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {REVIEW_TAGS.map(tag => (
                <Chip
                  key={tag.id}
                  active={draft.tags.includes(tag.id)}
                  onClick={() => set({
                    tags: draft.tags.includes(tag.id)
                      ? draft.tags.filter(x => x !== tag.id)
                      : [...draft.tags, tag.id],
                  })}
                >
                  {t(tag.labelKey, { defaultValue: tag.label })}
                </Chip>
              ))}
            </div>
          )}
        </Section>

        {/* Footer */}
        <div
          className="sticky bottom-0 mt-5 pt-3 pb-1"
          style={{ background: 'linear-gradient(180deg, transparent 0%, var(--bg-sheet) 30%)' }}
        >
          <div className="m-caption text-white/45 text-center mb-2">
            {/* Phrased as a label + number rather than "{{count}} reviews match": this count is
                genuinely 1 sometimes, and the catalog carries no plural forms (the i18n lint
                resolves the base key only, so key_one/key_other would fail it permanently). */}
            {t('reviews.filterMatches', { count: matches, defaultValue: 'Matches · {{count}}' })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <GhostButton
              icon={RotateCcw}
              // Reset leaves the time window alone — that is the time sheet's own Reset.
              onClick={() => setDraft({ ...DEFAULT_REVIEW_FILTERS, window: draft.window })}
            >
              {t('reviews.reset', { defaultValue: 'Reset' })}
            </GhostButton>
            <div className="col-span-2">
              <PrimaryButton onClick={() => { vibrate(12); onApply(draft); onClose() }}>
                {t('reviews.applyFilters', { defaultValue: 'Apply Filters' })}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}

function Section({ label, children }) {
  return (
    <div className="mt-4">
      <div className="m-subhead text-white/55 mb-2">{label}</div>
      {children}
    </div>
  )
}

function OptionChips({ options, selected, onSelect }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <Chip key={o.id} active={selected === o.id} onClick={() => onSelect(o.id)}>
          {t(o.labelKey, { defaultValue: o.label })}
        </Chip>
      ))}
    </div>
  )
}

/**
 * 1–5 star range, two thumbs on one track. Both inputs sit on top of each other: the input
 * itself ignores pointer events so the track below shows through, and only the thumbs take
 * the touch. The min thumb is lifted above the max one once it reaches the right-hand end,
 * where the two would otherwise stack and the lower one become ungrabbable.
 */
function RatingRange({ value, onChange }) {
  const { t } = useTranslation()
  const { min, max } = value
  const pct = (n) => ((n - STAR_MIN) / (STAR_MAX - STAR_MIN)) * 100

  const thumb = 'w-full h-8 absolute left-0 appearance-none bg-transparent pointer-events-none '
    + '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none '
    + '[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full '
    + '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-grab '
    + '[&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,.45)] '
    + '[&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#0070FC] '
    + '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none '
    + '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full '
    + '[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#0070FC]'

  return (
    <div>
      <div className="relative h-8 mx-1">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 rounded-full" style={{ background: 'var(--bg-subtle-strong)' }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full"
          style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%`, background: 'var(--si-ai-gradient)' }}
        />
        <input
          type="range" min={STAR_MIN} max={STAR_MAX} step={1} value={min}
          aria-label={t('reviews.ratingMin', { defaultValue: 'Minimum rating' })}
          onChange={e => onChange({ min: Math.min(Number(e.target.value), max), max })}
          className={thumb}
          style={{ zIndex: min >= STAR_MAX - 1 ? 4 : 2 }}
        />
        <input
          type="range" min={STAR_MIN} max={STAR_MAX} step={1} value={max}
          aria-label={t('reviews.ratingMax', { defaultValue: 'Maximum rating' })}
          onChange={e => onChange({ min, max: Math.max(Number(e.target.value), min) })}
          className={thumb}
          style={{ zIndex: 3 }}
        />
      </div>
      <div className="flex items-center justify-between mt-1 px-1">
        {[1, 2, 3, 4, 5].map(n => (
          <span key={n} className={'m-caption m-tabular ' + (n >= min && n <= max ? 'text-white/70' : 'text-white/25')}>{n}★</span>
        ))}
      </div>
      <div className="m-caption text-white/55 mt-1.5">
        {t('reviews.ratingRangeReadout', {
          min, max, total: STAR_MAX,
          defaultValue: 'Showing reviews from {{min}}★ to {{max}}★ of {{total}}',
        })}
      </div>
    </div>
  )
}

function CheckRow({ checked, onChange, icon: Icon, label, hint }) {
  return (
    <button onClick={() => onChange(!checked)} className="w-full flex items-start gap-2.5 py-2 press text-left">
      <span
        className="w-5 h-5 rounded-md grid place-items-center shrink-0 mt-0.5"
        style={{
          background: checked ? '#0070FC' : 'transparent',
          border: `1px solid ${checked ? '#0070FC' : 'var(--border-glass-strong)'}`,
        }}
      >
        {checked && <Check size={13} className="text-white" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="m-callout text-white/85 flex items-center gap-1.5">
          {Icon && <Icon size={12} className="text-white/45 shrink-0" />}
          {label}
        </span>
        {hint && <span className="m-caption text-white/40 block mt-0.5">{hint}</span>}
      </span>
    </button>
  )
}

// ============================================================
// TIME SHEET
// ============================================================

// ============================================================
// REVIEW CARD + DETAIL
// ============================================================

function ReviewStars({ rating, size = 12 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} fill={n <= rating ? '#F59E0B' : 'transparent'} stroke={n <= rating ? '#F59E0B' : '#3A3F66'} strokeWidth={1.6} />
      ))}
    </span>
  )
}

export function ReviewCard({ review, onOpen, onPitchAutoReply, aggregate }) {
  const { t } = useTranslation()
  const cs = ['#0070FC', '#0E0071', '#F59E0B', '#22D38B', '#FF6B7E']
  const c = cs[review.customer.charCodeAt(0) % cs.length]
  return (
    <Card onClick={onOpen} label={review.customer} className="!p-3.5">
      <div className="flex items-start gap-3">
        <Avatar initials={review.customer.split(' ').map(p => p[0]).slice(0, 2).join('')} color={c} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="m-headline text-white truncate">{review.customer}</span>
            {/* PM feedback 7 — the inbox read flat next to the newer screens because an
                answered review and one still waiting looked identical until you got to
                the bottom of the card. The state now sits beside the NAME, where the eye
                lands first, and an unanswered one carries the same "act here" pill the
                Leads cards use for Call back rather than a bare red word.
                Translator TODO on the waiting label — the catalogs have replyNow, which
                is an instruction, not a status. */}
            {!review.responded && !review.removed && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold whitespace-nowrap"
                style={review.priority
                  ? { background: 'rgba(220,38,38,.10)', color: 'var(--si-error-text)', border: '1px solid rgba(220,38,38,.30)' }
                  : { background: 'rgba(0,112,252,.10)', color: 'var(--si-primary-text)', border: '1px solid rgba(0,112,252,.28)' }}
              >
                {review.priority ? t('common.replyNow') : 'Waiting'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <ReviewStars rating={review.rating} />
            <span className="m-caption text-white/45">·</span>
            <span className="m-caption text-white/55 truncate">{review.platform}</span>
            {/* Which listing this review landed on — aggregate view only. */}
            {aggregate && <StoreBadge storeId={review.storeId} />}
            <span className="m-caption text-white/45">·</span>
            <span className="m-caption text-white/55 truncate">{relativeTime(review.atMs)}</span>
          </div>
        </div>
      </div>

      {/* The review itself and its flags sit BELOW the identity row, starting at the
          card's own left edge — under the avatar, not indented past it. The quote is
          the content; the avatar/stars line is the attribution. Indenting the quote to
          clear the avatar cost it ~52px of measure and left it with no left edge to
          align to. */}
      {review.hasText ? (
        <p className="mt-2 m-callout text-white/85 line-clamp-3">{review.body}</p>
      ) : (
        <p className="mt-2 m-callout text-white/40">{t('reviews.noTextShort', { defaultValue: 'Star rating only — no text.' })}</p>
      )}

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {/* REPORTED shows on the CARD, not just in the sheet. A manager who reported a
            review yesterday should be able to see that from the list rather than opening
            every one to check — and without it the inbox looks untouched after the one
            action they took. Sits before 'Removed' because a review can be both, in that
            order. */}
        {review.reportedAtMs && !review.removed && (
          <Flag color="#CA8A04" icon={AlertTriangle}>Reported to Google</Flag>
        )}
        {review.removed && (
          <Flag color="#FF6B7E" textColor="var(--si-error-text)" icon={EyeOff}>{t('reviews.removedFlag', { defaultValue: 'Removed from Google' })}</Flag>
        )}
        {review.edited && (
          <Flag color="#9DC2FF" textColor="var(--si-primary-text)" icon={Pencil}>
            {review.previousRating != null
              ? t('reviews.editedFromFlag', { from: review.previousRating, defaultValue: 'Edited · was {{from}}★' })
              : t('reviews.editedFlag', { defaultValue: 'Edited' })}
          </Flag>
        )}
        {review.responded ? (
          <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption" style={{ background: 'rgba(34,211,139,.10)', color: 'var(--si-success-text)', border: '1px solid rgba(34,211,139,.30)' }}>
            <Check size={10} /> {t('reviews.replied')}
          </span>
        ) : review.removed || !FEATURES.reviewsAutoReplyPitch ? (
          // A review Google has taken down is not waiting for anything: no reply we
          // post can appear against it. Promising a draft here would be the one place
          // on the card that contradicts the "Removed from Google" label beside it.
          //
          // Same branch for a build with the upsell suppressed: the inbox ships, the ad
          // for a tier this manager has not bought does not. Nothing replaces the chip —
          // the real reply flow is the card itself, which opens ReplyComposer.
          null
        ) : (
          // HONEST LABEL. This pill does NOT open a draft — tapping it opens the
          // Premium AI Auto-Responder PITCH (a feature that isn't on for this store).
          // The real AI draft already lives one tap away: opening the review (the card
          // itself) drops you into ReplyComposer, which drafts and posts a reply. So a
          // chip reading "AI reply draft ready" was baiting the manager with the exact
          // thing the pitch would sell — the trust smell the audit flagged. It now names
          // the feature it links to, and the Bot glyph + "Premium" mark it as an upsell,
          // not a ready action. stopPropagation so it doesn't also open the review.
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); vibrate(6); onPitchAutoReply?.() }}
            aria-label={t('reviews.autoReplyPitchA11y', { defaultValue: 'Auto-reply with AI — see the Premium AI Auto-Responder' })}
            className="inline-flex items-center justify-center press min-h-[var(--m-touch-min)]"
          >
            {/* NOT `.ai-text` here, on purpose. That class paints a brand gradient and
                clips it to the TEXT (`background-clip: text; color: transparent`), so
                it cannot coexist with a pill: the inline `background` shorthand this
                chip needs replaces the gradient AND resets background-clip, and the
                label is then painted in transparent — an empty pill with two icons in
                it. (It also strokes any lucide glyph inside it in transparent.)
                var(--si-primary-text) is the theme-aware brand blue the gradient
                resolves to anyway: #0355DB light, #5CA4FF dark. */}
            <span
              className="m-caption font-semibold inline-flex items-center gap-1 px-2 h-6 rounded-full md-state"
              style={{
                background: 'rgba(0,112,252,.10)',
                border: '1px solid rgba(0,112,252,.30)',
                color: 'var(--si-primary-text)',
              }}
            >
              {/* Bot, not Sparkles — this is the auto-responder, and the same glyph the
                  pitch sheet leads with. */}
              <Bot size={10} />
              {/* Names the feature it opens (a Premium auto-reply), never a draft. */}
              {t('reviews.autoReplyPitchChip', { defaultValue: 'Auto-reply with AI · Premium' })}
              <ChevronRight size={10} />
            </span>
          </button>
        )}
      </div>
    </Card>
  )
}

// `color` is the accent — it tints the 10% background and the border. `textColor`
// (optional) is the LEGIBLE foreground: the pale accents (#9DC2FF, #FF6B7E) read fine
// as a fill but fail WCAG AA as text on their own pale wash, so callers pass an
// AA-safe token for the label/icon and keep the accent for the chrome.
function Flag({ children, color, textColor, icon: Icon }) {
  const fg = textColor || color
  return (
    <span
      className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-medium shrink-0"
      style={{ background: `${color}1A`, color: fg, border: `1px solid ${color}4D` }}
    >
      {Icon && <Icon size={9} />}
      {children}
    </span>
  )
}

export function ReviewDetail({ review, onClose }) {
  const { t } = useTranslation()
  const platformLabel = usePlatformLabel()
  const replies = getReviewReplies(review)
  const platformId = platformIdFor(review.platform)
  // Scope 1 publishes to GBP only. A Justdial review keeps its reply HISTORY on screen —
  // it just loses the reply box. (Autoresponder settings are a later phase; there are none.)
  const publishable = canPublishReply(platformId)
  // PM: "Since reviews can be deleted by Google, add label against the review if a review
  // was deleted." The label is `removed` off the data layer — `removed_from_google` in the
  // schema — and it is the same flag the "Show removed from Google" filter switches on and
  // that filterReviews() excludes by default, so the label and the filter cannot disagree.
  //
  // A removed review also loses the reply box, not just gains a label: Google has taken the
  // review off the listing, so a reply published against it has nowhere to appear. Offering
  // one would be a control that pretends to work.
  const removed = !!review.removed
  const canReply = publishable && !removed

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center gap-3">
        <Avatar initials={review.customer.split(' ').map(p => p[0]).slice(0, 2).join('')} color="#0070FC" size={44} />
        <div className="flex-1 min-w-0">
          <div className="m-headline text-white truncate">{review.customer}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <ReviewStars rating={review.rating} size={13} />
            <span className="m-caption text-white/55">· {review.platform} · {dayClock(review.atMs)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {review.removed && (
          <Flag color="#FF6B7E" textColor="var(--si-error-text)" icon={EyeOff}>
            {t('reviews.removedAt', { at: dayClock(review.removedAtMs), defaultValue: 'Removed from Google · {{at}}' })}
          </Flag>
        )}
        {review.edited && (
          <Flag color="#9DC2FF" textColor="var(--si-primary-text)" icon={Pencil}>
            {review.previousRating != null
              ? t('reviews.editedFromAt', { from: review.previousRating, at: dayClock(review.editedAtMs), defaultValue: 'Edited {{at}} · was {{from}}★' })
              : t('reviews.editedAt', { at: dayClock(review.editedAtMs), defaultValue: 'Edited {{at}}' })}
          </Flag>
        )}
      </div>

      <Card className="mt-3 !p-3.5">
        {review.hasText
          ? <p className="m-body text-white/85">{review.body}</p>
          : <p className="m-body text-white/45">{t('reviews.noTextBody', { defaultValue: 'Star rating only — the customer didn’t write anything.' })}</p>}
        {review.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {review.tags.map(id => {
              const tag = reviewTag(id)
              return tag ? (
                <span key={id} className="px-2 h-5 rounded-full m-caption inline-flex items-center text-white/60" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}>
                  {t(tag.labelKey, { defaultValue: tag.label })}
                </span>
              ) : null
            })}
          </div>
        )}
      </Card>

      {/* Reply history — what we said, when, and where it was published. */}
      {replies.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle size={14} className="text-white/55" />
            <span className="m-headline text-white">{t('reviews.replyHistory', { defaultValue: 'Reply history' })}</span>
            <span className="m-caption text-white/40">{replies.length}</span>
          </div>
          <div className="space-y-2">
            {replies.map(rep => <ReplyRow key={rep.id} reply={rep} reviewId={review.id} />)}
          </div>
        </div>
      )}

      {canReply && !review.responded && (
        <ReplyComposer review={review} platformId={platformId} onClose={onClose} />
      )}

      {/* The last resort, and the least prominent thing on the sheet: replying is the job,
          reporting is what is left when a review should not be on the listing at all.
          Not shown for one Google has already taken down — there is nothing to report. */}
      {!review.removed && <ReportReview review={review} />}

      {/* WHY IT VANISHED. The chip at the top of this sheet names the fact and the date;
          this says what the fact MEANS — that the review is off the listing, that our
          reply went with it, and that it is therefore missing from every count on the
          inbox unless the filter is on. Without it "Removed from Google" reads as a
          warning the manager is supposed to act on, and there is no action. */}
      {removed && (
        <Card className="mt-4 !p-3.5">
          <div className="flex items-start gap-2">
            <EyeOff size={14} className="mt-0.5 shrink-0" style={{ color: '#FF6B7E' }} />
            <div className="flex-1 min-w-0">
              <div className="m-headline text-white">
                {t('reviews.removedTitle', { defaultValue: 'Google removed this review' })}
              </div>
              <p className="m-callout text-white/70 mt-1">
                {t('reviews.removedExplain', {
                  at: dayClock(review.removedAtMs),
                  defaultValue: 'Google took it down on {{at}}. It is no longer on your listing, so nobody searching for you can see it — and any reply you published against it came down with it.',
                })}
              </p>
              <p className="m-caption text-white/45 mt-1.5">
                {t('reviews.removedNotCounted', {
                  filter: t('reviews.showRemoved', { defaultValue: 'Show Removed From Google' }),
                  defaultValue: 'It is left out of every count on this screen unless “{{filter}}” is on in Filters, and there is nothing here for you to reply to.',
                })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {!removed && !publishable && (
        <Card className="mt-4 !p-3.5">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-white/45 mt-0.5 shrink-0" />
            <p className="m-callout text-white/70">
              {t('reviews.notPublishable', {
                platform: platformLabel(platformId) || review.platform,
                gbp: platformLabel('gbp'),
                defaultValue: 'Replies can’t be published to {{platform}} from Connect — {{gbp}} is the only connected platform today.',
              })}
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

/**
 * ONE PUBLISHED REPLY — readable, editable, retractable (PM feedback 9).
 *
 * A reply that is already down (`deleted`) offers neither action: there is nothing to
 * edit and nothing left to take down, and the dashed card already says so.
 *
 * DELETE ASKS FIRST, as specified — "when Deleting a response of a review, take the
 * confirmation that you are about to delete a review response." This is a PUBLIC
 * retraction; it is the one action on this screen a customer sees happen.
 */
/**
 * REPORT THIS REVIEW TO GOOGLE (PM feedback 9, "deleting a review").
 *
 * Deliberately NOT a delete. A store manager cannot remove a customer's Google review —
 * they can report it and Google decides — so the control says what it does. A local
 * "delete" would leave a one-star review live on the listing while the app showed it
 * gone, which is the one outcome worth designing against.
 *
 * Asks first, and the report is undoable while it is still just a report.
 * Translator TODO throughout: the catalogs carry nothing for reporting.
 */
function ReportReview({ review }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const reported = !!review.reportedAtMs

  if (reported) {
    return (
      <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(202,138,4,.10)', border: '1px solid rgba(202,138,4,.30)' }}>
        <div className="flex items-start gap-2">
          <Flag color="#CA8A04" icon={AlertTriangle}>Reported to Google</Flag>
        </div>
        <div className="m-caption text-white/70 mt-2">
          Reported {relativeTime(review.reportedAtMs)}. Google decides whether it comes
          down — it stays on your listing until they do.
        </div>
        <button
          type="button"
          onClick={() => { vibrate(8); unreportReview(review.id) }}
          className="mt-2 m-caption font-semibold press"
          style={{ color: 'var(--si-primary-text)' }}
        >
          {t('common.undo', { defaultValue: 'Undo' })}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {confirming ? (
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}>
          <div className="m-callout text-white">Report this review to Google?</div>
          <div className="m-caption text-white/70 mt-1">
            You cannot delete a customer&apos;s review. Reporting asks Google to take it
            down for a policy breach — fake, offensive or not about this business. It
            stays on your listing until they rule.
          </div>
          <div className="flex items-center justify-end gap-2 mt-3">
            <button type="button" onClick={() => setConfirming(false)} className="h-9 px-3 rounded-full m-subhead text-white/60 press">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => { vibrate(15); reportReview(review.id); setConfirming(false) }}
              className="on-dark h-9 px-4 rounded-full m-subhead font-semibold text-white press md-state inline-flex items-center gap-1.5"
              style={{ background: '#CA8A04' }}
            >
              <AlertTriangle size={13} /> Report
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { vibrate(6); setConfirming(true) }}
          className="m-caption press inline-flex items-center gap-1.5"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <AlertTriangle size={12} /> Report this review to Google
        </button>
      )}
    </div>
  )
}

function ReplyRow({ reply, reviewId }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState(reply.text)
  const ref = useRef(null)

  // Caret to the end when the edit opens — same rule as the lead notes: the browser
  // otherwise restores offset 0 and the next keystroke lands in front of the reply.
  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  function save() {
    if (!draft.trim()) return
    updateReviewReply(reviewId, reply.id, draft)
    vibrate(12)
    setEditing(false)
  }

  function remove() {
    deleteReviewReply(reviewId, reply.id)
    vibrate(18)
    setConfirming(false)
  }

  return (
    <Card
      className="!p-3"
      style={reply.deleted ? { borderStyle: 'dashed', opacity: 0.75 } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <PlatformChip id={reply.platform} />
        <span className="m-caption text-white/45 truncate">{dayClock(reply.atMs)}</span>
      </div>

      {editing ? (
        <>
          <textarea
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full mt-2 rounded-xl p-2.5 bg-transparent text-white m-callout outline-none resize-none min-h-[88px]"
            style={{ background: 'var(--bg-subtle)', border: '1px solid rgba(0,112,252,.45)' }}
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button type="button" onClick={() => { setDraft(reply.text); setEditing(false) }} className="h-9 px-3 rounded-full m-subhead text-white/60 press">
              {t('common.cancel')}
            </button>
            <button
              type="button" onClick={save} disabled={!draft.trim()}
              className={cn('on-dark h-9 px-4 rounded-full m-subhead font-semibold text-white press md-state', !draft.trim() && 'opacity-40')}
              style={{ background: '#0070FC' }}
            >
              {t('common.save')}
            </button>
          </div>
        </>
      ) : (
        <p className={'mt-2 m-callout ' + (reply.deleted ? 'text-white/45' : 'text-white/85')}>{reply.text}</p>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="m-caption text-white/40 truncate">— {reply.author}</span>
        {reply.deleted ? (
          <Flag color="#FF6B7E" icon={Trash2}>
            {t('reviews.replyDeletedAt', { at: dayClock(reply.deletedAtMs), defaultValue: 'Deleted · {{at}}' })}
          </Flag>
        ) : !editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => { vibrate(6); setDraft(reply.text); setEditing(true) }}
              aria-label={t('reviews.edit', { defaultValue: 'Edit' })}
              className="-m-2 p-2 press text-white/40 hover:text-white/70"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => { vibrate(6); setConfirming(true) }}
              /* Translator TODO: the catalogs carry no Delete string at all. */
              aria-label="Delete reply"
              className="-m-2 p-2 press text-white/40 hover:text-[#FF6B7E]"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* THE CONFIRMATION. Inline rather than a sheet on top of a sheet: this row is the
          thing being deleted, and a dialog that covers it makes the manager confirm
          against memory. Translator TODO — no catalog key for this warning. */}
      {confirming && !reply.deleted && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--border-glass)' }}>
          <div className="m-caption text-white/80">
            You are about to delete this review response. It will be taken down publicly.
          </div>
          <div className="flex items-center justify-end gap-2 mt-2">
            <button type="button" onClick={() => setConfirming(false)} className="h-9 px-3 rounded-full m-subhead text-white/60 press">
              {t('common.cancel')}
            </button>
            <button
              type="button" onClick={remove}
              className="on-dark h-9 px-4 rounded-full m-subhead font-semibold text-white press md-state inline-flex items-center gap-1.5"
              style={{ background: '#DC2626' }}
            >
              <Trash2 size={13} /> Delete reply
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

function ReplyComposer({ review, platformId, onClose }) {
  const { t, i18n } = useTranslation()
  const platformLabel = usePlatformLabel()
  const altLang = altLanguage(i18n.language)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    async function gen() {
      setLoading(true)
      // A star-only review has no words to work from — say so, rather than posting the
      // string "null" into the prompt and letting the model invent what they "said".
      const brief = review.hasText
        ? `Acknowledge specifics from the review${review.rating <= 3 ? ', sincerely apologize, take ownership and offer a concrete next step (callback / store visit / discount on next purchase)' : ', thank the customer warmly and invite them back'}.`
        : `The customer left a star rating and wrote NO text at all, so there are no specifics to acknowledge — do not invent any or imply they said something. ${review.rating <= 3 ? 'Acknowledge that something clearly fell short, apologize, and invite them to tell us what happened so we can fix it.' : 'Simply thank them warmly for the rating and invite them back.'}`
      const quoted = review.hasText
        ? `Review (${review.rating}★ by ${review.customer}):\n"${review.body}"`
        : `Review (${review.rating}★ by ${review.customer}): star rating only, no written text.`

      const out = await askAI(
        `You are an AI drafting a public reply to a customer review on behalf of "Lakshmi Electronics, Indiranagar Bangalore" managed by Rajesh Kumar. Tone: warm and professional in a natural Indian conversational register, brand-on, 2 short paragraphs (max 55 words). ${brief} Sign off as "— Team Lakshmi Electronics, Indiranagar". Do NOT use any emoji. No markdown, no quotes.

${quoted}`,
        {
          temperature: 0.85,
          fallback: review.hasText
            ? (review.rating <= 3
              ? t('reviews.replyDraftFallbackNegative', { customer: review.customer })
              : t('reviews.replyDraftFallbackPositive', { customer: review.customer }))
            : (review.rating <= 3
              ? t('reviews.replyDraftFallbackNoTextNegative', {
                customer: review.customer,
                defaultValue: 'Hi {{customer}}, thank you for the rating — it tells us we fell short somewhere, and we would genuinely like to know where.\n\nDo call the store and ask for Rajesh, or drop in any time. We will make it right. — Team Lakshmi Electronics, Indiranagar',
              })
              : t('reviews.replyDraftFallbackNoTextPositive', {
                customer: review.customer,
                rating: review.rating,
                defaultValue: 'Thank you for the {{rating}}★, {{customer}}! Ratings like yours are what keep a neighbourhood shop going.\n\nDo come back any time — we will keep working hard to earn your visit. — Team Lakshmi Electronics, Indiranagar',
              })),
        },
      )
      if (!cancelled) {
        setDraft(out)
        setLoading(false)
      }
    }
    gen()
    return () => { cancelled = true }
  }, [review.id])

  function submit() {
    vibrate(15)
    // Through the data layer, not into component state: the reply becomes a real record on
    // the review, so it is still there after a tab switch — and filterReviews()/
    // reviewMetrics() count it from this instant. postReviewReply() fires emitChange(),
    // which is what re-renders the list behind this sheet.
    postReviewReply(review.id, { body: draft, platform: platformId, author: PRIMARY_USER.name })
    toast.push({
      kind: 'success',
      title: t('reviews.replyPostedTitle'),
      body: t('reviews.replyPostedTo', { platform: platformLabel(platformId), defaultValue: 'Published to {{platform}}' }),
    })
    setTimeout(onClose, 600)
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Sparkles size={14} className="ai-text shrink-0" />
        <span className="m-headline text-white">{t('reviews.aiDraftedReply')}</span>
        <AIBadge>{t('reviews.reviewsAi')}</AIBadge>
        <span className="m-caption text-white/45">
          {t('reviews.publishesTo', { platform: platformLabel(platformId), defaultValue: 'Publishes to {{platform}}' })}
        </span>
      </div>
      <AICard className="!p-3.5">
        {loading ? (
          <div className="space-y-2">
            <AIShimmer className="h-3 w-[95%]" />
            <AIShimmer className="h-3 w-[88%]" />
            <AIShimmer className="h-3 w-[72%]" />
            <AIShimmer className="h-3 w-[80%]" />
          </div>
        ) : editing ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full bg-transparent text-white/90 m-body outline-none resize-none min-h-[120px]"
          />
        ) : (
          <p className="m-body text-white/90 whitespace-pre-line">{draft}</p>
        )}
      </AICard>

      <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
        <Chip icon={Sparkles}>{t('reviews.warmer')}</Chip>
        <Chip>{t('reviews.shorter')}</Chip>
        <Chip>{t('reviews.inLanguage', { language: altLang.native })}</Chip>
        <Chip>{t('reviews.addOffer')}</Chip>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <GhostButton onClick={() => setEditing(e => !e)} icon={editing ? Check : Send}>
          {editing ? t('common.done') : t('reviews.edit')}
        </GhostButton>
        <div className="col-span-2">
          <PrimaryButton onClick={submit} disabled={loading} icon={Send}>
            {t('reviews.postPublicReply')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// REVIEW LINK — the store's own link, ready to copy or hand to WhatsApp.
//
// This replaced the Generate tab outright (PM: "Remove 'generate', we will not be having
// different forms of messages for now. Add Review link."). What went with it: the
// name/phone/email form, the per-send AI message writer, and the fake `si.link/r/<random>`
// it minted — a link that was DIFFERENT on every press, so the same customer asked twice
// got two links and neither could ever be attributed.
//
// ONE LINK, ONE FORMAT. storeReviewLink() is in packages/core/data/reviews.js and builds
// `https://si.link/r/<CODE>` where CODE is FNV-1a over the subject → six base36 chars.
// That is the SAME builder and the same shape the Customers screen's per-customer link
// uses (reviewLinkFor(), seeded `store:customer`); this one is seeded on the store alone.
// Deterministic, so the link on this screen today is the link on this screen in December
// — which is the whole point of a link you print, and the only way a landed review can be
// traced back to where it came from.
//
// The MESSAGE is one fixed default the manager can edit, not a generated variant per
// send: that is exactly the "different forms of messages" the PM cut.
// ============================================================

/**
 * The two real hand-off URLs, with NO recipient.
 *
 * Same two endpoints the Customers screen uses (reviewShareHrefs) minus the number: this
 * is the STORE's link, so there is no one customer to address it to, and both endpoints
 * have an official no-recipient form that opens the app's own contact picker instead.
 *   • wa.me/?text=…   WhatsApp click-to-chat: deep-links on a phone, WhatsApp Web on a
 *                     desktop, so it degrades honestly rather than dead-ending.
 *   • sms:?&body=…    RFC 5724. iOS parses `&body=`, Android `?body=` — `?&body=` is the
 *                     one form both accept, which is why every cross-platform SMS link in
 *                     the wild looks like this.
 */
function storeShareHrefs(message) {
  const text = encodeURIComponent(message)
  return { whatsapp: `https://wa.me/?text=${text}`, sms: `sms:?&body=${text}` }
}

const SHARE_BTN = 'h-12 rounded-xl m-headline text-white press flex items-center justify-center gap-2'

function ReviewLink() {
  const { t } = useTranslation()
  const toast = useToast()
  const link = storeReviewLink(STORE)
  const [message, setMessage] = useState(() => t('reviews.storeLinkMessage', {
    store: STORE.name,
    branch: STORE.branch,
    link,
    defaultValue: 'Hi, thanks for shopping at {{store}}, {{branch}}. If we did right by you, could you leave us a quick review? It takes a minute: {{link}}',
  }))
  const hrefs = storeShareHrefs(message)

  return (
    <>
      <Card className="!p-3.5">
        <div className="m-subhead text-white/55">
          {t('reviews.storeLinkLabel', { defaultValue: 'Your store’s review link' })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div
            className="flex-1 px-3 h-11 rounded-xl flex items-center m-headline text-white m-tabular truncate"
            style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.25)' }}
          >
            {link}
          </div>
          <IconBtn
            icon={Copy}
            onClick={() => {
              vibrate(10)
              navigator.clipboard?.writeText(link)
              toast.push({ kind: 'success', title: t('reviewLink.copied', { defaultValue: 'Link copied' }) })
            }}
            label={t('reviewLink.copy', { defaultValue: 'Copy link' })}
          />
        </div>
        <div className="m-caption text-white/55 mt-2">
          {t('reviews.storeLinkHint', {
            store: STORE.name,
            branch: STORE.branch,
            defaultValue: 'The same link every time, for {{store}} {{branch}} — it opens the Google review box for this store. Print it, put it on the bill, or send it below.',
          })}
        </div>
      </Card>

      {/* The message — ONE default, editable. No per-send variants (PM). */}
      <div className="mt-3">
        <div className="m-subhead text-white/55 mb-2">
          {t('reviewLink.messageLabel', { defaultValue: 'Message' })}
        </div>
        <Card className="!p-3.5">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            aria-label={t('reviewLink.messageLabel', { defaultValue: 'Message' })}
            className="w-full bg-transparent text-white/90 m-body outline-none resize-none min-h-[92px]"
          />
        </Card>
      </div>

      {/* Channel — the manager picks, the phone takes over. Real hrefs, not a toast. */}
      <div className="mt-4">
        <div className="m-subhead text-white/55 mb-2">
          {t('reviewLink.chooseChannel', { defaultValue: 'Send it on' })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={hrefs.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => vibrate(15)}
            className={SHARE_BTN}
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', boxShadow: '0 6px 18px rgba(37,211,102,.35)' }}
          >
            <MessageCircle size={18} /> WhatsApp
          </a>
          <a
            href={hrefs.sms}
            onClick={() => vibrate(15)}
            className={SHARE_BTN}
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <Send size={18} /> {t('reviewLink.sms', { defaultValue: 'SMS' })}
          </a>
        </div>
        <div className="m-caption text-white/45 mt-2">
          {t('reviews.storeShareHint', {
            defaultValue: 'Opens WhatsApp or Messages with the message ready — you choose who it goes to and press send.',
          })}
        </div>
      </div>

      <div className="h-4" />
    </>
  )
}

// ============================================================
// LEADERBOARD
// ============================================================

function Leaderboard() {
  const { t } = useTranslation()
  return (
    <>
      <AICard className="mb-3 !p-3.5">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-[#FFC061]" />
          <span className="m-headline text-white">{t('reviews.leaderboardTitle', { branch: 'Indiranagar' })}</span>
        </div>
        <p className="mt-1 m-callout text-white/75">{t('reviews.leaderboardSub')}</p>
      </AICard>

      <Card className="!p-2">
        {REVIEW_LEADERBOARD.map((u, i) => (
          <div key={u.id} className={'flex items-center gap-3 px-2 py-3 ' + (i < REVIEW_LEADERBOARD.length - 1 ? 'border-b border-white/5' : '')}>
            <div className="w-7 m-title3 text-white/85 m-tabular text-center">#{i + 1}</div>
            <Avatar initials={u.initials} color={i === 0 ? '#F59E0B' : i === 1 ? '#A6ACC4' : '#CD7F32'} />
            <div className="flex-1 min-w-0">
              <div className="m-headline text-white truncate">{u.name}</div>
              <div className="m-caption text-white/55">{t('reviews.generated', { count: u.generated })} · <span className="text-[#7BE3B2]">{t('reviews.landed', { count: u.landed })}</span> · {t('reviews.avg', { rating: u.avgRating })}</div>
            </div>
            {i === 0 && <Trophy size={18} className="text-[#FFC061]" style={{ filter: 'drop-shadow(0 0 8px rgba(255,193,97,.5))' }} />}
          </div>
        ))}
      </Card>

      <Card className="mt-3 !p-3.5">
        <div className="m-subhead text-white/55 mb-2">{t('reviews.weeklyPrize')}</div>
        <div className="m-headline text-white">{t('reviews.weeklyPrizeValue')}</div>
      </Card>
    </>
  )
}
