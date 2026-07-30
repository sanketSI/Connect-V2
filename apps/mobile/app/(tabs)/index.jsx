// ============================================================
// HOME — ported section-for-section from apps/web/src/screens/Home.jsx, which is the
// single source of truth. Same selectors, same canonical windows, same gates, same copy
// keys. Where the web file explains a decision (the five-different-"missed" history, the
// insights block's restraint), the explanation is not repeated here — read it there.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  PhoneMissed, Star, Sparkles, RefreshCcw, Zap, ShieldCheck, CheckCircle2,
  TrendingUp, ArrowUpRight, ArrowDownRight, Eye, Hourglass, Layers, ChevronRight, ArrowRight,
} from 'lucide-react-native'
import {
  getCurrentUser, getLastLogin, callCounts, getCalls, callbackQueue, filterReviews,
  openMissedCount, reviewsWaitingCount, CANONICAL_MISSED_WINDOW, CANONICAL_REVIEW_WINDOW,
  getStoreInsights, getNetworkInsights, networkRollup, CANONICAL_INSIGHTS_WINDOW,
  formatNumber, rupees, totalRecoverable, dayClock, calendarDate,
  isReturningUser, markReturningUser, askAI, typewriter,
} from '@connect/core'
import { Screen, Card, SectionLabel, Title, Body, Caption, PrimaryButton } from '../../components/UI.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { FEATURES, IS_MVP } from '../../lib/features.js'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { refreshDerived } from '../../lib/refresh.js'
import { vibrate } from '../../lib/haptics.js'

const MISSED_WINDOW_KEY = `window.${CANONICAL_MISSED_WINDOW}`
const REVIEW_WINDOW_KEY = `window.${CANONICAL_REVIEW_WINDOW}`

export default function HomeTab() {
  const [firstTime, setFirstTime] = useState(() => !isReturningUser())
  if (firstTime) {
    return <WelcomeView onSeenWelcome={() => { markReturningUser(); setFirstTime(false) }} />
  }
  return <ReturningView />
}

/* ------------------------------------------------------------------ */
/* First-time users → welcome                                          */
/* ------------------------------------------------------------------ */
function WelcomeView({ onSeenWelcome }) {
  const { t } = useTranslation()
  const session = useSession()
  const user = getCurrentUser()
  const s = session.store?.aggregate ? user.store : (session.store || user.store)
  const scopeId = session.store?.aggregate ? undefined : session.store?.id
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    let cancel
    ;(async () => {
      const out = await askAI(
        `Write a warm ONE-sentence welcome for ${user.name}, who manages "${s.name} ${s.branch}". Mention you'll help them never miss a lead. Max 22 words. No emoji.`,
        { temperature: 0.8, fallback: t('home.welcomeFallback', { name: user.name.split(' ')[0], branch: s.branch }) },
      )
      cancel = typewriter(out, setGreeting)
    })()
    return () => cancel && cancel()
  }, [])

  return (
    <Screen>
      <View className="items-end"><HeaderRight /></View>
      <View className="items-center mt-4">
        <View
          className="w-20 h-20 rounded-full items-center justify-center bg-brand-blue"
          style={{ shadowColor: '#0070FC', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 8 }}
        >
          <Sparkles size={30} color="#fff" strokeWidth={2.2} />
        </View>
        <Title className="mt-5 text-center">{t('home.welcomeTitle', { defaultValue: 'Welcome to Connect.' })}</Title>
        <Text className="text-lg font-hk-semi text-primaryText dark:text-d-primaryText mt-1">
          {s.name} · {s.branch}
        </Text>
        <Body className="mt-4 text-center min-h-[64px] px-1">
          {greeting || <Text className="opacity-50">{t('home.settingUpStore', { defaultValue: 'Setting up your store…' })}</Text>}
        </Body>
      </View>

      <View className="flex-row gap-2 mt-4">
        <MiniStat value={String(openMissedCount(undefined, scopeId))} caption={t('home.missedLabel', { defaultValue: 'Missed' })} label={t(MISSED_WINDOW_KEY, { defaultValue: 'Last 24 hours' })} />
        <MiniStat value={rupees(totalRecoverable(scopeId))} label={t('home.recoverable', { defaultValue: 'Recoverable' })} />
        <MiniStat value={`${s.rating ?? 4.6}★`} label={t('home.reviewsCount', { count: s.reviews ?? 38, defaultValue_one: '{{count}} review', defaultValue_other: '{{count}} reviews' })} />
      </View>

      <View className="mt-5">
        <PrimaryButton onPress={onSeenWelcome}>{t('home.takeMeIn', { defaultValue: 'Take me in' })}</PrimaryButton>
        <View className="flex-row items-center justify-center gap-1.5 mt-2">
          <ShieldCheck size={11} color="#93A0C8" />
          <Caption>{t('home.nextTimeNote', { defaultValue: "Next time, you'll land on what changed since your last visit." })}</Caption>
        </View>
      </View>
    </Screen>
  )
}

