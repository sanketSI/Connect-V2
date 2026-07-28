import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FEATURES } from '../lib/features.js'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { Download, Share2, Link as LinkIcon, MapPin, QrCode, Globe, Store, ExternalLink } from 'lucide-react'
import BottomSheet from '../components/BottomSheet.jsx'
import { Card, PrimaryButton, GhostButton } from '../components/UI.jsx'
import { useToast } from '../components/Toast.jsx'
import { vibrate } from '../lib/utils.js'
import {
  storeReviewLink, googleStatusOf, googleProfileUrl, micrositeUrl,
} from '@connect/core'

/**
 * How each Google standing reads (design review 3, item 1).
 *
 * `verification_required` reuses the existing "address not verified yet" copy — same
 * situation, already translated. `suspended` is the expensive state and the only one
 * drawn in red: a suspended listing means customers cannot find the shop at all.
 */
const GOOGLE_STATUS_META = {
  verified: {
    tint: '#22D38B', color: 'var(--si-success-text)',
    key: 'reviewQr.statusLive', dv: 'Live on Google · listing verified',
  },
  verification_required: {
    tint: '#CA8A04', color: 'var(--si-warning-text)',
    key: 'reviewQr.statusUnverified', dv: 'Live on Google · address not verified yet',
  },
  suspended: {
    tint: '#DC2626', color: 'var(--si-error-text)',
    key: 'reviewQr.statusSuspended', dv: 'Suspended by Google · customers cannot find this listing',
  },
}

/** One tappable destination for the listing. 44px row, opens in a new tab. */
function ListingLink({ icon: Icon, href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 press min-h-[var(--m-touch-min)]"
    >
      <Icon size={13} className="shrink-0" style={{ color: 'var(--si-primary-text)' }} aria-hidden="true" />
      <span className="m-caption font-semibold truncate" style={{ color: 'var(--si-primary-text)' }}>{label}</span>
      <ExternalLink size={10} className="shrink-0 text-white/30" aria-hidden="true" />
    </a>
  )
}

// ============================================================
// ASK A REVIEW — the store's own review QR, opened from the avatar on Home.
//
// WHAT IT IS FOR. The single cheapest way a shop gets reviews is a printed card on the
// counter. This sheet is where the manager gets that card: his store's real review
// link, as a real QR, downloadable at print resolution.
//
// THE CODE IS REAL, and everything downstream depends on that being true:
//
//  • THE LINK is storeReviewLink() from the data layer — the same `si.link/r/<CODE>`
//    format the WhatsApp/SMS builder on Customers already sends and the same one the
//    Reviews screen generates. One link format for the whole product; a QR encoding a
//    second, invented shape would be a card that quietly leads nowhere.
//
//  • THE ENCODING is the `qrcode` package (MIT; 25 kB minified, 9.6 kB gzipped, and
//    it pulls in no Node polyfills), bundled — NOT an image served from a QR API.
//    Two reasons, both hard requirements here: a strict CSP
//    blocks off-origin image loads, and a dealer standing in a basement showroom with
//    no signal must still be able to put the card on the counter. Hand-rolling QR
//    encoding was the other option; Reed–Solomon error correction is not something to
//    reimplement for a counter card that has to survive a coffee ring.
//
//  • ERROR CORRECTION is level M (~15% recoverable) rather than the L default. This
//    gets printed, taped down and thumbed at; L looks the same on screen and fails on
//    a scuffed card.
//
//  • THE CANVAS IS RENDERED AT PRINT SIZE (720px) and displayed small. The same
//    canvas backs the screen, the download and the share, so what the manager scans to
//    test is byte-for-byte what he prints.
//
// SHARE DEGRADES HONESTLY. Web Share with a file attachment is the good path; where
// the browser has no navigator.share at all the button changes its own label to
// "Copy link" and copies. What it never does is sit there looking like a share button
// and do nothing — see shareMode below.
// ============================================================

/** Print size of the generated PNG, in pixels square. Big enough for an A5 card. */
const QR_PRINT_PX = 720

/** On-screen size. The canvas keeps its 720px backing store — this is CSS only. */
const QR_DISPLAY_PX = 168

