import React, { useMemo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Wallet, PartyPopper, MessageSquareQuote, X, ArrowRight } from 'lucide-react'
import { AIBadge, PrimaryButton, GhostButton, Chip, AIShimmer } from '../components/UI.jsx'
import { getPostTemplates, askAI, getStoreLocations, computeLocationFlags } from '@connect/core'
const POST_TEMPLATES = getPostTemplates()
import { useToast } from '../components/Toast.jsx'

// The four Nova post types — Standard, Offer, Event, Testimonial — come from the data
// layer, each carrying its own catalog key beside an English value. Render through the
// key and fall back to the seed value, so a template we haven't translated yet still
// reads as words rather than a raw key. The seed `name` stays English on purpose: it
// feeds the askAI prompt, which is written in English.

// Post composer — brand-approved templates + on-demand AI copy.
// Extracted from Profile so it can be reused inside Manage Media.
export default function CreatePostSheet({ onClose, storeId }) {
  // A post publishes to ONE Google listing. The preview footer and the AI prompt used to
  // name Indiranagar no matter which branch you were in — so a Koramangala manager wrote
  // a post that said Indiranagar on it. Both now read the branch this sheet was opened
  // for (ManageMedia is already per-store, and the aggregate view reaches it through the
  // branch picker), so what the preview shows is the listing that will carry it.
  const postStore = useMemo(
    () => getStoreLocations().find(l => l.id === storeId) || getStoreLocations()[0],
    [storeId],
  )
  // A post is public marketing copy, so it may only name what the listing can vouch
  // for. An 'address' flag means the city itself is in doubt — HSR Layout carries a
  // data-entry error that puts it in Bandra — so that draft names the branch alone.
  // A 'latlng' drift is only a misplaced pin, which says nothing about the city, so
  // those stores keep theirs.
  const postArea = useMemo(() => {
    const cityInDoubt = computeLocationFlags(postStore).some(f => f.type === 'address')
    return cityInDoubt ? postStore.branch : `${postStore.branch} ${postStore.city}`
  }, [postStore])
  const { t } = useTranslation()
  const [tpl, setTpl] = useState(POST_TEMPLATES[0])
  const [copy, setCopy] = useState('')
  const [loading, setLoading] = useState(false)
  // DESIGN REVIEW 3, item 16 — the details each post TYPE actually needs. Picking a
  // template used to only re-roll the AI copy: an Offer with no code and no expiry, or an
  // Event with nobody told when, is not a post anyone can publish. Google requires these
  // for those types, so they are real fields and they gate the submit.
  const [offerCode, setOfferCode] = useState('')
  const [offerValid, setOfferValid] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')

  const isOffer = tpl.id === 'pt-offer'
  const isEvent = tpl.id === 'pt-event'
  // Standard and Testimonial carry no extra required fields — copy alone is a valid post.
  const detailsReady = isOffer
    ? !!(offerCode.trim() && offerValid)
    : isEvent
      ? !!(eventDate && eventTime)
      : true
  const toast = useToast()

  const tplName = item => t(item.nameKey, { defaultValue: item.name })
  const tplCta = item => t(item.ctaKey, { defaultValue: item.cta })

  async function generate(template = tpl) {
    setLoading(true)
    const out = await askAI(
      `You are an AI marketing assistant for a local store. Generate ONE post for the brand "Lakshmi Electronics" branch "${postArea}", localized to weekend shoppers in that area. Template type: "${template.name}". Format: 1 short headline (max 5 words) on its own line, then ONE short body line (max 25 words). No emoji, no quotes, no hashtags. Friendly, confident.`,
      {
        temperature: 0.9,
        // The fallback is read by the shop owner, so its headline goes through the
        // catalog — unlike the prompt above, which stays English for the model.
        fallback: t('post.copyFallback', { headline: t(template.headlineKey, { defaultValue: template.headline }) }),
      },
    )
    setCopy(out)
    setLoading(false)
  }

  useEffect(() => { generate() }, [])

  const iconMap = { Sparkles, Wallet, PartyPopper, MessageSquareQuote }

  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('post.title')}</div>
      <div className="m-callout text-white/55 mb-3">{t('post.subtitle')}</div>

      <div className="m-subhead text-white/60 mb-2">{t('post.chooseTemplate')}</div>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {POST_TEMPLATES.map(item => {
          const I = iconMap[item.icon] || Sparkles
          const active = tpl.id === item.id
          return (
            <button key={item.id} onClick={() => { setTpl(item); generate(item) }} className="press text-left rounded-2xl p-3 relative overflow-hidden" style={{ background: active ? `${item.accent}18` : 'rgba(255,255,255,.04)', border: `1px solid ${active ? item.accent + '60' : 'rgba(255,255,255,.08)'}` }}>
              <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `${item.accent}28`, border: `1px solid ${item.accent}50` }}>
                <I size={16} style={{ color: item.accent }} />
              </div>
              <div className="mt-2 m-headline text-white">{tplName(item)}</div>
              <div className="m-caption text-white/55">{tplCta(item)}</div>
            </button>
          )
        })}
      </div>

      {/* The type-specific journey. Only rendered for the types that have one. */}
      {(isOffer || isEvent) && (
        <div className="mb-4">
          <div className="m-subhead text-white/60 mb-2">
            {isOffer
              ? t('post.offerDetails', { defaultValue: 'Offer details' })
              : t('post.eventDetails', { defaultValue: 'Event details' })}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {isOffer ? (
              <>
                <PostField label={t('post.offerCode', { defaultValue: 'Coupon code' })}>
                  <input
                    value={offerCode}
                    onChange={e => setOfferCode(e.target.value.toUpperCase().slice(0, 18))}
                    placeholder="DIWALI20"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full bg-transparent text-white m-headline outline-none m-tabular placeholder:text-white/25"
                  />
                </PostField>
                <PostField label={t('post.offerValid', { defaultValue: 'Valid till' })}>
                  <input
                    type="date"
                    value={offerValid}
                    onChange={e => setOfferValid(e.target.value)}
                    className="w-full bg-transparent text-white m-headline outline-none m-tabular"
                  />
                </PostField>
              </>
            ) : (
              <>
                <PostField label={t('post.eventDate', { defaultValue: 'Date' })}>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={e => setEventDate(e.target.value)}
                    className="w-full bg-transparent text-white m-headline outline-none m-tabular"
                  />
                </PostField>
                <PostField label={t('post.eventTime', { defaultValue: 'Start time' })}>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={e => setEventTime(e.target.value)}
                    className="w-full bg-transparent text-white m-headline outline-none m-tabular"
                  />
                </PostField>
              </>
            )}
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="m-subhead text-white/60 mb-2">{t('post.preview')}</div>
      <div
        className="on-dark relative rounded-2xl overflow-hidden p-4"
        style={{
          background: `linear-gradient(135deg, ${tpl.accent}55 0%, #0E0071 70%, #06070D 100%)`,
          border: '1px solid rgba(255,255,255,.10)',
          minHeight: 160,
        }}
      >
        <div className="absolute top-3 right-3">
          <AIBadge />
        </div>
        {loading ? (
          <div className="space-y-2 mt-3">
            <AIShimmer className="h-4 w-3/5" />
            <AIShimmer className="h-3 w-4/5" />
            <AIShimmer className="h-3 w-3/5" />
          </div>
        ) : (
          <>
            <div className="m-title2 text-white">{copy.split('\n')[0]}</div>
            <div className="mt-1 m-callout text-white/85">{copy.split('\n').slice(1).join(' ')}</div>
          </>
        )}
        {/* The type's own facts, ON the post — a coupon nobody can read is not an offer,
            and an event with no time is not an invitation. */}
        {(isOffer || isEvent) && (offerCode || offerValid || eventDate || eventTime) && (
          <div
            className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full m-caption font-semibold text-white"
            style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.22)' }}
          >
            {isOffer
              ? [offerCode, offerValid && t('post.validTill', { date: offerValid, defaultValue: 'till {{date}}' })]
                  .filter(Boolean).join(' · ')
              : [eventDate, eventTime].filter(Boolean).join(' · ')}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          {/* The listing this post goes to — named, not assumed. */}
          <span className="m-caption text-white/60 truncate">{postStore.name} · {postStore.branch}</span>
          <span className="px-3 h-7 rounded-full text-white m-caption font-semibold inline-flex items-center" style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)' }}>
            {tplCta(tpl)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Chip onClick={() => generate()} icon={Sparkles}>{t('post.regenerate')}</Chip>
        <Chip>{t('post.addImage')}</Chip>
        <Chip>{t('post.schedule')}</Chip>
      </div>

      {/* Says WHY the button is dead rather than leaving a disabled control with no cause. */}
      {!detailsReady && (
        <div className="mt-3 m-caption text-white/45">
          {isOffer
            ? t('post.offerRequired', { defaultValue: 'Add the coupon code and the date it runs out to submit this offer.' })
            : t('post.eventRequired', { defaultValue: 'Add the date and start time to submit this event.' })}
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2">
        <GhostButton icon={X} onClick={onClose}>{t('common.cancel')}</GhostButton>
        <div className="col-span-2">
          <PrimaryButton
            icon={ArrowRight}
            disabled={!detailsReady}
            onClick={() => { toast.push({ kind: 'success', title: t('post.submittedTitle'), body: t('post.submittedBody') }); onClose?.() }}
          >
            {t('post.submitCta')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

/** One labelled field in the type-specific details grid. */
function PostField({ label, children }) {
  return (
    <div>
      <div className="m-caption text-white/50 mb-1 ml-1">{label}</div>
      <div
        className="h-12 rounded-xl px-3 flex items-center"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
      >
        {children}
      </div>
    </div>
  )
}
