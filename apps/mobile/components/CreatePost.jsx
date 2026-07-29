// ============================================================
// CREATE POST — ported from apps/web/src/screens/CreatePostSheet.jsx (the spec). The
// four Nova templates off getPostTemplates(), AI copy through askAI (catalog fallback
// when no key is configured, same as web), the type-specific REQUIRED fields — an Offer
// with no code and no expiry is not a post anyone can publish — the accent-gradient
// preview naming the listing the post goes to, the regenerate chip, the dead-button
// explanation, and Cancel/Submit.
//
// Native deviation, documented: the web uses <input type="date|time">, which has no RN
// counterpart without a picker dependency — the fields are placeholder-guided text
// inputs carrying the same required-ness and the same gate on submit.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import { Sparkles, Wallet, PartyPopper, MessageSquareQuote } from 'lucide-react-native'
import { getPostTemplates, askAI, getStoreLocations, computeLocationFlags } from '@connect/core'
import { Card, Body, Caption, PrimaryButton, GhostButton, Chip } from './UI.jsx'
import { vibrate, notifySuccess } from '../lib/haptics.js'

const POST_TEMPLATES = getPostTemplates()
const ICONS = { Sparkles, Wallet, PartyPopper, MessageSquareQuote }

export default function CreatePost({ storeId, onDone }) {
  const { t } = useTranslation()
  const postStore = useMemo(
    () => getStoreLocations().find(l => l.id === storeId) || getStoreLocations()[0],
    [storeId],
  )
  // A post may only name what the listing can vouch for — an address flag puts the city
  // itself in doubt, so that draft names the branch alone. Same rule as web.
  const postArea = useMemo(() => {
    const cityInDoubt = computeLocationFlags(postStore).some(f => f.type === 'address')
    return cityInDoubt ? postStore.branch : `${postStore.branch} ${postStore.city}`
  }, [postStore])

  const [tpl, setTpl] = useState(POST_TEMPLATES[0])
  const [copy, setCopy] = useState('')
  const [loading, setLoading] = useState(false)
  const [offerCode, setOfferCode] = useState('')
  const [offerValid, setOfferValid] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')

  const isOffer = tpl.id === 'pt-offer'
  const isEvent = tpl.id === 'pt-event'
  const detailsReady = isOffer
    ? !!(offerCode.trim() && offerValid)
    : isEvent
      ? !!(eventDate && eventTime)
      : true

  const tplName = item => t(item.nameKey, { defaultValue: item.name })
  const tplCta = item => t(item.ctaKey, { defaultValue: item.cta })

  async function generate(template = tpl) {
    setLoading(true)
    const out = await askAI(
      `You are an AI marketing assistant for a local store. Generate ONE post for the brand "Lakshmi Electronics" branch "${postArea}", localized to weekend shoppers in that area. Template type: "${template.name}". Format: 1 short headline (max 5 words) on its own line, then ONE short body line (max 25 words). No emoji, no quotes, no hashtags. Friendly, confident.`,
      {
        temperature: 0.9,
        fallback: t('post.copyFallback', { headline: t(template.headlineKey, { defaultValue: template.headline }) }),
      },
    )
    setCopy(out)
    setLoading(false)
  }

  useEffect(() => { generate() }, [])

  return (
    <View>
      <Caption className="font-hk-medium mb-2">{t('post.chooseTemplate', { defaultValue: 'Choose a template' })}</Caption>
      <View className="flex-row flex-wrap -mx-1 mb-4">
        {POST_TEMPLATES.map(item => {
          const I = ICONS[item.icon] || Sparkles
          const active = tpl.id === item.id
          return (
            <View key={item.id} className="w-1/2 px-1 mb-2">
              <Pressable
                onPress={() => { vibrate(8); setTpl(item); generate(item) }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="rounded-card p-3"
                style={{
                  backgroundColor: active ? `${item.accent}18` : 'rgba(0,112,252,.04)',
                  borderWidth: 1,
                  borderColor: active ? `${item.accent}60` : 'rgba(0,0,0,.06)',
                }}
              >
                <View className="w-9 h-9 rounded-lg items-center justify-center" style={{ backgroundColor: `${item.accent}28` }}>
                  <I size={16} color={item.accent} />
                </View>
                <Body className="font-hk-semi text-ink dark:text-d-ink mt-2">{tplName(item)}</Body>
                <Caption>{tplCta(item)}</Caption>
              </Pressable>
            </View>
          )
        })}
      </View>

      {(isOffer || isEvent) && (
        <View className="mb-4">
          <Caption className="font-hk-medium mb-2">
            {isOffer
              ? t('post.offerDetails', { defaultValue: 'Offer details' })
              : t('post.eventDetails', { defaultValue: 'Event details' })}
          </Caption>
          <View className="flex-row gap-2.5">
            {isOffer ? (
              <>
                <PostField label={t('post.offerCode', { defaultValue: 'Coupon code' })}>
                  <TextInput
                    value={offerCode}
                    onChangeText={v => setOfferCode(v.toUpperCase().slice(0, 18))}
                    placeholder="DIWALI20"
                    placeholderTextColor="#93A0C8"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    className="text-base font-hk-semi text-ink dark:text-d-ink"
                  />
                </PostField>
                <PostField label={t('post.offerValid', { defaultValue: 'Valid till' })}>
                  <TextInput
                    value={offerValid}
                    onChangeText={setOfferValid}
                    placeholder="2026-08-15"
                    placeholderTextColor="#93A0C8"
                    className="text-base font-hk-semi text-ink dark:text-d-ink"
                  />
                </PostField>
              </>
            ) : (
              <>
                <PostField label={t('post.eventDate', { defaultValue: 'Date' })}>
                  <TextInput
                    value={eventDate}
                    onChangeText={setEventDate}
                    placeholder="2026-08-15"
                    placeholderTextColor="#93A0C8"
                    className="text-base font-hk-semi text-ink dark:text-d-ink"
                  />
                </PostField>
                <PostField label={t('post.eventTime', { defaultValue: 'Start time' })}>
                  <TextInput
                    value={eventTime}
                    onChangeText={setEventTime}
                    placeholder="18:00"
                    placeholderTextColor="#93A0C8"
                    className="text-base font-hk-semi text-ink dark:text-d-ink"
                  />
                </PostField>
              </>
            )}
          </View>
        </View>
      )}

      <Caption className="font-hk-medium mb-2">{t('post.preview', { defaultValue: 'Preview' })}</Caption>
      <LinearGradient
        colors={[`${tpl.accent}55`, '#0E0071', '#06070D']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: 16, padding: 16, minHeight: 160, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)' }}
      >
        {loading ? (
          <View className="mt-3 gap-2">
            <View className="h-4 w-3/5 rounded bg-white/20" />
            <View className="h-3 w-4/5 rounded bg-white/15" />
            <View className="h-3 w-3/5 rounded bg-white/15" />
          </View>
        ) : (
          <>
            <Text className="text-[22px] leading-7 font-hk-bold text-white">{copy.split('\n')[0]}</Text>
            <Text className="text-[15px] leading-5 text-white/85 mt-1">{copy.split('\n').slice(1).join(' ')}</Text>
          </>
        )}
        {(isOffer || isEvent) && (offerCode || offerValid || eventDate || eventTime) ? (
          <View className="self-start mt-2.5 h-7 px-2.5 rounded-pill bg-white/15 border border-white/20 justify-center">
            <Text className="text-[11px] font-hk-semi text-white">
              {isOffer
                ? [offerCode, offerValid && t('post.validTill', { date: offerValid, defaultValue: 'till {{date}}' })].filter(Boolean).join(' · ')
                : [eventDate, eventTime].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
        <View className="flex-row items-center justify-between mt-4">
          <Text className="text-[11px] text-white/60 flex-1" numberOfLines={1}>
            {postStore.name} · {postStore.branch}
          </Text>
          <View className="h-7 px-3 rounded-pill bg-white/12 border border-white/20 justify-center">
            <Text className="text-[11px] font-hk-semi text-white">{tplCta(tpl)}</Text>
          </View>
        </View>
      </LinearGradient>

      <View className="flex-row gap-2 mt-3">
        <Chip icon={Sparkles} onPress={() => generate()}>{t('post.regenerate', { defaultValue: 'Regenerate' })}</Chip>
      </View>

      {!detailsReady && (
        <Caption className="mt-3">
          {isOffer
            ? t('post.offerRequired', { defaultValue: 'Add the coupon code and the date it runs out to submit this offer.' })
            : t('post.eventRequired', { defaultValue: 'Add the date and start time to submit this event.' })}
        </Caption>
      )}

      <View className="flex-row gap-2 mt-5">
        <GhostButton onPress={onDone} className="flex-1">
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </GhostButton>
        <View className="flex-[2]">
          <PrimaryButton
            disabled={!detailsReady}
            onPress={() => { notifySuccess(); onDone?.() }}
          >
            {t('post.submitCta', { defaultValue: 'Submit for approval' })}
          </PrimaryButton>
        </View>
      </View>
    </View>
  )
}

function PostField({ label, children }) {
  return (
    <View className="flex-1">
      <Caption className="mb-1 ml-1">{label}</Caption>
      <View className="h-12 rounded-xl px-3 justify-center bg-brand-blue/5 border border-hairline dark:border-d-hairline">
        {children}
      </View>
    </View>
  )
}
