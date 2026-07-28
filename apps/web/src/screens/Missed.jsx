// ============================================================
// CALLS — the list, the call card, and the ONE call-detail screen.
//
// Rendered `embedded` inside CallsTab, which owns the window / outcome / filter state
// and the header roll-ups. This file owns everything below the segmented control:
//
//   • the filtered list (selectCalls, from @connect/core — the one predicate the badges
//     and the list share)
//   • multi-select + bulk actions (lead status, bulk review request) — real mutators
//   • the merged call detail (PM 10.1): when it happened, whether the caller sounded
//     unhappy, whether the review link went out, lead status, and THEN the transcript
//     (attended) or the call-back coach (missed). One screen, not two.
//
// Nothing here is decorative: every count, tag and state reads off a record, and every
// action goes through the data-layer mutators so the list, the badges and the roll-ups
// all see the same change.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PhoneMissed, PhoneCall, Phone, Sparkles, Repeat2, Radio,
  Mic, MicOff, Volume2, Lock as LockIcon, Check, ShieldCheck, Headphones, Star,
  MessageCircle, Smile, Frown, Meh, AlertTriangle, XCircle,
  FileText, NotebookPen, Send, Copy, Play, Square, History, ChevronRight,
} from 'lucide-react'
import {
  AICard, AIBadge, Card, Chip, SourceChip, PrimaryButton, Lock, AIShimmer, StoreBadge, StoreGroupHeader,
} from '../components/UI.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import { cn, vibrate } from '../lib/utils.js'
import {
  getCallById, getTranscript, isMissed, isAttended,
  setLeadStatus, markReviewLinkSent,
  getCustomerById, getCustomerNotes, addCustomerNote, negativeReviewFor,
  selectCalls, leadBandOf, DEFAULT_CALL_FILTERS,
  interactionCountForCall,
  LEAD_STATUSES, CALL_SENTIMENTS, SOURCES, OUTBOUND_AGENT_ENABLED,
  relativeTime, dayClock, clockTime, askAI,
  groupByStore,
} from '@connect/core'
import { altLanguage, getLanguage } from '@connect/core/i18n/languages.js'
import { track } from '@connect/core/analytics.js'
import { useToast } from '../components/Toast.jsx'
// Design review 3, item 15: ONE customer page. The person-level view behind a call is the
// same sheet the Customers tab opens — not a second profile that drifts from it. This is
// exactly the entry point CustomerDetailSheet was exported for.
import { CustomerDetailSheet } from './Customers.jsx'

// selectCalls / leadBandOf / DEFAULT_CALL_FILTERS / LEAD_BANDS used to live in this file
// and CallsTab imported them from here — a screen reaching into a screen for domain rules.
// They are now in @connect/core (data/calls.js), which is where the thresholds and the
// filter semantics belong and the only place both this app and Expo can read them.

// ============================================================
// SMALL SHARED BITS
// ============================================================

/** History rows carry only `masked`; today's rows carry a prettier display form. */
const maskedOf = (call) => call.fullMaskedDisplay || call.masked

/** "Called 3× in 2 hours" — the urgency fact, inline where the call-back decision is made. */
function repeatInline(t, call) {
  const hist = call.repeatHistoryAtMs
  if (!hist || hist.length < 2) {
    return t('vmn.calledCount', { defaultValue: 'Called {{count}}×', count: call.repeats })
  }
  const spanMs = Math.max(...hist) - Math.min(...hist)
  const span = spanMs >= 3.6e6
    ? t('calls.spanHours', {
      count: Math.max(1, Math.round(spanMs / 3.6e6)),
      defaultValue_one: '{{count}} hour', defaultValue_other: '{{count}} hours',
    })
    : t('calls.spanMinutes', {
      count: Math.max(1, Math.round(spanMs / 60000)),
      defaultValue_one: '{{count}} minute', defaultValue_other: '{{count}} minutes',
    })
  return t('calls.repeatInline', { defaultValue: 'Called {{count}}× in {{span}}', count: call.repeats, span })
}

/**
 * Render a seed value through its catalog key. Not every record carries every field —
 * only today's missed calls have an `intentReason`, only IVR drops have a `stage` — so
 * a missing key falls back to the English value rather than asking i18next for `undefined`.
 */
const keyed = (t, key, value) => (key ? t(key, { defaultValue: value }) : (value ?? ''))

// One colour per tone — but split into TWO jobs the old single `fg` conflated:
//
//   fg    the BRAND hue, for fills, dots and borders. Never carries words.
//   text  the READABLE step of the same hue, for labels and icons. These are the
//         theme-aware --si-*-text tokens: raw #16A34A measures 3.30 on a white card and
//         #CA8A04 just 2.94 — under the 4.5 floor for the 13px tags this screen paints
//         them on (amber under even the 3:1 graphics floor). The tokens give 5.6/5.9 in
//         light and stay bright in dark.
const TONES = {
  brand: { fg: '#0070FC', text: 'var(--si-primary-text)', bg: 'rgba(0,112,252,.10)', bd: 'rgba(0,112,252,.30)' },
  success: { fg: '#16A34A', text: 'var(--si-success-text)', bg: 'rgba(22,163,74,.12)', bd: 'rgba(22,163,74,.30)' },
  danger: { fg: '#DC2626', text: 'var(--si-error-text)', bg: 'rgba(220,38,38,.10)', bd: 'rgba(220,38,38,.30)' },
  warning: { fg: '#CA8A04', text: 'var(--si-warning-text)', bg: 'rgba(202,138,4,.10)', bd: 'rgba(202,138,4,.30)' },
  muted: { fg: 'var(--text-tertiary)', text: 'var(--text-tertiary)', bg: 'var(--bg-subtle)', bd: 'var(--border-glass)' },
}

