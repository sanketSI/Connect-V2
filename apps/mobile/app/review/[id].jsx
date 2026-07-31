// ============================================================
// REVIEW DETAIL + REPLY — ported from ReviewDetail/ReplyComposer in
// apps/web/src/screens/Reviews.jsx (the spec). The same rules, verbatim:
//
//   • Scope 1 publishes to GBP only — a Justdial review keeps its reply HISTORY but
//     loses the reply box (canPublishReply).
//   • A removed review loses the box too, and the sheet SAYS WHY: Google took the
//     review off the listing, so a reply has nowhere to appear.
//   • The AI draft acknowledges specifics only when there ARE specifics — a star-only
//     review must not have words invented for it. Same prompt, same catalog fallbacks.
//   • Posting goes through postReviewReply — a real record on the review, so the
//     waiting counts, the badge and the list behind this screen all move at once.
// ============================================================
import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Star, EyeOff, Pencil, MessageCircle, Sparkles, Trash2, AlertTriangle } from 'lucide-react-native'
import {
  getReviewById, getReviewReplies, canPublishReply, postReviewReply,
  updateReviewReply, deleteReviewReply,
  PUBLISHING_PLATFORMS, REVIEW_TAGS, askAI, dayClock, getCurrentUser,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption, PrimaryButton } from '../../components/UI.jsx'
import { BackButton, HeaderRight } from '../../components/Header.jsx'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { vibrate, notifySuccess } from '../../lib/haptics.js'

function platformIdFor(source) {
  if (!source) return null
  const s = String(source).toLowerCase()
  const hit = PUBLISHING_PLATFORMS.find(p =>
    p.id === s || p.short.toLowerCase() === s || p.label.toLowerCase() === s || p.label.toLowerCase().startsWith(s))
  return hit?.id || null
}

function Stars({ n, size = 13 }) {
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} color={i <= n ? '#F59E0B' : '#DEE7F2'} fill={i <= n ? '#F59E0B' : 'none'} />
      ))}
    </View>
  )
}

export default function ReviewDetailScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams()
  useDataVersion()
  const review = getReviewById(id)
  if (!review) return null

  const replies = getReviewReplies(review)
  const platformId = platformIdFor(review.platform)
  const publishable = canPublishReply(platformId)
  const removed = !!review.removed
  const canReply = publishable && !removed
  const platformLabel = (pid) => {
    const p = PUBLISHING_PLATFORMS.find(x => x.id === pid)
    return p ? t(p.labelKey, { defaultValue: p.label }) : pid
  }

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BackButton />
        <HeaderRight />
      </View>

      {/* Who, how many stars, where, when. */}
      <View className="flex-row items-center gap-3 mt-4">
        <View className="w-11 h-11 rounded-full bg-brand-blue items-center justify-center">
          <Text className="text-sm font-hk-bold text-white">
            {review.customer.split(' ').map(p => p[0]).slice(0, 2).join('')}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{review.customer}</Body>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Stars n={review.rating} />
            <Caption>· {review.platform} · {dayClock(review.atMs)}</Caption>
          </View>
        </View>
      </View>

      {/* Removed / edited flags — the data layer's own labels. */}
      <View className="flex-row flex-wrap gap-2 mt-3">
        {review.removed && (
          <View className="h-6 px-2 rounded-pill bg-bad/10 border border-bad/30 flex-row items-center gap-1">
            <EyeOff size={10} color="#DC2626" />
            <Text className="text-[11px] font-hk-semi text-bad">
              {t('reviews.removedAt', { at: dayClock(review.removedAtMs), defaultValue: 'Removed from Google · {{at}}' })}
            </Text>
          </View>
        )}
        {review.edited && (
          <View className="h-6 px-2 rounded-pill bg-brand-blue/10 border border-brand-blue/30 flex-row items-center gap-1">
            <Pencil size={10} color="#0355DB" />
            <Text className="text-[11px] font-hk-semi text-primaryText dark:text-d-primaryText">
              {review.previousRating != null
                ? t('reviews.editedFromAt', { from: review.previousRating, at: dayClock(review.editedAtMs), defaultValue: 'Edited {{at}} · was {{from}}★' })
                : t('reviews.editedAt', { at: dayClock(review.editedAtMs), defaultValue: 'Edited {{at}}' })}
            </Text>
          </View>
        )}
      </View>

      {/* The review itself — star-only is a real state, said rather than blank. */}
      <Card className="mt-3 !p-3.5">
        {review.hasText
          ? <Body>{review.body}</Body>
          : <Body className="text-ink-3 dark:text-d-ink3">{t('reviews.noTextBody', { defaultValue: 'Star rating only — the customer didn’t write anything.' })}</Body>}
        {review.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-2.5">
            {review.tags.map(tid => {
              const tag = REVIEW_TAGS.find(x => x.id === tid)
              return tag ? (
                <View key={tid} className="h-5 px-2 rounded-pill bg-brand-blue/5 border border-hairline dark:border-d-hairline justify-center">
                  <Text className="text-[11px] text-ink-3 dark:text-d-ink3">{t(tag.labelKey, { defaultValue: tag.label })}</Text>
                </View>
              ) : null
            })}
          </View>
        )}
      </Card>

      {/* Reply history — what we said, when, where it was published. */}
      {replies.length > 0 && (
        <View className="mt-4">
          <View className="flex-row items-center gap-2 mb-2">
            <MessageCircle size={14} color="#5F6878" />
            <Body className="font-hk-semi text-ink dark:text-d-ink">{t('reviews.replyHistory', { defaultValue: 'Reply history' })}</Body>
            <Caption>{replies.length}</Caption>
          </View>
          {replies.map(rep => (
            <ReplyRow
              key={rep.id} reply={rep} reviewId={review.id}
              t={t} platformLabel={platformLabel}
            />
          ))}
        </View>
      )}

      {canReply && !review.responded && <ReplyComposer review={review} platformId={platformId} t={t} platformLabel={platformLabel} />}

      {/* Why the box is gone — the fact means something, not just a warning label. */}
      {removed && (
        <Card className="mt-4 !p-3.5">
          <View className="flex-row items-start gap-2">
            <EyeOff size={14} color="#DC2626" />
            <View className="flex-1 min-w-0">
              <Body className="font-hk-semi text-ink dark:text-d-ink">
                {t('reviews.removedTitle', { defaultValue: 'Google removed this review' })}
              </Body>
              <Caption className="mt-0.5">
                {t('reviews.removedExplain', { at: dayClock(review.removedAtMs), defaultValue: 'Google took it down on {{at}}. It is no longer on your listing.' })}
              </Caption>
            </View>
          </View>
        </Card>
      )}
    </Screen>
  )
}

