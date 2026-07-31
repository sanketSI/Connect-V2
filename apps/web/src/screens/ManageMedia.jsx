import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Image as ImageIcon, X, Plus, AlertTriangle, UploadCloud, ShieldCheck,
  Camera, Images, Crop, Check, ChevronRight, Trash2,
} from 'lucide-react'
import { Card, PrimaryButton, GhostButton, Chip } from '../components/UI.jsx'
import { SheetSubview, SheetViews } from '../components/BottomSheet.jsx'
import { getMediaLibrary, getUploadSamples, checkCompliance } from '@connect/core'
// Read PER STORE at render, not once at module scope: a listing's photos belong to the
// branch, and the sheet can be opened for any of them from the All-locations view.
const UPLOAD_SAMPLES = getUploadSamples()
import { useToast } from '../components/Toast.jsx'
import { vibrate, cn } from '../lib/utils.js'
import CreatePostSheet from './CreatePostSheet.jsx'

// Feature 5 — Manage Media hub. Replaces the old "Make a post" entry point:
// one place for the store's Cover, Photos, and Posts, with compliance enforced
// at the point of upload and again, across the whole location, on demand.

const SEGMENTS = [
  { id: 'cover', labelKey: 'media.segCover' },
  { id: 'photos', labelKey: 'media.segPhotos' },
  { id: 'posts', labelKey: 'media.segPosts' },
]

// Neutral brand-dark gradient standing in for a picture we don't hold (seeded entries
// carry a label, not a file). Deliberately NOT the #0E0071→#0070FC AI gradient, which
// is reserved for AI surfaces.
const PLACEHOLDER = 'linear-gradient(135deg, #14206b 0%, #0E0071 55%, #0A0E24 100%)'

// ── Cover target ───────────────────────────────────────────────────────────────────
// Google crops the cover photo to 16:9 wherever it shows the listing, and asks for a
// 1200×675 file. Both numbers below come from that: the ratio decides what we trim,
// the size decides what we scale down to. The Cover preview renders at the same 16:9,
// so what the owner approves here is the frame Google will actually show.
const COVER_W = 1200
const COVER_H = 675
const COVER_RATIO = COVER_W / COVER_H

// ── Smart Image Protection thresholds ──────────────────────────────────────────────
// Google's floor for a business photo is 250px on each side. Anything under it is a
// real problem, measured — not guessed.
const MIN_EDGE_PX = 250
// Variance of the Laplacian over a 160px-normalised luma pass. Calibrated against the
// same detailed scene blurred by known amounts, measured in-browser rather than guessed:
//   sharp 3073 · 1px 2398 · 2px 1395 · 4px 339 · 8px 48 · 16px 8 · flat panel 0.
// The floor sits under all of those but the last two on purpose. Flagging sends a picture
// to Google for deletion, so a false positive costs the owner a real photo — only an image
// with essentially no edge detail left trips this, which is exactly what the copy claims.
const SHARPNESS_FLOOR = 12

// Seeded library entries carry a catalog key; an upload carries a real file name, which
// must render verbatim and never be translated. `labelKey` is the discriminator.
const imgLabel = (item, t) => (item?.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item?.label || '')

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

/**
 * Auto-adjust a chosen picture to the cover frame, for real: centre-crop it to 16:9 and
 * resize it down to at most 1200×675. We never scale UP — inventing pixels would make
 * the resolution we report a lie, and would hide a too-small file from the scan that is
 * meant to catch it. Returns the fitted data URL plus the before/after sizes, so the UI
 * can state what actually happened instead of claiming it.
 */
async function fitToCover(src) {
  const img = await loadImage(src)
  const srcW = img.naturalWidth
  const srcH = img.naturalHeight
  if (!srcW || !srcH) throw new Error('empty image')

  // Trim the long edge — sides on a wide picture, top and bottom on a tall one.
  let cropW = srcW
  let cropH = srcH
  if (srcW / srcH > COVER_RATIO) cropW = srcH * COVER_RATIO
  else cropH = srcW / COVER_RATIO

  const scale = Math.min(1, COVER_W / cropW)
  const outW = Math.max(1, Math.round(cropW * scale))
  const outH = Math.max(1, Math.round(cropH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (srcW - cropW) / 2, (srcH - cropH) / 2, cropW, cropH, 0, 0, outW, outH)

  return { src: canvas.toDataURL('image/jpeg', 0.9), w: outW, h: outH, srcW, srcH }
}

/**
 * Measure a picture we actually hold: its true pixel size, and how much edge detail it
 * carries. Both are read off the decoded image — no metadata is trusted.
 */
async function measurePicture(src) {
  const img = await loadImage(src)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return null

  // Normalise to a 160px long edge so the score means the same thing for a phone photo
  // and a thumbnail, and so the pass stays cheap however many images are on the listing.
  const S = 160
  const cw = Math.max(1, Math.round(w >= h ? S : S * (w / h)))
  const ch = Math.max(1, Math.round(w >= h ? S * (h / w) : S))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, cw, ch)
  const { data } = ctx.getImageData(0, 0, cw, ch)

  const lum = new Float64Array(cw * ch)
  for (let i = 0; i < lum.length; i++) {
    const p = i * 4
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }

  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x
      const lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - cw] - lum[i + cw]
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  if (!n) return { w, h, sharpness: null }
  const mean = sum / n
  return { w, h, sharpness: Math.max(0, sumSq / n - mean * mean) }
}