/** 'Lakshmi Electronics' + 'Indiranagar' → 'lakshmi-electronics-indiranagar-review-qr.png' */
function qrFileName(store) {
  const slug = [store?.name, store?.branch]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'store'}-review-qr.png`
}

export default function ReviewQrSheet({ open, onClose, store }) {
  if (!FEATURES.reviewQr) return null
  return (
    <BottomSheet open={open} onClose={onClose} label={store?.name}>
      {/* Mounted only while open, so the canvas effect runs on a real node every time
          the sheet is opened rather than once against a hidden one. */}
      {open && <ReviewQrBody store={store} />}
    </BottomSheet>
  )
}

function ReviewQrBody({ store }) {
  const { t } = useTranslation()
  const toast = useToast()
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const s = store || {}
  const link = storeReviewLink(s)
  const fileName = useMemo(() => qrFileName(s), [s.name, s.branch])

  // What this browser can actually do, decided once — the Share button is labelled
  // from it, so the label can never promise more than the device delivers.
  const shareMode = useMemo(() => {
    if (typeof navigator === 'undefined') return 'copy'
    if (typeof navigator.share === 'function') return 'share'
    return 'copy'
  }, [])

  // Draw the code. Deep indigo on white: white is not a style choice — a QR needs a
  // light quiet zone to lock onto, in both themes — and #0E0071 on #FFFFFF measures
  // ~15:1, far past what any scanner needs.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !link) return
    let live = true
    QRCode.toCanvas(canvas, link, {
      width: QR_PRINT_PX,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0E0071FF', light: '#FFFFFFFF' },
    }).then(
      () => {
        if (!live) return
        // toCanvas() writes `style.width`/`style.height` at the FULL 720px itself,
        // after React has rendered — so a size set through the style prop is silently
        // overwritten and the code lands on screen four times wider than the phone.
        // The display size therefore has to be re-applied here, once the library is
        // done with the element. (The backing store stays 720px, which is the point:
        // the download is print resolution.)
        canvas.style.width = `${QR_DISPLAY_PX}px`
        canvas.style.height = `${QR_DISPLAY_PX}px`
        setReady(true)
        setFailed(false)
      },
      (err) => { if (live) { setFailed(true); console.warn('[qr] could not render the review code:', err) } },
    )
    return () => { live = false }
  }, [link])

  /** The rendered code as a PNG blob — the one source for both download and share. */
  function toPngBlob() {
    return new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) return resolve(null)
      canvas.toBlob(resolve, 'image/png')
    })
  }

  async function onDownload() {
    vibrate()
    const blob = await toPngBlob()
    if (!blob) {
      toast?.push({ kind: 'info', title: t('reviewQr.downloadFailed', { defaultValue: 'Couldn’t save the code — try again.' }) })
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on the next tick: Safari reads the URL asynchronously after click().
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast?.push({
      kind: 'success',
      title: t('reviewQr.downloaded', { defaultValue: 'Review code saved' }),
      body: t('reviewQr.downloadedBody', { file: fileName, defaultValue: 'Saved as {{file}} — print it for the counter.' }),
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      toast?.push({ kind: 'success', title: t('reviewQr.copied', { defaultValue: 'Review link copied' }) })
    } catch {
      // Clipboard can be blocked outright (permissions, insecure context). Say so
      // rather than showing a success toast for something that did not happen.
      toast?.push({ kind: 'info', title: t('reviewQr.copyFailed', { defaultValue: 'Couldn’t copy — the link is above, on screen.' }) })
    }
  }

  async function onShare() {
    vibrate()
    const title = t('reviewQr.shareTitle', { store: s.name, defaultValue: 'Review {{store}}' })
    const text = t('reviewQr.shareText', {
      store: s.name, branch: s.branch, link,
      defaultValue: 'Scan or tap to review {{store}}, {{branch}}: {{link}}',
    })

    if (shareMode !== 'share') return copyLink()

    // The good path: hand over the actual image, so it can go into a WhatsApp group
    // or a printer app as a file rather than as a URL somebody has to re-render.
    const blob = await toPngBlob()
    if (blob && typeof navigator.canShare === 'function') {
      const file = new File([blob], fileName, { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title, text })
          return
        } catch (err) {
          // A user who backs out of the share sheet has not hit an error.
          if (err?.name === 'AbortError') return
        }
      }
    }
    // Share exists but will not take a file → share the link itself.
    try {
      await navigator.share({ title, text, url: link })
    } catch (err) {
      if (err?.name !== 'AbortError') copyLink()
    }
  }

  // The listing's standing with Google — THREE states off the record, not a hopeful green
  // dot (design review 3, item 1). Suspended is the expensive one: customers cannot find
  // the shop at all, so it reads red and says exactly that.
  const gStatus = googleStatusOf(store)
  const status = GOOGLE_STATUS_META[gStatus] || GOOGLE_STATUS_META.verified
  const address = [s.address, s.pincode].filter(Boolean).join(' ')
  const profileHref = googleProfileUrl(store)
  const micrositeHref = micrositeUrl(store)

  return (
    <div className="px-4 pb-6">
      {/* WHO — store, branch, live status, address. */}
      <div className="m-title2 text-white">{s.name}</div>
      <div className="m-callout text-white/55">{s.branch}{s.city ? ` · ${s.city}` : ''}</div>

      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: status.tint, boxShadow: `0 0 6px ${status.tint}` }}
        />
        <span className="m-subhead" style={{ color: status.color }}>
          {t(status.key, { defaultValue: status.dv })}
        </span>
      </div>

      {address && (
        <div className="mt-1.5 flex items-start gap-1.5">
          <MapPin size={13} className="text-white/45 mt-[3px] shrink-0" />
          <div className="m-caption text-white/55">{address}</div>
        </div>
      )}

      {/* Design review 3, item 1: the two places this listing actually lives, so the
          manager can open either without going hunting for the URL. */}
      <div className="mt-2 space-y-0.5">
        {profileHref && (
          <ListingLink
            icon={Globe}
            href={profileHref}
            label={t('reviewQr.googleProfile', { defaultValue: 'Google Business Profile' })}
          />
        )}
        {micrositeHref && (
          <ListingLink
            icon={Store}
            href={micrositeHref}
            label={t('reviewQr.microsite', { defaultValue: 'Store microsite' })}
          />
        )}
      </div>

      {/* ASK A REVIEW */}
      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-glass)' }}>
        <div className="m-subhead text-white/55 mb-2 flex items-center gap-1.5">
          <QrCode size={13} className="ai-text" />
          {t('reviewQr.sectionTitle', { defaultValue: 'Ask a review' })}
        </div>

        <Card className="!p-4">
          <div className="flex flex-col items-center">
            {/* The white plate is functional: a QR needs its quiet zone light in both
                themes, so this block does not follow the theme. */}
            <div
              className="rounded-2xl p-3 grid place-items-center"
              style={{ background: '#FFFFFF', border: '1px solid rgba(14,0,113,.14)' }}
            >
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={t('reviewQr.canvasAlt', {
                  store: s.name, link,
                  defaultValue: 'QR code linking to the review page for {{store}} ({{link}})',
                })}
                // Width/height are set in the effect, not here — see the note there.
                style={{ display: 'block', opacity: ready ? 1 : 0 }}
                width={QR_DISPLAY_PX}
                height={QR_DISPLAY_PX}
              />
            </div>

            {failed ? (
              <div className="mt-3 m-caption text-white/55 text-center">
                {t('reviewQr.renderFailed', { defaultValue: 'The code couldn’t be drawn on this device — the link below still works.' })}
              </div>
            ) : (
              <div className="mt-3 m-caption text-white/55 text-center px-2">
                {t('reviewQr.scanHint', { defaultValue: 'Customers scan this and land straight on your Google review form.' })}
              </div>
            )}

            {/* The link, in words — the fallback for anyone who cannot scan, and the
                thing the Copy action puts on the clipboard. */}
            <div
              className="mt-3 w-full px-3 h-11 rounded-xl flex items-center justify-center gap-2 m-subhead m-tabular truncate"
              style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.25)', color: 'var(--si-primary-text)' }}
            >
              <LinkIcon size={13} className="shrink-0" />
              <span className="truncate">{link}</span>
            </div>
          </div>
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <GhostButton icon={Download} onClick={onDownload} full>
            {t('reviewQr.download', { defaultValue: 'Download' })}
          </GhostButton>
          <PrimaryButton
            icon={shareMode === 'share' ? Share2 : LinkIcon}
            onClick={onShare}
          >
            {shareMode === 'share'
              ? t('reviewQr.share', { defaultValue: 'Share QR' })
              : t('reviewQr.copyLink', { defaultValue: 'Copy link' })}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
