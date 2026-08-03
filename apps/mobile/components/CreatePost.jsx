// ============================================================
// CREATE POST — four typed forms, then a preview, then submit.
//
// Native twin of apps/web/src/screens/CreatePostSheet.jsx; the reasoning lives there.
// In short (PM feedback 5): a template picker that generated AI copy is not the same
// product as a typed Offer with a coupon code, a redeem URL, a date window and terms.
// Google requires those fields and there was nowhere to enter them.
//
// THE FIELDS ARE NOT DEFINED HERE. They come from core's POST_TYPES, which the web
// renders too — see packages/core/data/postForms.js for why ~30 labels and ceilings live
// in one place. validatePost() is shared as well, so "can I submit this" cannot be
// answered differently on a phone than in a browser.
//
// TWO STEPS, in the order the brief gives: FORM → PREVIEW → success.
//
// NATIVE DEVIATIONS, documented:
//   • date / datetime are placeholder-guided text inputs (YYYY-MM-DD, YYYY-MM-DD HH:MM)
//     rather than native pickers — the deviation already recorded for the other date
//     fields in this port. Same required-ness, same gate on submit.
//   • the success message is an Alert, because this app has no toast host of its own
//     (the web's ToastProvider has no native counterpart). The manager still gets the
//     exact wording the brief asks for.
// ============================================================
import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Sparkles, Wallet, PartyPopper, MessageSquareQuote, Eye, Send,
  Image as ImageIcon, MapPin, CheckCircle2, Check,
} from 'lucide-react-native'
import {
  POST_TYPES, getPostType, validatePost, POST_IMAGE_HINT,
  getStoreLocations, computeLocationFlags,
} from '@connect/core'
import { Card, Body, Caption, PrimaryButton, GhostButton } from './UI.jsx'
import { vibrate, notifySuccess } from '../lib/haptics.js'

