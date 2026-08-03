// ============================================================
// CUSTOMER CARD — native twin of CustomerCard in apps/web/src/screens/Customers.jsx.
// That file is the spec; the reasoning for every decision here lives there and is not
// repeated. What follows are the NATIVE deviations only.
//
// On instruction: "from customer card, bring all data design and put all that design to
// the leads card". Web could do that by importing one component into both screens. Native
// had no customer card at all — the Leads tab drew its own row and the drill-downs drew
// plain ones — so this is that component, built once here so the same merge holds on the
// phone instead of two platforms drifting apart again.
//
// THE FIVE FACTS a lead card owes, and where each one is in this layout:
//   1. lead status      — the pill derived through leadStatusOf()
//   2. lead type        — the CLI pill top-right, "95 · Hot"
//   3. source type      — first item of the subline, "Call lead · ₹32.5K · 1 call"
//   4. review requested — the "Review link sent" badge (and "Reviewed" once they have)
//   5. reason of calling— the reason badge, passed in or derived
//
// DEVIATIONS FROM WEB, all forced:
//  - relativeTime() needs Intl.RelativeTimeFormat, which Hermes does not ship. The
//    compact since() form is used instead — the same substitution the Leads tab already
//    makes, so the two agree.
//  - `.ai-text` paints a clipped brand gradient on web. React Native has no
//    background-clip, so the read is brand blue: the same signal, one property down.
// ============================================================
import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Users, Lock, ChevronRight, Star as StarIcon, MessageSquare, Link as LinkIcon } from 'lucide-react-native'
import {
  rupees, leadStatusOf, LEAD_STATUSES, customerSourceType, customerSourceKey,
  callReasonForCustomer,
} from '@connect/core'
import { Card, Caption } from './UI.jsx'

/** English fallbacks for the source labels — the catalogs carry the localised ones. */
const SOURCE_FALLBACK = { call: 'Call lead', form: 'Form lead', walk_in: 'Walk-in' }