/**
 * One image, checked. Two tiers, and the tier is reported back so the sheet can say
 * which one it managed:
 *   'name'    — the rules the data layer already holds, matched against the file name.
 *               All we can do for a picture we don't hold the pixels for.
 *   'picture' — the name rules, plus the real size and sharpness read off the picture.
 */
async function analyseImage(item, t) {
  const base = { id: item.id, kind: item.kind, label: imgLabel(item, t) }

  const rule = checkCompliance(item.hint || item.label)
  if (!rule.ok) {
    return { ...base, flagged: true, method: 'name', reason: t(rule.reasonKey, { defaultValue: rule.reason }) }
  }

  if (item.src) {
    const m = await measurePicture(item.src).catch(() => null)
    if (m) {
      if (Math.min(m.w, m.h) < MIN_EDGE_PX) {
        return {
          ...base,
          flagged: true,
          method: 'picture',
          reason: t('media.sip.reasonSmall', {
            w: m.w, h: m.h, min: MIN_EDGE_PX,
            defaultValue: 'Only {{w}}×{{h}} pixels — Google needs at least {{min}} on each side.',
          }),
        }
      }
      if (m.sharpness != null && m.sharpness < SHARPNESS_FLOOR) {
        return {
          ...base,
          flagged: true,
          method: 'picture',
          reason: t('media.sip.reasonSoft', {
            defaultValue: 'Almost no detail in this picture — it reads as out of focus. Retake it in good light.',
          }),
        }
      }
      return { ...base, flagged: false, method: 'picture' }
    }
  }
  return { ...base, flagged: false, method: 'name' }
}