const TYPE_ICON = {
  standard: Sparkles,
  offer: Wallet,
  event: PartyPopper,
  testimonial: MessageSquareQuote,
}

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

  const [typeId, setTypeId] = useState(POST_TYPES[0].id)
  const [values, setValues] = useState({})
  const [step, setStep] = useState('form')
  // Errors only after a submit attempt — every required field red before anything is
  // typed reads as a broken form, not a helpful one.
  const [showErrors, setShowErrors] = useState(false)

  const type = getPostType(typeId)
  const result = validatePost(typeId, values)
  const set = (k, v) => setValues(prev => ({ ...prev, [k]: v }))

  // Switching type CLEARS the draft: the forms share almost no fields, and carrying a
  // Redeem URL into an Event post would submit a value its own form never showed.
  function pickType(id) {
    if (id === typeId) return
    vibrate(6)
    setTypeId(id)
    setValues({})
    setShowErrors(false)
  }

  function goPreview() {
    if (!result.ok) { setShowErrors(true); vibrate(20); return }
    vibrate(10)
    setStep('preview')
  }

  function submit() {
    notifySuccess()
    // The wording the brief asks for. Translator TODO: the catalogs' post.submittedTitle
    // says "Brand team will review and publish", which is not the promise the PM wants
    // made here — this one names the delay.
    Alert.alert(
      'Post published successfully',
      'It might take up to a few hours to reflect.',
      [{ text: t('common.done', { defaultValue: 'Done' }), onPress: () => onDone?.() }],
    )
  }

  return (
    <View>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-[22px] font-hk-bold text-ink dark:text-d-ink">
            {t('post.title', { defaultValue: 'Create Post' })}
          </Text>
          <View className="flex-row items-center gap-1 mt-0.5">
            <MapPin size={11} color="#93A0C8" />
            <Caption numberOfLines={1}>{postArea}</Caption>
          </View>
        </View>
      </View>

      {step === 'form' ? (
        <>
          {/* THE FOUR TYPES — a scrolling rail, not a 4-across grid: "Testimonial Post"
              does not fit a quarter of a 375px screen without truncating. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0 mt-3.5">
            <View className="flex-row gap-2">
              {POST_TYPES.map(pt => {
                const Icon = TYPE_ICON[pt.id] || Sparkles
                const on = pt.id === typeId
                return (
                  <Pressable
                    key={pt.id}
                    onPress={() => pickType(pt.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: !!on }}
                    className={`h-10 px-3.5 rounded-pill flex-row items-center gap-1.5 border ${
                      on ? 'bg-brand-blue/10 border-brand-blue/55' : 'bg-card dark:bg-white/5 border-hairline dark:border-d-hairline'
                    }`}
                  >
                    <Icon size={14} color={on ? '#0355DB' : '#5F6878'} />
                    <Text className={`text-[13px] font-hk-semi ${on ? 'text-primaryText dark:text-d-primaryText' : 'text-ink-2 dark:text-d-ink2'}`}>
                      {pt.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </ScrollView>

          <View className="mt-3">
            {type.fields.map(f => (
              <Field
                key={f.key}
                field={f}
                value={values[f.key] ?? ''}
                onChange={v => set(f.key, v)}
                error={showErrors && (
                  result.missing.includes(f.key) ? 'required'
                    : result.tooLong.includes(f.key) ? 'long'
                      : result.invalid.includes(f.key) ? 'invalid' : null
                )}
              />
            ))}
          </View>

          {showErrors && !result.ok ? (
            <Caption className="text-bad dark:text-d-bad mb-1">
              Fill the required fields before previewing this post.
            </Caption>
          ) : null}

          <View className="flex-row gap-2 mt-4">
            <View className="flex-1">
              <GhostButton onPress={() => onDone?.()}>{t('common.cancel', { defaultValue: 'Cancel' })}</GhostButton>
            </View>
            <View className="flex-1">
              <PrimaryButton icon={Eye} onPress={goPreview}>{t('post.preview', { defaultValue: 'Preview' })}</PrimaryButton>
            </View>
          </View>
        </>
      ) : (
        <>
          <PostPreview type={type} values={values} area={postArea} t={t} />
          <View className="flex-row gap-2 mt-4">
            <View className="flex-1">
              <GhostButton onPress={() => { vibrate(6); setStep('form') }}>
                {t('common.back', { defaultValue: 'Back' })}
              </GhostButton>
            </View>
            <View className="flex-1">
              {/* NO APPROVAL STEP — see the web sheet. The manager publishes; the delay
                  is Google's indexing, not a brand team's queue. */}
              <PrimaryButton icon={Send} onPress={submit}>Publish</PrimaryButton>
            </View>
          </View>
        </>
      )}
    </View>
  )
}

/**
 * ONE FIELD, from the spec's `kind`. Every ceiling comes with a live counter — a limit
 * you only discover by being truncated is not a limit anyone told the manager about.
 */