function MiniStat({ value, caption, label }) {
  return (
    <Card className="flex-1 !p-3 items-center">
      <Text className="text-lg font-hk-bold text-ink dark:text-d-ink" numberOfLines={1}>{value}</Text>
      {caption ? <Caption className="mt-0.5">{caption}</Caption> : null}
      <Caption className="mt-0.5 text-center" numberOfLines={2}>{label}</Caption>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Returning users → what needs you now                                */
/* ------------------------------------------------------------------ */
function ReturningView() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const version = useDataVersion()

  const user = getCurrentUser()
  const store = session.store
  const aggregate = !!store?.aggregate
  const s = aggregate ? {} : (store || {})
  const scopeId = aggregate ? undefined : store?.id
  const sinceMs = getLastLogin()

  const triage = useMemo(() => {
    const negatives = filterReviews({ window: CANONICAL_REVIEW_WINDOW, sentiment: 'negative', status: 'unreplied', storeId: scopeId })
      .sort((a, b) => a.rating - b.rating || b.atMs - a.atMs)
    return {
      missed: openMissedCount(undefined, scopeId),
      answered: callCounts(CANONICAL_MISSED_WINDOW, { storeId: scopeId }).answered,
      waiting: reviewsWaitingCount(undefined, scopeId),
      negatives,
      topLead: callbackQueue(scopeId)[0] || null,
    }
  }, [version, scopeId])

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

  const insights = useMemo(
    () => (aggregate ? getNetworkInsights(CANONICAL_INSIGHTS_WINDOW) : getStoreInsights(s.id, CANONICAL_INSIGHTS_WINDOW)),
    [s.id, aggregate],
  )

  // No combined "all clear" flag any more — the hero decides its own zero state from the
  // missed count and the reviews row renders itself only when it has a number worth
  // showing. Same restructure as the web file; read the reasoning there.
  const showReplyTriage = FEATURES.reviewsInbox
  const worstNegative = triage.negatives[0]
  const missedWindow = t(MISSED_WINDOW_KEY, { defaultValue: 'Last 24 hours' })
  const reviewWindow = t(REVIEW_WINDOW_KEY, { defaultValue: 'Last 30 days' })
  const net = aggregate ? networkRollup() : null

  return (
    <Screen onRefresh={refreshDerived}>
      {/* Greeting + store context — one row of chrome, exactly the web layout. */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title>{t('home.greeting', { name: user.name.split(' ')[0], defaultValue: 'Welcome back, {{name}}.' })}</Title>
          <Caption className="mt-0.5">{t('home.lastVisit', { when: dayClock(sinceMs), defaultValue: 'Last visit · {{when}}' })}</Caption>
        </View>
        <HeaderRight />
      </View>

      {/* The switcher pill. */}
      <Pressable
        onPress={() => { vibrate(8); router.push('/switch') }}
        accessibilityRole="button"
        accessibilityLabel={t('store.switchTitle', { defaultValue: 'Switch location' })}
        className="flex-row items-center gap-1.5 self-start mt-2 h-9 px-3 rounded-pill bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline"
      >
        <Text className="text-[13px] font-hk-medium text-ink-2 dark:text-d-ink2" numberOfLines={1}>
          {aggregate
            ? `${store?.label || t('stores.allLocations', { defaultValue: 'All locations' })} · ${t('stores.nStoresShort', { count: networkRollup().stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}`
            : `${store?.name} · ${store?.branch}`}
        </Text>
        <RefreshCcw size={12} color="#5F6878" />
        <Text className="text-[13px] font-hk-medium text-ink-3 dark:text-d-ink3">{t('common.switch', { defaultValue: 'Switch' })}</Text>
      </Pressable>

      {/* MISSED CALLS — THE HERO, AND THE FIRST THING ON THE SCREEN. It used to be the
          first ROW of "Needs you now", in the same 16px headline as the reviews row under
          it, which said the two were equally urgent. A missed call is money already
          walking out of the shop; it now opens the screen in the largest type the product
          has. The web file carries the full reasoning, including why the count is a whole
          catalog phrase rather than a giant bare numeral. */}
      <View className="mt-4">
        <MissedHero
          count={triage.missed}
          recoverable={rupees(totalRecoverable(scopeId))}
          topLead={triage.topLead}
          answered={triage.answered}
          windowLabel={missedWindow}
          onCall={() => router.push(IS_MVP ? '/(tabs)/leads?status=missed' : '/(tabs)/leads')}
          t={t}
        />
      </View>

      {/* ACROSS YOUR STORES — aggregate only. */}
      {aggregate && (
        <>
          <SectionLabel icon={Layers}>{t('stores.acrossStores', { defaultValue: 'Across your stores' })}</SectionLabel>
          <Card onPress={() => router.push('/(tabs)/locations')} label={t('stores.acrossStores', { defaultValue: 'Across your stores' })} className="!p-3.5">
            <View className="flex-row items-center gap-2">
              <View className="flex-row gap-2 flex-1 min-w-0">
                <WeekStat value={net.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} tone="text-primaryText dark:text-d-primaryText" />
                <WeekStat value={net.missed} label={t('calls.statMissed', { defaultValue: 'Missed' })} tone="text-bad dark:text-d-bad" />
                <WeekStat value={net.answered} label={t('calls.statAnswered', { defaultValue: 'Answered' })} tone="text-ok dark:text-d-ok" />
                <WeekStat value={`${net.recovery}%`} label={t('stores.recoveryRate', { defaultValue: 'Recovery' })} tone="text-ok dark:text-d-ok" />
              </View>
              <ChevronRight size={16} color="#93A0C8" />
            </View>
          </Card>
        </>
      )}

      {/* WHAT ELSE needs you — reviews only, now that missed calls lead the screen. The
          section renders ONLY when it has something in it: a "Needs you now" heading over
          a row reading "0 reviews waiting" is the shape this codebase keeps deleting.
          Missed calls are not counted here at all — the hero owns them. */}
      {showReplyTriage && triage.waiting > 0 && (
        <>
          <SectionLabel icon={Zap}>{t('home.needsYouNow', { defaultValue: 'Needs you now' })}</SectionLabel>
          <TriageRow
            icon={Star} tint="#CA8A04" bg="bg-[#CA8A04]/10"
            title={t('home.reviewsWaiting', { count: triage.waiting, defaultValue_one: '{{count}} review waiting for a reply', defaultValue_other: '{{count}} reviews waiting for a reply' })}
            sub={worstNegative
              ? t('home.worstNegative', { rating: worstNegative.rating, customer: worstNegative.customer, defaultValue: 'Worst is {{rating}}★ from {{customer}}' })
              : t('home.allReviewsHealthy', { defaultValue: 'All reviews look healthy' })}
            cta={t('common.reviewNow', { defaultValue: 'Review now' })}
            onPress={() => router.push('/(tabs)/reviews')}
          />
        </>
      )}

      {/* Recovered this week — progress, explicitly on last7. */}
      <SectionLabel icon={TrendingUp}>{t('home.recoveredThisWeek', { defaultValue: 'Recovered this week' })}</SectionLabel>
      <Card className="!p-3.5">
        <View className="flex-row gap-2">
          <WeekStat value={week.wonCount} label={t('home.leadsWon', { defaultValue: 'Leads won' })} tone="text-ok dark:text-d-ok" />
          <WeekStat value={rupees(week.wonValue)} label={t('home.valueWon', { defaultValue: 'Value won' })} tone="text-ok dark:text-d-ok" />
          <WeekStat value={week.newReviews} label={t('home.newReviews', { defaultValue: 'New reviews' })} tone="text-primaryText dark:text-d-primaryText" />
        </View>
        {/* "Still on the table" USED to sit here too, and with the hero above it the
            same rupee figure printed twice on one screen. It belongs to the hero: this
            card is what the work got BACK. */}
        <View className="mt-3 pt-3 border-t border-hairline dark:border-d-hairline">
          <Caption>
            {t('home.answeredOfCalls', { count: week.answered, total: week.total, defaultValue: 'You answered {{count}} of {{total}} calls' })}
          </Caption>
        </View>
      </Card>

      {/* Discovery, engagement and leads — the six GBP metrics with deltas + freshness. */}
      {insights && <InsightsBlock insights={insights} t={t} />}
    </Screen>
  )
}

function TriageRow({ icon: Icon, tint, bg, title, sub, cta, onPress }) {
  return (
    <Card className="!p-3">
      <View className="flex-row items-center gap-3">
        <View className={`w-10 h-10 rounded-xl items-center justify-center ${bg}`}>
          <Icon size={18} color={tint} />
        </View>
        <View className="flex-1 min-w-0">
          <Body className="font-hk-semi text-ink dark:text-d-ink">{title}</Body>
          <Caption numberOfLines={1} className="mt-0.5">{sub}</Caption>
        </View>
        <Pressable
          onPress={() => { vibrate(10); onPress() }}
          accessibilityRole="button"
          accessibilityLabel={cta}
          className="h-11 items-center justify-center"
        >
          <View className="h-8 px-3 rounded-pill bg-brand-blue/10 border border-brand-blue/30 items-center justify-center">
            <Text className="text-[13px] font-hk-semi text-primaryText dark:text-d-primaryText">{cta}</Text>
          </View>
        </Pressable>
      </View>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* THE MISSED-CALL HERO — the native twin of MissedHero in the web     */
/* file. 34px/40 matches .m-hero there; the two are meant to be        */
/* checkable against one number.                                       */
/*                                                                     */
/* Two states, and the zero one is a DIFFERENT card, not a smaller     */
/* version of the loud one: a red "0 missed calls" in 34px type alarms  */
/* a manager who has done nothing wrong.                               */
/* ------------------------------------------------------------------ */
function MissedHero({ count, recoverable, topLead, answered, windowLabel, onCall, t }) {
  if (count === 0) return <AllClearHero answered={answered} windowLabel={windowLabel} t={t} />

  return (
    <Card className="!p-0 overflow-hidden" style={{ borderColor: 'rgba(220,38,38,0.30)' }}>
      {/* The wash carries the alarm, not a solid fill — this sits in the same card stack
          as everything else on Home, and a block of red reads as an error the app made
          rather than as work waiting. Same three stops and angle as the web gradient. */}
      <LinearGradient
        colors={['rgba(220,38,38,0.20)', 'rgba(220,38,38,0.05)', 'rgba(220,38,38,0)']}
        locations={[0, 0.52, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}
      >
        {/* EYEBROW — names the window. A number with no window is a number nobody can
            check, and that rule is not suspended for being the hero. */}
        <View className="flex-row items-center gap-2">
          <View className="w-6 h-6 rounded-lg items-center justify-center bg-bad/15 border border-bad/40">
            <PhoneMissed size={13} color="#DC2626" />
          </View>
          <Text className="text-[12px] font-hk-semi uppercase tracking-wider text-bad dark:text-d-bad">
            {t('home.missedLabel', { defaultValue: 'Missed' })} · {windowLabel}
          </Text>
        </View>

        {/* THE COUNT — the catalog owns the whole phrase, because Hindi, Marathi and
            Gujarati inflect the noun with the number. A giant bare numeral beside a
            small noun would look bolder in English and be wrong in three languages. */}
        <Text className="text-[34px] leading-10 font-hk-bold text-ink dark:text-d-ink mt-2">
          {t('home.missedCalls', {
            count,
            defaultValue_one: '{{count}} missed call',
            defaultValue_other: '{{count}} missed calls',
          })}
        </Text>

        {/* THE MONEY — the reason to act on the alarm above it. */}
        <Text className="mt-1">
          <Text className="text-[17px] font-hk-bold text-bad dark:text-d-bad">{recoverable}</Text>
          <Text className="text-[14px] font-hk-medium text-ink-3 dark:text-d-ink3">
            {' '}{t('home.stillRecoverable', { defaultValue: 'still on the table' })}
          </Text>
        </Text>

        {/* WHAT THIS COUNT IS, always. openMissedCount() counts missed calls STILL OPEN,
            while the aggregate strip below prints ALL missed in the same window — 16 and
            25 on this fixture, ~150px apart. Both are true and neither can be dropped
            (Recovery% needs the total), so the hero says out loud that its number is the
            outstanding WORK. Core's rule: a screen showing both reconciles them aloud. */}
        <Body className="mt-2.5">
          {t('home.missedCallsSub', { defaultValue: 'Hot leads waiting for a call-back' })}
        </Body>

        {/* WHERE TO START — only when the queue can actually name a lead. */}
        {topLead ? (
          <Caption className="mt-1">
            {t('home.topCallback', {
              value: rupees(topLead.estValue),
              category: t(topLead.categoryKey, { defaultValue: topLead.category }),
              score: topLead.cli,
              defaultValue: 'Start with {{value}} {{category}} · {{score}} chance to buy',
            })}
          </Caption>
        ) : null}

        {/* One tap out. Lands on Leads already narrowed to what the count counted, so
            the number on this card is the number on that screen. */}
        <View className="mt-3.5">
          <PrimaryButton icon={ArrowRight} onPress={onCall}>
            {t('common.callNow', { defaultValue: 'Call now' })}
          </PrimaryButton>
        </View>
      </LinearGradient>
    </Card>
  )
}

/**
 * NOTHING MISSED — the hero's calm state. It says what it checked and over which window,
 * so a green tick cannot be read as "we didn't look". It does NOT claim the reviews inbox
 * is clear: that is a separate count on a separate window, with its own row below.
 */
function AllClearHero({ answered, windowLabel, t }) {
  return (
    <Card className="!p-4" style={{ borderColor: 'rgba(34,211,139,0.28)' }}>
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-xl items-center justify-center bg-ok/10 border border-ok/40">
          <CheckCircle2 size={20} color="#22D38B" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[17px] font-hk-bold text-ink dark:text-d-ink">
            {t('home.allClearTitle', { defaultValue: 'All clear.' })}
          </Text>
          <Body className="mt-1">
            {t('home.allClearAnsweredWindow', {
              count: answered, window: windowLabel,
              defaultValue_one: 'You answered {{count}} call in {{window}}.',
              defaultValue_other: 'You answered {{count}} calls in {{window}}.',
            })}
          </Body>
        </View>
      </View>
    </Card>
  )
}

function InsightsBlock({ insights, t }) {
  return (
    <>
      <SectionLabel icon={Eye}>{t('home.insightsTitle', { defaultValue: 'Discovery, engagement and leads' })}</SectionLabel>
      <Card className="!p-3.5">
        <View className="flex-row flex-wrap">
          {insights.metrics.map(m => (
            <InsightStat
              key={m.id}
              t={t}
              value={m.unit === 'percent'
                ? t('home.insightsPercent', { value: m.value, defaultValue: '{{value}}%' })
                : formatNumber(m.value)}
              label={t(m.labelKey, { defaultValue: m.label })}
              deltaPct={m.deltaPct}
              syncLagDays={m.syncLagDays}
              accurateThroughMs={m.accurateThroughMs}
            />
          ))}
        </View>
      </Card>
    </>
  )
}

function InsightStat({ value, label, deltaPct, syncLagDays, accurateThroughMs, t }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const up = deltaPct > 0
  const flat = deltaPct === 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  const tint = flat ? '#5F6878' : up ? '#13764E' : '#DC2626'
  return (
    <View className="w-1/3 pr-2 mb-3.5">
      <Text className="text-[17px] font-hk-bold text-ink dark:text-d-ink" numberOfLines={1}>{value}</Text>
      {deltaPct == null ? (
        <View className="h-[15px]" />
      ) : (
        <View
          className="flex-row items-center gap-0.5"
          accessibilityLabel={flat
            ? t('home.insightsDeltaFlat', { defaultValue: 'unchanged on the previous period' })
            : up
              ? t('home.insightsDeltaUp', { value: Math.abs(deltaPct), defaultValue: 'up {{value}}% on the previous period' })
              : t('home.insightsDeltaDown', { value: Math.abs(deltaPct), defaultValue: 'down {{value}}% on the previous period' })}
        >
          {!flat && <Arrow size={11} color={tint} strokeWidth={2.4} />}
          <Text className="text-[11px] font-hk-medium" style={{ color: tint }}>
            {t('home.insightsDelta', { value: Math.abs(deltaPct), defaultValue: '{{value}}%' })}
          </Text>
        </View>
      )}
      <View className="flex-row items-start gap-1 mt-0.5">
        <Caption numberOfLines={2} className="flex-shrink">{label}</Caption>
        {syncLagDays > 0 && (
          <Pressable
            onPress={() => { vibrate(6); setNoteOpen(o => !o) }}
            accessibilityRole="button"
            accessibilityLabel={t('insights.syncNoteA11y', { metric: label, defaultValue: 'How fresh is {{metric}}?' })}
            className="p-2 -m-2"
          >
            <Hourglass size={10} color="#93A0C8" />
          </Pressable>
        )}
      </View>
      {noteOpen && (
        <View className="absolute z-20 left-0 top-full mt-1 rounded-xl px-2.5 py-2 bg-card dark:bg-d-screen border border-hairline dark:border-d-hairline" style={{ width: 190, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
          <Caption>
            {t('insights.syncNote', {
              date: calendarDate(accurateThroughMs), metric: label, count: syncLagDays,
              defaultValue_one: 'Accurate through {{date}}. Google data for {{metric}} can take up to {{count}} day to sync.',
              defaultValue_other: 'Accurate through {{date}}. Google data for {{metric}} can take up to {{count}} days to sync.',
            })}
          </Caption>
        </View>
      )}
    </View>
  )
}

function WeekStat({ value, label, tone }) {
  return (
    <View className="flex-1 min-w-0">
      <Text className={`text-[17px] font-hk-bold ${tone}`} numberOfLines={1}>{value}</Text>
      <Caption numberOfLines={2}>{label}</Caption>
    </View>
  )
}
