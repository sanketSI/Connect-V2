// REVIEWS — ported from apps/web/src/screens/Reviews.jsx (the spec). Two tabs, as on
// web: INBOX (the three-stat card, the one-predicate waiting count, full review cards)
// and REVIEW LINK — the store's ONE link, an editable message, and real WhatsApp/SMS
// hand-offs. The leaderboard tab is brand-roles only on web and a single/multi-store
// manager never sees it; the filter sheet is the remaining iteration.
import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Star, Copy, MessageCircle, Send, SlidersHorizontal, EyeOff, Pencil, Check, CalendarRange } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import {
  filterReviews, reviewMetrics, reviewsWaitingCount, CANONICAL_REVIEW_WINDOW,
  storeReviewLink, getCurrentUser, groupByStore, TIME_WINDOWS,
  DEFAULT_REVIEW_FILTERS, REVIEW_SENTIMENTS, REVIEW_RATING_TYPES, REVIEW_STATUSES, REVIEW_TAGS,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption, Chip, PrimaryButton, GhostButton } from '../../components/UI.jsx'
import ScopePill from '../../components/ScopePill.jsx'
import RatingRange from '../../components/RatingRange.jsx'
import { HeaderRight } from '../../components/Header.jsx'
import { useSession } from '../../lib/session.js'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { refreshDerived } from '../../lib/refresh.js'
import { vibrate, notifySuccess } from '../../lib/haptics.js'

// Same helper the web file keeps beside its ReviewLink — the phone takes over from here.
function storeShareHrefs(message) {
  const text = encodeURIComponent(message)
  return { whatsapp: `https://wa.me/?text=${text}`, sms: `sms:?&body=${text}` }
}

function Stars({ n }) {
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} color={i <= n ? '#F59E0B' : '#DEE7F2'} fill={i <= n ? '#F59E0B' : 'none'} />
      ))}
    </View>
  )
}

