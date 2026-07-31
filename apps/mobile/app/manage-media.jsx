// ============================================================
// MANAGE MEDIA — ported from apps/web/src/screens/ManageMedia.jsx (the spec). This
// iteration carries the COVER and PHOTOS segments end to end on the real media library:
// one pool of images per location, the one marked `cover` is what Google shows on top,
// and changing the cover MOVES THE MARK — the outgoing cover drops back into the
// gallery pool, exactly the web's promoteToCover.
//
// Uploads are REAL now: the cover picker takes the device camera or gallery through
// expo-image-picker, runs the same compliance gate every upload passes (on the file
// name, exactly as web), centre-crops to the 1200×675 Google cover frame with
// expo-image-manipulator, and promotes the result. The photos panel mirrors the web's
// own behaviour faithfully: it is a picker over the seeded UPLOAD_SAMPLES, some of
// which the gate rejects — that is the demo the web ships, not a simplification. Seeded entries carry a
// label, not a file, so thumbs render the same neutral brand-dark panel the web uses
// (deliberately NOT the AI gradient, which is reserved for AI surfaces).
// ============================================================
import { useMemo, useState } from 'react'
import { View, Text, Pressable, Image, Alert } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image as ImageIcon, ShieldCheck, Trash2, Building2, ChevronRight, Check, Camera, UploadCloud, AlertTriangle } from 'lucide-react-native'
import { getMediaLibrary, getUploadSamples, checkCompliance, assignedStores, getStoreLocations } from '@connect/core'
import { Screen, Card, Title, Body, Caption, PrimaryButton, GhostButton } from '../components/UI.jsx'
import CreatePost from '../components/CreatePost.jsx'
import { BackButton } from '../components/Header.jsx'
import { useSession } from '../lib/session.js'
import { vibrate, notifySuccess } from '../lib/haptics.js'

const SEGMENTS = [
  { id: 'cover', labelKey: 'media.segCover', label: 'Cover photo' },
  { id: 'photos', labelKey: 'media.segPhotos', label: 'Photos' },
  { id: 'posts', labelKey: 'media.segPosts', label: 'Posts' },
]

function imgLabel(item, t) {
  return item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label
}

/** A real Image when the item carries a file, the brand-dark stand-in when it is a
    seeded label-only entry — same rule as the web Thumb. */
function Thumb({ item, t, ratio = 16 / 9, icon = 22 }) {
  if (item.src) {
    return (
      <Image
        source={{ uri: item.src }}
        className="w-full rounded-xl"
        style={{ aspectRatio: ratio }}
        accessibilityLabel={imgLabel(item, t)}
        resizeMode="cover"
      />
    )
  }
  return (
    <View
      className="w-full rounded-xl items-center justify-center bg-brand-indigo"
      style={{ aspectRatio: ratio }}
      accessibilityLabel={imgLabel(item, t)}
    >
      <ImageIcon size={icon} color="rgba(255,255,255,.5)" />
    </View>
  )
}

/** The web's RejectBanner — the gate's verdict, on screen and not only in a toast. */
function RejectBanner({ label, reason, t }) {
  return (
    <View className="rounded-card p-3 mb-3 bg-bad/10 border border-bad/30 flex-row items-start gap-2">
      <AlertTriangle size={15} color="#DC2626" />
      <View className="flex-1 min-w-0">
        <Caption className="font-hk-semi text-bad">{t('media.uploadBlockedTitle', { defaultValue: 'Upload blocked' })}</Caption>
        <Caption className="mt-0.5">{label} — {reason}</Caption>
      </View>
    </View>
  )
}

