import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ShieldCheck, Send, X, ChevronLeft, Building2, Check, AlertTriangle } from 'lucide-react'
import { PrimaryButton, GhostButton } from '../components/UI.jsx'
import { vibrate } from '../lib/utils.js'
import {
  maskPhone, normalizeStoreCode, resolveStoreCode, phoneOnFileFor,
  storeCodesFor, allStoreCodes, getStoreByCode, STORE_CODE_EXAMPLE,
} from '@connect/core'
import { useTranslation, Trans } from 'react-i18next'

const RESEND_SECONDS = 30

export default function Login({ onAuthed, onRequestNumberChange }) {
  const { t } = useTranslation()
  const [step, setStep] = useState('phone') // phone | otp
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [numChange, setNumChange] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const otpRefs = useRef([])

  // Sign-in takes the mobile number, and nothing else. The registry maps a number to
  // the outlets it owns, so the store is something we RESOLVE rather than ask for.
  const phoneValid = phone.length === 10

  // Every store this number owns, as store objects. Empty for a number nobody has
  // registered — which is the request-access case, not a sign-in one.
  const myStores = useMemo(
    () => (phoneValid ? storeCodesFor(phone).map(c => getStoreByCode(c)).filter(Boolean) : []),
    [phone, phoneValid],
  )

  // We can only say "this number is not registered" once it is a whole number; a
  // half-typed one is simply not answerable yet, so the field stays quiet.
  const unregistered = phoneValid && myStores.length === 0
  const valid = phoneValid && myStores.length > 0

  useEffect(() => {
    if (step !== 'otp' || resendIn <= 0) return
    const id = setInterval(() => setResendIn(s => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [step, resendIn])

  function handleSendOtp() {
    if (!valid) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setStep('otp')
      setResendIn(RESEND_SECONDS)
      vibrate(12)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }, 900)
  }

  function handleResend() {
    if (resendIn > 0) return
    setOtp(['', '', '', '', '', ''])
    setResendIn(RESEND_SECONDS)
    vibrate(12)
    otpRefs.current[0]?.focus()
  }

  function setOtpAt(i, v) {
    if (!/^\d?$/.test(v)) return
    const next = [...otp]
    next[i] = v
    setOtp(next)
    if (v && i < 5) otpRefs.current[i + 1]?.focus()
    if (next.every(d => d) && next.join('').length === 6) {
      setTimeout(() => {
        verify(next.join(''))
      }, 200)
    }
  }

  function verify(otpCode) {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      vibrate(20)
      // One outlet is not a choice — open it. Several and there is a real decision to
      // make, so hand App a null and let it show the picker rather than guessing at
      // the first row. App owns which store the session is scoped to either way.
      onAuthed?.(myStores.length === 1 ? myStores[0] : null, myStores)
    }, 1100)
  }

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'var(--bg-screen)' }}>
      {/* aurora background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            'radial-gradient(60% 40% at 30% 10%, rgba(0,112,252,.45) 0%, transparent 60%), radial-gradient(50% 40% at 100% 100%, rgba(14,0,113,.35) 0%, transparent 60%)',
        }}
      />
      <motion.div
        className="absolute -top-20 -left-10 w-72 h-72 rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, #0E0071 0%, transparent 60%)', filter: 'blur(40px)' }}
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-10 -right-10 w-64 h-64 rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, #0070FC 0%, transparent 60%)', filter: 'blur(40px)' }}
        animate={{ x: [0, -20, 0], y: [0, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative h-full flex flex-col px-6 pt-2 pb-8">
        {/* Brand */}
        <div className="pt-8">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl grid place-items-center"
              style={{ background: 'var(--si-ai-gradient-warm)', boxShadow: '0 8px 24px rgba(0,112,252,.45)' }}
            >
              <SILogo />
            </div>
            <div>
              <div className="m-headline text-white">SingleInterface</div>
              <div className="m-caption text-white/55 -mt-0.5">{t('login.brandTagline')}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          {step === 'phone' ? (
            <>
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
                <div className="m-largeTitle text-white">
                  {t('login.welcome')}
                </div>
                <div className="m-largeTitle ai-text">{t('login.tagline')}</div>
                <p className="m-body text-white/65 mt-3">
                  {t('login.subtitle')}
                </p>
              </motion.div>

              <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.5 }} className="mt-7">
                <label className="m-subhead text-white/60 ml-1">{t('login.mobileNumber')}</label>
                <div
                  className="mt-2 h-14 rounded-2xl flex items-center px-4 glass"
                  style={phone ? { borderColor: 'rgba(0,112,252,.50)', boxShadow: '0 0 0 4px rgba(0,112,252,.10)' } : undefined}
                >
                  <span className="m-headline text-white/85 m-tabular">+91</span>
                  <span className="mx-3 h-6 w-px bg-white/15" />
                  <input
                    autoFocus
                    autoComplete="tel"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={10}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98•••• 12342"
                    className="flex-1 bg-transparent text-white m-headline outline-none m-tabular placeholder:text-white/30"
                  />
                  {phoneValid && (
                    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[#22D38B]">
                      <ShieldCheck size={18} />
                    </motion.div>
                  )}
                </div>
                {/* The store code used to carry the "we don't know you" message. With it
                    gone the number has to say so itself, or a stranger would tap Send and
                    wait on an OTP for an account that does not exist. */}
                <div className="m-footnote mt-2.5 px-1 flex items-center gap-1.5 min-h-[16px]">
                  {unregistered ? (
                    <motion.span initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5" style={{ color: 'var(--si-warning-text)' }}>
                      <AlertTriangle size={11} className="shrink-0" />
                      <span>{t('login.numberNotRegistered', { defaultValue: 'This number is not registered to a store yet. Request access below.' })}</span>
                    </motion.span>
                  ) : valid ? (
                    <motion.span initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="text-[#22D38B] flex items-center gap-1.5 truncate">
                      <Check size={11} className="shrink-0" />
                      <span className="truncate">
                        {myStores.length === 1
                          ? `${myStores[0].name} — ${myStores[0].branch}`
                          : t('login.storesFound', { count: myStores.length, defaultValue: '{{count}} stores on this number' })}
                      </span>
                    </motion.span>
                  ) : (
                    <span className="text-white/45 flex items-center gap-1.5"><ShieldCheck size={11} /> {t('login.otpHint')}</span>
                  )}
                </div>
              </motion.div>

              {/* No store-code field. The number IS the credential: the registry already
                  maps it to this dealer's outlets, so asking the manager to read a code
                  off the signage was asking for something we could look up. One outlet
                  signs straight in; several go to the picker, which is what StoreSelector
                  mode="pick" was written for. The code survives where it is still the
                  only handle somebody has — the request-access sheet below, reached by a
                  number that is NOT on file and so cannot be looked up at all. */}
              <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.28, duration: 0.5 }} className="mt-5">
                <PrimaryButton onClick={handleSendOtp} disabled={!valid} loading={loading} icon={ArrowRight}>
                  {t('login.sendCode')}
                </PrimaryButton>
                {/* Plain flowing text, no icon: the old RefreshCw sat OUTSIDE the text as a
                    flex sibling, so the moment this footnote wrapped, the icon floated
                    alone at the far left of a two-line block — it read as broken chrome
                    (and a refresh glyph was the wrong metaphor for "request access"
                    anyway). whitespace-nowrap on the link keeps the tappable phrase whole,
                    so any wrap lands between the question and the link, never inside it.
                    min-h keeps the touch floor now that the visual is one quiet line. */}
                <button
                  onClick={() => setNumChange(true)}
                  className="mt-3 w-full min-h-[var(--m-touch-min)] text-center m-footnote text-white/55 press"
                >
                  <Trans
                    i18nKey="login.requestAccessCta"
                    components={{ 1: <span className="whitespace-nowrap text-[#7BB0FF] underline underline-offset-2 font-semibold" /> }}
                  />
                </button>
              </motion.div>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']) }}
                className="mb-3 inline-flex items-center gap-1.5 m-subhead text-white/70 press"
              >
                <ChevronLeft size={16} /> {t('login.changeNumber')}
              </button>
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
                <div className="m-title1 text-white">{t('login.verifyTitle')}</div>
                <p className="m-body text-white/65 mt-2">
                  {t('login.verifySubtitle', { phone: maskPhone(phone) })}
                </p>
                {/* What this number opens, named before the OTP is typed. With one
                    outlet that is the store itself; with several it is the count, because
                    naming one of them here would promise a store the picker is about to
                    ask about. */}
                {myStores.length > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full m-subhead" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                    <Building2 size={13} className="shrink-0" />
                    <span className="truncate">
                      {myStores.length === 1
                        ? `${myStores[0].name} — ${myStores[0].branch}`
                        : t('login.storesFound', { count: myStores.length, defaultValue: '{{count}} stores on this number' })}
                    </span>
                  </div>
                )}
              </motion.div>

              <div className="mt-8 flex justify-between gap-2">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={el => (otpRefs.current[i] = el)}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={1}
                    value={d}
                    onChange={e => setOtpAt(i, e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !d && i > 0) {
                        otpRefs.current[i - 1]?.focus()
                      }
                    }}
                    className={'otp-box ' + (d ? 'filled' : '')}
                  />
                ))}
              </div>
              <div className="m-footnote text-white/45 mt-3 text-center">
                {t('login.resendIn')}{' '}
                {resendIn > 0 ? (
                  <span className="m-tabular">{t('login.resendInSeconds', { seconds: resendIn })}</span>
                ) : (
                  <button onClick={handleResend} className="text-[#7BB0FF] underline press">
                    {t('login.resendCode')}
                  </button>
                )}
              </div>
              {loading && (
                <div className="mt-6 flex items-center justify-center gap-2 text-white/70 m-callout">
                  <span className="spin" /> {t('login.verifying')}
                </div>
              )}
            </>
          )}
        </div>

        <div className="m-footnote text-white/40 text-center">
          {t('login.terms')}
        </div>
      </div>

      <AnimatePresence>
        {numChange && (
          <NumberChangeSheet
            onClose={() => setNumChange(false)}
            onSubmit={(payload) => { onRequestNumberChange?.(payload); setNumChange(false) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

const REQUEST_BULLETS = ['login.requestBullet1', 'login.requestBullet2', 'login.requestBullet3']

function NumberChangeSheet({ onClose, onSubmit }) {
  const { t } = useTranslation()
  const [storeCode, setStoreCode] = useState('')
  const [newNum, setNewNum] = useState('')
  const [reason, setReason] = useState('joined')

  // THE store code now lives here, and only here. Sign-in resolves the store from the
  // number, but everyone who reaches this sheet does so BECAUSE their number is not on
  // file — there is nothing to resolve from. The code off the signage is the only handle
  // they have, and without it the request reaches the admin naming no store at all.
  //
  // Ownership is not the question here (the whole point is that the store isn't theirs
  // yet), so this asks the weaker one: is it a real code? — allStoreCodes(), not
  // storeCodesFor(phone).
  const code = normalizeStoreCode(storeCode)
  const resolved = resolveStoreCode(code)
  const store = resolved.ok ? resolved.store : null
  const stillTyping = allStoreCodes().some(c => c.startsWith(code))
  const codeError = !store && code.length >= 3 && !stillTyping ? resolved : null

  const onFile = store ? phoneOnFileFor(store.storeCode) : null

  const valid = newNum.length === 10 && !!store
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[80] flex items-end sheet-scrim"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="w-full rounded-t-[28px] glass-strong p-4"
        style={{ background: 'var(--bg-sheet)', boxShadow: 'var(--shadow-sheet)', borderTop: '1px solid var(--border-glass-strong)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pb-2"><span className="w-9 h-1 rounded-full" style={{ background: 'var(--border-glass-strong)' }} /></div>
        <div className="m-title2 text-white">{t('login.requestTitle')}</div>

        <ul className="mt-2 mb-3.5 space-y-1.5">
          {REQUEST_BULLETS.map(key => (
            <li key={key} className="flex items-start gap-2 m-footnote text-white/60">
              <span className="w-1 h-1 rounded-full shrink-0 mt-[7px]" style={{ background: '#0070FC' }} />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        {/* Store code — which store you are asking about. */}
        <div className="m-subhead text-white/55 mb-1.5">{t('login.storeCode')}</div>
        <div
          className="h-12 rounded-xl flex items-center px-3.5"
          style={{
            background: 'var(--bg-subtle)',
            border: codeError ? '1px solid rgba(202,138,4,.55)' : store ? '1px solid rgba(0,112,252,.5)' : '1px solid var(--border-glass)',
          }}
        >
          <Building2 size={16} className="text-white/70 shrink-0" />
          <span className="mx-3 h-6 w-px bg-white/15" />
          <input
            value={storeCode}
            onChange={e => setStoreCode(normalizeStoreCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, '')).slice(0, 12))}
            placeholder={STORE_CODE_EXAMPLE}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-white m-headline outline-none m-tabular placeholder:text-white/30"
          />
          {store && <Check size={16} className="text-[#22D38B] shrink-0" />}
        </div>
        <div className="m-footnote mt-1.5 mb-3 px-1 min-h-[16px]">
          {codeError ? (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--si-warning-text)' }}>
              <AlertTriangle size={11} className="shrink-0" />
              <span>{t(codeError.errorKey, { defaultValue: codeError.error })}</span>
            </span>
          ) : store ? (
            /* The number on file is the confirmation that this is the right store — it is
               a colleague's or an old one of theirs, and either way it says "yes, this is
               the shop I mean". Only shown once the code resolves; before that there is
               nothing true to put here. */
            /* Wraps rather than truncates: this is two facts, and `truncate` cut the
               number on file off mid-mask — which is precisely the half a reader needs
               to recognise the store. */
            <span className="text-white/45 block">
              {store.name} — {store.branch}
              {onFile && <> · {t('login.currentNumber')} {maskPhone(onFile)}</>}
            </span>
          ) : (
            <span className="text-white/40">{t('login.storeCodeHint')}</span>
          )}
        </div>

        <div className="m-subhead text-white/55 mb-1.5">{t('login.newNumber')}</div>
        <div className="h-12 rounded-xl flex items-center px-3.5 mb-3" style={{ background: 'var(--bg-subtle)', border: newNum ? '1px solid rgba(0,112,252,.5)' : '1px solid var(--border-glass)' }}>
          <span className="m-headline text-white/85 m-tabular">+91</span>
          <span className="mx-3 h-6 w-px bg-white/15" />
          <input autoFocus inputMode="numeric" maxLength={10} value={newNum} onChange={e => setNewNum(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder={t('login.newNumberPlaceholder')} className="flex-1 bg-transparent text-white m-headline outline-none m-tabular placeholder:text-white/30" />
        </div>

        <div className="m-subhead text-white/55 mb-1.5">{t('login.reason')}</div>
        <div className="flex gap-2 mb-4 flex-wrap">
          {[['joined', 'login.reasonJoined'], ['changed', 'login.reasonChanged'], ['multi', 'login.reasonMulti']].map(([id, labelKey]) => (
            <button key={id} onClick={() => setReason(id)} className="px-3 h-9 rounded-full m-subhead press" style={reason === id ? { background: '#0070FC', color: '#fff' } : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}>{t(labelKey)}</button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <GhostButton icon={X} onClick={onClose}>{t('common.cancel')}</GhostButton>
          <div className="col-span-2">
            <PrimaryButton icon={Send} disabled={!valid} onClick={() => onSubmit({ storeCode: store?.storeCode ?? null, store, newNum, reason })}>{t('login.requestApproval')}</PrimaryButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SILogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <path d="M9 18l3.5-3.5L16 18l3.5-3.5L23 18" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="23" cy="10" r="2.5" fill="white"/>
    </svg>
  )
}
