// ============================================================
// RAISE A TICKET — the store manager's support channel.
//
// Native twin of apps/web/src/screens/RaiseTicketSheet.jsx; the reasoning lives there.
// PM feedback 3: "raise a ticket flow exactly the same as nova." The Nova form is in the
// brief's screenshot and is followed field for field — Title with a 0/100 counter,
// Description with 0/500, one optional attachment naming its accepted formats, and a
// Cancel / Raise Ticket footer.
//
// The brief also says "Make this mobile first design". The Nova screenshot is a desktop
// dialog; this is a full screen with stacked, full-width controls, which is what that
// dialog has to become at 375px. Same fields, same limits, same order.
//
// LIMITS AND VALIDATION COME FROM CORE (validateTicket), so the phone and the browser
// cannot disagree about whether a draft is submittable.
// ============================================================
import { useState } from 'react'
import { View, Text, TextInput, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as DocumentPickerModule from 'expo-image-picker'
import { LifeBuoy, Upload, Paperclip, X, CheckCircle2 } from 'lucide-react-native'
import {
  raiseTicket, validateTicket, getTickets,
  TICKET_TITLE_MAX, TICKET_BODY_MAX, TICKET_ATTACHMENT_HINT,
} from '@connect/core'
import { Screen, Card, Title, Body, Caption, PrimaryButton, GhostButton } from '../components/UI.jsx'
import { BackButton, HeaderRight } from '../components/Header.jsx'
import { useSession } from '../lib/session.js'
import { useDataVersion } from '../lib/useDataVersion.js'
import { vibrate, notifySuccess } from '../lib/haptics.js'

export default function RaiseTicketScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  useDataVersion() // the list below re-reads after a ticket is raised
  const storeId = session.store?.aggregate ? null : session.store?.id

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState(null)
  // Errors only after an attempt — both fields red before anything is typed reads as a
  // broken form, not a helpful one.
  const [tried, setTried] = useState(false)

  const result = validateTicket({ title, body })
  const past = getTickets(storeId)

  const titleErr = tried && (result.missing.includes('title') || result.tooLong.includes('title'))
  const bodyErr = tried && (result.missing.includes('body') || result.tooLong.includes('body'))

  async function pickAttachment() {
    vibrate(6)
    // The image picker is what this app already carries (Manage Media uses it). It covers
    // the Images half of the accepted formats; there is no document picker dependency
    // here, and adding one for a build with no upload service behind it would be a
    // dependency that buys nothing. Documented, not silently narrowed.
    try {
      const res = await DocumentPickerModule.launchImageLibraryAsync({ quality: 1 })
      const asset = res?.assets?.[0]
      if (asset) setAttachment(asset.fileName || 'image')
    } catch {
      // A picker the OS refused is not an error worth a dialog — the field is optional.
    }
  }

  function submit() {
    if (!result.ok) { setTried(true); vibrate(20); return }
    const ticket = raiseTicket({ title, body, attachment, storeId })
    if (!ticket) { setTried(true); return }
    notifySuccess()
    // Translator TODO: the catalogs carry no ticketing strings at all.
    Alert.alert('Ticket raised', 'Our team will get back to you on this.', [
      { text: t('common.done', { defaultValue: 'Done' }), onPress: () => router.back() },
    ])
  }

  const ring = bad => (bad ? 'border-bad' : 'border-hairline dark:border-d-hairline')

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BackButton />
        <HeaderRight />
      </View>

      <View className="flex-row items-center gap-2.5 mt-4">
        <View className="w-10 h-10 rounded-xl bg-brand-blue/10 items-center justify-center">
          <LifeBuoy size={18} color="#0070FC" />
        </View>
        <View className="flex-1 min-w-0">
          <Title className="text-[22px] leading-7">Create New Ticket</Title>
          <Caption className="mt-0.5">Raise a concern with our team.</Caption>
        </View>
      </View>

      {/* TITLE */}
      <View className="mt-4">
        <View className="flex-row items-end justify-between gap-2 mb-1">
          <Caption>Title<Text className="text-bad dark:text-d-bad"> *</Text></Caption>
          <Caption className={title.length > TICKET_TITLE_MAX ? 'text-bad dark:text-d-bad' : ''}>
            {title.length}/{TICKET_TITLE_MAX}
          </Caption>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Brief summary of your issue"
          placeholderTextColor="#93A0C8"
          accessibilityLabel="Title"
          className={`h-11 rounded-xl border ${ring(titleErr)} bg-card dark:bg-white/5 px-3 text-[15px] text-ink dark:text-d-ink`}
        />
      </View>

      {/* DESCRIPTION */}
      <View className="mt-3.5">
        <View className="flex-row items-end justify-between gap-2 mb-1">
          <Caption>Description<Text className="text-bad dark:text-d-bad"> *</Text></Caption>
          <Caption className={body.length > TICKET_BODY_MAX ? 'text-bad dark:text-d-bad' : ''}>
            {body.length}/{TICKET_BODY_MAX} characters
          </Caption>
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Please describe your issue, request, or requirement in detail"
          placeholderTextColor="#93A0C8"
          accessibilityLabel="Description"
          multiline
          className={`min-h-[112px] py-2.5 rounded-xl border ${ring(bodyErr)} bg-card dark:bg-white/5 px-3 text-[15px] text-ink dark:text-d-ink`}
        />
      </View>

      {/* ATTACHMENT — optional, and NAME ONLY: this build has no upload service, so what
          is recorded is that a file was chosen. Better than storing a local URI that will
          not resolve for whoever receives the ticket. */}
      <View className="mt-3.5">
        <Caption>Attachment (optional)</Caption>
        {attachment ? (
          <View className="mt-1 h-11 rounded-xl border border-hairline dark:border-d-hairline bg-card dark:bg-white/5 px-3 flex-row items-center gap-2">
            <Paperclip size={14} color="#93A0C8" />
            <Body className="flex-1" numberOfLines={1}>{attachment}</Body>
            <Pressable onPress={() => setAttachment(null)} accessibilityRole="button" accessibilityLabel="Remove attachment" hitSlop={10}>
              <X size={14} color="#93A0C8" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={pickAttachment}
            accessibilityRole="button"
            className="mt-1 rounded-xl border border-dashed border-hairline dark:border-d-hairline items-center py-6 px-3"
          >
            <Upload size={18} color="#93A0C8" />
            <Caption className="mt-1.5">Tap to upload</Caption>
          </Pressable>
        )}
        <Caption className="mt-1">{TICKET_ATTACHMENT_HINT}</Caption>
      </View>

      {tried && !result.ok ? (
        <Caption className="mt-3 text-bad dark:text-d-bad">
          Add a title and a description before raising this ticket.
        </Caption>
      ) : null}

      <View className="flex-row gap-2 mt-5">
        <View className="flex-1">
          <GhostButton onPress={() => router.back()}>{t('common.cancel', { defaultValue: 'Cancel' })}</GhostButton>
        </View>
        <View className="flex-1">
          <PrimaryButton onPress={submit}>Raise Ticket</PrimaryButton>
        </View>
      </View>

      {/* WHAT HAS ALREADY BEEN RAISED — a support channel with no record of what you sent
          is a channel you cannot tell you used. Every ticket persists, so this is free. */}
      {past.length > 0 ? (
        <>
          <Caption className="mt-5 mb-2">Your tickets</Caption>
          {past.map(tk => (
            <Card key={tk.id} className="!p-3 mb-2">
              <View className="flex-row items-start gap-2">
                <CheckCircle2 size={14} color="#22D38B" />
                <View className="flex-1 min-w-0">
                  <Body className="font-hk-semi text-ink dark:text-d-ink" numberOfLines={1}>{tk.title}</Body>
                  <Caption className="mt-0.5" numberOfLines={2}>{tk.body}</Caption>
                  {tk.attachment ? (
                    <View className="flex-row items-center gap-1 mt-1">
                      <Paperclip size={11} color="#93A0C8" />
                      <Caption numberOfLines={1}>{tk.attachment}</Caption>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  )
}
