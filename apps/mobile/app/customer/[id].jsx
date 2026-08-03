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
import {
  Check, PhoneCall, MessageCircle, PhoneIncoming, NotebookPen,
  UserPen, Pencil, X as XIcon, FileText,
} from 'lucide-react-native'
import {
  getCustomerById, resolveSubject, getLeads, LEAD_STATUSES, LEAD_SOURCES, updateLeadStatus,
  getCustomerNotes, addCustomerNote, updateCustomerNote, getCurrentUser,
  recordedName, setRecordedName,
} from '@connect/core'
import { Screen, Card, SectionLabel, Title, Body, Caption, Chip, PrimaryButton, GhostButton } from '../../components/UI.jsx'
import { BackButton, HeaderRight } from '../../components/Header.jsx'
import { useDataVersion } from '../../lib/useDataVersion.js'
import { vibrate, notifySuccess } from '../../lib/haptics.js'


/**
 * THE NAME THE MANAGER RECORDED (PM feedback 11).
 *
 * Read-only until tapped, because on most visits the manager is here to call somebody,
 * not to edit a field — an always-open text input on the identity block turns the page
 * into a form. `known` is the name the platform already holds; when it has one, this
 * offers to correct it rather than pretending the field is empty.
 */
function NameField({ subjectId, current, known, t }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current || known || '')

  function commit() {
    setRecordedName(subjectId, draft)
    setEditing(false)
    notifySuccess()
  }

  if (!editing) {
    return (
      <Pressable
        onPress={() => { vibrate(6); setDraft(current || known || ''); setEditing(true) }}
        accessibilityRole="button"
        accessibilityLabel={t('customers.addName', { defaultValue: 'Full name' })}
        className="flex-row items-center gap-1.5 self-start mt-2 h-8 px-2.5 rounded-pill bg-brand-blue/5 border border-hairline dark:border-d-hairline"
      >
        <UserPen size={12} color="#0355DB" />
        <Text className="text-[12px] font-hk-semi text-primaryText dark:text-d-primaryText">
          {/* Translator TODO — no catalog key for the empty prompt. */}
          {current || known ? t('reviews.edit', { defaultValue: 'Edit' }) : 'Add name'}
        </Text>
      </Pressable>
    )
  }

  return (
    <View className="mt-2">
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        placeholder={t('customers.addNamePlaceholder', { defaultValue: 'Anand Rao' })}
        placeholderTextColor="#93A0C8"
        accessibilityLabel={t('customers.addName', { defaultValue: 'Full name' })}
        onSubmitEditing={commit}
        returnKeyType="done"
        className="h-10 rounded-xl border border-hairline dark:border-d-hairline bg-screen dark:bg-white/5 px-3 text-[15px] text-ink dark:text-d-ink"
      />
      <View className="flex-row gap-2 mt-2">
        <Pressable onPress={commit} accessibilityRole="button" className="h-8 px-3 rounded-pill bg-brand-blue items-center justify-center">
          <Text className="text-[12px] font-hk-semi text-white">{t('common.save', { defaultValue: 'Save' })}</Text>
        </Pressable>
        <Pressable onPress={() => setEditing(false)} accessibilityRole="button" className="h-8 px-3 rounded-pill border border-hairline dark:border-d-hairline items-center justify-center">
          <Text className="text-[12px] font-hk-semi text-ink-2 dark:text-d-ink2">{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * ONE NOTE — view-only by default, editable on demand (PM feedback 12).
 *
 * "the cursor automatically goes to the last endpoint. He starts editing the notes from
 * where he left last edit" — so opening an edit puts the caret AFTER the existing text
 * rather than selecting it all. On React Native that is `selection`, set once on mount:
 * left to the platform default, Android drops the caret at index 0 and the dealer's next
 * keystroke lands in front of everything he wrote last time.
 *
 * VIEW-ONLY IS THE DEFAULT STATE, not a separate mode to switch into: a note is read far
 * more often than it is changed, and a page of open textareas is unreadable.
 */
function NoteRow({ note, customerId, t, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)
  // Set once when the edit opens, then cleared on the first selection change so the
  // field goes back to being uncontrolled about its caret.
  const [caret, setCaret] = useState(undefined)

  function commit() {
    if (!draft.trim()) return
    updateCustomerNote(customerId, note.id, draft)
    setEditing(false)
    notifySuccess()
  }

  if (!editing) {
    return (
      <View className={className}>
        <View className="flex-row items-start gap-2">
          <Body className="flex-1">{note.text}</Body>
          <Pressable
            onPress={() => { vibrate(6); setDraft(note.text); setCaret({ start: note.text.length, end: note.text.length }); setEditing(true) }}
            accessibilityRole="button"
            accessibilityLabel={t('reviews.edit', { defaultValue: 'Edit' })}
            hitSlop={10}
          >
            <Pencil size={13} color="#93A0C8" />
          </Pressable>
        </View>
        <Caption className="mt-0.5">{note.author}</Caption>
      </View>
    )
  }

  return (
    <View className={className}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        multiline
        // THE CARET GOES TO THE END, not to index 0 and not selecting the whole note.
        // `selection` is applied once, while the field is still unfocused; letting it
        // track every keystroke would fight the dealer's own cursor moves.
        selection={caret}
        onSelectionChange={() => setCaret(undefined)}
        selectTextOnFocus={false}
        accessibilityLabel={t('reviews.edit', { defaultValue: 'Edit' })}
        className="min-h-[64px] rounded-xl border border-brand-blue/40 bg-screen dark:bg-white/5 p-3 text-[15px] text-ink dark:text-d-ink"
      />
      <View className="flex-row gap-2 mt-2">
        <Pressable onPress={commit} disabled={!draft.trim()} accessibilityRole="button"
          className={`h-8 px-3 rounded-pill items-center justify-center ${draft.trim() ? 'bg-brand-blue' : 'bg-brand-blue/30'}`}>
          <Text className="text-[12px] font-hk-semi text-white">{t('common.save', { defaultValue: 'Save' })}</Text>
        </Pressable>
        <Pressable onPress={() => { setDraft(note.text); setEditing(false) }} accessibilityRole="button"
          className="h-8 px-3 rounded-pill border border-hairline dark:border-d-hairline items-center justify-center flex-row gap-1">
          <XIcon size={11} color="#5F6878" />
          <Text className="text-[12px] font-hk-semi text-ink-2 dark:text-d-ink2">{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
        </Pressable>
      </View>
      <Caption className="mt-1">{note.author}</Caption>
    </View>
  )
}

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

  // The id may be a real customer's OR a lead's — resolveSubject handles both, and
  // projects the lead when the platform holds no contact record for it. That is why
  // every Leads card can be tappable: 42 of the 62 leads here have no record, and
  // gating the tap on one left those cards dead on tap.
  const customer = resolveSubject(id, { getCustomerById })
  if (!customer) return null

  // The lead this person is — status lives on the lead, not the customer record. A
  // projection names its own lead; a real record is found by back-reference.
  const leads = getLeads()
  const lead = (customer.leadId && leads.find(l => l.id === customer.leadId))
    || leads.find(l => l.customerId === customer.id)
    || null

  // NOTHING MAY BE WRITTEN TO A PROJECTION. There is no record behind it, so a note
  // saved here would be attached to an id the platform does not keep — the composer
  // switches itself off rather than accepting text it cannot honour. The lead's STATUS
  // is different: that lives on the lead, which is real, so it stays editable below.
  const canNote = !customer.synthetic
  const notes = canNote ? (getCustomerNotes(customer.id) || []) : []
  // The name the manager recorded is an OVERLAY, so unlike notes it works on a projection
  // too — and a projection is exactly where it matters most, because a caller with no
  // contact record has no name from anywhere else. See setRecordedName in core.
  const ownName = recordedName(customer.id)
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
          {/* Both of these ARE the score, so both wait on it. Rendering the band
              chip's `cold` fallback for a caller we never scored states a fact we do
              not hold, and the caption printed "· null/100". Web's guard exactly. */}
          {/* SOURCE, not score. The band pill and "92/100 chance to buy" were removed on
              instruction and replaced by where this lead actually came from — FORM, CALL
              or WALK-IN. A chance-to-buy is a model's opinion; the source is a fact, and
              it is the thing that tells the manager how to open the conversation.
              Translator TODO: LEAD_SOURCES carries labelKeys, so the label itself is
              translated — only the absence of a score needed no new string. */}
          {lead?.source ? (
            <View className="flex-row items-center gap-2 mt-1.5">
              <View className="h-6 px-2 rounded-pill items-center justify-center bg-brand-blue/10 border border-brand-blue/30">
                <Text className="text-[11px] font-hk-semi text-primaryText dark:text-d-primaryText uppercase">
                  {t(LEAD_SOURCES.find(x => x.id === lead.source)?.labelKey, {
                    defaultValue: LEAD_SOURCES.find(x => x.id === lead.source)?.label,
                  })}
                </Text>
              </View>
            </View>
          ) : null}
          <Caption className="mt-1">
            {customer.category ? t(customer.categoryKey, { defaultValue: customer.category }) : ''}
            {customer.value ? ` · ₹${(customer.value / 1000).toFixed(0)}K` : ''}
          </Caption>
          {/* WHO IS THIS? — the manager's own answer. Most callers arrive as a masked
              number and nothing else, so this is frequently the first and only name
              anyone will ever have for them. Inline under the identity because it IS
              the identity, not a field buried in a form further down. */}
          <NameField subjectId={customer.id} current={ownName} known={customer.name} t={t} />
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
                <Chip key={s.id} icon={on ? Check : undefined} active={on} onPress={() => { vibrate(10); updateLeadStatus(lead, s.id) }}>
                  {t(s.labelKey, { defaultValue: s.label })}
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

      {/* CUSTOMER NOTES — the customer's OWN words, typed into the enquiry form on the
          microsite. Conditional by nature: only a form lead has one (nobody types a
          description into a phone call), so on every other source this renders nothing
          rather than an empty heading. Read-only and visually distinct from the
          manager's notes below — this is evidence, not a working pad. */}
      {customer.micrositeNote ? (
        <>
          {/* Translator TODO: the catalogs carry no key for the customer's own form
              text. English literal for now, same precedent as the selector captions. */}
          <SectionLabel>Customer notes</SectionLabel>
          <Card className="bg-brand-blue/5">
            <View className="flex-row items-start gap-3">
              <View className="w-8 h-8 rounded-lg bg-brand-blue/10 items-center justify-center">
                <FileText size={14} color="#0355DB" />
              </View>
              <View className="flex-1 min-w-0">
                <Body className="text-ink dark:text-d-ink">{customer.micrositeNote}</Body>
                <Caption className="mt-1">From the enquiry form on your microsite</Caption>
              </View>
            </View>
          </Card>
        </>
      ) : null}

      {/* Notes — read them, add one, edit one. Persisted through the core storage seam.
          Absent entirely for a projection: see canNote above. */}
      {canNote && (
      <>
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
          <NoteRow
            key={n.id || i}
            note={n} customerId={customer.id} t={t}
            className={i > 0 || notes.length === 0 ? 'mt-3 pt-3 border-t border-hairline dark:border-d-hairline' : ''}
          />
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
      </>
      )}

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
