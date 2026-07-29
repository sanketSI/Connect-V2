// ============================================================
// CUSTOMER PAGE — the destination of an attended call, ported from the web's
// CustomerPage/CustomerDetail (Network.jsx + Customers.jsx). Same order the web page
// settled on after its design pass: one row of chrome, identity with the chance-to-buy
// folded in beside the name, About this customer, Lead status as a wrapping chip row
// (not five stacked rows), History, Notes, then the actions stacked full-width with
// Call back first — ringing the customer back is the job, the review link is the
// follow-up.
// ============================================================
import { useState } from 'react'
import { View, Text, TextInput, Pressable, Linking } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, PhoneCall, MessageCircle, PhoneIncoming, NotebookPen } from 'lucide-react-native'
import {
  getCustomerById, getLeads, LEAD_STATUSES, updateLeadStatus,
  getCustomerNotes, addCustomerNote, getCurrentUser,
} from '@connect/core'
import { Screen, Card, SectionLabel, Title, Body, Caption, Chip, PrimaryButton, GhostButton } from '../../components/UI.jsx'
import { BackButton, HeaderRight } from '../../components/Header.jsx'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { vibrate, notifySuccess } from '../../lib/haptics.js'

const BAND_KEY = { hot: 'common.hot', warm: 'common.warm', cool: 'common.cool', cold: 'common.cold' }
const BAND_CLASS = {
  hot: 'bg-bad/10 text-bad', warm: 'bg-[#CA8A04]/10 text-[#CA8A04]',
  cool: 'bg-brand-blue/10 text-primaryText', cold: 'bg-ink-3/10 text-ink-3',
}