/** Hermes has no Intl.RelativeTimeFormat — same compact form the Leads tab uses. */
export function since(atMs) {
  const m = Math.max(1, Math.round((Date.now() - atMs) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

/** Null means "we genuinely don't know", and every caller branches on it. */
function categoryLabel(t, customer) {
  if (!customer.category && !customer.categoryKey) return null
  return t(customer.categoryKey, { defaultValue: customer.category })
}

/** Chance to buy: a 0-100 score with its band, banded exactly as the web CLIPill. */
export function CLIPill({ score, showScore = true }) {
  const { t } = useTranslation()
  const band = score >= 75 ? 'hot' : score >= 55 ? 'warm' : score >= 35 ? 'cool' : 'cold'
  const label = band === 'hot' ? t('common.hot') : band === 'warm' ? t('common.warm')
    : band === 'cool' ? t('common.cool') : t('common.cold')
  const tone = band === 'hot' ? 'bg-bad/10' : band === 'warm' ? 'bg-[#CA8A04]/10' : 'bg-brand-blue/10'
  const ink = band === 'hot' ? 'text-bad' : band === 'warm' ? 'text-[#CA8A04]' : 'text-primaryText'
  return (
    <View className={`h-6 px-2 rounded-pill flex-row items-center gap-1 shrink-0 ${tone}`}>
      {showScore ? <Text className={`text-[11px] font-hk-semi ${ink}`}>{score} ·</Text> : null}
      <Text className={`text-[11px] font-hk-semi ${ink}`}>{label}</Text>
    </View>
  )
}

/** One badge shape, so five call sites cannot disagree about a pill's height. */
function Badge({ children, tone = 'neutral', icon: Icon }) {
  const bg = tone === 'good' ? 'bg-ok/10' : tone === 'bad' ? 'bg-bad/10' : tone === 'info' ? 'bg-[#38BDF8]/10'
    : 'bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline'
  const ink = tone === 'good' ? 'text-[#15803D]' : tone === 'bad' ? 'text-[#B91C1C]'
    : tone === 'info' ? 'text-[#0369A1]' : 'text-ink-2 dark:text-d-ink2'
  const glyph = tone === 'good' ? '#15803D' : tone === 'bad' ? '#B91C1C' : tone === 'info' ? '#0369A1' : '#5F6878'
  return (
    <View className={`h-6 px-2 rounded-pill flex-row items-center gap-1 ${bg}`}>
      {Icon ? <Icon size={10} color={glyph} /> : null}
      <Text className={`text-[11px] font-hk-semi ${ink}`}>{children}</Text>
    </View>
  )
}

/**
 * The one-line AI read, and the badges that share its last row.
 *
 * The read is a '·'-separated list of facts, so it truncates on that separator rather
 * than on a pixel: two whole facts, then "+N more" to open the rest in place. Ending a
 * sentence mid-word reads as a broken string rather than a shortened one, and loses the
 * fact the dealer needed.
 */
function CardInsight({ customer, badges }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  // No read at all is the honest state of a contact somebody just typed in — but the
  // badges are still theirs to show.
  const hasRead = !!(customer.aiGuess || customer.aiGuessKey)
  const text = hasRead ? t(customer.aiGuessKey, { defaultValue: customer.aiGuess }) : ''
  const facts = hasRead ? String(text).split('·').map(s => s.trim()).filter(Boolean) : []
  const hidden = Math.max(0, facts.length - 2)
  const shown = expanded || !hidden ? facts : facts.slice(0, 2)
  const showFooter = hidden > 0 || badges.length > 0
  if (!hasRead && !showFooter) return null

  return (
    <>
      {hasRead ? (
        <Text
          className="mt-2 text-[14px] leading-5 font-hk-medium text-primaryText"
          numberOfLines={expanded ? undefined : 2}
        >
          {shown.join(' · ')}
        </Text>
      ) : null}
      {showFooter ? (
        <View className="mt-2 flex-row items-center gap-1.5 flex-wrap">
          {hidden > 0 ? (
            <Pressable
              onPress={e => { e.stopPropagation?.(); setExpanded(v => !v) }}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text className="text-[14px] font-hk-semi text-primaryText underline">
                {expanded
                  ? t('customers.insightLess', { defaultValue: 'Show less' })
                  : t('customers.insightMore', { n: hidden, defaultValue: '+{{n}} more' })}
              </Text>
            </Pressable>
          ) : null}
          {badges}
        </View>
      ) : null}
    </>
  )
}

export default function CustomerCard({ customer, onOpen, footer, reason, branch }) {
  const { t } = useTranslation()
  const category = categoryLabel(t, customer)
  const amount = customer.value != null ? rupees(customer.value) : null
  const calls = t('customers.calls', { count: customer.callCount })

  // Lead with the name when the shop knows it; otherwise with what they came for.
  const title = customer.name
    ? customer.name
    : customer.value > 0
      ? t('customers.enquiryTitle', { category, amount, defaultValue: '{{category}} · {{amount}}' })
      : t('customers.enquiryTitleNoValue', { category, defaultValue: '{{category}} enquiry' })

  const sourceType = customerSourceType(customer)
  const sourceLabel = t(customerSourceKey(sourceType), { defaultValue: SOURCE_FALLBACK[sourceType] })
  const namedFacts = [sourceLabel, amount, customer.callCount > 0 ? calls : null].filter(Boolean)
  const subline = customer.name
    ? (namedFacts.length
        ? namedFacts.join(' · ')
        : t('customers.addedByYou', {
            when: customer.addedAtMs ? since(customer.addedAtMs) : '',
            defaultValue: 'Added by you {{when}}',
          }))
    // An UNNAMED row leads with the source too — see the web note. "How did this reach
    // us" is one of the five facts every lead card owes, and most leads have no name to
    // trigger the branch above.
    : `${sourceLabel} · ${calls} · ${t('customers.seenAgo', { when: since(customer.lastSeenAtMs), defaultValue: 'seen {{when}}' })}`

  // Prefer what the caller knows; fall back to this person's own most recent call. A
  // projected lead has an id of the form `lead:…` that the lookup cannot match, which is
  // exactly the case the `reason` prop exists for.
  const derived = reason ? null : callReasonForCustomer(customer.id)
  const shownReason = reason || (derived ? t(derived.reasonKey, { defaultValue: derived.reason }) : null)

  // Derived ONCE: the lifecycle pill labels `review_requested` "Review link sent", word
  // for word what the reviewSent badge says, and two badges must not say it twice.
  const derivedStatus = leadStatusOf(customer)
  const statusMeta = LEAD_STATUSES.find(x => x.id === derivedStatus)

  const badges = [
    statusMeta ? (
      <Badge
        key="status"
        tone={derivedStatus === 'missed' ? 'bad'
          : derivedStatus === 'converted' || derivedStatus === 'review_requested' ? 'good' : 'neutral'}
      >
        {t(statusMeta.labelKey, { defaultValue: statusMeta.label })}
      </Badge>
    ) : null,
    shownReason ? <Badge key="reason" icon={MessageSquare}>{shownReason}</Badge> : null,
    customer.reviewed ? (
      <Badge key="reviewed" tone="good" icon={StarIcon}>{t('customers.reviewed')}</Badge>
    ) : null,
    customer.reviewSent && !customer.reviewed && derivedStatus !== 'review_requested' ? (
      <Badge key="sent" tone="info" icon={LinkIcon}>{t('customers.reviewLinkSent')}</Badge>
    ) : null,
    customer.callCount >= 2 ? (
      <Badge key="calls">{t('customers.callsCount', { count: customer.callCount })}</Badge>
    ) : null,
  ].filter(Boolean)

  return (
    <Card onPress={onOpen} label={title} className="!p-4">
      <View className="flex-row items-start gap-3">
        <View className="w-11 h-11 rounded-2xl items-center justify-center shrink-0 bg-brand-blue/[0.14] border border-brand-blue/[0.28]">
          <Users size={18} color="#0070FC" />
        </View>

        <View className="flex-1 min-w-0">
          {/* The band rides on the TITLE's line, inside this column — not as a sibling of
              it. A sibling reserves its width for the column's whole height, so the branch
              badge pushed the subline and the number onto extra lines each. */}
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[17px] leading-[22px] font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>
              {title}
            </Text>
            <View className="flex-row items-center gap-1.5 shrink-0">
              {branch ? (
                <View className="h-6 px-2 rounded-pill items-center justify-center bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline">
                  <Text className="text-[11px] font-hk-medium text-ink-2 dark:text-d-ink2" numberOfLines={1}>{branch}</Text>
                </View>
              ) : null}
              {/* No score is NOT a score of zero. A contact nobody has spoken to through
                  the platform has nothing to rank, and a "0 · Cold" pill would be the app
                  asserting they will never buy. */}
              {customer.cli != null ? <CLIPill score={customer.cli} /> : null}
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <View className="flex-1 min-w-0">
              <Caption className="mt-0.5" numberOfLines={1}>{subline}</Caption>
              {/* The number, demoted to what it is: a detail you confirm before dialling. */}
              <View className="flex-row items-center gap-1 mt-0.5">
                <Lock size={9} color="#93A0C8" />
                <Caption>{customer.masked}</Caption>
              </View>
            </View>
            <ChevronRight size={16} color="#93A0C8" />
          </View>
        </View>
      </View>

      {/* Below the identity row, NOT inside it: the read and the badges start at the
          card's own left edge, under the avatar rather than indented past it. */}
      <CardInsight customer={customer} badges={badges} />

      {/* An optional line the CALLER owns, inside the card and hairlined off from it.
          Outside the card it read as a caption for the NEXT row. */}
      {footer ? (
        <View className="mt-3 pt-2.5 border-t border-hairline dark:border-d-hairline">{footer}</View>
      ) : null}
    </Card>
  )
}