export default function ManageMediaScreen() {
  const { t } = useTranslation()
  const session = useSession()
  const params = useLocalSearchParams()
  const aggregate = !!session.store?.aggregate
  const [pickedId, setPickedId] = useState(typeof params.store === 'string' ? params.store : null)

  const store = aggregate
    ? (pickedId ? getStoreLocations().find(s => s.id === pickedId) : null)
    : session.store

  // Same rule as Business profile: a photo library belongs to ONE branch, so the
  // aggregate view asks rather than silently opening the flagship's.
  if (aggregate && !store) {
    return (
      <Screen>
        <BackButton />
        <Title className="mt-4">{t('profile.manageMedia', { defaultValue: 'Manage media' })}</Title>
        <Caption className="mt-1 mb-4">{t('profile.manageMediaSub', { defaultValue: 'Cover photo, gallery, posts' })}</Caption>
        {assignedStores().map(s => (
          <Card key={s.id} onPress={() => { vibrate(8); setPickedId(s.id) }} label={`${s.name} — ${s.branch}`} className="mb-2.5">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-blue/10 items-center justify-center">
                <Building2 size={17} color="#0355DB" />
              </View>
              <View className="flex-1 min-w-0">
                <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{s.name} — {s.branch}</Body>
                <Caption numberOfLines={1} className="mt-0.5">{s.address}</Caption>
              </View>
              <ChevronRight size={16} color="#93A0C8" />
            </View>
          </Card>
        ))}
      </Screen>
    )
  }

  return <ManageMediaBody storeId={store?.id} t={t} />
}

