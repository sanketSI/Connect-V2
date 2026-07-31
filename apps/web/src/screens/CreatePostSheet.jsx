import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles, Wallet, PartyPopper, MessageSquareQuote, X, Eye, Send,
  Image as ImageIcon, MapPin, ChevronLeft, CheckCircle2,
} from 'lucide-react'
import { PrimaryButton, GhostButton } from '../components/UI.jsx'
import {
  POST_TYPES, getPostType, validatePost, POST_IMAGE_HINT,
  getStoreLocations, computeLocationFlags,
} from '@connect/core'
import { useToast } from '../components/Toast.jsx'
import { vibrate, cn } from '../lib/utils.js'

// ============================================================
// CREATE POST — four typed forms, then a preview, then submit.
//
// PM feedback 5: "Add flow of post addition, keep the form same exact as below", with a
// screenshot per type, plus "Submit for approval and Preview will come once the post form
// has been submitted. After the preview is confirmed, a success message will come."
//
// WHAT THIS REPLACES: a template picker that generated AI copy and showed a preview
// immediately. Four brand templates and a paragraph of generated text is not the same
// product as a typed Offer with a coupon code, a redeem URL, a date window and terms —
// Google requires those fields and there was nowhere to enter them.
//
// THE FIELDS ARE NOT DEFINED HERE. They come from core's POST_TYPES, which native renders
// too; see packages/core/data/postForms.js for why ~30 labels and ceilings live in one
// place rather than being typed twice.
//
// TWO STEPS, in the order the brief gives: FORM → PREVIEW → success. The preview is a
// confirmation step rather than a live sidebar, because the brief makes confirming it the
// thing that submits.
//
// Icons per type are this screen's own: core's spec carries data, not lucide imports.
// ============================================================

const TYPE_ICON = {
  standard: Sparkles,
  offer: Wallet,
  event: PartyPopper,
  testimonial: MessageSquareQuote,
}

