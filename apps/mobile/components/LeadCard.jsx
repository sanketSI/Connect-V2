// ============================================================
// LEAD CARD — the one card every lead is drawn with, on every native screen that
// lists leads: the Leads tab and the city drill-down.
//
// Lifted out of app/(tabs)/leads.jsx so the drill-down stops drawing its own plainer
// row. That row showed a name, a category, a value and a time — four facts, none of
// them the lifecycle status, the source, the reason or the review state. One list of
// leads showing five facts and another showing four is exactly the drift this whole
// merge existed to end.
// ============================================================
import { useMemo } from 'react'
import { View, Text, Pressable, Linking } from 'react-native'
import { PhoneCall, Repeat2 } from 'lucide-react-native'
import {
  getCustomerById, customerDialDigits, updateLeadStatus, dayClock, resolveSubject,
} from '@connect/core'
import { Caption } from './UI.jsx'
import CustomerCard, { since } from './CustomerCard.jsx'
import { vibrate } from '../lib/haptics.js'

/**
 * THE LEAD CARD IS THE CUSTOMER CARD. Native twin of LeadCard in
 * apps/web/src/screens/Leads.jsx — that file carries the reasoning; this one carries the
 * platform.
 *
 * On instruction: "from customer card, bring all data design and put all that design to
 * the leads card". Web does it by importing one component into both screens. Native had
 * no customer card to import, so components/CustomerCard.jsx is that component, and this
 * screen is now one of its two callers rather than the owner of a rival design.
 *
 * WHAT IT NEEDS is a customer-shaped subject, and core already has the bridge:
 * resolveSubject() returns the real contact record when the lead names one and
 * leadAsCustomer()'s projection when it does not — which is most of this fixture.
 *
 * ALL FIVE FACTS come out of CustomerCard's own anatomy; the list is in its header
 * comment. What this screen adds on top is what a lead list needs and a contact book does
 * not: WHEN it came in, and — for a missed call — the button to ring back.
 */
export default function LeadCard({ lead, t, onOpen }) {
  const subject = useMemo(() => {
    const base = resolveSubject(lead.id, { getCustomerById })
    if (!base) return null
    return {
      ...base,
      // FACT 1 MUST AGREE WITH THE LIST IT IS IN — see the web note. leadStatusOf() reads
      // the CONTACT's lifecycle for a lead that resolves to a real one, which put a red
      // "Missed" pill on seven rows sitting under the "Contacted" filter.
      leadStatus: lead.status,
      // FACT 2, hot/warm/cold. A lead can score when the contact record it resolves to
      // does not — the ranking is computed on the CALL, and a contact nobody has rung has
      // nothing to rank. `??` not `||`: a real score of 0 is a score.
      cli: base.cli ?? lead.cli ?? null,
    }
  }, [lead, lead.id])

  if (!subject) return null

  // The fifth fact, passed rather than derived: CustomerCard's own derivation goes
  // through callReasonForCustomer(customer.id), which finds nothing for a projection
  // whose id is `lead:…` rather than a contact id.
  const reason = lead.callReason
    ? t(lead.callReasonKey, { defaultValue: lead.callReason })
    : null

  return (
    <CustomerCard
      customer={subject}
      onOpen={onOpen}
      reason={reason}
      footer={<LeadFooter lead={lead} t={t} who={subject.name || subject.masked} />}
    />
  )
}

/**
 * When it came in, and — for a missed call — the one action the row is for.
 *
 * A MISSED CALL IS THE ONE ROW WITH SOMETHING STILL OWED ON IT. That used to justify a
 * whole separate card shape. It does not any more — one design, on instruction — but it
 * still justifies the button, so the button is what survived.
 *
 * CALL BACK does two things, both real. It dials — a true `tel:` — but only where we
 * actually hold a number: a call record carries none, so that means the ones matched to a
 * customer. And it moves the lead `missed → contacted`, which is the transition this
 * screen exists to record, so the row stops being outstanding whether or not the handset
 * could be opened.
 */
function LeadFooter({ lead, t, who }) {
  const missedCall = lead.source === 'call' && lead.status === 'missed'
  const digits = lead.customerId ? customerDialDigits(lead.customerId) : null

  function callBack() {
    vibrate([10, 20, 10])
    updateLeadStatus(lead, 'contacted')
    if (digits) Linking.openURL(`tel:${digits}`)
  }

  return (
    <View>
      {/* WHEN. Clock time and elapsed both, because a dealer reads the list by "how long
          has this been sitting" and dials by "was that before or after lunch". */}
      <View className="flex-row items-center gap-1.5 flex-wrap">
        <Caption>{dayClock(lead.atMs)}</Caption>
        <Caption>·</Caption>
        <Caption>{since(lead.atMs)}</Caption>
        {lead.repeats > 1 ? (
          <>
            <Caption>·</Caption>
            <View className="flex-row items-center gap-0.5">
              <Repeat2 size={10} color="#93A0C8" />
              <Caption>{t('vmn.calledCount', { count: lead.repeats, defaultValue: 'Called {{count}}×' })}</Caption>
            </View>
          </>
        ) : null}
      </View>

      {missedCall ? (
        <Pressable
          onPress={callBack}
          // Eleven buttons all named "Call back" is eleven identical announcements and no
          // way to tell whose. The visible label stays short; the ACCESSIBLE name carries
          // the person.
          accessibilityRole="button"
          accessibilityLabel={`${t('common.callBack', { defaultValue: 'Call back' })} ${who}`}
          // h-11 === 44pt === the minimum touch target.
          className="h-11 mt-2.5 rounded-pill flex-row items-center justify-center gap-2 bg-brand-blue active:opacity-80"
        >
          <PhoneCall size={16} color="#fff" />
          <Text className="text-[15px] font-hk-semi text-white">
            {t('common.callBack', { defaultValue: 'Call back' })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
