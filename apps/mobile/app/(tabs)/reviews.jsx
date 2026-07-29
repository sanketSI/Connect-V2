// REVIEWS — ported from apps/web/src/screens/Reviews.jsx (the spec). Two tabs, as on
// web: INBOX (the three-stat card, the one-predicate waiting count, full review cards)
// and REVIEW LINK — the store's ONE link, an editable message, and real WhatsApp/SMS
// hand-offs. The leaderboard tab is brand-roles only on web and a single/multi-store
// manager never sees it; the filter sheet is the remaining iteration.
import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Star, Copy, MessageCircle, Send, SlidersHorizontal, EyeOff, Pencil, RotateCcw, Check } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import {
  filterReviews, reviewMetrics, reviewsWaitingCount, CANONICAL_REVIEW_WINDOW,
  storeReviewLink, getCurrentUser,
  DEFAULT_REVIEW_FILTERS, REVIEW_SENTIMENTS, REVIEW_RATING_TYPES, REVIEW_STATUSES, REVIEW_TAGS,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption, Chip, PrimaryButton, GhostButton } from '../../components/UI.jsx'
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
      {/* The way into the filter sheet, with the active count as its badge. */}
      <View className="flex-row mt-3 -mb-1">
        <Chip active={nActive > 0} onPress={() => setFiltersOpen(true)}>
          ⚙ {t('reviews.filters', { defaultValue: 'Filters' })}{nActive > 0 ? ` · ${nActive}` : ''}
        </Chip>
      </View>
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
      </Card>

      {/* Every card opens the detail — read the whole review, the reply history, and
          reply with the AI draft. The web's setSelectedId sheet, as a route. */}
      {list.map(r => (
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
        <View className="flex-row items-center gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map(n => (
            <Chip
              key={n}
              active={n >= draft.rating.min && n <= draft.rating.max}
              onPress={() => {
                // Tap outside the range extends it; tap an edge shrinks it — a two-thumb
                // range on chips.
                const { min, max } = draft.rating
                if (n < min) set({ rating: { min: n, max } })
                else if (n > max) set({ rating: { min, max: n } })
                else if (n === min && min < max) set({ rating: { min: min + 1, max } })
                else if (n === max && max > min) set({ rating: { min, max: max - 1 } })
                else set({ rating: { min: 1, max: 5 } })
              }}
            >
              {n}★
            </Chip>
          ))}
        </View>
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
      accessibilityState={{ checked }}
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