export default function CustomerPage() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams()
  useDataVersion() // status + notes mutate in place; this page must follow
  const [noteText, setNoteText] = useState('')

  const customer = getCustomerById(id)
  if (!customer) return null

  // The lead this person is — status lives on the lead, not the customer record.
  const lead = getLeads().find(l => l.customerId === customer.id) || null
  const notes = getCustomerNotes(customer.id) || []
  const digits = (customer.phone || '').replace(/\D/g, '')
  const bandCls = BAND_CLASS[customer.band] || BAND_CLASS.cold

  function saveNote() {
    const text = noteText.trim()
    if (!text) return
    addCustomerNote(customer.id, text, getCurrentUser().name)
    setNoteText('')
    notifySuccess()
  }

  return (
    <Screen>
      {/* ONE row of chrome — back left, bell + avatar right (web commit d0ed173). */}
      <View className="flex-row items-center justify-between">
        <BackButton />
        <HeaderRight />
      </View>

      {/* Identity — chance-to-buy beside the name, not orphaned under the avatar. */}
      <View className="flex-row items-start gap-3 mt-4">
        <View className="w-14 h-14 rounded-full bg-brand-blue/10 items-center justify-center">
          <Text className="text-lg font-hk-bold text-primaryText dark:text-d-primaryText">
            {(customer.name || '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Title className="text-[24px] leading-7">{customer.name || customer.masked}</Title>
          {customer.name ? <Caption className="mt-0.5">{customer.masked}</Caption> : null}
          <View className="flex-row items-center gap-2 mt-1.5">
            <View className={`h-6 px-2 rounded-pill items-center justify-center ${bandCls.split(' ')[0]}`}>
              <Text className={`text-[11px] font-hk-semi ${bandCls.split(' ')[1]}`}>
                {t(BAND_KEY[customer.band] || 'common.cold', { defaultValue: customer.band })}
              </Text>
            </View>
            <Caption>
              {t('common.chanceToBuyTitle', { defaultValue: 'Chance to buy' })} · {customer.cli}/100
            </Caption>
          </View>
          <Caption className="mt-1">
            {customer.category ? t(customer.categoryKey, { defaultValue: customer.category }) : ''}
            {customer.value ? ` · ₹${(customer.value / 1000).toFixed(0)}K` : ''}
          </Caption>
        </View>
      </View>

      {/* About this customer — the AI read, plain heading aligned with the others. */}
      {(customer.aiGuess || customer.aiGuessKey) && (
        <>
          <SectionLabel>{t('customers.aboutCustomer', { defaultValue: 'About this customer' })}</SectionLabel>
          <Card className="bg-brand-blue/5">
            <Body>{t(customer.aiGuessKey, { defaultValue: customer.aiGuess })}</Body>
          </Card>
        </>
      )}

      {/* Lead status — a wrapping chip row, the idiom the Leads tab already uses. */}
      {lead && (
        <>
          <SectionLabel>{t('calls.leadStatusTitle', { defaultValue: 'Lead status' })}</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {LEAD_STATUSES.map(s => {
              const on = lead.status === s.id
              return (
                <Chip key={s.id} active={on} onPress={() => { vibrate(10); updateLeadStatus(lead, s.id) }}>
                  {on ? '✓ ' : ''}{t(s.labelKey, { defaultValue: s.label })}
                </Chip>
              )
            })}
          </View>
        </>
      )}

      {/* History — the customer's own timeline, newest first as the record keeps it. */}
      <SectionLabel>{t('customers.history', { defaultValue: 'History' })}</SectionLabel>
      {customer.timeline?.length ? (
        <Card>
          {customer.timeline.map((ev, i) => (
            <View key={i} className={`flex-row items-start gap-3 ${i > 0 ? 'mt-3 pt-3 border-t border-hairline dark:border-d-hairline' : ''}`}>
              <View className="w-8 h-8 rounded-lg bg-brand-blue/10 items-center justify-center">
                <PhoneIncoming size={14} color="#0355DB" />
              </View>
              <View className="flex-1 min-w-0">
                <Body numberOfLines={2}>{t(ev.detailKey, { defaultValue: ev.detail })}</Body>
                <Caption className="mt-0.5">{ev.at}</Caption>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Caption>{t('customers.historyEmpty', { defaultValue: 'Nothing recorded against this customer yet.' })}</Caption>
      )}

      {/* Notes — read them, add one. Persisted through the core storage seam. */}
      <SectionLabel>{t('customers.notes', { defaultValue: 'Notes' })}</SectionLabel>
      <Card>
        {notes.length === 0 && (
          <View className="flex-row items-start gap-3">
            <View className="w-8 h-8 rounded-lg bg-brand-blue/10 items-center justify-center">
              <NotebookPen size={14} color="#0355DB" />
            </View>
            <View className="flex-1 min-w-0">
              <Body className="font-hk-semi text-ink dark:text-d-ink">{t('customers.notesEmpty', { defaultValue: 'No notes yet' })}</Body>
              <Caption className="mt-0.5">{t('customers.notesEmptySub', { defaultValue: 'Jot down what was said — the price you quoted, what you promised, when to follow up.' })}</Caption>
            </View>
          </View>
        )}
        {notes.map((n, i) => (
          <View key={n.id || i} className={i > 0 || notes.length === 0 ? 'mt-3 pt-3 border-t border-hairline dark:border-d-hairline' : ''}>
            <Body>{n.text}</Body>
            <Caption className="mt-0.5">{n.author}</Caption>
          </View>
        ))}
        <TextInput
          value={noteText}
          onChangeText={setNoteText}
          placeholder={t('customers.notePlaceholder', { defaultValue: 'What did you agree on? Price quoted, model, when they’re coming in…' })}
          placeholderTextColor="#93A0C8"
          multiline
          accessibilityLabel={t('customers.addNote', { defaultValue: 'Add note' })}
          className="mt-3 min-h-[64px] rounded-xl border border-hairline dark:border-d-hairline bg-screen dark:bg-white/5 p-3 text-[15px] text-ink dark:text-d-ink"
        />
        <Pressable
          onPress={saveNote}
          disabled={!noteText.trim()}
          accessibilityRole="button"
          className={`self-end mt-2 h-9 px-3.5 rounded-pill items-center justify-center ${noteText.trim() ? 'bg-brand-blue' : 'bg-brand-blue/30'}`}
        >
          <Text className="text-[13px] font-hk-semi text-white">{t('customers.addNote', { defaultValue: 'Add note' })}</Text>
        </Pressable>
      </Card>

      {/* Actions — stacked, primary first, full width. No wrap in any language. */}
      <View className="mt-5 gap-2">
        {digits ? (
          <PrimaryButton onPress={() => { vibrate(15); Linking.openURL(`tel:+91${digits}`) }}>
            {t('common.callBack', { defaultValue: 'Call back' })}
          </PrimaryButton>
        ) : null}
        <GhostButton onPress={() => { vibrate(10); Linking.openURL(digits ? `https://wa.me/91${digits}` : 'https://wa.me/') }}>
          {t('customers.sendReviewLink', { defaultValue: 'Send review link' })}
        </GhostButton>
      </View>
    </Screen>
  )
}