function Field({ field: f, value, onChange, error }) {
  const len = String(value ?? '').length
  const over = f.max ? len > f.max : false
  const ring = error ? 'border-bad' : 'border-hairline dark:border-d-hairline'
  const urlish = f.kind === 'url' || f.kind === 'image'

  // The placeholder doubles as the format hint for the fields with no native picker.
  const placeholder = f.kind === 'date' ? 'YYYY-MM-DD'
    : f.kind === 'datetime' ? 'YYYY-MM-DD HH:MM'
      : f.kind === 'image' ? 'https://…'
        : f.placeholder

  return (
    <View className="mb-3.5">
      <View className="flex-row items-end justify-between gap-2 mb-1">
        <Caption className="flex-1" numberOfLines={2}>
          {f.label}{f.required ? <Text className="text-bad dark:text-d-bad"> *</Text> : null}
        </Caption>
        {f.altUrl ? <Caption className="text-primaryText dark:text-d-primaryText">Paste URL instead</Caption> : null}
        {f.max ? <Caption className={over ? 'text-bad dark:text-d-bad' : ''}>{len} / {f.max}</Caption> : null}
      </View>

      {f.kind === 'select' ? (
        // A chip row rather than a picker modal: these lists are 2-5 items, and a modal
        // for five options is two taps where one will do.
        <View className="flex-row flex-wrap gap-2">
          {f.options.map(o => {
            const on = value === o.id
            return (
              <Pressable
                key={o.id}
                onPress={() => { vibrate(6); onChange(on ? '' : o.id) }}
                accessibilityRole="button"
                accessibilityState={{ selected: !!on }}
                className={`h-9 px-3 rounded-pill flex-row items-center gap-1.5 border ${
                  on ? 'bg-brand-blue/10 border-brand-blue/55' : `bg-card dark:bg-white/5 ${ring}`
                }`}
              >
                {on ? <Check size={12} color="#0355DB" /> : null}
                <Text className={`text-[13px] font-hk-medium ${on ? 'text-primaryText dark:text-d-primaryText' : 'text-ink-2 dark:text-d-ink2'}`}>
                  {o.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <TextInput
          value={String(value ?? '')}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#93A0C8"
          accessibilityLabel={f.label}
          multiline={f.kind === 'textarea'}
          autoCapitalize={urlish ? 'none' : 'sentences'}
          autoCorrect={!urlish}
          keyboardType={urlish ? 'url' : 'default'}
          className={`rounded-xl border ${ring} bg-card dark:bg-white/5 px-3 text-[15px] text-ink dark:text-d-ink ${
            f.kind === 'textarea' ? 'min-h-[96px] py-2.5' : 'h-11'
          }`}
        />
      )}

      {f.kind === 'image' ? (
        <View className="mt-2 rounded-xl border border-dashed border-hairline dark:border-d-hairline items-center py-6 px-3">
          <ImageIcon size={20} color="#93A0C8" />
          <Caption className="mt-1.5">Click to upload image</Caption>
          <Caption className="mt-0.5 text-center">{POST_IMAGE_HINT}</Caption>
        </View>
      ) : null}

      {f.hint ? <Caption className="mt-1">{f.hint}</Caption> : null}
      {error === 'invalid' ? (
        <Caption className="mt-1 text-bad dark:text-d-bad">
          {f.kind === 'url' ? 'Enter a full URL starting with https://' : 'Check this value.'}
        </Caption>
      ) : null}
    </View>
  )
}

/** Everything typed, read back — the confirmation step, not a decorative card. */
function PostPreview({ type, values, area, t }) {
  const filled = type.fields.filter(f => {
    const v = values[f.key]
    return typeof v === 'string' ? v.trim() : v
  })
  const cta = type.fields.find(f => f.key === 'cta')
  const ctaLabel = cta?.options.find(o => o.id === values.cta)?.label

  return (
    <View className="mt-4">
      <Caption className="mb-2">{t('post.preview', { defaultValue: 'Preview' })}</Caption>

      <LinearGradient
        colors={['#0E0071', '#0033B8', '#06003A']}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={{ borderRadius: 16, padding: 16 }}
      >
        <Text className="text-[17px] font-hk-bold text-white">
          {values.offerTitle || values.eventTitle || values.customerName || type.label}
        </Text>
        <Text className="text-[14px] text-white/85 mt-1.5">
          {values.caption || values.description || values.eventDescription || values.quote || ''}
        </Text>
        <View className="flex-row items-center justify-between gap-2 mt-3">
          <Text className="text-[12px] text-white/55 flex-1" numberOfLines={1}>{area}</Text>
          {ctaLabel ? (
            <View className="h-8 px-3 rounded-pill items-center justify-center bg-white/15 border border-white/25">
              <Text className="text-[13px] font-hk-semi text-white">{ctaLabel}</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {/* Every value, spelled out — the card above is what the customer sees; this is
          what the manager is confirming, including the fields the card has no room for. */}
      <Card className="mt-3 !p-0 overflow-hidden">
        {filled.map((f, i) => {
          const raw = values[f.key]
          const shown = f.kind === 'select' ? (f.options.find(o => o.id === raw)?.label ?? raw) : String(raw)
          return (
            <View
              key={f.key}
              className={`px-3 py-2.5 flex-row items-start gap-3 ${i ? 'border-t border-hairline dark:border-d-hairline' : ''}`}
            >
              <Caption style={{ width: '38%' }}>{f.label}</Caption>
              <Body className="flex-1">{shown}</Body>
            </View>
          )
        })}
      </Card>

      <View className="flex-row items-start gap-2 mt-3">
        <CheckCircle2 size={14} color="#22D38B" />
        <Caption className="flex-1">
          Publishing sends this to your listing. It might take up to a few hours to reflect.
        </Caption>
      </View>
    </View>
  )
}