function Tag({ icon: Icon, tone = 'muted', children, className }) {
  const s = TONES[tone] || TONES.muted
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-medium whitespace-nowrap', className)}
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.bd}` }}
    >
      {Icon && <Icon size={11} className="shrink-0" />}
      {children}
    </span>
  )
}

/**
 * Chance to buy — the TAG only, never the score (PM 6: it read "92 · Hot").
 * Reuses the existing .cli-pill[data-band] colour bands so it is the same pill the app
 * already speaks, minus the number.
 */
function LeadTag({ score }) {
  const { t } = useTranslation()
  const band = leadBandOf(score)
  if (!band) return null
  const label = {
    hot: t('common.hot', { defaultValue: 'Hot' }),
    warm: t('common.warm', { defaultValue: 'Warm' }),
    cool: t('common.cool', { defaultValue: 'Cool' }),
    cold: t('common.cold', { defaultValue: 'Cold' }),
  }[band]
  return (
    <span className="cli-pill inline-flex items-center px-2 h-6 rounded-full m-caption shrink-0" data-band={band}>
      {label}
    </span>
  )
}

/**
 * Why they rang — read off the call script, so ATTENDED ONLY (design review 3, item 9:
 * "the reason of call would never be there for missed calls"). The seed may carry a
 * campaign guess on a missed row; the display rule wins — nobody said anything on a call
 * nobody answered, and a tag would claim we heard them.
 */
function ReasonTag({ call }) {
  const { t } = useTranslation()
  if (!isAttended(call) || !call.callReason) return null
  return <Tag icon={FileText} tone="brand">{keyed(t, call.callReasonKey, call.callReason)}</Tag>
}

const SENTIMENT_UI = {
  positive: { tone: 'success', Icon: Smile },
  negative: { tone: 'danger', Icon: Frown },
  neutral: { tone: 'muted', Icon: Meh },
}

/**
 * How the call ended. Only ever shown for an ATTENDED call: a missed call is 'neutral'
 * because nobody spoke, and painting "Neutral" on it would claim we read a tone we never
 * heard. The filter still spans both — see the empty state.
 */
function SentimentTag({ call }) {
  const { t } = useTranslation()
  if (!isAttended(call) || !call.sentiment) return null
  const meta = CALL_SENTIMENTS.find(s => s.id === call.sentiment)
  const ui = SENTIMENT_UI[call.sentiment] || SENTIMENT_UI.neutral
  return <Tag icon={ui.Icon} tone={ui.tone}>{keyed(t, meta?.labelKey, meta?.label || call.sentiment)}</Tag>
}

/** PM 16: the state of a lead that was marked converted (or lost). Open shows nothing. */
function LeadStatusTag({ call }) {
  const { t } = useTranslation()
  if (call.leadStatus === 'converted') {
    return <Tag icon={Check} tone="success">{t('calls.leadConverted', { defaultValue: 'Converted' })}</Tag>
  }
  if (call.leadStatus === 'expired') {
    return <Tag icon={XCircle} tone="muted">{t('calls.leadExpired', { defaultValue: 'Expired' })}</Tag>
  }
  return null
}

/** PM 16: the state of a caller the WhatsApp review link already went out to. */
function ReviewSentTag({ call }) {
  const { t } = useTranslation()
  if (!call.reviewLinkSent) return null
  return <Tag icon={MessageCircle} tone="success">{t('customers.reviewLinkSent', { defaultValue: 'Review link sent' })}</Tag>
}

/**
 * HOW WELL WE KNOW THIS CALLER — PM: replace the call duration with "the number of
 * interactions between this customer and the store manager".
 *
 * Duration ("4m 32s") described the recording; it said nothing the manager could act on
 * once the recording itself is on the screen below. A caller on their fifth contact is a
 * different call from a stranger's first, and that is a decision he makes before dialling.
 *
 * The count is interactionCountForCall() in @connect/core — calls on this customer's
 * record plus their CRM timeline, unioned. It returns NULL for an anonymous caller we
 * hold no record for, and then this renders nothing at all rather than a flattering "1".
 */
function InteractionsTag({ call }) {
  const { t } = useTranslation()
  const n = interactionCountForCall(call)
  if (n == null || n < 1) return null
  return (
    <Tag icon={History} tone="muted">
      {t('calls.interactionCount', {
        defaultValue_one: '{{count}} interaction',
        defaultValue_other: '{{count}} interactions',
        count: n,
      })}
    </Tag>
  )
}

/** Missed call / IVR drop / attended — the avatar and its accent. */
function kindUI(call) {
  if (call.kind === 'ivr') return { Icon: Radio, tone: 'warning' }
  if (isAttended(call)) return { Icon: PhoneCall, tone: 'success' }
  return { Icon: PhoneMissed, tone: 'brand' }
}

// ============================================================
// THE LIST
// ============================================================

export default function CallsList({
  win, outcome, filters = DEFAULT_CALL_FILTERS, embedded = false,
  // The branch this list is scoped to (undefined = every store), and whether the session
  // is the All-locations view — which is the ONLY place a row needs to say where it came
  // from. See StoreBadge in UI.jsx.
  storeId, aggregate = false,
  // The window this list is FOR, spelled the way the header spells it. The count above
  // the rows is meaningless without it — see the note on the list header below.
  winLabel,
  version = 0, onMutate, onClearFilters, store,
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [detail, setDetail] = useState(null)   // call id — re-read each render so mutations show
  const [callOpen, setCallOpen] = useState(null)
  const [reviewIds, setReviewIds] = useState(null)
  const [calledBack, setCalledBack] = useState({})

  // The callback, recorded at the ONE UI site both the card and the detail route
  // through (a simulated in-app call, not a core mutator, so it fires at the call
  // site). The calls path dials back over the secure VMN, so channel is 'vmn';
  // `from: 'calls'` sets it apart from the Customers book, which fires the same
  // event with `from: 'customer_detail'`. minutes_since_miss — the pitch of the
  // whole product — is measured from when the call was missed; a row with no miss
  // instant omits it rather than inventing a zero.
  function placeCall(call) {
    vibrate([10, 20, 10])
    track('callback_initiated', {
      call_id: call.id,
      customer_id: call.customerId ?? null,
      channel: 'vmn',
      from: 'calls',
      minutes_since_miss: (isMissed(call) && Number.isFinite(call.atMs))
        ? Math.round((Date.now() - call.atMs) / 60000)
        : undefined,
    })
    setCallOpen(call)
    setCalledBack(s => ({ ...s, [call.id]: true }))
  }

  const list = useMemo(
    () => selectCalls(win, outcome, filters, storeId),
    [win, outcome, filters, version, storeId],
  )

  // One group per branch in the cumulative view; a single unlabelled group otherwise,
  // so the list markup has one shape. After `list`, which it reads.
  const groups = useMemo(
    () => (aggregate ? groupByStore(list) : [{ storeId: null, label: null, count: list.length, items: list }]),
    [aggregate, list],
  )
  // Headings are for telling branches apart. With a branch already chosen in the picker
  // above, `storeId` is set, every row belongs to it, and the heading would repeat what
  // the control on screen already says.
  const showGroupHeaders = aggregate && !storeId

  const detailCall = detail ? getCallById(detail) : null

  return (
    <div className={embedded
      ? 'pb-[88px]'
      : 'absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar'}>
      <div className={embedded ? '' : 'px-4'}>
        {/* Cards */}
        {list.length === 0 ? (
          <Card className="!p-6 text-center">
            <div className="m-headline text-white">{t('calls.emptyTitle', { defaultValue: 'No calls match these filters' })}</div>
            <div className="m-callout text-white/55 mt-1">
              {t('calls.emptySub', { defaultValue: 'Try a wider time period, or clear the filters.' })}
            </div>
            {onClearFilters && (
              <div className="mt-3 flex justify-center">
                <Chip onClick={onClearFilters}>{t('calls.clearFilters', { defaultValue: 'Clear filters' })}</Chip>
              </div>
            )}
          </Card>
        ) : (
          <div className="space-y-2.5">
            {/* In the cumulative view these calls rang at different shops, so they are
                grouped under the one they rang at. Biggest group first, which on the
                Missed segment is the branch losing the most business. */}
            {groups.map(g => (
              <div key={g.storeId ?? 'all'} className="space-y-2.5">
                {g.label && showGroupHeaders && <StoreGroupHeader label={g.label} count={g.count} />}
                {g.items.map((call, i) => (
                  <motion.div
                    key={call.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    /* 24ms stagger on the emphasized curve — perceptibly liquid, never slow.
                       Delay caps at 8 cards so a long list never makes the tail wait. */
                    transition={{ delay: Math.min(i, 8) * 0.024, duration: 0.24, ease: [0.2, 0, 0, 1] }}
                  >
                    <CallCard
                      call={call}
                      aggregate={false}
                      calledBack={calledBack[call.id]}
                      onClick={() => setDetail(call.id)}
                      onCall={() => placeCall(call)}
                    />
                  </motion.div>
                ))}
              </div>
            ))}
            <div className="h-4" />
          </div>
        )}
      </div>

      {/* PM 10.1 — the merged call detail. One screen for missed and attended alike. */}
      <BottomSheet open={!!detailCall} onClose={() => setDetail(null)} fullHeight label={detailCall ? maskedOf(detailCall) : undefined}>
        {detailCall && (
          <CallDetail
            call={detailCall}
            onMutate={onMutate}
            aggregate={aggregate}
            onSendReview={() => { setDetail(null); setReviewIds([detailCall.id]) }}
            onCall={() => { setDetail(null); placeCall(detailCall) }}
          />
        )}
      </BottomSheet>

      {/* PM 14 — the bulk review request, and the single-call one: same sheet, same mutator. */}
      <BottomSheet open={!!reviewIds} onClose={() => setReviewIds(null)} label={t('calls.askReview', { defaultValue: 'Ask Review' })}>
        {reviewIds && (
          <ReviewRequestSheet
            ids={reviewIds}
            store={store}
            onDone={() => { setReviewIds(null); onMutate?.() }}
          />
        )}
      </BottomSheet>

      <CallUI open={!!callOpen} item={callOpen} onClose={() => {
        setCallOpen(null)
        toast.push({
          kind: 'success',
          title: t('vmn.callCompleteTitle', { defaultValue: 'Call complete' }),
          body: t('vmn.callCompleteBody', { defaultValue: 'AI is summarizing the conversation…' }),
        })
      }} />
    </div>
  )
}

// ============================================================
// THE CARD
//
// Facts only. The AI blurb that used to sit on every row moved into the detail screen
// (PM 2: the manager asks for AI, it does not follow them down the list), and the source
// chip moved with it (PM 7) — this row has to carry the reason, the sentiment and the
// lead/review state now, and those are what the manager acts on.
// ============================================================
function CallCard({ call, onClick, onCall, calledBack, aggregate }) {
  const { t } = useTranslation()
  const ui = kindUI(call)
  const tone = TONES[ui.tone]

  return (
    <Card
      onClick={onClick}
      className="!p-0 overflow-hidden"
    >
      {/* ---- INFO ZONE — one scan path: who (left) → how warm (right) → when → state.
           The hairline under it splits the card into "read" above and "act" below, so
           the buttons never blend into the tag row they used to sit against. ---- */}
      <div className="p-4 flex items-start gap-3">
        <div className="relative shrink-0">
          <div
            className="w-11 h-11 rounded-2xl grid place-items-center"
            style={{ background: tone.bg, border: `1px solid ${tone.bd}` }}
          >
            <ui.Icon size={18} style={{ color: tone.text }} />
          </div>
          {call.repeats > 1 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold grid place-items-center px-1"
              style={{ background: '#0070FC', color: 'white', boxShadow: '0 2px 8px rgba(0,112,252,.55)' }}
            >
              {call.repeats}×
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Lock size={10} />
              <span className="m-headline text-white m-tabular truncate">{maskedOf(call)}</span>
            </div>
            <LeadTag score={call.cli} />
          </div>

          <div className="m-subhead text-white/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="m-tabular">{dayClock(call.atMs)}</span>
            <span className="opacity-50">·</span>
            <span>{relativeTime(call.atMs)}</span>
            {call.repeats > 1 && (
              <>
                <span className="opacity-50">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Repeat2 size={10} />
                  {t('vmn.calledCount', { defaultValue: 'Called {{count}}×', count: call.repeats })}
                </span>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {/* Which branch took this call — first in the row, because in a mixed list it
                is the fact that tells you whose problem this is. Aggregate view only. */}
            {aggregate && <StoreBadge storeId={call.storeId} />}
            {/* "IVR drop" KEPT as-is: it is what the industry (and every phone-system
                vendor this dealer already deals with) calls it, and the detail sheet
                spells out what it means — "dropped in Language menu · After 8s". */}
            {call.kind === 'ivr' && <Tag icon={Radio} tone="warning">{t('vmn.ivrDrop', { defaultValue: 'IVR drop' })}</Tag>}
            <ReasonTag call={call} />
            <SentimentTag call={call} />
            <LeadStatusTag call={call} />
            <ReviewSentTag call={call} />
          </div>
        </div>

        {/* Tapping the card opens the detail — say so, in the exact idiom the Customers
            rows already use, instead of leaving the whole surface a silent button. */}
        <ChevronRight size={16} className="shrink-0 self-center text-white/30" aria-hidden="true" />
      </div>

      {/* ---- ACTION ZONE — one filled pill, one quiet text button, a hairline above.
           The minimal-button rule: one surface per card gets ink. The pill (same brand
           fill, glow gone) is unmistakably THE button; the review link keeps its
           affordance from colour + icon + press, not from a competing box. And a call
           already returned needs no button clothing at all — the done state collapses
           to a quiet ✓ line that stays tappable. ---- */}
      <div className="px-4 pb-4 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-hairline)' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onCall() }}
            /* h-11 === 44px === --m-touch-min. Sitting next to a second button it has to
               clear the floor on its own. */
            className="flex-1 min-w-0 h-11 rounded-full m-headline press inline-flex items-center justify-center gap-2"
            style={calledBack
              ? { background: 'transparent', color: 'var(--si-success-text)' }
              : { background: '#0070FC', color: 'white', boxShadow: '0 1px 2px rgba(15,23,42,.08)' }}
          >
            {calledBack
              ? (<><ShieldCheck size={16} className="shrink-0" /> <span className="truncate">{t('vmn.calledBack', { defaultValue: 'Called back' })}</span></>)
              : (<><PhoneCall size={16} className="shrink-0" /> <span className="truncate">{t('common.callBack', { defaultValue: 'Call back' })}</span></>)}
          </button>
      </div>
    </Card>
  )
}

// ============================================================
// THE CALL DETAIL — PM 10.1
//
// "This screen and the call details screen would be the same, in which we are showing
//  when it was missed. Does this have any negative review? Whether the review link has
//  been sent — it will be the same screen."
//
// ORDER (audit: the primary CTA was buried under the coach AND under a premium upsell —
// the upsell outranked the core action of the product). Ranked by what the manager has to
// decide, in the order he decides it:
//
//   1. WHO + WHEN + WHAT           who rang, when, why, how they sounded, where from
//   2. RISK                        did this caller already leave a bad review? — the one
//                                  fact that changes HOW you open the call, so it must be
//                                  above the button, not below it
//   3. → CALL BACK ←               the action the whole product exists for. Reachable
//                                  without a scroll on a 375×812 screen.
//   4. SUPPORTING MATERIAL         the call-back script (missed) or the transcript +
//                                  notes (attended). Read it if you want it; the button
//                                  does not wait for it.
//   5. FOLLOW-UP STATE             review link sent?, lead status, every time they rang
//   6. UPSELL                      last, and demoted from a full AI card to one quiet row
// ============================================================
function CallDetail({ call, onMutate, onCall, onSendReview, aggregate }) {
  const { t } = useTranslation()
  const ui = kindUI(call)
  const tone = TONES[ui.tone]
  const missed = isMissed(call)
  // Which person's canonical profile is open over this call (design review 3, item 15).
  const [personId, setPersonId] = useState(null)

  function setStatus(status) {
    vibrate(10)
    setLeadStatus(call.id, status)
    onMutate?.()
  }

  return (
    // pt-5 clears the sheet's own close button — the lead tag sits top-right, where it lands.
    <div className="px-4 pb-6 pt-5">
      {/* ---------- 1. WHO ---------- */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl grid place-items-center shrink-0" style={{ background: tone.bg, border: `1px solid ${tone.bd}` }}>
          <ui.Icon size={20} style={{ color: tone.text }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Lock size={11} />
            <span className="m-headline text-white m-tabular">{maskedOf(call)}</span>
          </div>
          {/* "when it was missed" — the first thing the PM asked this screen to answer */}
          <div className="m-subhead text-white/55 mt-0.5">
            {missed
              ? t('calls.whenMissed', { defaultValue: 'Missed {{when}}', when: dayClock(call.atMs) })
              : t('calls.whenAttended', { defaultValue: 'Answered {{when}}', when: dayClock(call.atMs) })}
            {' · '}{relativeTime(call.atMs)}
          </div>
        </div>
        <LeadTag score={call.cli} />
      </div>

      {/* DESIGN REVIEW 3, item 15 — ONE customer page, two entry points.
          The person behind this call opens the SAME CustomerDetailSheet the Customers tab
          opens: identity, the AI read, the full history across every call, the notes and
          the review-link builder. Previously a call sheet and a customer sheet each grew
          their own half-profile of the same person, and they drifted. This sheet stays
          about THE CALL; anything about the PERSON lives in one place. */}
      {call.customerId && (
        <button
          type="button"
          onClick={() => { vibrate(6); setPersonId(call.customerId) }}
          className="mt-2 w-full flex items-center justify-between gap-2 press min-h-[var(--m-touch-min)]"
        >
          <span className="m-subhead font-semibold" style={{ color: 'var(--si-primary-text)' }}>
            {t('calls.openCustomer', { defaultValue: 'Full customer profile' })}
          </span>
          <ChevronRight size={15} style={{ color: 'var(--si-primary-text)' }} aria-hidden="true" />
        </button>
      )}

      {/* What the band on the right actually MEANS, in the words the rest of the app uses.
          The score used to leak out as "CLI 92", which is our word, not the dealer's.
          MISSED ONLY. PM: "remove the 56/100 chance to buy" from an attended call — the
          score is a prediction about a conversation that has already happened, so on that
          screen it is scoring a call you can simply read. It still earns its place above a
          call-back button, where the decision is whether to spend the next ten minutes on
          this person, so the missed sheet keeps it untouched. */}
      {/* The urgency line: the score AND the repeat pressure, side by side — feedback
          round 4 moved "Called 3× in 2 hours" up here from a card of its own below,
          because both facts feed the same decision: pick up the phone now or not. */}
      {missed && (call.cli != null || call.repeats > 1) && (
        <div className="m-caption text-white/45 mt-1.5">
          {[
            call.cli != null && t('common.chanceToBuyTitle', { defaultValue: '{{score}}/100 chance to buy', score: call.cli }),
            call.repeats > 1 && repeatInline(t, call),
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      {/* What it was — reason, tone, source, and how well we know this caller.
          The source chip lives HERE now (PM 7). */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {aggregate && <StoreBadge storeId={call.storeId} />}
        {call.kind === 'ivr' && <Tag icon={Radio} tone="warning">{t('vmn.ivrDrop', { defaultValue: 'IVR drop' })}</Tag>}
        <ReasonTag call={call} />
        <SentimentTag call={call} />
        {call.source && <SourceChip src={call.source} sources={SOURCES} />}
        <InteractionsTag call={call} />
      </div>

      {/* IVR drops: where in the menu they gave up. `droppedAt` carries a catalog key of
          its own ("After {{seconds}}s") — resolve it, or this line stays English. */}
      {call.kind === 'ivr' && call.stage && (
        <Card className="mt-3 !p-3">
          <div className="m-caption text-white/70 flex items-center gap-1.5">
            <Radio size={11} style={{ color: 'var(--si-warning-text)' }} />
            {t('vmn.droppedIn', {
              defaultValue: 'dropped in {{stage}} · {{droppedAt}}',
              stage: keyed(t, call.stageKey, call.stage),
              droppedAt: call.droppedAtKey
                ? t(call.droppedAtKey, { defaultValue: call.droppedAt, seconds: call.droppedAfterSec })
                : call.droppedAt,
            })}
          </div>
          {call.reason && <div className="m-caption text-white/50 mt-0.5">{keyed(t, call.reasonKey, call.reason)}</div>}
        </Card>
      )}

      {/* ---------- 2. RISK — "does this have any negative review?" (PM 10.1) ----------
          Above the button on purpose: it is the one thing that changes how you open the
          call, and reading it after dialling is reading it too late. */}
      <ReviewSignalBlock call={call} />

      {/* ---------- 3. THE ACTION ----------
          The product is "call the customer back before they buy elsewhere". That button
          is therefore the first thing under the facts, not the last thing under an ad. */}
      <div className="mt-4">
        {/* "Call back now via secure VMN" said VMN — our word for a virtual number, not a
            dealer's. The footnote under it already says the same thing in his words, so
            the button just names the action. vmn.callBackNow is the app's existing phrase
            and is the ONE label here already translated into all 13 languages. */}
        <PrimaryButton onClick={onCall} icon={PhoneCall}>
          {t('vmn.callBackNow', { defaultValue: 'Call back now' })}
        </PrimaryButton>
        <div className="mt-2 flex items-center justify-center gap-1.5 m-footnote text-white/55 text-center">
          <LockIcon size={11} className="shrink-0" />
          {t('vmn.callRouted', { defaultValue: 'Call routed & recorded · customer never sees your number' })}
        </div>
      </div>

      {/* ---------- 4+5. ATTENDED ONLY ----------
          Feedback round 4: a MISSED call's sheet now ENDS at the routed line above —
          coach script, follow-up state, status chips, notes and the upsell are gone.
          Its one job is the call-back button. Attended keeps the conversation and the
          follow-up machinery below. */}
      {isAttended(call) && (<>
      <CallMediaBlock call={call} onMutate={onMutate} />

      {/* ---------- 5. FOLLOW-UP STATE ---------- */}
      {/* "Whether the review link has been sent" — PM 10.1 + 16. */}
      <div
        className="mt-4 rounded-2xl p-3 flex items-center gap-2.5"
        style={call.reviewLinkSent
          ? { background: TONES.success.bg, border: `1px solid ${TONES.success.bd}` }
          : { background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
      >
        <MessageCircle
          size={16}
          className="shrink-0"
          style={{ color: call.reviewLinkSent ? TONES.success.text : 'var(--text-tertiary)' }}
        />
        <div className="flex-1 min-w-0">
          <div className="m-callout text-white">
            {call.reviewLinkSent
              ? t('calls.reviewLinkSentTitle', { defaultValue: 'Review link sent on WhatsApp' })
              : t('calls.reviewLinkNotSentTitle', { defaultValue: 'No review link sent yet' })}
          </div>
        </div>
        {!call.reviewLinkSent && (
          <Chip className="shrink-0" icon={Send} onClick={onSendReview}>
            {t('calls.askReview', { defaultValue: 'Ask Review' })}
          </Chip>
        )}
      </div>

      {/* Lead status — PM 14 / 16. Tap = the mutator, same one the bulk bar calls. */}
      <div className="mt-4">
        <div className="m-subhead text-white/55 mb-2">{t('calls.leadStatusTitle', { defaultValue: 'Lead status' })}</div>
        <div className="flex items-center gap-2">
          {LEAD_STATUSES.map(s => (
            <Chip key={s.id} active={call.leadStatus === s.id} onClick={() => setStatus(s.id)}>
              {t(s.labelKey, { defaultValue: s.label })}
            </Chip>
          ))}
        </div>
      </div>

      </>)}

      {/* The canonical customer page, opened over this call sheet (design review 3, item
          15). Same component the Customers tab renders — an unknown id renders nothing
          rather than an empty sheet. */}
      <CustomerDetailSheet
        customerId={personId}
        open={!!personId}
        onClose={() => setPersonId(null)}
      />
    </div>
  )
}

// ============================================================
// "DOES THIS HAVE ANY NEGATIVE REVIEW?" — PM 10.1
//
// Two different questions, and the screen must not blur them:
//
//   1. Has this caller left us a bad review?  ← what the PM asked. Answerable ONLY where
//      the review carries a customerId we can trust (see the customerId note in the seed's
//      REVIEWS header — two reviews of twenty-one do). When it is answerable and the answer
//      is yes, the review itself goes on screen: stars, words, when. The manager is about
//      to ring this person; he should read it in their words, not be told a score.
//
//   2. How did this caller SOUND?  ← what the record can always tell us, and what this
//      block showed before the join existed. It stays, unchanged, as the fallback.
//
// The fallback is deliberately worded about THE CALL, never about reviews. For a caller we
// hold no linked review for, "no negative review" would be a claim we cannot make: nearly
// every reviewer on the listing is a stranger to the CRM, so absence of a link is absence
// of knowledge, not evidence of a happy customer. So the quiet state says nothing about
// reviews at all — it reports the tone of the call and stops there.
// ============================================================

function ReviewSignalBlock({ call }) {
  const customer = call.customerId ? getCustomerById(call.customerId) : null
  // Null for: no customerId, an id we hold no record for, a customer who never reviewed,
  // and a customer whose reviews are all positive. All four mean the same thing here —
  // we have no bad review we can prove is theirs — so all four fall through to the tone.
  const review = customer ? negativeReviewFor(customer) : null
  if (review) return <NegativeReviewCard review={review} />

  // Feedback round 4: the missed-call quiet card is gone as well — a RISK block renders
  // only when there is a risk to show. Attended-and-unhappy keeps its warning; every
  // other state is silence, because a card that fires on every call is not a signal.
  if (!(isAttended(call) && call.sentiment === 'negative')) return null
  return <SentimentSignalCard call={call} />
}

/** The real thing: their review, their words, on the record. */
function NegativeReviewCard({ review }) {
  const { t } = useTranslation()
  return (
    <div
      className="mt-3 rounded-2xl p-3"
      style={{ background: TONES.danger.bg, border: `1px solid ${TONES.danger.bd}` }}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} style={{ color: TONES.danger.text }} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="m-callout text-white">
            {t('calls.negativeReviewTitle', { defaultValue: 'This caller left you a bad review' })}
          </div>
          <div className="m-caption text-white/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-0.5">
              {/* The star count IS the rating — drawn, not described, so it reads at a glance. */}
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  size={10}
                  fill={i < review.rating ? '#F59E0B' : 'none'}
                  stroke={i < review.rating ? '#F59E0B' : 'currentColor'}
                />
              ))}
            </span>
            <span className="opacity-50">·</span>
            <span>{review.platform}</span>
            <span className="opacity-50">·</span>
            <span>{relativeTime(review.atMs)}</span>
          </div>
        </div>
      </div>

      {/* Their words, verbatim. A star-only review has none, and then we show none rather
          than paraphrasing a complaint nobody made. */}
      {review.body && (
        <div
          className="mt-2.5 rounded-xl px-3 py-2 m-callout text-white/85"
          style={{ background: 'rgba(0,0,0,.16)', border: '1px solid rgba(255,255,255,.08)' }}
        >
          “{review.body}”
        </div>
      )}

      {/* Why we are willing to say this is the same person. The join is a judgement made on
          named evidence, not a guess off a matching phone number — and the manager gets to
          see that it was made, because he is about to act on it. */}
      {/* The catalog copy for this line takes {{rating}} and {{platform}} — feed them, or
          it renders "★ on  · matched to this customer" with two holes in it. */}
      <div className="m-caption text-white/45 mt-2">
        {t('calls.negativeReviewMatched', {
          defaultValue: 'Matched to this caller’s customer record.',
          rating: review.rating,
          platform: review.platform,
        })}
      </div>
    </div>
  )
}

/** No linked review: report the tone of the call, and say nothing about reviews. */
function SentimentSignalCard({ call }) {
  const { t } = useTranslation()
  const negative = call.sentiment === 'negative'
  return (
    <div
      className="mt-3 rounded-2xl p-3 flex items-start gap-2.5"
      style={negative
        ? { background: TONES.danger.bg, border: `1px solid ${TONES.danger.bd}` }
        : { background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
    >
      {negative
        ? <AlertTriangle size={16} style={{ color: TONES.danger.text }} className="shrink-0 mt-0.5" />
        : <ShieldCheck size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--text-tertiary)' }} />}
      <div className="flex-1 min-w-0">
        <div className="m-callout text-white">
          {negative
            ? t('calls.negativeSignalTitle', { defaultValue: 'Caller was unhappy on this call' })
            : t('calls.noNegativeSignalTitle', { defaultValue: 'No negative signal on this call' })}
        </div>
        <div className="m-caption text-white/55 mt-0.5">
          {isAttended(call)
            ? t('calls.negativeSignalSub', { defaultValue: 'Read from the call script. Reach them before they say it in a review.' })
            : t('calls.noScriptSub', { defaultValue: 'Nobody spoke to this caller, so there is no tone to read.' })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CALL SUMMARY + TRANSCRIPT COPY + NOTES — the attended call's written record.
//
// Feedback round 4 removed the recording section outright: this build stores the
// TRANSCRIPT of a call, never its audio, so a "No recording saved" card was a
// permanent apology for a feature that does not exist. What remains is everything
// real — the stored summary (regenerable through askAI), the device-voice readout,
// one tap to copy the whole transcript, and the notes.
// ============================================================

/** Copy that actually lands: the async Clipboard API, or the old selection trick. */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* falls through — permission denied, insecure context, older WebView */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/**
 * The summary, spoken — by the device, not by us.
 *
 * `window.speechSynthesis` is a real browser capability with no backend behind it, which
 * is the only reason this button exists at all: there is no TTS service in this product,
 * and a "play" that quietly did nothing would be worse than no button.
 *
 * So every way it can fail is handled out loud. No API → the control renders disabled with
 * the reason. An error, or an utterance that never actually starts within 1.5s (what a
 * missing voice for the chosen language looks like on most platforms), → we cancel and
 * tell the manager, instead of leaving a "Speaking…" state running over silence.
 */
function useSpeech() {
  const { i18n } = useTranslation()
  const [speaking, setSpeaking] = useState(false)
  const startedRef = useRef(false)
  const timerRef = useRef(null)

  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  const supported = !!synth && typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function'

  const stop = useCallback(() => {
    clearTimeout(timerRef.current)
    if (synth) synth.cancel()
    setSpeaking(false)
  }, [synth])

  // Leaving the sheet must not leave a voice talking to an empty screen.
  useEffect(() => stop, [stop])

  const speak = useCallback((text, onFail) => {
    if (!supported || !text) return
    synth.cancel()
    const lang = getLanguage(i18n.resolvedLanguage || i18n.language || 'en')
    const u = new window.SpeechSynthesisUtterance(text)
    u.lang = lang.intl
    // Prefer an exact locale voice, then any voice for the language at all.
    const voices = synth.getVoices() || []
    const norm = v => String(v.lang || '').replace('_', '-')
    u.voice = voices.find(v => norm(v) === lang.intl)
      || voices.find(v => norm(v).split('-')[0] === lang.code)
      || null
    startedRef.current = false
    u.onstart = () => { startedRef.current = true; setSpeaking(true) }
    u.onend = () => { clearTimeout(timerRef.current); setSpeaking(false) }
    u.onerror = (e) => {
      clearTimeout(timerRef.current)
      setSpeaking(false)
      // 'interrupted' / 'canceled' is US, from stop() or the next speak(). Not a failure.
      if (e?.error !== 'interrupted' && e?.error !== 'canceled') onFail?.(lang)
    }
    setSpeaking(true)
    synth.speak(u)
    timerRef.current = setTimeout(() => {
      if (startedRef.current) return
      synth.cancel()
      setSpeaking(false)
      onFail?.(lang)
    }, 1500)
  }, [supported, synth, i18n.resolvedLanguage, i18n.language])

  return { supported, speaking, speak, stop }
}

function CallMediaBlock({ call, onMutate }) {
  const { t } = useTranslation()
  const toast = useToast()
  const turns = getTranscript(call)
  const speech = useSpeech()

  // The stored summary, resolved through its catalog key so it follows the UI language.
  // `generated` (null until asked for) wins when the manager regenerates it — derived
  // rather than seeded into state, or a language switch would strand the old sentence.
  const stored = call.summary ? keyed(t, call.summaryKey, call.summary) : ''
  const [generated, setGenerated] = useState(null)
  const [loading, setLoading] = useState(false)
  const summary = generated ?? stored

  async function regenerate() {
    setLoading(true)
    speech.stop()
    vibrate(8)
    const script = (turns || [])
      .map(turn => `${turn.speaker === 'customer' ? 'Customer' : 'Manager'}: ${turn.text}`)
      .join('\n')
    // Offline, the honest fallback is the stored summary — and where there is none, the
    // record's own facts. Never an invented sentence.
    const fallback = stored || t('calls.summaryFallbackNoDuration', {
      defaultValue: '{{reason}} · the caller sounded {{sentiment}}.',
      reason: keyed(t, call.callReasonKey, call.callReason),
      sentiment: keyed(t, `calls.sentiment${call.sentiment === 'positive' ? 'Positive' : call.sentiment === 'negative' ? 'Negative' : 'Neutral'}`, call.sentiment).toLowerCase(),
    })
    const out = script
      ? await askAI(
        `Summarize this store phone call for the store manager in 2 short sentences: what the customer wanted, and what was promised. No emoji, no headings.\n\n${script}`,
        { temperature: 0.5, fallback },
      )
      : fallback
    setGenerated(out)
    setLoading(false)
  }

  async function copyTranscript() {
    if (!turns?.length) return
    const header = t('calls.transcriptCopyHeader', {
      defaultValue: 'Call transcript · {{number}} · {{when}}',
      number: maskedOf(call),
      when: dayClock(call.atMs),
    })
    const body = turns.map(turn => {
      const who = turn.speaker === 'customer'
        ? t('calls.speakerCustomer', { defaultValue: 'Customer' })
        : t('calls.speakerYou', { defaultValue: 'You' })
      return `${who} · ${clockTime(turn.atMs)}: ${turn.text}`
    })
    const ok = await copyToClipboard([header, '', ...body].join('\n'))
    vibrate(8)
    toast.push(ok
      ? {
        kind: 'success',
        title: t('calls.transcriptCopied', { defaultValue: 'Transcript copied' }),
        body: t('calls.transcriptCopiedBody', {
          defaultValue_one: '{{count}} line on your clipboard.',
          defaultValue_other: '{{count}} lines on your clipboard.',
          count: turns.length,
        }),
      }
      : {
        kind: 'error',
        title: t('calls.transcriptCopyFailed', { defaultValue: 'Could not copy' }),
        body: t('calls.transcriptCopyFailedBody', { defaultValue: 'This browser blocked clipboard access.' }),
      })
  }

  function toggleVoice() {
    if (speech.speaking) { speech.stop(); return }
    vibrate(6)
    speech.speak(summary, (lang) => toast.push({
      kind: 'info',
      title: t('calls.voiceNoVoiceTitle', { defaultValue: 'No voice available' }),
      body: t('calls.voiceNoVoiceBody', {
        defaultValue: 'This device has no {{language}} voice installed, so it cannot read the summary out.',
        language: lang?.label || '',
      }),
    }))
  }

  return (
    <div className="mt-4">
      {/* ---------- CALL SUMMARY (feedback round 4: the recording section is gone —
           this build stores transcripts, not audio, so the summary IS the record) ---------- */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-white/70 shrink-0" />
            <span className="m-headline text-white truncate">
              {t('vmn.aiSummary', { defaultValue: 'Call Summary' })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
          {turns?.length > 0 && (
            <button
              onClick={copyTranscript}
              aria-label={t('calls.copyTranscript', { defaultValue: 'Copy transcript' })}
              title={t('calls.copyTranscript', { defaultValue: 'Copy transcript' })}
              className="shrink-0 grid place-items-center press md-state min-h-[var(--m-touch-min)] min-w-[var(--m-touch-min)]"
            >
              <span
                className="w-9 h-9 rounded-full grid place-items-center"
                style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
              >
                <Copy size={15} style={{ color: 'var(--text-secondary)' }} />
              </span>
            </button>
          )}
          {summary && !loading && (
            <button
              onClick={toggleVoice}
              disabled={!speech.supported}
              aria-label={speech.speaking
                ? t('calls.summaryStop', { defaultValue: 'Stop' })
                : t('calls.summaryListen', { defaultValue: 'Listen' })}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-3 rounded-full m-subhead font-semibold press md-state min-h-[var(--m-touch-min)]',
                !speech.supported && 'opacity-40',
              )}
              style={{
                background: speech.speaking ? TONES.brand.bg : 'var(--bg-subtle)',
                color: speech.speaking ? TONES.brand.text : 'var(--text-secondary)',
                border: `1px solid ${speech.speaking ? TONES.brand.bd : 'var(--border-glass)'}`,
              }}
            >
              {speech.speaking
                ? (<><Square size={13} className="shrink-0" /> {t('calls.summaryStop', { defaultValue: 'Stop' })}</>)
                : (<><Play size={13} className="shrink-0" /> {t('calls.summaryListen', { defaultValue: 'Listen' })}</>)}
            </button>
          )}
          </div>
        </div>

        <AICard className="!p-3">
          {loading ? (
            <div className="space-y-1.5">
              <AIShimmer className="h-3 w-4/5" />
              <AIShimmer className="h-3 w-3/5" />
            </div>
          ) : summary ? (
            <div className="flex items-start gap-2">
              <AIBadge />
              <span className="m-callout text-white/90 flex-1">{summary}</span>
            </div>
          ) : (
            <div className="m-callout text-white/60">
              {t('calls.summaryNoneStored', { defaultValue: 'No summary was saved for this call. Write one from the transcript?' })}
            </div>
          )}
        </AICard>

        {/* The voice is the device's, not a service of ours — and where the device has none
            the button above is dead, so say why rather than let it look broken. */}
        {summary && !speech.supported && (
          <div className="m-caption text-white/40 mt-1.5">
            {t('calls.voiceUnsupported', { defaultValue: 'This browser cannot read text out loud, so there is no voice version here.' })}
          </div>
        )}

        {/* Design review 3, item 14: the "Rewrite with AI · from N lines of transcript" row
            is gone once a summary exists — re-rolling an AI summary is not a shop-floor
            action, and the transcript-line count was noise next to the summary itself.
            The write action survives ONLY for the empty state, so the line above ("No
            summary was saved for this call. Write one from the transcript?") keeps an
            answer instead of becoming a dead-end question. */}
        {turns?.length > 0 && !summary && (
          <div className="mt-2">
            <Chip icon={Sparkles} onClick={regenerate}>
              {t('calls.summaryWrite', { defaultValue: 'Write summary' })}
            </Chip>
          </div>
        )}
      </div>

      <NotesBlock call={call} onMutate={onMutate} />
    </div>
  )
}

/** "…and take notes" — the manager's own words, against the caller's record. */
function NotesBlock({ call, onMutate }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const customer = call.customerId ? getCustomerById(call.customerId) : null
  if (!customer) return null
  const notes = getCustomerNotes(customer)

  function save() {
    if (!addCustomerNote(customer.id, draft)) return
    setDraft('')
    vibrate(8)
    onMutate?.()
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <NotebookPen size={14} className="text-white/70" />
        <span className="m-headline text-white">{t('calls.notesTitle', { defaultValue: 'Your notes' })}</span>
      </div>

      {notes.length > 0 && (
        <div className="space-y-2 mb-2">
          {notes.map(note => (
            <Card key={note.id} className="!p-3">
              <div className="m-callout text-white/85">{note.text}</div>
              <div className="m-caption text-white/45 mt-1">{note.author} · {relativeTime(note.atMs)}</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="!p-3">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('calls.notesPlaceholder', { defaultValue: 'What did they ask for? What did you promise?' })}
          className="w-full bg-transparent text-white/90 m-body outline-none resize-none min-h-[64px] placeholder:text-white/35"
        />
        <div className="flex justify-end">
          <Chip icon={Check} onClick={save} className={cn(!draft.trim() && 'opacity-40 pointer-events-none')}>
            {t('calls.saveNote', { defaultValue: 'Save note' })}
          </Chip>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// THE CALL-BACK COACH — now a block inside the detail screen, not a screen of its own.
// On request: opening a call to read the facts must not fire an AI call every time.
// ============================================================
// ============================================================
// BULK REVIEW REQUEST — PM 14. Generate one message, send it to the selection.
// ============================================================
function ReviewRequestSheet({ ids, store, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const calls = ids.map(id => getCallById(id)).filter(Boolean)
  const call = calls[0] || null
  const customer = call?.customerId ? getCustomerById(call.customerId) : null
  // The FULL number, deliberately unmasked (feedback round 4): this sheet is the moment
  // the manager ACTS on the number, and masking it here only sent them hunting through
  // the customer book. Grouped 5+5, the way Indian mobiles read aloud.
  const digits = customer?.phone ? String(customer.phone).replace(/\D/g, '').slice(-10) : null
  const fullNumber = digits ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : null
  // The gate: asking for a review only makes sense once the sale actually happened, so
  // the send stays dead until the manager states it did. Checking the box is a claim —
  // and acting on it records the claim: send() marks the lead converted with the same
  // mutator the status chips use.
  const [confirmed, setConfirmed] = useState(false)
  const storeName = store?.name || 'Lakshmi Electronics'
  const branch = store?.branch || 'Indiranagar'

  const fallback = t('calls.reviewMsgFallback', {
    defaultValue: 'Hello! This is {{store}}, {{branch}}. Thank you for calling us today. If we were able to help, would you take 30 seconds to leave us a Google review? It genuinely helps a small store like ours.',
    store: storeName,
    branch,
  })
  const [message, setMessage] = useState(fallback)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    vibrate(8)
    const out = await askAI(
      `Write ONE WhatsApp message (max 45 words) from an Indian electronics store asking a customer who called today to leave a Google review. Warm, human, no pressure, no emoji, no placeholders other than nothing — do not invent a link, the link is attached automatically. Store: ${storeName}, ${branch}.`,
      { temperature: 0.8, fallback },
    )
    setMessage(out)
    setLoading(false)
  }

  async function copyNumber() {
    if (!digits) return
    const ok = await copyToClipboard(`+91${digits}`)
    vibrate(8)
    toast.push(ok
      ? { kind: 'success', title: t('calls.numberCopied', { defaultValue: 'Number copied' }) }
      : { kind: 'error', title: t('calls.transcriptCopyFailed', { defaultValue: 'Could not copy' }) })
  }

  // The backend sends the message server-side over WhatsApp — the app fires the send,
  // records the facts, and confirms. Nothing to open, nothing left to do afterwards.
  function send() {
    if (!confirmed) return
    setLeadStatus(ids, 'converted')
    const updated = markReviewLinkSent(ids, true, { channel: 'whatsapp' })
    vibrate(12)
    toast.push({
      kind: 'success',
      title: t('calls.reviewSentTitle', { defaultValue: 'Message sent' }),
      body: t('calls.reviewSentToast', {
        defaultValue_one: 'Review link sent to {{count}} caller',
        defaultValue_other: 'Review link sent to {{count}} callers',
        count: updated.length,
      }),
    })
    onDone?.()
  }

  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('calls.askReview', { defaultValue: 'Ask Review' })}</div>
      <div className="m-callout text-white/55 mb-4">
        {t('calls.reviewRequestSub', {
          defaultValue_one: 'One message, sent on WhatsApp to {{count}} caller.',
          defaultValue_other: 'One message, sent on WhatsApp to {{count}} callers.',
          count: calls.length,
        })}
      </div>

      {/* WHO gets it — the full number, with one tap to take it elsewhere. */}
      <Card className="!p-3">
        <div className="m-subhead text-white/55 mb-1">{t('calls.customerNumber', { defaultValue: 'Customer number' })}</div>
        <div className="flex items-center justify-between gap-2">
          <span className="m-headline text-white m-tabular truncate">{fullNumber || (call ? maskedOf(call) : '—')}</span>
          {digits && (
            <button
              onClick={copyNumber}
              aria-label={t('calls.copyNumber', { defaultValue: 'Copy number' })}
              title={t('calls.copyNumber', { defaultValue: 'Copy number' })}
              className="shrink-0 grid place-items-center press md-state min-h-[var(--m-touch-min)] min-w-[var(--m-touch-min)]"
            >
              <span
                className="w-9 h-9 rounded-full grid place-items-center"
                style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
              >
                <Copy size={15} style={{ color: 'var(--text-secondary)' }} />
              </span>
            </button>
          )}
        </div>
      </Card>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="ai-text" />
            <span className="m-headline text-white">{t('calls.reviewMessage', { defaultValue: 'WhatsApp message' })}</span>
          </div>
          <Chip icon={Sparkles} onClick={generate}>{t('reviews.generate', { defaultValue: 'Generate' })}</Chip>
        </div>
        <AICard className="!p-3.5">
          {loading ? (
            <div className="space-y-2">
              <AIShimmer className="h-3 w-4/5" />
              <AIShimmer className="h-3 w-3/5" />
            </div>
          ) : (
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-transparent text-white/90 m-body outline-none resize-none min-h-[90px]"
            />
          )}
        </AICard>
      </div>

      {/* The confirmation that unlocks the send. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={confirmed}
        onClick={() => { vibrate(6); setConfirmed(v => !v) }}
        className="mt-4 w-full flex items-center gap-2.5 press min-h-[var(--m-touch-min)] text-left"
      >
        <span
          className="w-5 h-5 rounded-md grid place-items-center shrink-0"
          style={{
            background: confirmed ? '#0070FC' : 'transparent',
            border: `1.5px solid ${confirmed ? '#0070FC' : 'var(--border-glass-strong)'}`,
          }}
        >
          {confirmed && <Check size={13} className="text-white" strokeWidth={3} />}
        </span>
        <span className="m-callout text-white/85">
          {t('calls.confirmConverted', { defaultValue: 'This customer is converted' })}
        </span>
      </button>

      <button
        onClick={send}
        disabled={!confirmed}
        aria-disabled={!confirmed}
        className="on-dark mt-3 w-full h-12 rounded-xl m-headline text-white press flex items-center justify-center gap-2"
        style={{
          background: 'linear-gradient(135deg, #25D366, #128C7E)',
          boxShadow: confirmed ? '0 6px 18px rgba(37,211,102,.35)' : 'none',
          opacity: confirmed ? 1 : 0.45,
        }}
      >
        <MessageCircle size={18} />
        {t('calls.askReview', { defaultValue: 'Ask Review' })}
      </button>
      {!confirmed && (
        <div className="mt-2 m-caption text-white/45 text-center">
          {t('calls.confirmConvertedHint', { defaultValue: 'Confirm the sale above to send the review request.' })}
        </div>
      )}
    </div>
  )
}

const CALL_STATUS = {
  dialing: { key: 'vmn.statusDialing', label: 'Dialing' },
  ringing: { key: 'vmn.statusRinging', label: 'Ringing' },
  connected: { key: 'vmn.statusConnected', label: 'Connected' },
}

export function CallUI({ open, item, onClose }) {
  const [status, setStatus] = useState('dialing')
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    setStatus('dialing')
    setSeconds(0)
    const t1 = setTimeout(() => setStatus('ringing'), 1100)
    const t2 = setTimeout(() => setStatus('connected'), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [open, item?.id])

  useEffect(() => {
    if (status !== 'connected') return
    const iv = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [status])

  if (!open || !item) return null

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[70]"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 30%, rgba(0,112,252,.45) 0%, transparent 60%), linear-gradient(180deg, #06070D 0%, #0E1020 100%)',
        }}
      >
        <div className="on-dark absolute inset-0 flex flex-col px-6 pt-14 pb-10 text-white">
          <div className="text-center">
            <div className="m-caption text-white/55 uppercase tracking-wider">
              {t('vmn.viaVmnRecorded', { defaultValue: 'via SingleInterface VMN · recorded' })}
            </div>
            <div className="mt-3 m-title2 text-white capitalize">
              {t(CALL_STATUS[status].key, { defaultValue: CALL_STATUS[status].label })}…
            </div>
            <div className="mt-1 m-headline text-white/70 m-tabular">{maskedOf(item)}</div>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              <motion.div
                className="absolute inset-[-32px] rounded-full"
                animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                style={{ background: 'radial-gradient(circle, rgba(0,112,252,.55), transparent 70%)' }}
              />
              <motion.div
                className="absolute inset-[-16px] rounded-full"
                animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                style={{ background: 'radial-gradient(circle, rgba(0,112,252,.7), transparent 70%)' }}
              />
              <div
                className="relative w-32 h-32 rounded-full grid place-items-center"
                style={{
                  background: 'var(--si-ai-gradient-warm)',
                  boxShadow: '0 24px 60px rgba(0,112,252,.55), inset 0 0 0 1px rgba(255,255,255,.10)',
                }}
              >
                <Headphones size={44} className="text-white" />
              </div>
            </div>
          </div>

          {status === 'connected' && (
            <div className="text-center mb-4 m-title1 text-white m-tabular">{mm}:{ss}</div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-6">
            <CallBtn icon={muted ? MicOff : Mic} label={t('vmn.mute', { defaultValue: 'Mute' })} active={muted} onClick={() => setMuted(m => !m)} />
            <CallBtn icon={Volume2} label={t('vmn.speaker', { defaultValue: 'Speaker' })} />
            <CallBtn icon={Star} label={t('vmn.tag', { defaultValue: 'Tag' })} />
          </div>
          <button
            onClick={onClose}
            className="mx-auto w-16 h-16 rounded-full grid place-items-center press"
            style={{ background: 'linear-gradient(135deg,#FF3B5C,#B22344)', boxShadow: '0 12px 32px rgba(255,59,92,.45)' }}
          >
            <Phone size={24} className="text-white rotate-[135deg]" />
          </button>

          <div className="mt-4 m-footnote text-white/55 text-center flex items-center justify-center gap-1.5">
            <LockIcon size={11} /> {t('vmn.callsRecordedSecurely', { defaultValue: 'Calls recorded & routed securely via VMN' })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function CallBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 press">
      <span
        className="w-14 h-14 rounded-full grid place-items-center"
        style={{
          background: active ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.10)',
        }}
      >
        <Icon size={20} className="text-white" />
      </span>
      <span className="m-caption text-white/70">{label}</span>
    </button>
  )
}
