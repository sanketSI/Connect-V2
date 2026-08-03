// ============================================================
// ADD A LEAD BY HAND — the "+" on the Leads tab.
//
// Screen 3 of the annotated feedback: "there will add Lead flow… Form fields will be
// Name, email, phone number, notes."
//
// The annotation also says "sync with design team for in person collaboration". So this
// is the FLOW, not a new visual language: it reuses the field idiom, the button idiom
// and the error idiom this app already has, and invents no layout of its own. When the
// design lands, the styling changes and none of the logic below has to.
//
// NOTHING IS VALIDATED HERE. addCustomer() in core already owns every rule — name
// required and under its ceiling, a real 10-digit Indian mobile, a well-formed email if
// one is given, and a refusal when that number is ALREADY in the book. It returns
// `{ ok: false, field, reasonKey }` and this screen renders the reason against the field
// it names. A second copy of those rules on the phone is how the two platforms start
// disagreeing about what a valid lead is.
//
// NOTES are saved as the customer's first note through addCustomerNote(), not as a field
// on the record: the app already has one place notes live, and a lead added by hand
// should not get a parallel one. That is also what makes the note editable straight
// afterwards on the detail screen.
// ============================================================
import { useState } from 'react'
import { View, Text, TextInput, Pressable, Alert, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react-native'
import { addCustomer, addCustomerNote, getCurrentUser } from '@connect/core'
import { Screen, Title, Body, Caption, PrimaryButton, GhostButton } from '../components/UI.jsx'
import { BackButton, HeaderRight } from '../components/Header.jsx'
import { useSession } from '../lib/session.js'
import { notifySuccess, vibrate } from '../lib/haptics.js'

export default function AddLeadScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSession()
  // The aggregate view has no single branch, so core needs one told to it explicitly —
  // otherwise a hand-typed lead silently lands on the primary store.
  const storeId = session.store?.aggregate ? null : session.store?.id

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null) // { field, message }
  const [saving, setSaving] = useState(false)

  function save() {
    if (saving) return
    setSaving(true)
    setError(null)

    const res = addCustomer({ name, phone, email, storeId: storeId || undefined })

    // core refuses with `{ ok:false, reason:<field>, error:<message>, errorKey:<key> }`
    // — render it against the field it names rather than as one generic "something went
    // wrong" at the bottom. (First pass here read res.field / res.reasonKey, which do not
    // exist; a probe of the real return caught it before it shipped.)
    if (!res || res.ok === false) {
      setSaving(false)
      vibrate(20)
      setError({
        field: res?.reason || 'name',
        message: t(res?.errorKey, { defaultValue: res?.error || 'Could not add this lead.' }),
      })
      return
    }

    const customer = res.customer
    // The note rides along as the customer's first note, through the same mutator the
    // detail screen uses — so it is editable there immediately.
    if (notes.trim()) addCustomerNote(customer.id, notes, getCurrentUser().name)

    notifySuccess()
    Alert.alert(
      t('customers.addedToast', { name: customer.name, defaultValue: '{{name}} added to your customers' }),
      // Translator TODO: no catalog string for where it went.
      'They are in your leads now, as a walk-in.',
      [{ text: t('common.done', { defaultValue: 'Done' }), onPress: () => router.back() }],
    )
  }

  const ring = f => (error?.field === f ? 'border-bad' : 'border-hairline dark:border-d-hairline')

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <BackButton />
        <HeaderRight />
      </View>

      <View className="flex-row items-center gap-2.5 mt-4">
        <View className="w-10 h-10 rounded-xl bg-brand-blue/10 items-center justify-center">
          <UserPlus size={18} color="#0070FC" />
        </View>
        <View className="flex-1 min-w-0">
          {/* Translator TODO on the title: the catalogs say "Add customer", and on this
              screen the thing being added is a LEAD. */}
          <Title className="text-[22px] leading-7">Add a lead</Title>
          <Caption className="mt-0.5">
            {t('customers.addSubtitle', {
              store: session.store?.branch || session.store?.name || '',
              defaultValue: 'Someone who walked in or was referred — record them so you can follow up.',
            })}
          </Caption>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="mt-4" keyboardShouldPersistTaps="handled">
        <Field
          label={t('customers.addName', { defaultValue: 'Full name' })}
          hint={t('customers.addNameHint', { defaultValue: 'How you would greet them on the phone.' })}
          placeholder={t('customers.addNamePlaceholder', { defaultValue: 'Anand Rao' })}
          value={name} onChange={setName} ring={ring('name')} required
        />
        <Field
          label={t('customers.addPhone', { defaultValue: 'Mobile number' })}
          hint={t('customers.addPhoneHint', { defaultValue: 'Stored in full so you can call them; shown masked everywhere.' })}
          placeholder="98450 12345"
          value={phone} onChange={setPhone} ring={ring('phone')} required keyboardType="phone-pad"
        />
        <Field
          label={t('customers.addEmail', { defaultValue: 'Email' })}
          hint={t('customers.addEmailHint', { defaultValue: 'For the invoice or the warranty — leave it blank if they did not give one.' })}
          placeholder={t('customers.addEmailPlaceholder', { defaultValue: 'anand@example.com' })}
          value={email} onChange={setEmail} ring={ring('email')}
          keyboardType="email-address" autoCapitalize="none"
          optional={t('customers.addOptional', { defaultValue: 'Optional' })}
        />
        <Field
          label={t('customers.notes', { defaultValue: 'Notes' })}
          hint={t('customers.notesEmptySub', { defaultValue: 'What was said — the price you quoted, what you promised, when to follow up.' })}
          placeholder={t('customers.notePlaceholder', { defaultValue: 'What did you agree on?' })}
          value={notes} onChange={setNotes} ring="border-hairline dark:border-d-hairline"
          multiline
          optional={t('customers.addOptional', { defaultValue: 'Optional' })}
        />

        {error ? (
          <Caption className="text-bad dark:text-d-bad mb-2">{error.message}</Caption>
        ) : null}

        <Caption className="mb-4">
          {t('customers.addPrivacyHint', {
            defaultValue: 'Saved to your store’s records. The number is shown masked on every screen, like everyone else’s.',
          })}
        </Caption>

        <View className="flex-row gap-2 mb-6">
          <View className="flex-1">
            <GhostButton onPress={() => router.back()}>{t('common.cancel', { defaultValue: 'Cancel' })}</GhostButton>
          </View>
          <View className="flex-1">
            <PrimaryButton onPress={save} disabled={saving}>
              {t('customers.addCustomer', { defaultValue: 'Add customer' })}
            </PrimaryButton>
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

function Field({ label, hint, placeholder, value, onChange, ring, required, optional, multiline, ...rest }) {
  return (
    <View className="mb-3.5">
      <View className="flex-row items-end justify-between gap-2 mb-1">
        <Caption>
          {label}{required ? <Text className="text-bad dark:text-d-bad"> *</Text> : null}
        </Caption>
        {optional && !required ? <Caption>{optional}</Caption> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#93A0C8"
        accessibilityLabel={label}
        multiline={!!multiline}
        className={`rounded-xl border ${ring} bg-card dark:bg-white/5 px-3 text-[15px] text-ink dark:text-d-ink ${
          multiline ? 'min-h-[88px] py-2.5' : 'h-11'
        }`}
        {...rest}
      />
      {hint ? <Caption className="mt-1">{hint}</Caption> : null}
    </View>
  )
}