/**
 * ONE PUBLISHED REPLY — readable, editable, retractable (PM feedback 9).
 *
 * It also FIXES a live bug: this row rendered `rep.body`, and the reply record has no
 * such field (it is `text`), so every published reply in the history has been drawing as
 * an empty card on device. The web row reads `reply.text` and always has.
 *
 * A reply already down offers neither action, and DELETE ASKS FIRST — a retraction is
 * the one thing on this screen the customer sees happen.
 */
function ReplyRow({ reply, reviewId, t, platformLabel }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState(reply.text)
  // Caret after the existing text when the edit opens — same rule as the lead notes.
  const [caret, setCaret] = useState(undefined)
  const gone = !!reply.deleted

  function save() {
    if (!draft.trim()) return
    updateReviewReply(reviewId, reply.id, draft)
    setEditing(false)
    notifySuccess()
  }

  function remove() {
    deleteReviewReply(reviewId, reply.id)
    setConfirming(false)
    notifySuccess()
  }

  return (
    <Card className={`mb-2 !p-3 ${gone ? 'opacity-70' : ''}`}>
      {editing ? (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            multiline
            selection={caret}
            onSelectionChange={() => setCaret(undefined)}
            accessibilityLabel={t('reviews.edit', { defaultValue: 'Edit' })}
            className="min-h-[88px] rounded-xl border border-brand-blue/40 bg-screen dark:bg-white/5 p-3 text-[15px] text-ink dark:text-d-ink"
          />
          <View className="flex-row justify-end gap-2 mt-2">
            <Pressable onPress={() => { setDraft(reply.text); setEditing(false) }} accessibilityRole="button"
              className="h-9 px-3 rounded-pill border border-hairline dark:border-d-hairline items-center justify-center">
              <Text className="text-[13px] font-hk-semi text-ink-2 dark:text-d-ink2">{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!draft.trim()} accessibilityRole="button"
              className={`h-9 px-3.5 rounded-pill items-center justify-center ${draft.trim() ? 'bg-brand-blue' : 'bg-brand-blue/30'}`}>
              <Text className="text-[13px] font-hk-semi text-white">{t('common.save', { defaultValue: 'Save' })}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Body numberOfLines={8} className={gone ? 'text-ink-3 dark:text-d-ink3' : ''}>{reply.text}</Body>
      )}

      <View className="flex-row items-center justify-between gap-2 mt-1.5">
        <Caption className="flex-1" numberOfLines={1}>
          {gone
            ? t('reviews.replyDeletedAt', { at: dayClock(reply.deletedAtMs), defaultValue: 'Deleted · {{at}}' })
            : t('reviews.replyPostedTo', { platform: platformLabel(reply.platform), defaultValue: 'Published to {{platform}}' })}
          {' · '}{dayClock(reply.atMs)}
        </Caption>
        {!gone && !editing ? (
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => { vibrate(6); setDraft(reply.text); setCaret({ start: reply.text.length, end: reply.text.length }); setEditing(true) }}
              accessibilityRole="button" accessibilityLabel={t('reviews.edit', { defaultValue: 'Edit' })} hitSlop={10}>
              <Pencil size={13} color="#93A0C8" />
            </Pressable>
            {/* Translator TODO: the catalogs carry no Delete string at all. */}
            <Pressable onPress={() => { vibrate(6); setConfirming(true) }}
              accessibilityRole="button" accessibilityLabel="Delete reply" hitSlop={10}>
              <Trash2 size={13} color="#93A0C8" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* THE CONFIRMATION, inline — the row being deleted stays on screen, so the manager
          is not confirming against memory. Translator TODO on the warning copy. */}
      {confirming && !gone ? (
        <View className="mt-2.5 pt-2.5 border-t border-hairline dark:border-d-hairline">
          <View className="flex-row items-start gap-2">
            <AlertTriangle size={14} color="#DC2626" />
            <Body className="flex-1 text-ink dark:text-d-ink">
              You are about to delete this review response. It will be taken down publicly.
            </Body>
          </View>
          <View className="flex-row justify-end gap-2 mt-2.5">
            <Pressable onPress={() => setConfirming(false)} accessibilityRole="button"
              className="h-9 px-3 rounded-pill border border-hairline dark:border-d-hairline items-center justify-center">
              <Text className="text-[13px] font-hk-semi text-ink-2 dark:text-d-ink2">{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
            </Pressable>
            <Pressable onPress={remove} accessibilityRole="button"
              className="h-9 px-3.5 rounded-pill bg-bad items-center justify-center flex-row gap-1.5">
              <Trash2 size={13} color="#fff" />
              <Text className="text-[13px] font-hk-semi text-white">Delete reply</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Card>
  )
}

function ReplyComposer({ review, platformId, t, platformLabel }) {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function gen() {
      setLoading(true)
      const brief = review.hasText
        ? `Acknowledge specifics from the review${review.rating <= 3 ? ', sincerely apologize, take ownership and offer a concrete next step (callback / store visit / discount on next purchase)' : ', thank the customer warmly and invite them back'}.`
        : `The customer left a star rating and wrote NO text at all, so there are no specifics to acknowledge — do not invent any or imply they said something. ${review.rating <= 3 ? 'Acknowledge that something clearly fell short, apologize, and invite them to tell us what happened so we can fix it.' : 'Simply thank them warmly for the rating and invite them back.'}`
      const quoted = review.hasText
        ? `Review (${review.rating}★ by ${review.customer}):\n"${review.body}"`
        : `Review (${review.rating}★ by ${review.customer}): star rating only, no written text.`

      const out = await askAI(
        `You are an AI drafting a public reply to a customer review on behalf of "Lakshmi Electronics, Indiranagar Bangalore" managed by Rajesh Kumar. Tone: warm and professional in a natural Indian conversational register, brand-on, 2 short paragraphs (max 55 words). ${brief} Sign off as "— Team Lakshmi Electronics, Indiranagar". Do NOT use any emoji. No markdown, no quotes.\n\n${quoted}`,
        {
          temperature: 0.85,
          fallback: review.hasText
            ? (review.rating <= 3
              ? t('reviews.replyDraftFallbackNegative', { customer: review.customer })
              : t('reviews.replyDraftFallbackPositive', { customer: review.customer }))
            : (review.rating <= 3
              ? t('reviews.replyDraftFallbackNoTextNegative', { customer: review.customer })
              : t('reviews.replyDraftFallbackNoTextPositive', { customer: review.customer, rating: review.rating })),
        },
      )
      if (!cancelled) { setDraft(out); setLoading(false) }
    }
    gen()
    return () => { cancelled = true }
  }, [review.id])

  function submit() {
    vibrate(15)
    // Through the data layer, not component state: the reply is a real record, so the
    // waiting count, the badge and the list behind this screen move from this instant.
    postReviewReply(review.id, { body: draft, platform: platformId, author: getCurrentUser().name })
    notifySuccess()
    setTimeout(() => router.back(), 400)
  }

  return (
    <View className="mt-4">
      <View className="flex-row items-center gap-2 mb-2 flex-wrap">
        <Sparkles size={14} color="#0355DB" />
        <Body className="font-hk-semi text-ink dark:text-d-ink">{t('reviews.aiDraftedReply', { defaultValue: 'AI-drafted reply' })}</Body>
        <Caption>{t('reviews.publishesTo', { platform: platformLabel(platformId), defaultValue: 'Publishes to {{platform}}' })}</Caption>
      </View>
      <Card className="!p-3">
        {loading ? (
          <View className="gap-2 py-1">
            <View className="h-3.5 w-3/5 rounded bg-brand-blue/15" />
            <View className="h-3 w-4/5 rounded bg-brand-blue/10" />
            <View className="h-3 w-2/3 rounded bg-brand-blue/10" />
          </View>
        ) : (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            accessibilityLabel={t('reviews.aiDraftedReply', { defaultValue: 'AI-drafted reply' })}
            className="min-h-[110px] text-[15px] leading-5 text-ink dark:text-d-ink"
          />
        )}
      </Card>
      <PrimaryButton onPress={submit} disabled={loading || !draft.trim()} className="mt-3">
        {t('reviews.postPublicReply', { defaultValue: 'Post public reply' })}
      </PrimaryButton>
    </View>
  )
}
