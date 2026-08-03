// ============================================================
// LOGIN — Phase 3, item 1. Ported from apps/web/src/screens/Login.jsx.
//
// The LOGIC is the web screen's, unchanged, because it is core's and not the browser's:
// sign-in takes the mobile number and nothing else, and the registry RESOLVES which
// outlets that number holds (storeCodesFor → getStoreByCode). One outlet signs straight
// in; several open on the combined view. A number nobody has registered is not a failed
// sign-in, it is the request-access case, and the screen says so rather than rejecting.
//
// The field is PREFILLED with DEMO_PHONE for the same reason as on web: this is a
// prototype signed into by people demoing it, not by the dealer whose number it is, so
// it opens ready to send. Clearing it still works.
//
// What is native rather than ported: keyboardType="number-pad" (the phone shows a digit
// pad instead of a full keyboard), the OTP boxes advance and BACKSPACE between fields,
// and each step commits with a haptic.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Building2, ChevronLeft, AlertTriangle, Check, X, Send } from 'lucide-react-native'
import {
  storeCodesFor, getStoreByCode, DEMO_PHONE, maskPhone,
  normalizeStoreCode, resolveStoreCode, allStoreCodes, phoneOnFileFor, STORE_CODE_EXAMPLE,
} from '@connect/core'
import { PrimaryButton, GhostButton, Title, Body, Caption, Chip, CARD_SHADOW } from '../components/UI.jsx'
import { vibrate, notifySuccess } from '../lib/haptics.js'
import { signIn } from '../lib/session.js'
import { FEATURES } from '../lib/features.js'

const RESEND_SECONDS = 30

