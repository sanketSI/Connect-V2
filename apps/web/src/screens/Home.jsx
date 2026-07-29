import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import {
  PhoneMissed, Star, ArrowRight, Sparkles, RefreshCcw,
  Zap, ShieldCheck, CheckCircle2, TrendingUp, MapPin,
  QrCode, ArrowUpRight, ArrowDownRight, Eye, Hourglass, Layers, ChevronRight,
} from 'lucide-react'
import { Card, PrimaryButton, Avatar } from '../components/UI.jsx'
import ReviewQrSheet from './ReviewQrSheet.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
import { FEATURES, IS_MVP } from '../lib/features.js'
import {
  getCurrentUser, getLastLogin,
  callCounts, getCalls, callbackQueue, filterReviews, locationNeedsVerification,
  openMissedCount, reviewsWaitingCount, CANONICAL_MISSED_WINDOW, CANONICAL_REVIEW_WINDOW,
  getStoreInsights, getNetworkInsights, networkRollup, CANONICAL_INSIGHTS_WINDOW, formatNumber,
  rupees, totalRecoverable, askAI, typewriter, dayClock, calendarDate, dataStore,
} from '@connect/core'

const PRIMARY_USER = getCurrentUser()

// The two windows every count on this screen is measured over, named once. They come from
// the data layer rather than from here on purpose: the tab badges, the Calls screen and
// the Reviews screen read the same constants, so a number here cannot drift from the
// number on the tab it sends you to. See the CANONICAL notes in packages/core/data.
const MISSED_WINDOW_KEY = `window.${CANONICAL_MISSED_WINDOW}`
const REVIEW_WINDOW_KEY = `window.${CANONICAL_REVIEW_WINDOW}`
const INSIGHTS_WINDOW_KEY = `window.${CANONICAL_INSIGHTS_WINDOW}`

export default function Home({ store, firstTime, onSeenWelcome, onGoTab, onSwitchStore }) {
  if (firstTime) return <WelcomeView store={store} onSeenWelcome={onSeenWelcome} />
  return <ReturningView store={store} onGoTab={onGoTab} onSwitchStore={onSwitchStore} />
}

