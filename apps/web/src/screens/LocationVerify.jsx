import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, MapPin, Check, Camera, Navigation, ShieldCheck,
  Crosshair, Lock, Store,
} from 'lucide-react'
import { Card, PrimaryButton, GhostButton } from '../components/UI.jsx'
import { computeLocationFlags, metersBetween, verifyLocation } from '@connect/core'
import { track } from '@connect/core/analytics.js'
import { useToast } from '../components/Toast.jsx'

// The single rule this screen enforces: the store manager's GPS reading, taken at the
// storefront, must land within this many metres of the lat/long our system holds for the
// store. Inside it → matching → verified. Outside it → the listing is wrong and needs
// verifying. Every distance and threshold on screen is measured against this, never typed in.
const GPS_TOLERANCE_M = 50
const TOTAL_STEPS = 3

function fmtCoord(c) {
  return c ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : '—'
}
function fmtBytes(n) {
  if (n == null) return ''
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`
  return `${n} B`
}

// ── Real EXIF GPS reader ───────────────────────────────────────────────────────────
// The photo step exists to match the lat/long the camera baked into the picture against
// the lat/long the phone's GPS reported. That claim only holds if we genuinely read the
// file, so we parse it: JPEG markers → APP1 "Exif\0\0" → TIFF header → IFD0 → GPS IFD.
// Returns null whenever the file carries no location — a case the UI states plainly.

const TYPE_BYTES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

// One IFD → Map of tag → { count, at }, where `at` is the absolute byte offset of its value.
function readIfd(view, tiff, at, le) {
  const out = new Map()
  if (at + 2 > view.byteLength) return out
  const entries = view.getUint16(at, le)
  for (let i = 0; i < entries; i++) {
    const e = at + 2 + i * 12
    if (e + 12 > view.byteLength) break
    const type = view.getUint16(e + 2, le)
    const count = view.getUint32(e + 4, le)
    const bytes = (TYPE_BYTES[type] || 1) * count
    // Values of 4 bytes or less sit inline; anything larger is addressed from the TIFF header.
    out.set(view.getUint16(e, le), { count, at: bytes > 4 ? tiff + view.getUint32(e + 8, le) : e + 8 })
  }
  return out
}

function readRationals(view, at, n, le) {
  const out = []
  for (let i = 0; i < n; i++) {
    const p = at + i * 8
    if (p + 8 > view.byteLength) return null
    const den = view.getUint32(p + 4, le)
    if (!den) return null
    out.push(view.getUint32(p, le) / den)
  }
  return out
}

// EXIF stores a coordinate as three rationals: degrees, minutes, seconds.
function toDegrees(parts) {
  return parts && parts.length >= 3 ? parts[0] + parts[1] / 60 + parts[2] / 3600 : null
}

function readTiffGps(view, tiff) {
  if (tiff + 8 > view.byteLength) return null
  const order = view.getUint16(tiff)
  if (order !== 0x4949 && order !== 0x4D4D) return null
  const le = order === 0x4949                                  // "II" little-endian, "MM" big-endian
  if (view.getUint16(tiff + 2, le) !== 0x002A) return null
  const gpsPtr = readIfd(view, tiff, tiff + view.getUint32(tiff + 4, le), le).get(0x8825)
  if (!gpsPtr) return null                                     // no GPS IFD in this file
  const gps = readIfd(view, tiff, tiff + view.getUint32(gpsPtr.at, le), le)
  const latRec = gps.get(0x0002), lngRec = gps.get(0x0004)
  if (!latRec || !lngRec) return null
  const lat = toDegrees(readRationals(view, latRec.at, 3, le))
  const lng = toDegrees(readRationals(view, lngRec.at, 3, le))
  if (lat == null || lng == null) return null
  const ref = (tag, dflt) => (gps.has(tag) ? String.fromCharCode(view.getUint8(gps.get(tag).at)) : dflt)
  return {
    lat: ref(0x0001, 'N') === 'S' ? -lat : lat,               // GPSLatitudeRef
    lng: ref(0x0003, 'E') === 'W' ? -lng : lng,               // GPSLongitudeRef
  }
}

/** {lat,lng} the camera saved inside a JPEG, or null when it saved none. */
async function readPhotoGps(file) {
  try {
    const view = new DataView(await file.arrayBuffer())
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null   // not a JPEG
    let at = 2
    while (at + 4 <= view.byteLength) {
      if (view.getUint8(at) !== 0xFF) return null
      const marker = view.getUint8(at + 1)
      if (marker === 0xFF) { at += 1; continue }              // fill byte before the next marker
      if (marker === 0xDA) return null                        // image data starts; no Exif found
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { at += 2; continue }  // no payload
      // The APP1 segment whose payload opens with "Exif" is the one we want.
      if (marker === 0xE1 && at + 10 <= view.byteLength && view.getUint32(at + 4) === 0x45786966) {
        return readTiffGps(view, at + 10)                     // skip "Exif\0\0"
      }
      at += 2 + view.getUint16(at + 2)
    }
  } catch { /* unreadable file — same outcome as "no location saved" */ }
  return null
}

// Dealer-led, presence-gated location verification (Feature 4).
export default function LocationVerify({ location, onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  // The pincode/state consistency check still colours the address inputs in step 1 so the
  // manager can see which field looks wrong. It is not a reason to verify — the GPS rule is.
  const addressFlag = computeLocationFlags(location).some(f => f.type === 'address')

  // Presence gate — reads real device GPS. No reading, no verification: the rule is
  // "the manager's GPS against our stored lat/long", so standing in for the GPS with a
  // number we already had would make every distance on this screen a fiction.
  const [acquiring, setAcquiring] = useState(false)
  const [gpsError, setGpsError] = useState(null)   // 'denied' | 'unsupported'
  const [deviceCoords, setDeviceCoords] = useState(null)
  const present = !!deviceCoords

  // Step wizard state
  const [step, setStep] = useState(1)
  const [addr, setAddr] = useState({
    address: location.address || '', pincode: location.pincode || '',
    city: location.city || '', state: location.state || '', landmark: location.landmark || '',
  })
  const [corrected, setCorrected] = useState(null) // lat/lng after the pin is snapped to GPS
  const [photo, setPhoto] = useState(null)         // real captured image + its own EXIF location

  const cameraRef = useRef(null)
  const sentOutcomes = useRef(new Set())

  // THE RULE: measure the manager's GPS against the lat/long our system holds for the store.
  const gpsDistance = deviceCoords ? metersBetween(deviceCoords, location.stated) : null
  const gpsMatches = gpsDistance != null && gpsDistance <= GPS_TOLERANCE_M

  // Where the store really is, as established by this visit: the snapped pin, else the reading.
  const finalCoord = corrected || deviceCoords

  const gpsAccuracy = Number.isFinite(deviceCoords?.accuracy) ? Math.max(1, Math.round(deviceCoords.accuracy)) : null
  const driftOver = !corrected && !gpsMatches
  const driftLabel = corrected
    ? (gpsAccuracy != null
      ? t('verify.pinnedToGps', { accuracy: gpsAccuracy })
      : t('verify.pinnedToGpsPlain', { defaultValue: 'Pinned to your GPS position' }))
    : t('verify.driftFromAddress', { meters: gpsDistance, limit: GPS_TOLERANCE_M })

  const stepDone = (n) => {
    if (n === 2) return !!corrected
    if (n === 3) return !!photo
    return step > n
  }
  const doneCount = [1, 2, 3].filter(stepDone).length
  const allDone = doneCount === TOTAL_STEPS
  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS))

  // Read real device GPS. A denial leaves us with nothing to compare, so it surfaces as an
  // error and the gate stays shut — there is no honest way to continue without a reading.
  function startPresence() {
    if (!navigator.geolocation) { setGpsError('unsupported'); trackOutcome('gps_unsupported'); return }
    setGpsError(null)
    setAcquiring(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setAcquiring(false)
      },
      () => { setAcquiring(false); setGpsError('denied'); trackOutcome('gps_denied') },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function snapPin() {
    setCorrected({ lat: deviceCoords.lat, lng: deviceCoords.lng })
  }

  async function onPickPhoto(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // allow re-taking the same file
    if (!file) return
    const exif = await readPhotoGps(file)
    const url = URL.createObjectURL(file)
    const img = new Image()
    const keep = (dims) => setPhoto(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return {
        url, name: file.name, size: file.size, ...dims,
        exif,
        exifDistance: exif ? metersBetween(exif, deviceCoords) : null,
      }
    })
    img.onload = () => keep({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => keep({})
    img.src = url
  }

  // ── Funnel telemetry ─────────────────────────────────────────────────────────────
  // One event, one `result`: this screen has exactly four ways to end, and a pilot that
  // only counts the happy one cannot tell "nobody needed it" from "everybody bounced at
  // the GPS prompt". Ids, a rounded distance and a step count go out; the lat/long never
  // does (the analytics schema declares no coordinate prop, and its sanitiser drops any
  // key that looks like one — see packages/core/analytics.js).
  function trackOutcome(result) {
    // Once per outcome per visit: a manager who taps "Try again" three times after a
    // denial produced one blocked verification, not three.
    if (sentOutcomes.current.has(result)) return
    sentOutcomes.current.add(result)
    track('location_verification_completed', {
      location_id: location.id,
      result,
      gps_delta_m: gpsDistance == null ? undefined : Math.round(gpsDistance),
      steps_done: doneCount,
      photo_exif_match: photo?.exif ? photo.exifDistance <= GPS_TOLERANCE_M : undefined,
    })
  }

  function runVerification() {
    // Persist the corrected address + the on-site GPS position so the store clears its flag.
    verifyLocation(location.id, {
      address: addr.address, pincode: addr.pincode, city: addr.city, state: addr.state, landmark: addr.landmark,
      stated: { lat: finalCoord.lat, lng: finalCoord.lng },
      actual: { lat: finalCoord.lat, lng: finalCoord.lng },
    })
    trackOutcome('verified')
    toast.push({ kind: 'success', title: t('verify.verified'), body: t('verify.verifiedBody', { branch: location.branch }) })
    onClose && onClose()
  }

  /** Left before finishing — the drop-off the funnel exists to measure. */
  function abandon() {
    trackOutcome(present ? 'abandoned' : 'not_at_store')
    onClose && onClose()
  }

  return (
    <div className="px-4 pb-6">
      {/* Header */}
      <div className="m-title2 text-white">{t('verify.title')}</div>
      <div className="m-callout text-white/55 mb-3">{location.name} · {location.branch}</div>

      {/* Why this needs verifying — one reason, and it is the rule itself. Before we hold a
          GPS reading we state the rule; once we do, we state what it actually measured. */}
      <div className="m-subhead text-white/60 mb-2">{t('verify.why')}</div>
      <ReasonRow
        tone={gpsDistance == null ? 'pending' : gpsMatches ? 'ok' : 'alert'}
        text={gpsDistance == null
          ? t('verify.reasonPending', {
            limit: GPS_TOLERANCE_M,
            defaultValue: "Not verified yet. We'll compare your GPS reading at the store against the lat/long saved in our system — more than {{limit}} m apart means the listing needs correcting.",
          })
          : gpsMatches
            ? t('verify.reasonMatch', {
              meters: gpsDistance, limit: GPS_TOLERANCE_M,
              defaultValue: 'Your GPS is {{meters}} m from the lat/long saved in our system — inside the {{limit}} m allowed.',
            })
            : t('verify.reasonMismatch', {
              meters: gpsDistance, limit: GPS_TOLERANCE_M,
              defaultValue: 'Your GPS is {{meters}} m from the lat/long saved in our system — more than the {{limit}} m allowed, so this location needs verifying.',
            })}
      />

      {/* Presence gate */}
      {!present ? (
        <Card className="!p-3.5" style={{ background: 'rgba(0,112,252,.08)', border: '1px solid rgba(0,112,252,.30)' }}>
          <div className="flex items-start gap-3">
            <div className="on-dark w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: '#0070FC' }}>
              <Store size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="m-headline text-white">{t('verify.storefrontTitle')}</div>
              <div className="m-callout text-white/70 mt-0.5">{t('verify.storefrontBody')}</div>
            </div>
          </div>
          {gpsError && (
            <div className="flex items-start gap-2.5 rounded-xl p-3 mt-3" style={{ background: 'rgba(220,38,38,.10)', border: '1px solid rgba(220,38,38,.30)' }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: '#DC2626' }} />
              <div className="m-callout text-white/85">
                {gpsError === 'unsupported'
                  ? t('verify.gpsUnsupported', { defaultValue: "This device can't share a GPS position, so we can't confirm you're at the store." })
                  : t('verify.gpsDenied', { defaultValue: "We couldn't read your GPS. Allow location access for this site and try again — this check only means something from the storefront." })}
              </div>
            </div>
          )}
          {gpsError !== 'unsupported' && (
            <PrimaryButton onClick={startPresence} loading={acquiring} icon={Navigation} className="mt-3">
              {acquiring
                ? t('verify.gettingLocation')
                : gpsError
                  ? t('verify.retryGps', { defaultValue: 'Try again' })
                  : t('verify.startCta')}
            </PrimaryButton>
          )}
          <GhostButton onClick={abandon} full className="mt-2">{t('verify.notAtStore')}</GhostButton>
        </Card>
      ) : (
        <>
          {/* Presence confirmed */}
          <div className="flex items-center gap-2 rounded-xl p-2.5 mb-3" style={{ background: 'rgba(22,163,74,.10)', border: '1px solid rgba(22,163,74,.30)' }}>
            <Check size={15} className="shrink-0" style={{ color: '#16A34A' }} />
            <div className="m-caption text-white/85">
              {t('verify.presenceOkSteps', {
                branch: location.branch, coords: fmtCoord(deviceCoords), total: TOTAL_STEPS,
                defaultValue: "You're at {{branch}}. Device position captured · {{coords}} — complete the {{total}} steps below.",
              })}
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-between mb-2">
            <div className="m-subhead text-white/60">{allDone ? t('verify.allDone') : t('verify.stepOf', { step: Math.min(step, TOTAL_STEPS), total: TOTAL_STEPS })}</div>
            <div className="m-caption text-white/45 m-tabular">{t('verify.doneCount', { done: doneCount, total: TOTAL_STEPS })}</div>
          </div>

          {/* Step 1 — Correct address details */}
          <StepShell n={1} title={t('verify.step1')} done={stepDone(1)} active={step === 1}>
            <div className="space-y-2.5">
              <Field label={t('verify.address')} value={addr.address} onChange={v => setAddr(a => ({ ...a, address: v }))} />
              <div className="grid grid-cols-2 gap-2.5">
                <Field label={t('verify.pincode')} value={addr.pincode} onChange={v => setAddr(a => ({ ...a, pincode: v }))} alert={addressFlag} />
                <Field label={t('verify.city')} value={addr.city} onChange={v => setAddr(a => ({ ...a, city: v }))} />
              </div>
              <Field label={t('verify.state')} value={addr.state} onChange={v => setAddr(a => ({ ...a, state: v }))} alert={addressFlag} />
              <Field label={t('verify.landmark')} value={addr.landmark} onChange={v => setAddr(a => ({ ...a, landmark: v }))} placeholder={t('verify.landmarkPlaceholder')} />
              <PrimaryButton onClick={next} icon={Check} className="!h-11 mt-0.5">{t('verify.saveDetails')}</PrimaryButton>
            </div>
          </StepShell>

          {/* Step 2 — Move the pin to the exact spot. Snapping it replaces the stored lat/long
              with the GPS reading, which is what closes the gap the rule measured. */}
          <StepShell n={2} title={t('verify.step2')} done={stepDone(2)} active={step === 2}>
            <div className="relative rounded-2xl overflow-hidden mb-2.5" style={{ height: 150, background: 'linear-gradient(135deg, rgba(0,112,252,.16), rgba(14,0,113,.34))', border: '1px solid var(--border-glass)' }}>
              <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
              <div className="absolute left-1/2 top-1/2 rounded-full" style={{ width: 76, height: 76, transform: 'translate(-50%,-50%)', border: '1px dashed rgba(255,255,255,.35)' }} />
              <div className="absolute" style={{ left: corrected ? '50%' : '63%', top: corrected ? '50%' : '36%', transform: 'translate(-50%,-100%)', transition: 'all .5s ease' }}>
                <MapPin size={30} fill={driftOver ? 'rgba(220,38,38,.25)' : 'rgba(22,163,74,.25)'} style={{ color: driftOver ? '#DC2626' : '#16A34A', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))' }} />
              </div>
            </div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="m-callout font-semibold" style={{ color: driftOver ? '#DC2626' : '#16A34A' }}>{driftLabel}</div>
              {corrected && <Check size={16} style={{ color: '#16A34A' }} />}
            </div>
            {!corrected ? (
              <PrimaryButton onClick={snapPin} icon={Crosshair} className="!h-11">
                {gpsMatches ? t('verify.confirmPin') : t('verify.snapPin')}
              </PrimaryButton>
            ) : (
              <PrimaryButton onClick={next} icon={Check} className="!h-11">{t('verify.looksRight')}</PrimaryButton>
            )}
          </StepShell>

          {/* Step 3 — Live storefront photo. Its own EXIF location is matched against the
              GPS reading from the gate, which is why it has to be shot here and now. */}
          <StepShell n={3} title={t('verify.stepPhoto', { defaultValue: 'Take a live storefront photo' })} done={stepDone(3)} active={step === 3}>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onPickPhoto} className="hidden" />
            {!photo ? (
              <>
                <div className="m-caption text-white/55 mb-2.5">
                  {t('verify.photoHintLive', { defaultValue: 'Take a photo at the entrance now. We read the location your camera saved into the photo and match it against your GPS reading.' })}
                </div>
                <PrimaryButton onClick={() => cameraRef.current?.click()} icon={Camera} className="!h-11">{t('verify.takePhoto')}</PrimaryButton>
              </>
            ) : (
              <>
                <div className="flex gap-3 items-center">
                  <img src={photo.url} alt={t('verify.storefrontAlt')} className="rounded-xl object-cover shrink-0" style={{ width: 78, height: 78, border: '1px solid var(--border-glass)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="m-subhead text-white truncate">{photo.name}</div>
                    <div className="m-caption text-white/50 mt-0.5 m-tabular">{photo.w ? `${photo.w}×${photo.h} · ` : ''}{fmtBytes(photo.size)}</div>
                    <PhotoGpsLine photo={photo} deviceCoords={deviceCoords} />
                  </div>
                </div>
                <GhostButton onClick={() => cameraRef.current?.click()} icon={Camera} full className="!h-10 mt-2.5">{t('verify.retake')}</GhostButton>
              </>
            )}
          </StepShell>

          {/* Run Verification — final on-site confirm (not a numbered step) */}
          <div className="mt-4">
            <PrimaryButton onClick={runVerification} disabled={!allDone} icon={ShieldCheck}>
              {t('verify.runVerification')}
            </PrimaryButton>
            <div className="mt-2 m-caption text-white/45 text-center flex items-center justify-center gap-1.5">
              <Lock size={11} /> {allDone ? t('verify.runHintDone') : t('verify.runHintPending', { done: doneCount, total: TOTAL_STEPS })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const REASON_TONES = {
  pending: { rgb: '202,138,4', color: 'var(--si-warning-text)', icon: AlertTriangle },
  alert: { rgb: '220,38,38', color: '#DC2626', icon: AlertTriangle },
  ok: { rgb: '22,163,74', color: '#16A34A', icon: Check },
}

function ReasonRow({ tone, text }) {
  const { rgb, color, icon: Icon } = REASON_TONES[tone]
  return (
    <div className="flex items-start gap-2.5 rounded-xl p-3 mb-3" style={{
      background: `rgba(${rgb},.10)`,
      border: `1px solid rgba(${rgb},.30)`,
    }}>
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color }} />
      <div className="m-callout text-white/85">{text}</div>
    </div>
  )
}

// What the photo actually proves. When the camera saved a location we match it against the
// GPS reading; when it saved none we say so, rather than printing the GPS reading back as
// though it had come out of the picture.
function PhotoGpsLine({ photo, deviceCoords }) {
  const { t } = useTranslation()
  if (!photo.exif) {
    return (
      <div className="m-caption mt-1 flex items-start gap-1 text-white/50">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        <span>{t('verify.exifNone', {
          coords: fmtCoord(deviceCoords),
          defaultValue: 'This photo carries no saved location — filed against your GPS reading at {{coords}}.',
        })}</span>
      </div>
    )
  }
  const ok = photo.exifDistance <= GPS_TOLERANCE_M
  return (
    <div className="m-caption mt-1 flex items-start gap-1" style={{ color: ok ? '#16A34A' : '#DC2626' }}>
      <MapPin size={12} className="mt-0.5 shrink-0" />
      <span>
        {ok
          ? t('verify.exifMatch', { meters: photo.exifDistance, defaultValue: 'Photo location matches your GPS · {{meters}} m apart' })
          : t('verify.exifMismatch', { meters: photo.exifDistance, defaultValue: 'Photo location is {{meters}} m from your GPS — retake it at the storefront.' })}
      </span>
    </div>
  )
}

function StepShell({ n, title, done, active, children }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl mb-2.5" style={{
      background: active ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.03)',
      border: active ? '1px solid rgba(0,112,252,.35)' : '1px solid var(--border-glass)',
      opacity: !active && !done ? 0.55 : 1,
    }}>
      <div className="flex items-center gap-2.5 p-3">
        <div className="w-7 h-7 rounded-full grid place-items-center shrink-0 m-subhead font-semibold" style={{
          background: done ? '#16A34A' : active ? '#0070FC' : 'rgba(255,255,255,.06)',
          color: done || active ? '#fff' : 'rgba(255,255,255,.6)',
          border: done || active ? 'none' : '1px solid var(--border-glass)',
        }}>
          {done ? <Check size={15} /> : n}
        </div>
        <div className="m-headline text-white flex-1">{title}</div>
        {done && <span className="m-caption font-semibold" style={{ color: '#16A34A' }}>{t('common.done')}</span>}
      </div>
      {active && <div className="px-3 pb-3.5">{children}</div>}
    </div>
  )
}

function Field({ label, value, onChange, alert, placeholder }) {
  return (
    <div>
      <div className="m-caption text-white/55 mb-1">{label}</div>
      <input
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full h-11 px-3.5 rounded-xl bg-transparent outline-none text-white m-callout"
        style={alert
          ? { background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.55)' }
          : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(0,112,252,.45)' }}
      />
    </div>
  )
}