export default function ReviewsTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  const version = useDataVersion()
  const scopeId = session.store?.aggregate ? undefined : session.store?.id
  const [tab, setTab] = useState('inbox')
  const [filters, setFilters] = useState({ ...DEFAULT_REVIEW_FILTERS })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [windowOpen, setWindowOpen] = useState(false)
  const aggregate = !!session.store?.aggregate

  // How many controls sit off their default — the badge on the Filters chip, and the
  // gate on the "Showing X of Y" note, exactly the web's nActive.
  const nActive =
    (filters.rating.min !== 1 || filters.rating.max !== 5 ? 1 : 0) +
    (filters.sentiment !== 'all' ? 1 : 0) +
    (filters.ratingType !== 'both' ? 1 : 0) +
    (filters.status !== 'both' ? 1 : 0) +
    (filters.showRemoved ? 1 : 0) +
    (filters.editedOnly ? 1 : 0) +
    filters.tags.length

  const scoped = useMemo(() => ({ ...filters, storeId: scopeId }), [filters, scopeId])

  // The sentiment mix over the SAME set reviewMetrics() describes — every number on the
  // hero card is talking about the same reviews. `sentiment` is the data layer's own
  // derivation, already resolved onto each record.
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
  // Denominator for the filtered note: the window alone (plus showRemoved, which widens).
  const windowTotal = useMemo(
    () => filterReviews({ window: filters.window, showRemoved: filters.showRemoved, storeId: scopeId }).length,
    [filters.window, filters.showRemoved, version, scopeId],
  )
  const metrics = useMemo(() => reviewMetrics(scoped), [scoped, version])
  const list = useMemo(() => filterReviews(scoped), [scoped, version])

  // ONE PREDICATE: counted off the very array rendered below, with the data layer's own
  // responded flag — the headline and the rows can never disagree. See the long audit
  // note in the web file for why this matters (four surfaces once showed four numbers).
  // Grouped BEFORE the branch filter, so the picker's counts survive a pick.
  const allGroups = useMemo(
    () => (aggregate ? groupByStore(list) : [{ storeId: null, label: null, count: list.length, items: list }]),
    [aggregate, list],
  )
  const groups = useMemo(
    // No screen-local branch filter any more: the SCOPE PILL above is the one location
    // control and it narrows the list at source, through assignedStoreIds(). Filtering
    // twice would let this screen disagree with the pill's own label.
    () => allGroups,
    [allGroups],
  )

  const waiting = useMemo(() => list.filter(r => !r.responded && !r.removed).length, [list])
  const canonicalWaiting = useMemo(() => reviewsWaitingCount(undefined, scopeId), [version, scopeId])

  return (
    <Screen onRefresh={refreshDerived}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Title>{t('reviews.title', { defaultValue: 'Reviews' })}</Title>
          <Caption className="mt-0.5">
            {t('reviews.subtitlePlain', { defaultValue: 'What customers are saying, and how fast you reply' })}
          </Caption>
        </View>
        <HeaderRight />
      </View>

      {/* Which tab — Inbox or the store's review link, the web's chip idiom. */}
      <View className="flex-row gap-2 mt-4 mb-1">
        <Chip active={tab === 'inbox'} onPress={() => setTab('inbox')}>
          {t('reviews.inbox', { defaultValue: 'Inbox' })}
        </Chip>
        <Chip active={tab === 'link'} onPress={() => setTab('link')}>
          {t('reviews.reviewLink', { defaultValue: 'Review link' })}
        </Chip>
      </View>

      {filtersOpen ? (
        <FiltersView
          t={t}
          value={filters}
          onApply={(f) => { setFilters(f); setFiltersOpen(false) }}
          onClose={() => setFiltersOpen(false)}
        />
      ) : tab === 'link' ? <ReviewLink t={t} /> : (<>
      {/* Scope controls — the branch picker leads (WHICH listings are in play), then the
          period, then the filters. The web order, the web icons. */}
      <View className="flex-row flex-wrap items-center gap-2 mt-3 -mb-1">
        {/* ALWAYS shown, never gated on `aggregate`: a switcher that vanishes once you
            narrow to one store cannot take you back out, and Home's never hides. */}
        <ScopePill />
        <Chip
          icon={CalendarRange}
          active={filters.window !== DEFAULT_REVIEW_FILTERS.window}
          onPress={() => setWindowOpen(o => !o)}
        >
          {t(`window.${filters.window}`, { defaultValue: filters.window })}
        </Chip>
        <Chip icon={SlidersHorizontal} active={nActive > 0} onPress={() => setFiltersOpen(true)}>
          {nActive > 0
            ? t('reviews.filtersN', { count: nActive, defaultValue: 'Filters · {{count}}' })
            : t('reviews.filters', { defaultValue: 'Filters' })}
        </Chip>
      </View>

      {/* The period options — every canonical window except custom (its date-range
          inputs need a native picker; documented deviation, not a silent drop). */}
      {windowOpen && (
        <View className="flex-row flex-wrap gap-2 mt-3 -mb-1">
          {TIME_WINDOWS.filter(w => w.id !== 'custom').map(w => (
            <Chip
              key={w.id}
              active={filters.window === w.id}
              onPress={() => { setFilters(f => ({ ...f, window: w.id })); setWindowOpen(false) }}
            >
              {t(w.labelKey, { defaultValue: w.label })}
            </Chip>
          ))}
        </View>
      )}
      {/* Listing metrics — the CountsCard idiom, three across. */}
      <Card className="mt-4 mb-2 !p-3.5">
        <View className="flex-row">
          <HeadStat value={metrics.total} label={t('reviews.totalReviews', { defaultValue: 'Total reviews' })} />
          <HeadStat
            value={waiting}
            tone="text-[#CA8A04]"
            label={t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })}
            divider
          />
          <HeadStat
            value={metrics.avgRating != null ? metrics.avgRating.toFixed(1) : '—'}
            star={metrics.avgRating != null}
            label={t('reviews.avgRating', { defaultValue: 'Avg rating' })}
            divider
          />
        </View>
        <View className="mt-3 pt-2.5 border-t border-hairline dark:border-d-hairline">
          {nActive > 0 && (
            <Caption className="mb-1">
              {t('reviews.countsFilteredNote', {
                shown: list.length, total: windowTotal,
                defaultValue: 'Filters on — showing {{shown}} of {{total}} reviews.',
              })}
            </Caption>
          )}
          <Caption>{t('reviews.waitingMeans', { defaultValue: 'Waiting for a reply means live on your listing with no reply posted.' })}</Caption>
          {canonicalWaiting !== waiting && (
            <Caption className="mt-1">
              {t('reviews.waitingBadgeNote', {
                count: canonicalWaiting,
                window: t(`window.${CANONICAL_REVIEW_WINDOW}`, { defaultValue: 'Last 30 days' }),
                defaultValue: 'The Reviews tab badge shows {{count}} — the same count over {{window}}.',
              })}
            </Caption>
          )}
        </View>

        {/* The sentiment mix — same set as every number above, web's exact colours. */}
        {mix ? (
          <>
            <View className="mt-3 h-1.5 rounded-pill overflow-hidden flex-row bg-ink-3/10">
              {mix.positive > 0 && <View style={{ width: `${mix.positive}%`, backgroundColor: '#16A34A' }} />}
              {mix.neutral > 0 && <View style={{ width: `${mix.neutral}%`, backgroundColor: '#F59E0B' }} />}
              {mix.negative > 0 && <View style={{ width: `${mix.negative}%`, backgroundColor: '#FF6B7E' }} />}
            </View>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-xs font-hk-medium text-[#16A34A]">{t('reviews.sharePositive', { pct: mix.positive, defaultValue: '{{pct}}% positive' })}</Text>
              <Text className="text-xs font-hk-medium text-[#B45309]">{t('reviews.shareNeutral', { pct: mix.neutral, defaultValue: '{{pct}}% neutral' })}</Text>
              <Text className="text-xs font-hk-medium text-[#DC2626]">{t('reviews.shareNegative', { pct: mix.negative, defaultValue: '{{pct}}% negative' })}</Text>
            </View>
          </>
        ) : null}
      </Card>

      {/* Every card opens the detail — read the whole review, the reply history, and
          reply with the AI draft. Grouped per listing on the cumulative view. */}
      {groups.map(g => (
        <View key={g.storeId ?? 'all'}>
          {g.label ? (
            <View className="flex-row items-center justify-between mt-2 mb-2">
              <Caption className="font-hk-semi">{g.label}</Caption>
              <Caption>{g.count}</Caption>
            </View>
          ) : null}
          {g.items.map(r => (
        <Card key={r.id} onPress={() => router.push(`/review/${r.id}`)} label={r.customer} className="mb-2.5">
          <View className="flex-row items-center justify-between gap-2">
            <Body className="font-hk-semi text-ink dark:text-d-ink flex-1" numberOfLines={1}>{r.customer}</Body>
            <Stars n={r.rating} />
          </View>
          <Caption className="mt-0.5">{r.platform} · {r.time}</Caption>
          {r.body ? <Body numberOfLines={4} className="mt-2">{r.body}</Body> : null}
          {r.tags?.length ? (
            <View className="flex-row flex-wrap gap-1.5 mt-2">
              {r.tags.map(tag => (
                <View key={tag} className="h-6 px-2 rounded-pill bg-brand-blue/5 border border-hairline dark:border-d-hairline items-center justify-center">
                  <Text className="text-[11px] font-hk-medium text-ink-3 dark:text-d-ink3">{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {r.replies?.length ? (
            <View className="mt-2 pl-3 border-l-2 border-brand-blue/30">
              <Caption numberOfLines={3}>{r.replies[r.replies.length - 1].text}</Caption>
            </View>
          ) : (!r.removed && (
            <View className="self-start mt-2 h-6 px-2 rounded-pill bg-[#CA8A04]/10 items-center justify-center">
              <Text className="text-[11px] font-hk-semi text-[#CA8A04]">
                {t('reviews.waitingStat', { defaultValue: 'Waiting for a reply' })}
              </Text>
            </View>
          ))}
        </Card>
          ))}
        </View>
      ))}
      </>)}
    </Screen>
  )
}

/** The Review-link tab — the store's ONE link, every time (PM: no per-send variants). */
function ReviewLink({ t }) {
  const STORE = getCurrentUser().store
  const link = storeReviewLink(STORE)
  const [message, setMessage] = useState(() => t('reviews.storeLinkMessage', {
    store: STORE.name, branch: STORE.branch, link,
    defaultValue: 'Hi, thanks for shopping at {{store}}, {{branch}}. If we did right by you, could you leave us a quick review? It takes a minute: {{link}}',
  }))
  const hrefs = storeShareHrefs(message)

  return (
    <View className="mt-2">
      <Card className="!p-3.5">
        <Caption className="font-hk-medium">{t('reviews.storeLinkLabel', { defaultValue: 'Your store’s review link' })}</Caption>
        <View className="flex-row items-center gap-2 mt-2">
          <View className="flex-1 h-11 px-3 rounded-xl bg-brand-blue/10 border border-brand-blue/25 justify-center">
            <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{link}</Body>
          </View>
          <Pressable
            onPress={async () => { vibrate(10); await Clipboard.setStringAsync(link); notifySuccess() }}
            accessibilityRole="button"
            accessibilityLabel={t('reviewLink.copy', { defaultValue: 'Copy link' })}
            className="w-11 h-11 rounded-xl bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline items-center justify-center"
          >
            <Copy size={17} color="#374151" />
          </Pressable>
        </View>
        <Caption className="mt-2">
          {t('reviews.storeLinkHint', {
            store: STORE.name, branch: STORE.branch,
            defaultValue: 'The same link every time, for {{store}} {{branch}} — it opens the Google review box for this store. Print it, put it on the bill, or send it below.',
          })}
        </Caption>
      </Card>

      <Caption className="font-hk-medium mt-3 mb-2">{t('reviewLink.messageLabel', { defaultValue: 'Message' })}</Caption>
      <Card className="!p-3.5">
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          accessibilityLabel={t('reviewLink.messageLabel', { defaultValue: 'Message' })}
          className="min-h-[92px] text-[15px] text-ink dark:text-d-ink"
        />
      </Card>

      <Caption className="font-hk-medium mt-4 mb-2">{t('reviewLink.chooseChannel', { defaultValue: 'Send it on' })}</Caption>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => { vibrate(15); Linking.openURL(hrefs.whatsapp) }}
          accessibilityRole="button"
          className="flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 bg-[#25D366]"
        >
          <MessageCircle size={18} color="#fff" />
          <Text className="text-base font-hk-semi text-white">WhatsApp</Text>
        </Pressable>
        <Pressable
          onPress={() => { vibrate(15); Linking.openURL(hrefs.sms) }}
          accessibilityRole="button"
          className="flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 bg-card dark:bg-white/5 border border-hairline dark:border-d-hairline"
        >
          <Send size={18} color="#374151" />
          <Text className="text-base font-hk-semi text-ink dark:text-d-ink">{t('reviewLink.sms', { defaultValue: 'SMS' })}</Text>
        </Pressable>
      </View>
      <Caption className="mt-2">
        {t('reviews.storeShareHint', { defaultValue: 'Opens WhatsApp or Messages with the message ready — you choose who it goes to and press send.' })}
      </Caption>
    </View>
  )
}

function HeadStat({ value, label, tone = 'text-ink dark:text-d-ink', star, divider }) {
  return (
    <View className={`flex-1 min-w-0 ${divider ? 'pl-3 border-l border-hairline dark:border-d-hairline' : ''}`}>
      <View className="flex-row items-center gap-1">
        <Text className={`text-2xl font-hk-bold ${tone}`} numberOfLines={1}>{value}</Text>
        {star ? <Star size={13} color="#F59E0B" fill="#F59E0B" /> : null}
      </View>
      <Caption numberOfLines={2} className="mt-0.5">{label}</Caption>
    </View>
  )
}


/** The web FilterSheet, as a pushed view. Draft state: Cancel discards, Apply commits.
    Deviation, documented: the web's dual-thumb RatingRange slider is two chip rows
    (from/to) — same values, no slider dependency. */
function FiltersView({ t, value, onApply, onClose }) {
  const [draft, setDraft] = useState(value)
  const matches = useMemo(() => filterReviews(draft).length, [draft])
  const set = (patch) => setDraft(d => ({ ...d, ...patch }))

  return (
    <View className="mt-3">
      <Body className="font-hk-semi text-ink dark:text-d-ink mb-3">{t('reviews.filters', { defaultValue: 'Filters' })}</Body>

      <FilterSection label={t('reviews.ratingRange', { defaultValue: 'Rating Range' })}>
        <RatingRange value={draft.rating} onChange={(rating) => set({ rating })} />
      </FilterSection>

      <FilterSection label={t('reviews.sentiment', { defaultValue: 'Sentiment' })}>
        <OptionChips t={t} options={REVIEW_SENTIMENTS} selected={draft.sentiment} onSelect={sentiment => set({ sentiment })} />
      </FilterSection>

      <FilterSection label={t('reviews.ratingType', { defaultValue: 'Rating Type' })}>
        <OptionChips t={t} options={REVIEW_RATING_TYPES} selected={draft.ratingType} onSelect={ratingType => set({ ratingType })} />
      </FilterSection>

      <FilterSection label={t('reviews.reviewStatus', { defaultValue: 'Review Status' })}>
        <OptionChips t={t} options={REVIEW_STATUSES} selected={draft.status} onSelect={status => set({ status })} />
      </FilterSection>

      <View className="mt-4">
        <CheckRow
          checked={draft.showRemoved}
          onPress={() => set({ showRemoved: !draft.showRemoved })}
          icon={EyeOff}
          label={t('reviews.showRemoved', { defaultValue: 'Show Removed From Google' })}
          hint={t('reviews.showRemovedHint', { defaultValue: 'Reviews Google has taken down — not on your listing.' })}
        />
        <CheckRow
          checked={draft.editedOnly}
          onPress={() => set({ editedOnly: !draft.editedOnly })}
          icon={Pencil}
          label={t('reviews.editedOnly', { defaultValue: 'Edited reviews' })}
          hint={t('reviews.editedOnlyHint', { defaultValue: 'Only reviews the customer changed after posting.' })}
        />
      </View>

      <FilterSection label={t('reviews.tags', { defaultValue: 'Tags' })}>
        <View className="flex-row flex-wrap gap-2">
          {REVIEW_TAGS.map(tag => (
            <Chip
              key={tag.id}
              active={draft.tags.includes(tag.id)}
              onPress={() => set({
                tags: draft.tags.includes(tag.id)
                  ? draft.tags.filter(x => x !== tag.id)
                  : [...draft.tags, tag.id],
              })}
            >
              {t(tag.labelKey, { defaultValue: tag.label })}
            </Chip>
          ))}
        </View>
      </FilterSection>

      <Caption className="text-center mt-5 mb-2">
        {t('reviews.filterMatches', { count: matches, defaultValue: 'Matches · {{count}}' })}
      </Caption>
      <View className="flex-row gap-2">
        <GhostButton
          onPress={() => setDraft({ ...DEFAULT_REVIEW_FILTERS, window: draft.window })}
          className="flex-1"
        >
          {t('reviews.reset', { defaultValue: 'Reset' })}
        </GhostButton>
        <View className="flex-[2]">
          <PrimaryButton onPress={() => { vibrate(12); onApply(draft) }}>
            {t('reviews.applyFilters', { defaultValue: 'Apply Filters' })}
          </PrimaryButton>
        </View>
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" className="h-11 items-center justify-center mt-1">
        <Caption>{t('common.cancel', { defaultValue: 'Cancel' })}</Caption>
      </Pressable>
    </View>
  )
}

function FilterSection({ label, children }) {
  return (
    <View className="mt-4">
      <Caption className="font-hk-medium mb-2">{label}</Caption>
      {children}
    </View>
  )
}

function OptionChips({ t, options, selected, onSelect }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map(o => (
        <Chip key={o.id} active={selected === o.id} onPress={() => onSelect(o.id)}>
          {t(o.labelKey, { defaultValue: o.label })}
        </Chip>
      ))}
    </View>
  )
}

function CheckRow({ checked, onPress, icon: Icon, label, hint }) {
  return (
    <Pressable
      onPress={() => { vibrate(8); onPress() }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked }}
      accessibilityLabel={label}
      className="flex-row items-start gap-3 py-2.5"
    >
      <View className={`w-5 h-5 rounded items-center justify-center border ${checked ? 'bg-brand-blue border-brand-blue' : 'border-hairline dark:border-d-hairline'}`}>
        {checked && <Check size={13} color="#fff" />}
      </View>
      <Icon size={15} color="#5F6878" style={{ marginTop: 2 }} />
      <View className="flex-1 min-w-0">
        <Body className="font-hk-medium text-ink dark:text-d-ink">{label}</Body>
        <Caption className="mt-0.5">{hint}</Caption>
      </View>
    </Pressable>
  )
}
