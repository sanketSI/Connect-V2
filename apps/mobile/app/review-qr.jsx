// ============================================================
// REVIEW QR — the code a buyer at the counter scans to leave a Google review.
//
// PM feedback 10: "Add QR Scanner, [it] is an easy way for a store manager to be able to
// allow buyers to scan the code and to add a review on their Google Business Profile.
// Again, this was there in the previous build of the app. It got stripped in this
// version." Restored, and lib/features.js now carries reviewQr as in-scope rather than
// !IS_MVP.
//
// SAME ENCODER AS WEB. apps/web/src/screens/ReviewQrSheet.jsx draws the `qrcode` package
// to a <canvas>; there is no canvas on React Native, but the same package emits an SVG
// string, which react-native-svg renders. So the two platforms encode with one library
// and a code scanned off the phone and a code scanned off the printed sheet are the same
// code — rather than a second QR implementation that could disagree about the URL.
//
// `qrcode` is not in apps/mobile/package.json: it hoists to the repo root as apps/web's
// dependency, and Metro's nodeModulesPaths reaches the root second (see metro.config.js).
// That is the documented resolution order, not an accident.
//
// THE LINK IS storeReviewLink() — the same one the Reviews tab's "Review link" tab hands
// out over WhatsApp. One code per listing, and it opens that store's Google review box.
// ============================================================
import { useEffect, useState } from 'react'
import { View, Text, Share } from 'react-native'
import { SvgXml } from 'react-native-svg'
import QRCode from 'qrcode'
import { QrCode as QrIcon, Share2, MapPin } from 'lucide-react-native'
import { storeReviewLink } from '@connect/core'
import { Screen, Card, Title, Body, Caption, PrimaryButton } from '../components/UI.jsx'
import { BackButton, HeaderRight } from '../components/Header.jsx'
import { useSession } from '../lib/session.js'
import { vibrate } from '../lib/haptics.js'

export default function ReviewQrScreen() {
  const session = useSession()
  const store = session.store
  const link = storeReviewLink(store)

  const [svg, setSvg] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!link) { setFailed(true); return undefined }
    QRCode.toString(link, { type: 'svg', margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then(out => { if (!cancelled) setSvg(out) })
      // A QR that failed to encode must SAY so. A blank white square is the one outcome
      // that would have a manager taping nothing to their counter.
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [link])

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BackButton />
        <HeaderRight />
      </View>

      {/* Translator TODO throughout: the catalogs carry no QR strings. */}
      <Title className="mt-4">Review QR</Title>
      <Caption className="mt-0.5">Buyers scan this to leave you a Google review.</Caption>

      {store && !store.aggregate ? (
        <View className="flex-row items-center gap-1.5 mt-2">
          <MapPin size={12} color="#93A0C8" />
          <Caption numberOfLines={1}>{store.name} · {store.branch}</Caption>
        </View>
      ) : null}

      <Card className="mt-4 items-center !p-5">
        {svg ? (
          // White plate behind the code regardless of theme: a QR inverted on a dark
          // card is a QR most scanners refuse.
          <View className="rounded-2xl bg-white p-4">
            <SvgXml xml={svg} width={240} height={240} />
          </View>
        ) : failed ? (
          <View className="items-center py-8">
            <QrIcon size={24} color="#93A0C8" />
            <Body className="mt-2 text-center">This code could not be generated.</Body>
            <Caption className="mt-1 text-center">
              {store?.aggregate
                ? 'Pick a single store first — a review code belongs to one listing.'
                : 'Try again from this screen.'}
            </Caption>
          </View>
        ) : (
          <View className="py-16"><Caption>Generating…</Caption></View>
        )}

        {link ? <Caption className="mt-3 text-center" numberOfLines={1}>{link}</Caption> : null}
      </Card>

      {link ? (
        <View className="mt-4">
          <PrimaryButton
            icon={Share2}
            onPress={() => {
              vibrate(10)
              // The OS share sheet — printing is not something a phone does, so sharing
              // the link is the honest equivalent of the web's Download.
              Share.share({ message: link }).catch(() => {})
            }}
          >
            Share link
          </PrimaryButton>
        </View>
      ) : null}
    </Screen>
  )
}
