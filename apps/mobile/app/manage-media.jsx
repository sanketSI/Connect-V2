// ============================================================
// MANAGE MEDIA — ported from apps/web/src/screens/ManageMedia.jsx (the spec). This
// iteration carries the COVER and PHOTOS segments end to end on the real media library:
// one pool of images per location, the one marked `cover` is what Google shows on top,
// and changing the cover MOVES THE MARK — the outgoing cover drops back into the
// gallery pool, exactly the web's promoteToCover.
//
// Named, not hidden: camera/gallery uploads (expo-image-picker + the compliance gate +
// 16:9 fitting) are the remaining iteration — their buttons are not drawn until they
// work. Seeded entries carry a
// label, not a file, so thumbs render the same neutral brand-dark panel the web uses
// (deliberately NOT the AI gradient, which is reserved for AI surfaces).
// ============================================================
import { useMemo, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, ShieldCheck, Trash2, Building2, ChevronRight, Check } from 'lucide-react-native'
import { getMediaLibrary, assignedStores, getStoreLocations } from '@connect/core'
import { Screen, Card, Title, Body, Caption, PrimaryButton } from '../components/UI.jsx'
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

/** The stand-in panel for a seeded image we hold a label for, not a file. */
function Thumb({ item, t, ratio = 16 / 9, icon = 22 }) {
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
  const [view, setView] = useState('main') // 'main' | 'cover'

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

  function removePhoto(id) {
    vibrate(10)
    setLibrary(list => list.filter(m => m.id !== id))
  }

  if (view === 'cover') {
    return (
      <Screen>
        <BackButton onPress={() => setView('main')} />
        <Title className="mt-4 mb-1">{t('media.changeCover', { defaultValue: 'Change cover photo' })}</Title>
        <Caption className="mb-3">{t('media.coverHint', { defaultValue: 'The first photo customers see on Google' })}</Caption>
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