function ManageMediaBody({ storeId, t }) {
  const MEDIA_LIBRARY = useMemo(() => getMediaLibrary(storeId), [storeId])
  const [segment, setSegment] = useState('cover')
  const [library, setLibrary] = useState(() => MEDIA_LIBRARY.map(m => ({ ...m })))
  const [view, setView] = useState('main') // 'main' | 'cover' | 'upload'
  const [coverError, setCoverError] = useState(null)
  const [uploadError, setUploadError] = useState(null)

  // The 1200×675 Google cover frame (COVER_W/H in the web file). Centre-crop whatever
  // the camera hands us to 16:9, then resize down — the same fitToCover contract.
  async function fitToCover(asset) {
    const ratio = 1200 / 675
    const srcW = asset.width, srcH = asset.height
    let cropW = srcW, cropH = Math.round(srcW / ratio)
    if (cropH > srcH) { cropH = srcH; cropW = Math.round(srcH * ratio) }
    const originX = Math.round((srcW - cropW) / 2)
    const originY = Math.round((srcH - cropH) / 2)
    const out = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ crop: { originX, originY, width: cropW, height: cropH } }, { resize: { width: 1200, height: 675 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    )
    return { src: out.uri, w: 1200, h: 675, srcW, srcH }
  }

  async function pickCover(fromCamera) {
    vibrate(10)
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (res.canceled || !res.assets?.length) return
    const asset = res.assets[0]
    const name = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg'
    // The same gate every other upload passes — the data layer's rules, on the real name.
    const check = checkCompliance(name)
    if (!check.ok) {
      setCoverError({ label: name, reason: t(check.reasonKey, { defaultValue: check.reason }) })
      return
    }
    try {
      const fitted = await fitToCover(asset)
      setCoverError(null)
      promoteToCover({ id: `up-${asset.assetId || name}-${asset.fileSize || fitted.srcW}`, label: name, ...fitted })
    } catch {
      setCoverError({ label: name, reason: t('media.unreadableFile', { defaultValue: 'We couldn’t open this file as a picture. Choose a JPG or PNG.' }) })
    }
  }

  const cover = library.find(m => m.kind === 'cover')
  const photos = library.filter(m => m.kind === 'photo')
  const coverLibrary = library.filter(m => m.kind !== 'cover')

  // Promote `next` to cover, demote the outgoing one back into the gallery — it stays
  // an image of this store, so it stays in the pool and can be picked again.
  function promoteToCover(next) {
    setLibrary(list => [
      { ...next, kind: 'cover' },
      ...list.filter(m => m.id !== next.id).map(m => (m.kind === 'cover' ? { ...m, kind: 'photo' } : m)),
    ])
    notifySuccess()
    setView('main')
  }

  // PM feedback 4(i): "when delete a image, a confirmation comes to delete". A listing
  // photo is public, so removing one is asked about rather than done on a tap. Alert is
  // the platform's own confirmation here rather than a hand-built modal — it is what an
  // Android/iOS user already recognises as "this one is destructive".
  // Translator TODO: the catalogs carry no confirmation copy — media.photoRemovedTitle
  // describes the AFTERMATH, so reusing it would say "Photo removed" before it was.
  function removePhoto(id) {
    vibrate(6)
    Alert.alert(
      'Delete this photo?',
      'It will be taken off your listing.',
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            vibrate(12)
            setLibrary(list => list.filter(m => m.id !== id))
            notifySuccess()
          },
        },
      ],
    )
  }

  if (view === 'upload') {
    const samples = getUploadSamples()
    return (
      <Screen>
        <BackButton onPress={() => setView('main')} />
        <Title className="mt-4 mb-1">{t('media.pickerPhotosTitle', { defaultValue: 'Add store photos' })}</Title>
        <Caption className="mb-3">{t('media.pickerSubtitle', { defaultValue: 'Pick from your phone — every upload is quality-checked first.' })}</Caption>

        {uploadError && <RejectBanner label={uploadError.label} reason={uploadError.reason} t={t} />}

        {samples.map(sample => (
          <Card
            key={sample.id}
            onPress={() => {
              vibrate(6)
              const res = checkCompliance(sample.hint)
              if (res.ok) {
                setUploadError(null)
                setLibrary(list => [...list, { id: `up-${sample.id}`, kind: 'photo', label: sample.label }])
                notifySuccess()
                setView('main')
                setSegment('photos')
              } else {
                setUploadError({ label: sample.label, reason: t(res.reasonKey, { defaultValue: res.reason }) })
              }
            }}
            label={sample.label}
            className="mb-2 !p-2"
          >
            <View className="flex-row items-center gap-3">
              <View className="w-12">
                <Thumb item={sample} t={t} ratio={1} icon={16} />
              </View>
              <View className="flex-1 min-w-0">
                <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{sample.label}</Body>
                <Caption>{t('media.jpgTapToUpload', { defaultValue: 'JPG · tap to upload' })}</Caption>
              </View>
              <UploadCloud size={16} color="#93A0C8" />
            </View>
          </Card>
        ))}
      </Screen>
    )
  }

  if (view === 'cover') {
    return (
      <Screen>
        <BackButton onPress={() => setView('main')} />
        <Title className="mt-4 mb-1">{t('media.changeCover', { defaultValue: 'Change cover photo' })}</Title>
        <Caption className="mb-3">{t('media.coverSubLibrary', { defaultValue: 'Reuse a picture already on your listing, or add a new one.' })}</Caption>

        {coverError && <RejectBanner label={coverError.label} reason={coverError.reason} t={t} />}

        <PrimaryButton onPress={() => pickCover(true)}>
          {t('media.takeCoverPhoto', { defaultValue: 'Take a photo now' })}
        </PrimaryButton>
        <GhostButton onPress={() => pickCover(false)} className="mt-2 mb-3">
          {t('media.fromGallery', { defaultValue: 'Choose from phone gallery' })}
        </GhostButton>

        {coverLibrary.length > 0 && (
          <>
            <Caption className="font-hk-medium mt-2 mb-2">
              {t('media.coverFromLibrary', { count: coverLibrary.length, defaultValue_one: 'Your uploaded image', defaultValue_other: 'Your {{count}} uploaded images' })}
            </Caption>
            {coverLibrary.map(item => (
              <Card key={item.id} onPress={() => promoteToCover(item)} label={imgLabel(item, t)} className="mb-2.5 !p-2.5">
                <View className="flex-row items-center gap-3">
                  <View className="w-20">
                    <Thumb item={item} t={t} icon={16} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{imgLabel(item, t)}</Body>
                    {item.tag ? <Caption className="mt-0.5">{item.tagKey ? t(item.tagKey, { defaultValue: item.tag }) : item.tag}</Caption> : null}
                  </View>
                  <Check size={16} color="#93A0C8" />
                </View>
              </Card>
            ))}
          </>
        )}
      </Screen>
    )
  }

  return (
    <Screen>
      <BackButton />
      <Title className="mt-4">{t('profile.manageMedia', { defaultValue: 'Manage media' })}</Title>
      <Caption className="mt-1 mb-3">{t('profile.manageMediaSub', { defaultValue: 'Cover photo, gallery, posts' })}</Caption>

      {/* Segmented control — the web's three-segment bar, minus Posts until it works. */}
      <View className="flex-row rounded-xl bg-brand-blue/5 border border-hairline dark:border-d-hairline p-1 mb-4">
        {SEGMENTS.map(seg => {
          const on = segment === seg.id
          return (
            <Pressable
              key={seg.id}
              onPress={() => { vibrate(6); setSegment(seg.id) }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className={`flex-1 h-9 rounded-lg items-center justify-center ${on ? 'bg-card dark:bg-white/10' : ''}`}
            >
              <Text className={`text-[13px] font-hk-medium ${on ? 'text-ink dark:text-d-ink' : 'text-ink-3 dark:text-d-ink3'}`}>
                {t(seg.labelKey, { defaultValue: seg.label })}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {segment === 'cover' && cover && (
        <View>
          <Card className="!p-2.5">
            <View className="relative">
              <Thumb item={cover} t={t} icon={30} />
              <View className="absolute bottom-2 left-2 h-6 px-2 rounded-pill bg-black/40 border border-white/20 flex-row items-center gap-1">
                <ImageIcon size={10} color="#fff" />
                <Text className="text-[11px] font-hk-semi text-white">{t('media.storefrontBadge', { defaultValue: 'Storefront' })}</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-2 mt-2.5 px-0.5">
              <View className="flex-1 min-w-0">
                <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{imgLabel(cover, t)}</Body>
                <Caption className="mt-0.5">
                  {cover.w
                    ? t('media.coverSized', { w: cover.w, h: cover.h, defaultValue: 'Fitted to {{w}}×{{h}} for your Google listing' })
                    : t('media.coverHint', { defaultValue: 'The first photo customers see on Google' })}
                </Caption>
              </View>
              <View className="h-6 px-2 rounded-pill bg-ok/10 border border-ok/30 items-center justify-center">
                <Text className="text-[11px] font-hk-semi text-ok">{t('media.liveBadge', { defaultValue: 'Live' })}</Text>
              </View>
            </View>
          </Card>

          <PrimaryButton onPress={() => setView('cover')} className="mt-3">
            {t('media.changeCover', { defaultValue: 'Change cover photo' })}
          </PrimaryButton>

          <View className="flex-row items-start gap-1.5 mt-3 px-1">
            <ShieldCheck size={12} color="#16A34A" />
            <Caption className="flex-1">{t('media.coverTip', { defaultValue: 'Listings with a clear storefront photo get more direction requests.' })}</Caption>
          </View>
        </View>
      )}

      {segment === 'photos' && (
        <View>
          <PrimaryButton onPress={() => { setUploadError(null); setView('upload') }} className="mb-3">
            {t('media.addPhotos', { defaultValue: 'Add photos' })}
          </PrimaryButton>
          <Caption className="mb-2">
            {t('media.photosOnListing', { count: photos.length, defaultValue_one: '{{count}} photo on your listing', defaultValue_other: '{{count}} photos on your listing' })}
          </Caption>
          <View className="flex-row flex-wrap -mx-1">
            {photos.map(p => (
              <View key={p.id} className="w-1/2 px-1 mb-2">
                <Card className="!p-1.5">
                  <Thumb item={p} t={t} icon={16} />
                  <View className="flex-row items-center gap-1 mt-1.5 px-0.5">
                    <Caption numberOfLines={1} className="flex-1">{imgLabel(p, t)}</Caption>
                    <Pressable
                      onPress={() => removePhoto(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('media.removePhotoAria', { label: imgLabel(p, t), defaultValue: 'Remove {{label}}' })}
                      className="p-2 -m-1"
                    >
                      <Trash2 size={13} color="#DC2626" />
                    </Pressable>
                  </View>
                </Card>
              </View>
            ))}
          </View>
        </View>
      )}

      {segment === 'posts' && (
        <CreatePost storeId={storeId} onDone={() => setSegment('cover')} />
      )}
    </Screen>
  )
}