export default function LoginScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState('phone') // phone | otp
  const [phone, setPhone] = useState(DEMO_PHONE)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [numChange, setNumChange] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const otpRefs = useRef([])

  const phoneValid = phone.length === 10

  // Every store this number owns. Empty for an unregistered number — the request-access
  // case, not a sign-in one.
  const myStores = useMemo(
    () => (phoneValid ? storeCodesFor(phone).map(c => getStoreByCode(c)).filter(Boolean) : []),
    [phone, phoneValid],
  )
  const unregistered = phoneValid && myStores.length === 0
  const valid = phoneValid && myStores.length > 0

  useEffect(() => {
    if (step !== 'otp' || resendIn <= 0) return
    const id = setInterval(() => setResendIn(s => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [step, resendIn])

  function sendOtp() {
    if (!valid) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setStep('otp')
      setResendIn(RESEND_SECONDS)
      vibrate(12)
      setTimeout(() => otpRefs.current[0]?.focus(), 120)
    }, 700)
  }

  function setOtpAt(i, v) {
    const digits = v.replace(/\D/g, '')
    // Paste: one field receives all six, so spread them rather than truncating.
    if (digits.length > 1) {
      const next = digits.slice(0, 6).split('')
      setOtp(prev => prev.map((d, k) => next[k] ?? d))
      otpRefs.current[Math.min(next.length, 5)]?.focus()
      return
    }
    setOtp(prev => { const n = [...prev]; n[i] = digits; return n })
    if (digits && i < 5) otpRefs.current[i + 1]?.focus()
  }

  // Backspace on an empty box steps BACK — without this the only way out of a mistyped
  // code is to tap each box, which on a phone is worse than retyping the lot.
  function onOtpKey(i, e) {
    if (e.nativeEvent.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  // The code is complete — sign in, whichever way the digits arrived. Guarded on
  // `loading` so a re-render mid-verify cannot fire a second one.
  useEffect(() => {
    if (otp.join('').length !== 6 || !otp.every(Boolean) || loading) return
    const id = setTimeout(() => {
      setLoading(true)
      setTimeout(() => {
        notifySuccess()
        // One outlet is not a choice — open it. Several and there is no single right
        // answer, so session opens the combined view rather than guessing at row one.
        signIn(myStores, myStores.length === 1 ? myStores[0] : null)
        router.replace('/(tabs)')
      }, 700)
    }, 180)
    return () => clearTimeout(id)
  }, [otp, loading, myStores, router])

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-screen dark:bg-d-screen"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Brand wash. The web uses two radial gradients; RN has no radial without another
          dependency, so this is the same idea with soft tinted discs — cheap, and it
          reads as the same screen. */}
      <View pointerEvents="none" className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-brand-blue/20" />
      <View pointerEvents="none" className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-brand-indigo/10" />

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 72 }} keyboardShouldPersistTaps="handled">
        {/* Wordmark */}
        <View className="flex-row items-center gap-3">
          <View className="w-11 h-11 rounded-2xl bg-brand-indigo items-center justify-center">
            <Text className="text-white text-lg font-hk-bold">S</Text>
          </View>
          <View>
            <Text className="text-base font-hk-semi text-ink dark:text-d-ink">SingleInterface</Text>
            <Caption>{t('login.brandTagline', { defaultValue: 'Zero Business Loss' })}</Caption>
          </View>
        </View>

        <View className="flex-1 justify-center">
          {step === 'phone' ? (
            <View>
              <Title>{t('login.welcome', { defaultValue: 'Welcome back.' })}</Title>
              <Title className="text-primaryText dark:text-d-primaryText">
                {t('login.tagline', { defaultValue: 'Recover every call.' })}
              </Title>
              <Body className="mt-3">
                {t('login.subtitle', { defaultValue: 'Sign in with your registered mobile number.' })}
              </Body>

              <Caption className="mt-7 mb-1.5">{t('login.mobileNumber', { defaultValue: 'Mobile number' })}</Caption>
              <View
                className="flex-row items-center h-14 rounded-xl border border-hairline dark:border-d-hairline bg-card dark:bg-white/5 px-3.5"
                style={CARD_SHADOW}
              >
                <Text className="text-base font-hk-semi text-ink-3 dark:text-d-ink3 mr-2">+91</Text>
                <TextInput
                  value={phone}
                  onChangeText={v => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder={maskPhone(DEMO_PHONE)}
                  placeholderTextColor="#93A0C8"
                  accessibilityLabel={t('login.mobileNumber', { defaultValue: 'Mobile number' })}
                  className="flex-1 text-lg font-hk-semi text-ink dark:text-d-ink"
                />
              </View>

              {/* Answerable only once the number is whole — a half-typed one is not
                  "unregistered", it is simply not a question yet. */}
              {valid && (
                <View className="flex-row items-center gap-1.5 mt-3 self-start rounded-pill bg-brand-blue/10 px-3 h-8">
                  <Building2 size={13} color="#0355DB" />
                  <Text className="text-[13px] font-hk-medium text-primaryText dark:text-d-primaryText">
                    {t('login.storesFound', {
                      count: myStores.length,
                      defaultValue_one: '{{count}} store on this number',
                      defaultValue_other: '{{count}} stores on this number',
                    })}
                  </Text>
                </View>
              )}
              {unregistered && (
                <View className="flex-row items-start gap-2 mt-3">
                  <AlertTriangle size={14} color="#DC2626" />
                  <Caption className="flex-1 text-bad dark:text-d-bad">
                    {t('login.numberNotRegistered', {
                      defaultValue: 'This number is not registered to a store yet. Request access below.',
                    })}
                  </Caption>
                </View>
              )}

              <PrimaryButton onPress={sendOtp} disabled={!valid} loading={loading} className="mt-6">
                {t('login.sendCode', { defaultValue: 'Send verification code' })}
              </PrimaryButton>
              {/* OUT OF THE LAUNCH SCOPE on instruction — see the web Login. Gated, not
                  deleted: the request sheet still exists for the full build. */}
              {FEATURES.requestAccess ? (
                <Pressable
                  onPress={() => { vibrate(8); setNumChange(true) }}
                  accessibilityRole="button"
                  className="min-h-[44px] items-center justify-center mt-2"
                >
                  <Caption className="text-primaryText dark:text-d-primaryText">
                    {t('login.requestAccess', { defaultValue: 'Number changed or new to the team?' })}
                  </Caption>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View>
              <Pressable
                onPress={() => { vibrate(8); setStep('phone'); setOtp(['', '', '', '', '', '']) }}
                accessibilityRole="button"
                className="flex-row items-center gap-1 self-start mb-4 h-11"
              >
                <ChevronLeft size={18} color="#5F6878" />
                <Body>{t('login.changeNumber', { defaultValue: 'Change number' })}</Body>
              </Pressable>

              <Title>{t('login.verifyTitle', { defaultValue: "Verify it's you" })}</Title>
              <Body className="mt-2">
                {t('login.verifySubtitle', {
                  phone: `+91 ${maskPhone(phone)}`,
                  defaultValue: 'We sent a 6-digit code to {{phone}}',
                })}
              </Body>

              <View className="flex-row items-center gap-1.5 mt-3 self-start rounded-pill bg-brand-blue/10 px-3 h-8">
                <Building2 size={13} color="#0355DB" />
                <Text className="text-[13px] font-hk-medium text-primaryText dark:text-d-primaryText">
                  {t('login.storesFound', {
                    count: myStores.length,
                    defaultValue_one: '{{count}} store on this number',
                    defaultValue_other: '{{count}} stores on this number',
                  })}
                </Text>
              </View>

              <View className="flex-row justify-between mt-7">
                {otp.map((d, i) => (
                  <TextInput
                    key={i}
                    ref={el => { otpRefs.current[i] = el }}
                    value={d}
                    onChangeText={v => setOtpAt(i, v)}
                    onKeyPress={e => onOtpKey(i, e)}
                    keyboardType="number-pad"
                    maxLength={6}
                    accessibilityLabel={`Digit ${i + 1} of 6`}
                    className="w-12 h-14 rounded-xl border border-hairline dark:border-d-hairline bg-card dark:bg-white/5 text-center text-xl font-hk-bold text-ink dark:text-d-ink"
                  />
                ))}
              </View>

              <Caption className="mt-4 text-center">
                {resendIn > 0
                  ? t('login.resendIn', { count: resendIn, defaultValue: "Didn't receive it? Resend in {{count}}s" })
                  : t('login.resendCode', { defaultValue: 'Resend code' })}
              </Caption>

              {loading && <PrimaryButton loading className="mt-6">{' '}</PrimaryButton>}
            </View>
          )}
        </View>

        <View className="flex-row items-start gap-1.5 mt-6">
          <ShieldCheck size={12} color="#93A0C8" />
          <Caption className="flex-1">
            {t('login.terms', {
              defaultValue: "By continuing you agree to SingleInterface's Terms · Privacy.",
            })}
          </Caption>
        </View>
      </ScrollView>

      {numChange && <NumberChangeSheet t={t} onClose={() => setNumChange(false)} />}
    </KeyboardAvoidingView>
  )
}

/**
 * REQUEST ACCESS — the web's NumberChangeSheet, as a native overlay. Everyone who
 * reaches this does so BECAUSE their number is not on file, so the store code off the
 * signage is the only handle they have — validated live against allStoreCodes() (is it
 * a REAL code — ownership is not the question here), with the number on file shown once
 * it resolves as the confirmation this is the right shop.
 */
function NumberChangeSheet({ t, onClose }) {
  const [storeCode, setStoreCode] = useState('')
  const [newNum, setNewNum] = useState('')
  const [reason, setReason] = useState('joined')

  const code = normalizeStoreCode(storeCode)
  const resolved = resolveStoreCode(code)
  const store = resolved.ok ? resolved.store : null
  const stillTyping = allStoreCodes().some(c => c.startsWith(code))
  const codeError = !store && code.length >= 3 && !stillTyping ? resolved : null
  const onFile = store ? phoneOnFileFor(store.storeCode) : null
  const valid = newNum.length === 10 && !!store

  return (
    <View className="absolute inset-0 z-50 justify-end">
      <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close', { defaultValue: 'Close' })} />
      <View className="rounded-t-[28px] bg-card dark:bg-d-screen border-t border-hairline dark:border-d-hairline p-4 pb-8">
        <View className="items-center pb-2"><View className="w-9 h-1 rounded-pill bg-hairline dark:bg-d-hairline" /></View>
        <Text className="text-[22px] leading-7 font-hk-bold text-ink dark:text-d-ink">
          {t('login.requestTitle', { defaultValue: 'Request access' })}
        </Text>

        {['login.requestBullet1', 'login.requestBullet2', 'login.requestBullet3'].map(key => (
          <View key={key} className="flex-row items-start gap-2 mt-1.5">
            <View className="w-1 h-1 rounded-full bg-brand-blue mt-[7px]" />
            <Caption className="flex-1">{t(key)}</Caption>
          </View>
        ))}

        <Caption className="font-hk-medium mt-3.5 mb-1.5">{t('login.storeCode', { defaultValue: 'Store code' })}</Caption>
        <View className={`h-12 rounded-xl flex-row items-center px-3.5 bg-brand-blue/5 border ${codeError ? 'border-[#CA8A04]/60' : store ? 'border-brand-blue/50' : 'border-hairline dark:border-d-hairline'}`}>
          <Building2 size={16} color="#5F6878" />
          <View className="mx-3 h-6 w-px bg-hairline dark:bg-d-hairline" />
          <TextInput
            value={storeCode}
            onChangeText={v => setStoreCode(normalizeStoreCode(v.replace(/[^a-zA-Z0-9-]/g, '')).slice(0, 12))}
            placeholder={STORE_CODE_EXAMPLE}
            placeholderTextColor="#93A0C8"
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={t('login.storeCode', { defaultValue: 'Store code' })}
            className="flex-1 text-base font-hk-semi text-ink dark:text-d-ink"
          />
          {store && <Check size={16} color="#16A34A" />}
        </View>
        <View className="min-h-[18px] mt-1.5 mb-3 px-1">
          {codeError ? (
            <View className="flex-row items-center gap-1.5">
              <AlertTriangle size={11} color="#CA8A04" />
              <Caption className="flex-1 text-[#B45309]">{t(codeError.errorKey, { defaultValue: codeError.error })}</Caption>
            </View>
          ) : store ? (
            <Caption>
              {store.name} — {store.branch}
              {onFile ? ` · ${t('login.currentNumber', { defaultValue: 'Current number' })} ${maskPhone(onFile)}` : ''}
            </Caption>
          ) : (
            <Caption>{t('login.storeCodeHint', { defaultValue: 'The code on your store signage — it tells us which store to ask about.' })}</Caption>
          )}
        </View>

        <Caption className="font-hk-medium mb-1.5">{t('login.newNumber', { defaultValue: 'New number' })}</Caption>
        <View className={`h-12 rounded-xl flex-row items-center px-3.5 mb-3 bg-brand-blue/5 border ${newNum ? 'border-brand-blue/50' : 'border-hairline dark:border-d-hairline'}`}>
          <Text className="text-base font-hk-semi text-ink-3 dark:text-d-ink3">+91</Text>
          <View className="mx-3 h-6 w-px bg-hairline dark:bg-d-hairline" />
          <TextInput
            value={newNum}
            onChangeText={v => setNewNum(v.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            maxLength={10}
            placeholder={t('login.newNumberPlaceholder', { defaultValue: 'Mobile number to approve' })}
            placeholderTextColor="#93A0C8"
            accessibilityLabel={t('login.newNumber', { defaultValue: 'New number' })}
            className="flex-1 text-base font-hk-semi text-ink dark:text-d-ink"
          />
        </View>

        <Caption className="font-hk-medium mb-1.5">{t('login.reason', { defaultValue: 'Reason' })}</Caption>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {[['joined', 'login.reasonJoined'], ['changed', 'login.reasonChanged'], ['multi', 'login.reasonMulti']].map(([id, labelKey]) => (
            <Chip key={id} active={reason === id} onPress={() => setReason(id)}>
              {t(labelKey)}
            </Chip>
          ))}
        </View>

        <View className="flex-row gap-2">
          <GhostButton onPress={onClose} className="flex-1">{t('common.cancel', { defaultValue: 'Cancel' })}</GhostButton>
          <View className="flex-[2]">
            <PrimaryButton
              disabled={!valid}
              onPress={() => { notifySuccess(); onClose() }}
            >
              {t('login.requestApproval', { defaultValue: 'Request Approval' })}
            </PrimaryButton>
          </View>
        </View>
      </View>
    </View>
  )
}