export default function CreatePostSheet({ onClose, storeId }) {
  const { t } = useTranslation()
  const toast = useToast()

  // A post publishes to ONE Google listing. The preview footer used to name Indiranagar
  // whichever branch you were in, so a Koramangala manager wrote a post that said
  // Indiranagar on it. It reads the branch this sheet was opened for.
  const postStore = useMemo(
    () => getStoreLocations().find(l => l.id === storeId) || getStoreLocations()[0],
    [storeId],
  )
  // A post is public marketing copy, so it may only name what the listing can vouch for.
  // An 'address' flag means the city itself is in doubt — HSR Layout carries a data-entry
  // error that puts it in Bandra — so that draft names the branch alone. A 'latlng' drift
  // is only a misplaced pin and says nothing about the city.
  const postArea = useMemo(() => {
    const cityInDoubt = computeLocationFlags(postStore).some(f => f.type === 'address')
    return cityInDoubt ? postStore.branch : `${postStore.branch} ${postStore.city}`
  }, [postStore])

  const [typeId, setTypeId] = useState(POST_TYPES[0].id)
  const [values, setValues] = useState({})
  const [step, setStep] = useState('form') // form | preview
  // Errors show only AFTER a submit attempt. Marking every required field red before the
  // manager has typed anything reads as a broken form, not a helpful one.
  const [showErrors, setShowErrors] = useState(false)

  const type = getPostType(typeId)
  const result = validatePost(typeId, values)

  const set = (key, v) => setValues(prev => ({ ...prev, [key]: v }))

  // Switching type CLEARS the draft. The forms share almost no fields, and carrying a
  // "Redeem URL" into an Event post would submit a value its own form never showed.
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
    vibrate(15)
    // The wording the brief asks for. Translator TODO: the catalogs' post.submittedTitle
    // / post.submittedBody say "Brand team will review and publish", which is not the
    // promise the PM wants made here — this one names the delay.
    toast.push({
      kind: 'success',
      title: 'Post submitted successfully',
      body: 'It might take up to a few hours to reflect.',
    })
    onClose?.()
  }

  return (
    <div className="px-4 pb-6">
      {/* Header — title, the listing this publishes to, and close. */}
      <div className="flex items-start justify-between gap-3 pr-1">
        <div className="min-w-0">
          <div className="m-title2 text-white">{t('post.title', { defaultValue: 'Create Post' })}</div>
          <div className="m-caption text-white/55 mt-0.5 flex items-center gap-1">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{postArea}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', { defaultValue: 'Close' })}
          className="w-9 h-9 rounded-full grid place-items-center shrink-0 press"
          style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
        >
          <X size={16} className="text-white" />
        </button>
      </div>

      {step === 'form' ? (
        <>
          {/* THE FOUR TYPES. A scrolling rail, not a 4-across grid: "Testimonial Post"
              does not fit a quarter of a 375px screen without becoming "Testimoni…". */}
          <div className="flex items-center gap-2 mt-3.5 mb-1 overflow-x-auto no-scrollbar">
            {POST_TYPES.map(pt => {
              const Icon = TYPE_ICON[pt.id] || Sparkles
              const on = pt.id === typeId
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => pickType(pt.id)}
                  aria-pressed={on}
                  className={cn(
                    'shrink-0 h-10 px-3.5 rounded-full inline-flex items-center gap-1.5 m-subhead press md-state',
                    on ? 'text-white' : 'text-white/70',
                  )}
                  style={{
                    background: on ? 'rgba(0,112,252,.16)' : 'var(--bg-subtle)',
                    border: `1px solid ${on ? 'rgba(0,112,252,.55)' : 'var(--border-glass)'}`,
                  }}
                >
                  <Icon size={14} /> {pt.label}
                </button>
              )
            })}
          </div>

          <div className="mt-3 space-y-3.5">
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
          </div>

          {showErrors && !result.ok && (
            <div className="m-caption text-[#FF6B7E] mt-3">
              Fill the required fields before previewing this post.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-5">
            <GhostButton onClick={onClose}>{t('common.cancel')}</GhostButton>
            <PrimaryButton icon={Eye} onClick={goPreview}>
              {t('post.preview', { defaultValue: 'Preview' })}
            </PrimaryButton>
          </div>
        </>
      ) : (
        <>
          {/* PREVIEW — what the brief calls confirming. Everything typed, read back, with
              the way to go and fix it still on screen. */}
          <div className="mt-4">
            <PostPreview type={type} values={values} area={postArea} />
          </div>

          <div className="grid grid-cols-2 gap-2 mt-5">
            <GhostButton icon={ChevronLeft} onClick={() => { vibrate(6); setStep('form') }}>
              {t('common.back', { defaultValue: 'Back' })}
            </GhostButton>
            <PrimaryButton icon={Send} onClick={submit}>
              {t('post.submitCta', { defaultValue: 'Submit for approval' })}
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * ONE FIELD, rendered from the spec's `kind`. Every ceiling in the brief comes with a
 * live counter, because a limit you only discover by being truncated is not a limit the
 * manager was ever told about.
 */
function Field({ field: f, value, onChange, error }) {
  const len = String(value ?? '').length
  const over = f.max ? len > f.max : false
  const border = error ? '1px solid rgba(220,38,38,.6)' : '1px solid var(--border-subtle)'
  const base = 'w-full rounded-xl px-3 bg-transparent text-white m-callout outline-none placeholder:text-white/35'

  return (
    <label className="block">
      <div className="flex items-end justify-between gap-2 mb-1">
        <span className="m-caption text-white/70">
          {f.label}{f.required && <span style={{ color: '#FF6B7E' }}> *</span>}
        </span>
        {f.altUrl && (
          // "Paste URL instead" — the escape hatch beside the label in every screenshot.
          <span className="m-caption" style={{ color: 'var(--si-primary-text)' }}>Paste URL instead</span>
        )}
        {f.max && (
          <span className={cn('m-caption m-tabular', over ? 'text-[#FF6B7E]' : 'text-white/40')}>
            {len} / {f.max}
          </span>
        )}
      </div>

      {f.kind === 'textarea' && (
        <textarea
          value={value} onChange={e => onChange(e.target.value)} placeholder={f.placeholder}
          className={`${base} py-2.5 resize-none min-h-[96px]`}
          style={{ background: 'var(--bg-subtle)', border }}
        />
      )}

      {(f.kind === 'text' || f.kind === 'url') && (
        <input
          type={f.kind === 'url' ? 'url' : 'text'} value={value} onChange={e => onChange(e.target.value)}
          placeholder={f.placeholder} className={`${base} h-11`}
          style={{ background: 'var(--bg-subtle)', border }}
        />
      )}

      {f.kind === 'select' && (
        <select
          value={value} onChange={e => onChange(e.target.value)}
          className={`${base} h-11`} style={{ background: 'var(--bg-subtle)', border, colorScheme: 'dark' }}
        >
          <option value="">{f.placeholder}</option>
          {f.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}

      {(f.kind === 'date' || f.kind === 'datetime') && (
        <input
          type={f.kind === 'date' ? 'date' : 'datetime-local'} value={value}
          onChange={e => onChange(e.target.value)}
          className={`${base} h-11 m-tabular`}
          style={{ background: 'var(--bg-subtle)', border, colorScheme: 'dark' }}
        />
      )}

      {f.kind === 'image' && (
        <>
          {/* The upload zone is drawn as specified, but there is no upload service behind
              this build — so the URL field is the path that actually works, and the brief
              already offers it as "Paste URL instead" rather than it being a substitute
              invented here. */}
          <input
            type="url" value={value} onChange={e => onChange(e.target.value)}
            placeholder="https://…" className={`${base} h-11`}
            style={{ background: 'var(--bg-subtle)', border }}
          />
          <div
            className="mt-2 rounded-xl grid place-items-center py-6 px-3 text-center"
            style={{ border: '1px dashed var(--border-glass-strong)' }}
          >
            <ImageIcon size={20} className="text-white/40" />
            <div className="m-caption text-white/55 mt-1.5">Click to upload image</div>
            <div className="m-caption text-white/35 mt-0.5">{POST_IMAGE_HINT}</div>
          </div>
        </>
      )}

      {f.hint && <div className="m-caption text-white/40 mt-1">{f.hint}</div>}
      {error === 'invalid' && (
        <div className="m-caption text-[#FF6B7E] mt-1">
          {f.kind === 'url' ? 'Enter a full URL starting with https://' : 'Check this value.'}
        </div>
      )}
    </label>
  )
}

/** Everything typed, read back — the confirmation step, not a decorative card. */
function PostPreview({ type, values, area }) {
  const { t } = useTranslation()
  const filled = type.fields.filter(f => {
    const v = values[f.key]
    return typeof v === 'string' ? v.trim() : v
  })
  const cta = type.fields.find(f => f.key === 'cta')
  const ctaLabel = cta?.options.find(o => o.id === values.cta)?.label

  return (
    <>
      <div className="m-subhead text-white/55 mb-2">{t('post.preview', { defaultValue: 'Preview' })}</div>

      <div
        className="on-dark rounded-2xl p-4 overflow-hidden"
        style={{ background: 'linear-gradient(140deg,#0E0071 0%, #0033B8 55%, #06003A 100%)' }}
      >
        <div className="m-title3 text-white">
          {values.offerTitle || values.eventTitle || values.customerName || type.label}
        </div>
        <p className="m-callout text-white/85 mt-1.5 whitespace-pre-wrap">
          {values.caption || values.description || values.eventDescription || values.quote || ''}
        </p>
        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="m-caption text-white/55 truncate">{area}</span>
          {ctaLabel && (
            <span
              className="shrink-0 h-8 px-3 rounded-full grid place-items-center m-subhead text-white"
              style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.24)' }}
            >
              {ctaLabel}
            </span>
          )}
        </div>
      </div>

      {/* Every value, spelled out. The card above is what the customer sees; this is what
          the manager is confirming, including the fields the card has no room for —
          dates, coupon code, terms, redeem URL. */}
      <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-glass)' }}>
        {filled.map((f, i) => {
          const raw = values[f.key]
          const shown = f.kind === 'select'
            ? (f.options.find(o => o.id === raw)?.label ?? raw)
            : String(raw)
          return (
            <div
              key={f.key}
              className="px-3 py-2.5 flex items-start gap-3"
              style={i ? { borderTop: '1px solid var(--border-glass)' } : undefined}
            >
              <span className="m-caption text-white/45 shrink-0" style={{ width: '38%' }}>{f.label}</span>
              <span className="m-caption text-white/85 flex-1 min-w-0 break-words">{shown}</span>
            </div>
          )
        })}
      </div>

      <div className="flex items-start gap-2 mt-3">
        <CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: '#22D38B' }} />
        <span className="m-caption text-white/55">
          Submitting sends this for approval. It might take up to a few hours to reflect.
        </span>
      </div>
    </>
  )
}