/* ------------------------------------------------------------------ */
/* First-time users → welcome                                          */
/* ------------------------------------------------------------------ */
function WelcomeView({ store, onSeenWelcome }) {
  const { t } = useTranslation()
  const [greeting, setGreeting] = useState('')
  const s = store || {}
  // Same scoping the returning view uses: this screen names the branch two lines
  // above, so its figures have to be that branch's. Unscoped, a Koramangala manager
  // was greeted with the whole network's missed calls and recoverable rupees.
  const scopeId = store?.aggregate ? undefined : store?.id

  useEffect(() => {
    let cancel
    ;(async () => {
      const out = await askAI(
        `Write a warm ONE-sentence welcome for ${PRIMARY_USER.name}, who manages "${s.name} ${s.branch}". Mention you'll help them never miss a lead. Max 22 words. No emoji.`,
        { temperature: 0.8, fallback: t('home.welcomeFallback', { name: PRIMARY_USER.name.split(' ')[0], branch: s.branch }) },
      )
      cancel = typewriter(out, setGreeting)
    })()
    return () => cancel && cancel()
  }, [])

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar px-4">
      <div className="absolute top-2 right-3 z-10">
        <NotificationBell />
      </div>
      <div className="pt-6 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 14 }}
          className="w-20 h-20 rounded-full grid place-items-center animate-pulseGlow"
          style={{ background: 'linear-gradient(135deg,#0E0071 0%, #0070FC 80%)', boxShadow: '0 12px 40px rgba(0,112,252,.5)' }}
        >
          <Sparkles size={30} color="#fff" strokeWidth={2.2} />
        </motion.div>

        <div className="mt-5 m-largeTitle text-white">{t('home.welcomeTitle')}</div>
        <div className="m-title2 ai-text">{s.name} · {s.branch}</div>

        <div className="mt-4 min-h-[64px] m-body text-white/80 px-1">
          {greeting || <span className="opacity-50">{t('home.settingUpStore')}</span>}
        </div>
      </div>

      {/* The interstitial used to print MISSED_CALLS.length — today's RINGING misses only,
          which is a fourth definition of "missed" and where the "8 vs 11" gap started.
          It reads the canonical count now, and says which window it is. */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat value={openMissedCount(undefined, scopeId)} label={t(MISSED_WINDOW_KEY)} caption={t('home.missedLabel', { defaultValue: 'Missed' })} />
        <MiniStat value={rupees(totalRecoverable(scopeId))} label={t('home.recoverable')} />
        <MiniStat value={`${s.rating ?? 4.6}★`} label={t('home.reviewsCount', { count: s.reviews ?? 38 })} />
      </div>

      <div className="mt-5">
        <PrimaryButton icon={ArrowRight} onClick={onSeenWelcome}>{t('home.takeMeIn')}</PrimaryButton>
        <div className="mt-2 m-footnote text-white/45 text-center flex items-center justify-center gap-1.5">
          <ShieldCheck size={11} /> {t('home.nextTimeNote')}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ value, label, caption }) {
  return (
    <Card className="!p-3 text-center">
      <div className="m-title2 text-white m-tabular">{value}</div>
      {caption && <div className="m-caption text-white/70 mt-0.5">{caption}</div>}
      <div className="m-caption text-white/55 mt-0.5">{label}</div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Returning users → what needs you now                                */
/*                                                                     */
/* THE WINDOWS, stated once because five surfaces have to agree.       */
/*                                                                     */
/* This screen used to count over { startMs: getLastLogin() } — a      */
/* window nothing else in the app uses and no badge can express. It    */
/* was one of five different "missed" figures a manager could see in a */
/* single session (7 / 8 / 8 / 11 / 11) and one of four for "waiting   */
/* for a reply" (4 / 2 / ten / 6-of-16).                               */
/*                                                                     */
/* Both triage rows now read the CANONICAL selectors from the data     */
/* layer — openMissedCount() over 'last24h', reviewsWaitingCount()     */
/* over 'last30' — which are the same calls the tab badges make and    */
/* the same windows the Calls and Reviews screens open on. Tapping a   */
/* row therefore lands on a screen showing that exact number. The      */
/* windows are printed under the rows, in the same idiom the Calls     */
/* screen already uses for its reconciliation line.                    */
/*                                                                     */
/* The last-login instant is still on screen (the greeting line) — it  */
/* is real and useful. It is just no longer a secret fourth window     */
/* silently scoping numbers nothing else in the app agrees with.       */
/*                                                                     */
/* "Recovered this week" is a different, EXPLICITLY LABELLED window    */
/* ('last7') — progress over a visit that lasted 16 hours is noise.    */
/* ------------------------------------------------------------------ */
function ReturningView({ store, onGoTab, onSwitchStore }) {
  const { t } = useTranslation()
  const s = store || {}
  // The synthetic "All locations" pick — every store-scoped affordance below branches
  // on this one flag (feedback round 4: cumulative view).
  const aggregate = !!store?.aggregate
  // undefined on All-locations, which every selector reads as "every store".
  const scopeId = aggregate ? undefined : store?.id
  // Re-read every derived count when the data layer moves (a reply posted on the Reviews
  // tab, a lead marked converted on Calls) — the records are mutated in place.
  const version = useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot)
  const [qrOpen, setQrOpen] = useState(false)

  const sinceMs = getLastLogin()

  const triage = useMemo(() => {
    const negatives = filterReviews({ window: CANONICAL_REVIEW_WINDOW, sentiment: 'negative', status: 'unreplied', storeId: scopeId })
      .sort((a, b) => a.rating - b.rating || b.atMs - a.atMs)
    return {
      // Both straight off the canonical selectors — identical to the tab badges.
      missed: openMissedCount(undefined, scopeId),
      answered: callCounts(CANONICAL_MISSED_WINDOW, { storeId: scopeId }).answered,
      waiting: reviewsWaitingCount(undefined, scopeId),
      negatives,
      // The one caller most worth ringing back — real, ranked by chance-to-buy.
      topLead: callbackQueue(scopeId)[0] || null,
    }
  }, [version, scopeId])

  // Progress, over the last 7 days, from real call outcomes: a lead is "won" when someone
  // set its status to converted, and its value is that call's own estimate.
  const week = useMemo(() => {
    const calls = callCounts('last7', { storeId: scopeId })
    const won = getCalls('last7', { storeId: scopeId }).filter(c => c.leadStatus === 'converted')
    return {
      wonCount: won.length,
      wonValue: won.reduce((sum, c) => sum + (c.estValue || 0), 0),
      newReviews: filterReviews({ window: 'last7', storeId: scopeId }).length,
      answered: calls.answered,
      total: calls.total,
    }
  }, [version, scopeId])

  // The Google Business Profile side of the same story: the calls and reviews above are
  // what reached us, these are how many people saw the listing and what they did with
  // it. Every figure — including the deltas — comes off getStoreInsights(); nothing on
  // this screen computes a listing number itself. Null for a store with no listing
  // data, in which case the block does not render at all rather than printing zeroes.
  // All-locations: the SAME six metrics summed across the network — honest sums, with
  // action rate re-derived from summed actions over summed views (see core insights.js).
  const insights = useMemo(
    () => (aggregate ? getNetworkInsights(CANONICAL_INSIGHTS_WINDOW) : getStoreInsights(s.id, CANONICAL_INSIGHTS_WINDOW)),
    [s.id, aggregate],
  )

  // The reviews INBOX is out of the MVP, so the row that opens it is not rendered and
  // "waiting for a reply" cannot be part of what counts as clear — otherwise a store
  // with nothing missed but replies pending would show a "Needs you now" block whose
  // only remaining row reads "0 missed calls".
  const showReplyTriage = FEATURES.reviewsInbox
  const allClear = triage.missed === 0 && (!showReplyTriage || triage.waiting === 0)
  const worstNegative = triage.negatives[0]
  // Same gate as the store picker: MVP has no verification flow, so a build that cannot
  // resolve the problem must not open by naming it.
  const needsVerify = FEATURES.locationVerify && !!store && locationNeedsVerification(store)
  const missedWindow = t(MISSED_WINDOW_KEY)
  const reviewWindow = t(REVIEW_WINDOW_KEY)

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      {/* Greeting + store context */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="m-title1 text-white">{t('home.greeting', { name: PRIMARY_USER.name.split(' ')[0] })}</div>
            {/* dayClock(), not the seed's frozen English LAST_LOGIN string — this is the
                instant every count below is measured from, so it has to localise. */}
            <div className="m-caption text-white/50 mt-0.5">{t('home.lastVisit', { when: dayClock(sinceMs) })}</div>
          </div>
          {/* Right cluster: the global notification bell, then the avatar/QR. The bell is
              the primary daily view's only entry to the notification centre — the
              first-run WelcomeView has its own; ReturningView needs it here too. */}
          <div className="flex items-center gap-1.5 shrink-0">
            <NotificationBell />
            {/* The avatar is the way into the store's review QR (PM, feedback 1). Same
                44px-hit-box-around-a-smaller-visual split as Chip and IconBtn, so the
                target is real and measurable without the avatar growing. The little QR
                badge is the affordance: an avatar that silently opens a sheet is a
                feature nobody finds. */}
            {/* The avatar is the way into Profile now that it is not a tab, so it can no
                longer double as the review-QR trigger the way it did when Profile had a
                slot in the bar. QR keeps its own control beside it, in the builds that
                have the feature — dropping it silently would have cost the full build
                its only entry point. No QR on the network view either way: a review QR
                belongs to ONE listing, and the aggregate is not a listing. */}
            {!aggregate && FEATURES.reviewQr && (
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                aria-label={t('home.reviewQrOpen', {
                  store: s.name,
                  defaultValue: 'Show the review QR code for {{store}}',
                })}
                className="grid place-items-center shrink-0 press min-w-[var(--m-touch-min)] min-h-[var(--m-touch-min)]"
              >
                <span
                  className="w-9 h-9 rounded-full grid place-items-center md-state"
                  style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
                >
                  <QrCode size={17} className="text-white" aria-hidden="true" />
                </span>
              </button>
            )}
            <ProfileButton onClick={() => onGoTab('profile')} />
          </div>
        </div>

        {/* Chip idiom (see UI.jsx): the BUTTON is the full 44px touch target, the painted
            pill stays 32px as an inner span. The hit area grows, the design does not. */}
        <button
          onClick={onSwitchStore}
          className="mt-1 inline-flex items-center min-h-[var(--m-touch-min)] press"
        >
          <span
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full m-subhead md-state"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}
          >
            {aggregate
              ? `${store.label || t('stores.allLocations', { defaultValue: 'All locations' })} · ${t('stores.nStoresShort', { count: networkRollup().stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}`
              : `${s.name} · ${s.branch}`} <RefreshCcw size={12} /> <span className="text-white/45">{t('common.switch')}</span>
          </span>
        </button>
      </div>

      {/* ACROSS YOUR STORES — the cumulative strip, aggregate view only. The four facts a
          multi-store owner scans first, summed from every mapped location; the triage
          rows below already run on network-wide selectors, so the two agree by
          construction. */}
      {aggregate && (() => {
        const net = networkRollup()
        return (
          <div className="px-4 mt-4">
            <div className="m-subhead text-white/55 mb-2 flex items-center gap-1.5">
              <Layers size={13} style={{ color: 'var(--si-primary-text)' }} />
              {t('stores.acrossStores', { defaultValue: 'Across your stores' })}
            </div>
            {/* The strip is the way INTO the roll-up, not just a read-out: it opens the
                locations view at its entry level, which assignmentLevels() derives from
                what this manager holds (several states → state → city → store). A real
                <button> rather than Card's onClick — the div form is invisible to a
                screen reader and unreachable by keyboard. */}
            <button
              type="button"
              onClick={() => onGoTab('network')}
              className="w-full text-left press"
              aria-label={t('stores.acrossStores', { defaultValue: 'Across your stores' })}
            >
              {/* The chevron is a disclosure indicator, so it rides the card's right edge
                  centred against the stats — not parked on a row of its own underneath,
                  where it lined up with nothing and read as a stray glyph. */}
              <Card className="!p-3.5">
                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-4 gap-2 flex-1 min-w-0">
                    <WeekStat value={net.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} tint="var(--si-primary-text)" />
                    <WeekStat value={net.missed} label={t('calls.statMissed', { defaultValue: 'Missed' })} tint="var(--si-error-text)" />
                    <WeekStat value={net.answered} label={t('calls.statAnswered', { defaultValue: 'Answered' })} tint="var(--si-success-text)" />
                    <WeekStat value={`${net.recovery}%`} label={t('stores.recoveryRate', { defaultValue: 'Recovery' })} tint="var(--si-success-text)" />
                  </div>
                  <ChevronRight size={16} className="text-white/40 shrink-0" aria-hidden="true" />
                </div>
              </Card>
            </button>
          </div>
        )
      })()}

      {/* What needs you now — both counts on their canonical window, both windows named. */}
      <div className="px-4 mt-4">
        <div className="m-subhead text-white/55 mb-2 flex items-center gap-1.5">
          <Zap size={13} className="ai-text" />
          {t('home.needsYouNow', { defaultValue: 'Needs you now' })}
        </div>

        {allClear ? (
          <AllClearCard answered={triage.answered} window={missedWindow} />
        ) : (
          <div className="space-y-2.5">
            <MissedRow
              icon={PhoneMissed} tint="#DC2626"
              title={t('home.missedCalls', {
                count: triage.missed,
                defaultValue_one: '{{count}} missed call',
                defaultValue_other: '{{count}} missed calls',
              })}
              sub={triage.topLead
                ? t('home.topCallback', {
                  value: rupees(triage.topLead.estValue),
                  category: t(triage.topLead.categoryKey, { defaultValue: triage.topLead.category }),
                  score: triage.topLead.cli,
                  defaultValue: 'Start with {{value}} {{category}} · {{score}} chance to buy',
                })
                : t('home.missedCallsSub')}
              cta={t('common.callNow', { defaultValue: 'Call now' })}
              // MVP has no Calls tab — the bar drops it and Leads is the one list. So
              // this opens Leads already narrowed to exactly what the row counted:
              // missed, call-sourced. Sending it to 'vmn' put the manager on a screen
              // with no way back through the bar, and made them re-find the same rows.
              // The full build still has Calls, and that is where the row belongs there.
              onClick={() => (IS_MVP
                ? onGoTab('leads', { status: 'missed', source: 'call' })
                : onGoTab('vmn'))}
            />
            {/* Replying to a review is an inbox job, and the inbox is not in this build.
                This was the ONE route left into it — the tab bar already drops Reviews
                in MVP — so without this gate the launch build shipped the full inbox,
                Premium auto-reply pitch and all. */}
            {showReplyTriage && (
              <MissedRow
                icon={Star} tint="#CA8A04" iconColor="var(--si-warning-text)"
                title={t('home.reviewsWaiting', {
                  count: triage.waiting,
                  defaultValue_one: '{{count}} review waiting for a reply',
                  defaultValue_other: '{{count}} reviews waiting for a reply',
                })}
                sub={worstNegative
                  ? t('home.worstNegative', {
                    rating: worstNegative.rating,
                    customer: worstNegative.customer,
                    defaultValue: 'Worst is {{rating}}★ from {{customer}}',
                  })
                  : t('home.allReviewsHealthy')}
                cta={t('common.reviewNow', { defaultValue: 'Review now' })} onClick={() => onGoTab('reviews')}
              />
            )}
          </div>
        )}

      </div>

      {/* Progress — the other half of triage: what the work already got back. */}
      <div className="px-4 mt-5">
        <div className="m-subhead text-white/55 mb-2 flex items-center gap-1.5">
          <TrendingUp size={13} style={{ color: 'var(--si-success-text)' }} />
          {t('home.recoveredThisWeek', { defaultValue: 'Recovered this week' })}
        </div>
        <Card className="!p-3.5">
          <div className="grid grid-cols-3 gap-2">
            {/* These three are 18px VALUES, i.e. normal-size text under WCAG, so they take
                the accessible variants. The mint measured 1.95:1 on a white card. */}
            <WeekStat value={week.wonCount} label={t('home.leadsWon', { defaultValue: 'Leads won' })} tint="var(--si-success-text)" />
            <WeekStat value={rupees(week.wonValue)} label={t('home.valueWon', { defaultValue: 'Value won' })} tint="var(--si-success-text)" />
            <WeekStat value={week.newReviews} label={t('home.newReviews', { defaultValue: 'New reviews' })} tint="var(--si-primary-text)" />
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
            <span className="m-caption text-white/55">
              {t('home.answeredOfCalls', {
                count: week.answered, total: week.total,
                defaultValue: 'You answered {{count}} of {{total}} calls',
              })}
            </span>
            <span className="m-caption text-white/40 m-tabular">
              {rupees(totalRecoverable(scopeId))} {t('home.stillRecoverable', { defaultValue: 'still on the table' })}
            </span>
          </div>
        </Card>
      </div>

      {/* Discovery — the top of the funnel the two blocks above are the bottom of. */}
      {insights && <InsightsBlock insights={insights} />}

      {/* One real next action, and only when the data says there is one. */}
      {needsVerify && (
        <div className="px-4 mt-5">
          <div className="m-subhead text-white/55 mb-2">{t('home.worthDoing', { defaultValue: 'Worth doing' })}</div>
          <MissedRow
            icon={MapPin} tint="#0070FC"
            title={t('home.verifyStoreTitle', { defaultValue: 'Confirm this store’s address' })}
            sub={t('home.verifyStoreSub', { defaultValue: 'Customers can’t find a listing that points at the wrong spot.' })}
            cta={t('home.verifyStoreCta', { defaultValue: 'Check' })} onClick={() => onGoTab('profile')}
          />
        </div>
      )}

      {!aggregate && <ReviewQrSheet open={qrOpen} onClose={() => setQrOpen(false)} store={store} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* DISCOVERY, ENGAGEMENT AND LEADS — the Google Business Profile block  */
/*                                                                      */
/* Six numbers, and Home was recently criticised for BOTH being empty   */
/* and for cramming, so what is here and what is not is a decision:     */
/*                                                                      */
/*  • ONE card, 3 × 2. It reads as a sibling of the "Recovered this      */
/*    week" card directly above it (same grid, same stat idiom) rather  */
/*    than as a new kind of thing, and it costs one screenful, not six  */
/*    rows.                                                             */
/*  • ONE delta per metric, and the comparison is named ONCE in the     */
/*    footer instead of six times as "vs prev" noise next to each.      */
/*  • THE WINDOW IS NAMED, the same discipline the triage counts above  */
/*    already follow — a number with no window is a number nobody can   */
/*    check.                                                            */
/*  • The footer states the arithmetic ties, because they are visible   */
/*    on screen: the three action metrics ARE Total Actions, and Action */
/*    Rate is Total Actions over Profile Views. A manager who adds them */
/*    up gets the answer the panel already told him.                    */
/*                                                                      */
/* LEFT OUT deliberately: sparklines and per-metric charts (Home is a   */
/* triage screen, not an analytics screen), a window picker (nothing    */
/* else on Home has one), and per-metric definitions — "Store Visits"   */
/* is direction requests, which belongs on the listing screen where     */
/* there is room to say so properly.                                    */
/*                                                                      */
/* NOTHING HERE IS HARDCODED. Every value, delta and label comes off    */
/* getStoreInsights(); this component only formats.                     */
/* ------------------------------------------------------------------ */
function InsightsBlock({ insights }) {
  const { t } = useTranslation()
  return (
    <div className="px-4 mt-5">
      <div className="m-subhead text-white/55 mb-2 flex items-center gap-1.5">
        <Eye size={13} style={{ color: 'var(--si-primary-text)' }} />
        {t('home.insightsTitle', { defaultValue: 'Discovery, engagement and leads' })}
      </div>
      <Card className="!p-3.5">
        <div className="grid grid-cols-3 gap-x-2 gap-y-3.5">
          {insights.metrics.map(m => (
            <InsightStat
              key={m.id}
              value={m.unit === 'percent'
                ? t('home.insightsPercent', { value: m.value, defaultValue: '{{value}}%' })
                : formatNumber(m.value)}
              label={t(m.labelKey, { defaultValue: m.label })}
              deltaPct={m.deltaPct}
              syncLagDays={m.syncLagDays}
              accurateThroughMs={m.accurateThroughMs}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}

function InsightStat({ value, label, deltaPct, syncLagDays, accurateThroughMs }) {
  const { t } = useTranslation()
  // Design review 3, items 3 + 5: freshness is per-metric, and it is opt-in reading. The
  // note is tap-to-open rather than always printed — six permanent sync disclaimers would
  // bury the six numbers they are about.
  const [noteOpen, setNoteOpen] = useState(false)
  // No comparison is a real state (all-time, or not enough history behind the window):
  // show the value alone rather than inventing a 0% that reads as "flat".
  const up = deltaPct > 0
  const flat = deltaPct === 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  const tint = flat ? 'var(--text-tertiary)' : up ? 'var(--si-success-text)' : '#DC2626'
  return (
    <div className="relative">
      <div className="m-title3 m-tabular text-white truncate">{value}</div>
      {deltaPct == null ? (
        <div className="h-[15px]" />
      ) : (
        <div
          className="flex items-center gap-0.5 m-micro m-tabular"
          style={{ color: tint }}
          // The direction is carried by an arrow glyph and a colour, neither of which a
          // screen reader can read — so it is said in words here.
          aria-label={flat
            ? t('home.insightsDeltaFlat', { defaultValue: 'unchanged on the previous period' })
            : up
              ? t('home.insightsDeltaUp', { value: Math.abs(deltaPct), defaultValue: 'up {{value}}% on the previous period' })
              : t('home.insightsDeltaDown', { value: Math.abs(deltaPct), defaultValue: 'down {{value}}% on the previous period' })}
        >
          {!flat && <Arrow size={11} strokeWidth={2.4} aria-hidden="true" />}
          {t('home.insightsDelta', {
            value: Math.abs(deltaPct),
            defaultValue: '{{value}}%',
          })}
        </div>
      )}
      <div className="mt-0.5 flex items-start gap-1">
        <span className="m-caption text-white/55 line-clamp-2 min-w-0">{label}</span>
        {syncLagDays > 0 && (
          <button
            type="button"
            onClick={() => setNoteOpen(o => !o)}
            aria-expanded={noteOpen}
            aria-label={t('insights.syncNoteA11y', {
              metric: label,
              defaultValue: 'How fresh is {{metric}}?',
            })}
            /* Negative margin + padding: a real ≥28px hit box around a 10px glyph without
               pushing the six-up grid around. */
            className="shrink-0 -m-2 p-2 press"
          >
            <Hourglass size={10} className="text-white/40" aria-hidden="true" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {noteOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            role="status"
            className="absolute z-20 left-0 top-full mt-1 rounded-xl px-2.5 py-2 m-caption"
            style={{
              background: 'var(--bg-sheet)',
              border: '1px solid var(--border-glass-strong)',
              boxShadow: 'var(--shadow-sheet)',
              color: 'var(--text-secondary)',
              width: 'max(190px, 100%)',
            }}
          >
            {t('insights.syncNote', {
              date: calendarDate(accurateThroughMs),
              metric: label,
              count: syncLagDays,
              defaultValue_one: 'Accurate through {{date}}. Google data for {{metric}} can take up to {{count}} day to sync.',
              defaultValue_other: 'Accurate through {{date}}. Google data for {{metric}} can take up to {{count}} days to sync.',
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * The state the screen never had: nothing missed, nothing unanswered.
 *
 * Only ever rendered when both counts are genuinely zero, and it says WHAT it checked —
 * a green tick that cannot be read as "we didn't look".
 */
function AllClearCard({ answered, window: windowLabel }) {
  const { t } = useTranslation()
  return (
    <Card className="!p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(34,211,139,.10)', border: '1px solid rgba(34,211,139,.35)' }}>
          <CheckCircle2 size={20} style={{ color: '#22D38B' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="m-headline text-white">{t('home.allClearTitle', { defaultValue: 'All clear.' })}</div>
          {/* Exactly the two checks the triage rows make, and nothing more — no number in
              this line, so it is true whatever the window holds. */}
          <div className="m-caption text-white/70 mt-0.5">
            {t('home.allClearSub', { defaultValue: 'Nothing missed, nothing waiting for a reply.' })}
          </div>
          <div className="m-caption text-white/45 mt-1">
            {t('home.allClearAnsweredWindow', {
              count: answered,
              window: windowLabel,
              defaultValue_one: 'You answered {{count}} call in {{window}}.',
              defaultValue_other: 'You answered {{count}} calls in {{window}}.',
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

function WeekStat({ value, label, tint }) {
  return (
    <div>
      <div className="m-title3 m-tabular truncate" style={{ color: tint }}>{value}</div>
      <div className="m-caption text-white/55 line-clamp-2">{label}</div>
    </div>
  )
}

function MissedRow({ icon: Icon, tint, iconColor, title, sub, cta, onClick, valueRight }) {
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: `${tint}1A`, border: `1px solid ${tint}40` }}>
          {/* iconColor separates the glyph from the tile chrome: the amber tint fails the
              3:1 graphics floor as an icon colour (2.94 on white), so the reviews row
              passes the readable amber token here while its tile stays on-brand. */}
          <Icon size={18} style={{ color: iconColor || tint }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="m-headline text-white">{title}</div>
          <div className="m-caption text-white/55 truncate">{sub}</div>
        </div>
        {cta ? (
          // Same Chip split: 44px button, 32px painted pill. The label takes the
          // accessible text variant of the brand blue (see index.css).
          <button onClick={onClick} className="inline-flex items-center justify-center min-h-[var(--m-touch-min)] press shrink-0">
            <span
              className="inline-flex items-center px-3 h-8 rounded-full m-subhead font-semibold whitespace-nowrap md-state"
              style={{ background: 'rgba(0,112,252,.10)', color: 'var(--si-primary-text)', border: '1px solid rgba(0,112,252,.28)' }}
            >
              {cta}
            </span>
          </button>
        ) : valueRight ? (
          <div className="m-title2 text-white m-tabular shrink-0">{valueRight}</div>
        ) : null}
      </div>
    </Card>
  )
}