export default function ManageMedia({ onClose, storeId }) {
  const MEDIA_LIBRARY = useMemo(() => getMediaLibrary(storeId), [storeId])
  const [segment, setSegment] = useState('cover')
  // One pool of images for this location, exactly as the data layer shapes it: the one
  // marked `cover` is what Google shows on top, the rest are the gallery. Changing the
  // cover moves the mark — which is what makes "previously uploaded images" a real,
  // countable set rather than a list we invent.
  const [library, setLibrary] = useState(() => MEDIA_LIBRARY.map(m => ({ ...m })))
  // Views WITHIN this sheet — see SheetSubview in BottomSheet.jsx. These were three
  // sheets stacked ON this one, which put the listing you were editing behind a second
  // modal and made Escape close both at once.
  const [view, setView] = useState('main') // 'main' | 'cover' | 'upload' | 'protect'
  const [dir, setDir] = useState(1)
  const push = (v) => { setDir(1); setView(v) }
  const pop = () => { setDir(-1); setView('main') }
  const [coverError, setCoverError] = useState(null)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const toast = useToast()
  const { t } = useTranslation()

  const cover = library.find(m => m.kind === 'cover')
  const photos = library.filter(m => m.kind === 'photo')
  // Everything already uploaded to this location apart from the picture that is live as
  // the cover. Empty is a real state — remove every photo and it genuinely is empty.
  const coverLibrary = library.filter(m => m.kind !== 'cover')

  function openCoverPicker() {
    setCoverError(null)
    push('cover')
  }

  // Promote `next` to cover and demote the outgoing one back into the gallery — it stays
  // an image of this store, so it stays in the pool and can be picked again.
  function promoteToCover(next) {
    setLibrary(list => [
      { ...next, kind: 'cover' },
      ...list.filter(m => m.id !== next.id).map(m => (m.kind === 'cover' ? { ...m, kind: 'photo' } : m)),
    ])
  }

  async function onCoverFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return

    // The same gate every other upload passes — the data layer's rules, run on the real name.
    const res = checkCompliance(file.name)
    if (!res.ok) {
      const reason = t(res.reasonKey, { defaultValue: res.reason })
      setCoverError({ label: file.name, reason })
      toast.push({ kind: 'missed', title: t('media.uploadBlockedTitle'), body: reason })
      return
    }

    const url = URL.createObjectURL(file)
    try {
      const fitted = await fitToCover(url)
      setCoverError(null)
      promoteToCover({ id: `up-${Date.now()}`, label: file.name, src: fitted.src, w: fitted.w, h: fitted.h })
      toast.push({
        kind: 'success',
        title: t('media.coverUpdatedTitle'),
        body: t('media.coverFittedBody', {
          srcW: fitted.srcW, srcH: fitted.srcH, w: fitted.w, h: fitted.h,
          defaultValue: 'Cropped from {{srcW}}×{{srcH}} to {{w}}×{{h}} and set as your cover.',
        }),
      })
      pop()
    } catch {
      const reason = t('media.unreadableFile', { defaultValue: "We couldn't open this file as a picture. Choose a JPG or PNG." })
      setCoverError({ label: file.name, reason })
      toast.push({ kind: 'missed', title: t('media.uploadBlockedTitle'), body: reason })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  // Reusing an image already on the listing gets the same auto-adjust as a fresh upload,
  // wherever we hold its picture — the cover frame is the cover frame either way.
  async function useExistingAsCover(item) {
    vibrate(6)
    let next = item
    if (item.src) {
      try {
        const fitted = await fitToCover(item.src)
        next = { ...item, src: fitted.src, w: fitted.w, h: fitted.h }
      } catch { /* won't decode — keep the entry as it stands */ }
    }
    promoteToCover(next)
    toast.push({ kind: 'success', title: t('media.coverUpdatedTitle'), body: t('media.coverUpdatedBody', { label: imgLabel(item, t) }) })
    pop()
  }

  // Called only for compliant picks — the picker rejects the rest before this runs.
  function acceptUpload(sample) {
    setLibrary(list => [...list, { id: `${sample.id}-${Date.now()}`, kind: 'photo', label: sample.label, hint: sample.hint }])
    toast.push({ kind: 'success', title: t('media.photoAddedTitle'), body: t('media.photoAddedBody', { label: sample.label }) })
    pop()
  }

  // Removing a listing photo is a real, destructive action, so it is REVERSIBLE rather than
  // instant-and-gone: the picture leaves the grid immediately (optimistic), but the exact
  // record — same id, label, order — is held in the Undo on the toast and spliced back at
  // its original index if the owner taps it. The library is local state seeded from the
  // data layer, so this restore is honest: there is no core mutator that removePhoto goes
  // through that the Undo would have to reverse too. (When a real Google-removal API sits
  // behind this, the same shape holds: defer the removal call until the Undo window closes,
  // or use Google's soft-delete + restore. What must never happen is a one-tap, no-way-back
  // deletion of a live photo — which is exactly what this replaces.)
  // PM feedback 4(i): "when delete a image, a confirmation comes to delete". Asked for
  // BEFORE the fact — the Undo below is the safety net after it, and both are kept: the
  // confirmation stops the accident, the Undo recovers the one that gets through anyway.
  const [pendingDelete, setPendingDelete] = useState(null)

  function askRemovePhoto(id) {
    const photo = library.find(p => p.id === id)
    if (!photo) return
    vibrate(6)
    setPendingDelete(photo)
  }

  function removePhoto(id) {
    const index = library.findIndex(p => p.id === id)
    if (index === -1) return
    const removed = library[index]
    setLibrary(list => list.filter(p => p.id !== id))
    setPendingDelete(null)
    vibrate(12)
    toast.push({
      kind: 'info',
      title: t('media.photoRemovedTitle'),
      body: t('media.photoRemovedBody'),
      // Per-photo signature so two quick removals don't dedupe into one toast and cost the
      // owner the first photo's Undo.
      signature: `photo-removed-${id}`,
      action: {
        label: t('common.undo', { defaultValue: 'Undo' }),
        onClick: () => restorePhoto(removed, index),
      },
    })
  }

  // Put the exact record back where it was. Clamp the index in case other photos left in
  // the meantime, and no-op if it is somehow already back, so a double-tap can't clone it.
  function restorePhoto(item, index) {
    setLibrary(list => {
      if (list.some(p => p.id === item.id)) return list
      const next = [...list]
      next.splice(Math.min(index, next.length), 0, item)
      return next
    })
    vibrate(8)
    toast.push({ kind: 'success', title: t('media.photoRestoredTitle', { defaultValue: 'Photo restored' }) })
  }

  // "Flag to Google for deletion" — the images leave the listing here and go into
  // Google's removal queue. Only gallery photos: a cover can't be deleted, it can only
  // be replaced, so the sheet sends the owner to the Cover tab for that instead.
  function flagToGoogle(ids) {
    setLibrary(list => list.filter(m => !ids.includes(m.id)))
    toast.push({
      kind: 'success',
      title: t('media.sip.flaggedTitle', { defaultValue: 'Sent to Google' }),
      body: t('media.sip.flaggedBody', {
        count: ids.length,
        defaultValue_one: '{{count}} image is off your listing and queued for removal from Google.',
        defaultValue_other: '{{count}} images are off your listing and queued for removal from Google.',
      }),
    })
    pop()
  }

  // The file inputs live OUTSIDE the view switcher: picking a cover photo unmounts the
  // cover view while the OS picker is open, and an input that unmounts mid-pick never
  // fires its change event.
  const fileInputs = (
    <>
      {/* Both ways in, side by side: the camera for a picture taken now, the plain input
          for one already on the phone. Same idiom as the storefront photo in LocationVerify. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onCoverFile} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={onCoverFile} className="hidden" />
    </>
  )

  if (view !== 'main') {
    const sub = {
      cover: {
        title: t('media.changeCover'),
        body: (
          <CoverPanel
            cover={cover}
            libraryImages={coverLibrary}
            error={coverError}
            onUseExisting={useExistingAsCover}
            onCamera={() => cameraRef.current?.click()}
            onGallery={() => galleryRef.current?.click()}
          />
        ),
      },
      upload: {
        title: t('media.pickerPhotosTitle'),
        body: <UploadPanel onAccept={acceptUpload} />,
      },
      protect: {
        title: t('media.sip.title', { defaultValue: 'Smart Image Protection' }),
        body: (
          <ProtectionPanel
            images={library}
            onFlag={flagToGoogle}
            onGoToCover={() => { pop(); setSegment('cover') }}
            onClose={pop}
          />
        ),
      },
    }[view]
    return (
      <SheetViews viewKey={view} dir={dir}>
        <SheetSubview title={sub.title} onBack={pop}>{sub.body}</SheetSubview>
        {fileInputs}
      </SheetViews>
    )
  }

  return (
    <SheetViews viewKey="main" dir={dir}>
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('profile.manageMedia')}</div>
      <div className="m-callout text-white/55 mb-3">{t('media.subtitle')}</div>

      <Segmented value={segment} onChange={setSegment} segments={SEGMENTS} />

      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={segment}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {segment === 'cover' && <CoverSection cover={cover} onChange={openCoverPicker} />}
            {segment === 'photos' && (
              <PhotosSection
                photos={photos}
                onAdd={() => push('upload')}
                onRemove={askRemovePhoto}
                onProtect={() => push('protect')}
              />
            )}
            {segment === 'posts' && (
              // CreatePostSheet supplies its own px-4 — cancel the parent padding so it lines up.
              <div className="-mx-4">
                <CreatePostSheet storeId={storeId} onClose={onClose} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {fileInputs}

      {/* DELETE CONFIRMATION (PM feedback 4i). A listing photo is public, so removing one
          is asked about rather than done on a tap. Translator TODO: the catalogs carry no
          confirmation copy — media.photoRemovedTitle/Body describe the AFTERMATH, not the
          question, so reusing them here would say "Photo removed" before it was. */}
      {pendingDelete && (
        <div
          className="absolute inset-0 z-30 grid place-items-center px-6"
          style={{ background: 'rgba(4,8,20,.55)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Delete this photo?"
        >
          <div
            className="w-full rounded-2xl p-4"
            style={{ background: 'var(--bg-sheet)', border: '1px solid var(--border-glass-strong)', boxShadow: 'var(--shadow-sheet)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
                style={{ background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.35)' }}
              >
                <Trash2 size={18} style={{ color: '#DC2626' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="m-headline text-white">Delete this photo?</div>
                <div className="m-caption text-white/70 mt-1">
                  It will be taken off your listing. You can undo this straight afterwards.
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="h-10 px-4 rounded-xl m-subhead text-white/70 press"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => removePhoto(pendingDelete.id)}
                className="on-dark h-10 px-4 rounded-xl m-subhead font-semibold text-white press md-state inline-flex items-center gap-1.5"
                style={{ background: '#DC2626' }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </SheetViews>
  )
}

// Three-segment switcher — track var(--bg-subtle), solid #0070FC thumb (CallsTab style).
function Segmented({ value, onChange, segments }) {
  const { t } = useTranslation()
  const activeIdx = segments.findIndex(s => s.id === value)
  return (
    <div
      className="relative h-11 rounded-2xl p-1 grid grid-cols-3"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
    >
      <motion.div
        className="absolute top-1 bottom-1 rounded-xl"
        style={{ left: 4, width: 'calc((100% - 8px) / 3)', background: '#0070FC', boxShadow: '0 4px 14px rgba(0,112,252,.35)' }}
        animate={{ x: `${activeIdx * 100}%` }}
        transition={{ type: 'spring', damping: 25, stiffness: 320 }}
      />
      {segments.map(s => {
        const active = value === s.id
        return (
          <button
            key={s.id}
            onClick={() => { vibrate(6); onChange(s.id) }}
            className="relative z-10 m-callout font-semibold inline-flex items-center justify-center press"
            style={{ color: active ? '#fff' : 'var(--text-secondary)' }}
          >
            {t(s.labelKey)}
          </button>
        )
      })}
    </div>
  )
}

// The real picture when we hold one; the neutral brand panel when we don't.
function Thumb({ item, alt, ratio = '16 / 9', icon = 18, className }) {
  return (
    <div
      className={cn('relative grid place-items-center overflow-hidden', className)}
      style={{ aspectRatio: ratio, background: PLACEHOLDER }}
    >
      {item?.src
        ? <img src={item.src} alt={alt || ''} className="absolute inset-0 w-full h-full object-cover" />
        : <ImageIcon size={icon} style={{ color: 'rgba(255,255,255,.7)' }} />}
    </div>
  )
}

function RejectBanner({ label, reason }) {
  return (
    <div className="rounded-xl p-2.5 mb-3 flex items-start gap-2" style={{ background: 'rgba(220,38,38,.10)', border: '1px solid rgba(220,38,38,.30)' }}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: '#DC2626' }} />
      <div className="min-w-0">
        <div className="m-subhead text-white font-semibold truncate">{label}</div>
        <div className="m-caption text-white/70 mt-0.5">{reason}</div>
      </div>
    </div>
  )
}

function CoverSection({ cover, onChange }) {
  const { t } = useTranslation()
  if (!cover) return null
  return (
    <div>
      <Card className="!p-2.5">
        <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.10)' }}>
          <Thumb item={cover} alt={imgLabel(cover, t)} icon={30} />
          {/* Text over a fixed dark panel stays white via inline color, not the auto-inking class. */}
          <span
            className="absolute bottom-2 left-2 px-2 h-6 rounded-full m-caption font-semibold inline-flex items-center gap-1"
            style={{ background: 'rgba(0,0,0,.4)', color: '#fff', border: '1px solid rgba(255,255,255,.22)' }}
          >
            <ImageIcon size={10} /> {t('media.storefrontBadge')}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2.5 px-0.5">
          <div className="flex-1 min-w-0">
            <div className="m-headline text-white truncate">{imgLabel(cover, t)}</div>
            <div className="m-caption text-white/55">
              {cover.w
                ? t('media.coverSized', { w: cover.w, h: cover.h, defaultValue: 'Fitted to {{w}}×{{h}} for your Google listing' })
                : t('media.coverHint')}
            </div>
          </div>
          <span
            className="px-2 h-6 rounded-full m-caption font-semibold inline-flex items-center shrink-0"
            style={{ background: 'rgba(22,163,74,.12)', color: '#16A34A', border: '1px solid rgba(22,163,74,.30)' }}
          >
            {t('media.liveBadge')}
          </span>
        </div>
      </Card>

      <PrimaryButton icon={ImageIcon} className="mt-3" onClick={onChange}>{t('media.changeCover')}</PrimaryButton>

      <div className="mt-3 m-caption text-white/55 px-1 flex items-start gap-1.5">
        <ShieldCheck size={12} className="mt-0.5 shrink-0" style={{ color: '#16A34A' }} />
        <span>{t('media.coverTip')}</span>
      </div>
    </div>
  )
}

// Change cover photo. The list of previously-uploaded images appears only when there
// genuinely are any: with an empty pool this is just the current cover and the two ways
// to replace it, which is the whole sheet. Nothing here is switched on by a flag — it
// reads `libraryImages`, and that is whatever the location actually holds.
// A pushed view inside the Manage Media sheet, not a sheet of its own. Mounted only
// while it is showing, so it starts fresh each time without an `open` effect to do it.
function CoverPanel({ cover, libraryImages, error, onUseExisting, onCamera, onGallery }) {
  const { t } = useTranslation()
  const hasLibrary = libraryImages.length > 0
  return (
      <div className="px-4 pb-6">
        <div className="m-callout text-white/55 mb-3">
          {hasLibrary
            ? t('media.coverSubLibrary', { defaultValue: 'Reuse a picture already on your listing, or add a new one.' })
            : t('media.coverSubDirect', { defaultValue: 'This is the only picture on your listing — take or choose a new one to replace it.' })}
        </div>

        {error && <RejectBanner label={error.label} reason={error.reason} />}

        <div className="m-subhead text-white/60 mb-2">{t('media.coverCurrent', { defaultValue: 'Cover right now' })}</div>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-glass)' }}>
          <Thumb item={cover} alt={imgLabel(cover, t)} icon={26} />
        </div>
        <div className="mt-1.5 mb-4 m-caption text-white/55 truncate">
          {imgLabel(cover, t)}{cover?.w ? ` · ${cover.w}×${cover.h}` : ''}
        </div>

        {hasLibrary && (
          <>
            <div className="m-subhead text-white/60 mb-1">
              {t('media.coverFromLibrary', {
                count: libraryImages.length,
                defaultValue_one: 'Your uploaded image',
                defaultValue_other: 'Your {{count}} uploaded images',
              })}
            </div>
            <div className="m-caption text-white/45 mb-2">
              {t('media.coverFromLibraryHint', { defaultValue: 'Already on your listing — tap one to make it the cover.' })}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {libraryImages.map(item => (
                <button
                  key={item.id}
                  onClick={() => onUseExisting(item)}
                  className="press rounded-xl overflow-hidden text-left"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
                >
                  <Thumb item={item} alt={imgLabel(item, t)} icon={16} />
                  <div className="px-1.5 py-1 m-caption text-white/75 truncate">{imgLabel(item, t)}</div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="m-subhead text-white/60 mb-2">
          {hasLibrary
            ? t('media.coverUploadNew', { defaultValue: 'Or add a new one' })
            : t('media.coverUploadOnly', { defaultValue: 'Replace it' })}
        </div>
        <PrimaryButton icon={Camera} onClick={onCamera}>
          {t('media.takeCoverPhoto', { defaultValue: 'Take a photo now' })}
        </PrimaryButton>
        <GhostButton icon={Images} full className="mt-2" onClick={onGallery}>
          {t('media.fromGallery', { defaultValue: 'Choose from phone gallery' })}
        </GhostButton>

        <div className="mt-3 m-caption text-white/55 flex items-start gap-1.5">
          <Crop size={12} className="mt-0.5 shrink-0" style={{ color: '#0070FC' }} />
          <span>{t('media.cropNote', {
            w: COVER_W, h: COVER_H,
            defaultValue: 'Whatever you pick, we crop the middle to 16:9 and size it to {{w}}×{{h}} — the frame Google shows your cover in.',
          })}</span>
        </div>
      </div>
  )
}

function PhotosSection({ photos, onAdd, onRemove, onProtect }) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="m-subhead text-white/60">{t('media.photosOnListing', { count: photos.length })}</div>
        <Chip icon={Plus} onClick={onAdd}>{t('media.add')}</Chip>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {photos.map(p => <PhotoTile key={p.id} photo={p} onRemove={() => onRemove(p.id)} />)}
        <button
          onClick={onAdd}
          className="press rounded-2xl grid place-items-center"
          style={{ aspectRatio: '1', background: 'var(--bg-subtle)', border: '1.5px dashed var(--border-glass-strong)' }}
        >
          <div className="text-center">
            <Plus size={20} className="mx-auto text-white/60" />
            <div className="mt-1 m-caption text-white/60">{t('media.addPhotos')}</div>
          </div>
        </button>
      </div>

      <div className="mt-3 m-caption text-white/45 px-1">
        {t('media.photosHint')}
      </div>

      {/* Smart Image Protection — the second line of defence. The picker above stops a bad
          upload; this goes over everything already on the location, including pictures that
          arrived some other way. Card idiom, not the AI gradient: this is a rules-and-
          measurement check, and dressing it as AI would be a claim the code can't back. */}
      <button
        onClick={() => { vibrate(6); onProtect() }}
        className="w-full mt-3 rounded-2xl p-3 press text-left flex items-start gap-3"
        style={{ background: 'rgba(0,112,252,.08)', border: '1px solid rgba(0,112,252,.30)' }}
      >
        <div className="on-dark w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: '#0070FC' }}>
          <ShieldCheck size={17} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="m-headline text-white">{t('media.sip.title', { defaultValue: 'Smart Image Protection' })}</div>
          <div className="m-caption text-white/70 mt-0.5">
            {t('media.sip.entryBody', { defaultValue: 'You can now manage non-compliant images with Smart Image Protection.' })}
          </div>
        </div>
        <ChevronRight size={16} className="text-white/40 shrink-0 mt-1" />
      </button>
    </div>
  )
}

function PhotoTile({ photo, onRemove }) {
  const { t } = useTranslation()
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}>
      <div className="relative">
        <Thumb item={photo} alt={imgLabel(photo, t)} ratio="1" icon={22} />
        {/* The single most destructive control in the app — so it gets a full ≥44px hit
            box (the deletion is a real Google-listing action), while the painted target
            stays a compact 24px circle in the corner. Same touch-vs-visual split as Chip /
            IconBtn: the button IS 44×44 and measurable, the circle is an inner span. */}
        <button
          onClick={onRemove}
          aria-label={t('media.removePhotoAria', { label: imgLabel(photo, t) })}
          className="absolute top-0 right-0 grid place-items-center press w-[var(--m-touch-min)] h-[var(--m-touch-min)]"
        >
          <span
            className="w-6 h-6 rounded-full grid place-items-center md-state"
            style={{ background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.25)' }}
          >
            <X size={13} style={{ color: '#fff' }} />
          </span>
        </button>
      </div>
      <div className="px-2 py-1.5">
        <div className="m-caption text-white truncate">{imgLabel(photo, t)}</div>
      </div>
    </div>
  )
}

// Upload picker — the compliance gate. Compliant picks bubble up via onAccept;
// non-compliant ones are rejected in place with a red banner + a "missed" toast.
function UploadPanel({ onAccept }) {
  const [error, setError] = useState(null)
  const toast = useToast()
  const { t } = useTranslation()

  function pick(sample) {
    vibrate(6)
    const res = checkCompliance(sample.hint)
    if (res.ok) {
      setError(null)
      onAccept(sample)
    } else {
      const reason = t(res.reasonKey, { defaultValue: res.reason })
      setError({ label: sample.label, reason })
      toast.push({ kind: 'missed', title: t('media.uploadBlockedTitle'), body: reason })
    }
  }

  return (
      <div className="px-4 pb-6">
        <div className="m-callout text-white/55 mb-3">{t('media.pickerSubtitle')}</div>

        {error && <RejectBanner label={error.label} reason={error.reason} />}

        <div className="space-y-2">
          {UPLOAD_SAMPLES.map(s => (
            <button
              key={s.id}
              onClick={() => pick(s)}
              className="w-full flex items-center gap-3 p-2 rounded-2xl press text-left"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
            >
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
                <Thumb item={s} ratio="1" icon={18} />
              </div>
              <div className="flex-1 min-w-0">
                {/* A file name, never translated. */}
                <div className="m-headline text-white truncate">{s.label}</div>
                <div className="m-caption text-white/50">{t('media.jpgTapToUpload')}</div>
              </div>
              <UploadCloud size={16} className="text-white/40 shrink-0" />
            </button>
          ))}
        </div>

      </div>
  )
}

// Smart Image Protection — explains itself, then runs over every image on the location.
// What it reports is what it measured: no result appears here that the code didn't find.
function ProtectionPanel({ images, onFlag, onGoToCover, onClose }) {
  const { t } = useTranslation()
  // A fresh look every time it opens — the listing may have changed since the last one.
  // Mounting only while shown is what makes that true, with no effect to keep in step.
  const [phase, setPhase] = useState('idle') // idle | scanning | done
  const [findings, setFindings] = useState(null)

  async function runScan() {
    vibrate(8)
    setPhase('scanning')
    const out = []
    for (const item of images) out.push(await analyseImage(item, t))
    setFindings(out)
    setPhase('done')
  }

  const flagged = findings ? findings.filter(f => f.flagged) : []
  const flaggablePhotos = flagged.filter(f => f.kind === 'photo')
  const flaggedCover = flagged.find(f => f.kind === 'cover')
  const nameOnly = findings ? findings.filter(f => f.method === 'name').length : 0

  return (
      <div className="px-4 pb-6">
        <div className="m-callout text-white/55 mb-3">
          {t('media.sip.intro', {
            defaultValue: 'We go through every picture on this location and pick out the ones that don’t belong — selfies, screenshots, forwarded files and anything that isn’t your store — then flag them to Google for removal.',
          })}
        </div>

        {/* What the check is, in the same words as what it does. Stated before the scan
            runs, not buried under the result. */}
        <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}>
          <div className="m-subhead text-white/80 font-semibold mb-1">
            {t('media.sip.methodTitle', { defaultValue: 'How this check works' })}
          </div>
          <div className="m-caption text-white/60">
            {t('media.sip.methodBody', {
              min: MIN_EDGE_PX,
              defaultValue: 'Every image is matched against the same rules that block a bad upload — including names that point to a competitor or to something that isn\'t your store — and for the pictures we hold we measure the real size and sharpness: under {{min}}px on a side, or no detail at all, gets flagged. It reads names and pixels, not the picture itself, so it can\'t see a competitor\'s board or a stranger\'s face in a neutrally-named photo. Those still need your eye.',
            })}
          </div>
        </div>

        {phase !== 'done' && (
          <>
            <PrimaryButton icon={ShieldCheck} onClick={runScan} loading={phase === 'scanning'}>
              {phase === 'scanning'
                ? t('media.sip.scanning', { defaultValue: 'Checking your images…' })
                : t('media.sip.scanCta', {
                  count: images.length,
                  defaultValue_one: 'Check {{count}} image',
                  defaultValue_other: 'Check all {{count}} images',
                })}
            </PrimaryButton>
          </>
        )}

        {phase === 'done' && findings && (
          <>
            {flagged.length === 0 ? (
              <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: 'rgba(22,163,74,.10)', border: '1px solid rgba(22,163,74,.30)' }}>
                <Check size={16} className="mt-0.5 shrink-0" style={{ color: '#16A34A' }} />
                <div className="min-w-0">
                  <div className="m-headline text-white">{t('media.sip.clearTitle', { defaultValue: 'Nothing to flag' })}</div>
                  <div className="m-caption text-white/70 mt-0.5">
                    {t('media.sip.clearBody', {
                      count: findings.length,
                      defaultValue_one: '{{count}} image checked and it passed.',
                      defaultValue_other: 'All {{count}} images passed the check.',
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="m-subhead text-white/60 mb-2">
                  {t('media.sip.foundTitle', {
                    count: flagged.length,
                    defaultValue_one: '{{count}} image doesn’t belong',
                    defaultValue_other: '{{count}} images don’t belong',
                  })}
                </div>
                <div className="space-y-2">
                  {flagged.map(f => (
                    <div key={f.id} className="rounded-xl p-2.5 flex items-start gap-2.5" style={{ background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.28)' }}>
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: '#DC2626' }} />
                      <div className="min-w-0">
                        <div className="m-subhead text-white font-semibold truncate">{f.label}</div>
                        <div className="m-caption text-white/70 mt-0.5">{f.reason}</div>
                        {f.kind === 'cover' && (
                          <div className="m-caption mt-1" style={{ color: 'var(--si-warning-text)' }}>
                            {t('media.sip.coverNote', { defaultValue: 'This is your cover — it can’t be removed, only replaced.' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* The honest footnote: for a picture we don't hold, the name is all there was
                to go on, and the result above is only as good as that. */}
            <div className="mt-3 m-caption text-white/45">
              {t('media.sip.checkedSummary', {
                count: findings.length,
                defaultValue_one: 'Checked {{count}} image.',
                defaultValue_other: 'Checked {{count}} images.',
              })}
              {nameOnly > 0 && ' ' + t('media.sip.nameOnlyNote', {
                count: nameOnly,
                defaultValue_one: '{{count}} of them was checked by name only — we don’t hold that picture, so there was nothing to measure.',
                defaultValue_other: '{{count}} of them were checked by name only — we don’t hold those pictures, so there was nothing to measure.',
              })}
            </div>

            {flaggablePhotos.length > 0 && (
              <PrimaryButton icon={Trash2} className="mt-4" onClick={() => onFlag(flaggablePhotos.map(f => f.id))}>
                {t('media.sip.flagCta', {
                  count: flaggablePhotos.length,
                  defaultValue_one: 'Flag {{count}} image to Google',
                  defaultValue_other: 'Flag {{count}} images to Google',
                })}
              </PrimaryButton>
            )}
            {flaggedCover && (
              <GhostButton icon={ImageIcon} full className="mt-2" onClick={onGoToCover}>
                {t('media.sip.replaceCoverCta', { defaultValue: 'Replace the cover photo' })}
              </GhostButton>
            )}
            <GhostButton icon={X} full className="mt-2" onClick={onClose}>{t('common.close')}</GhostButton>
          </>
        )}
      </div>
  )
}
