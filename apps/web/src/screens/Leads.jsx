import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  PhoneCall, FileText, Store as StoreIcon, Users as UsersIcon, Check, Lock, Repeat2,
  ChevronRight, CalendarRange, UserPlus,
} from 'lucide-react'
import { NameField, NoteRow, AddCustomerSheet, CustomerCard } from './Customers.jsx'

/**
 * The id the recorded-name overlay is keyed by for a lead: its customer record when one
 * exists, the projected-subject id when it does not. One helper because three call sites
 * read it and a disagreement here shows up as a name that appears on one screen only.
 */
const customerOf = lead => (lead.customerId ? lead.customerId : `lead:${lead.id}`)
import { useTranslation } from 'react-i18next'
import {
  getLeads, leadCounts, updateLeadStatus, groupByStore,
  LEAD_STATUSES, LEAD_SOURCES, rupees, relativeTime, dayClock,
  getCustomerById, getCustomerNotes, resolveSubject, addCustomerNote, customerDialDigits, recordedName,
} from '@connect/core'
import { Card, Chip, CLIPill, StoreGroupHeader, PrimaryButton } from '../components/UI.jsx'
import ScreenScroll from '../components/ScreenScroll.jsx'
import { LargeTitle } from '../components/TopBar.jsx'
import { TimelineRow } from '../components/Timeline.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
import ScopePill from '../components/ScopePill.jsx'
import TimeFilterSheet, { useWindowLabeller } from '../components/TimeFilterSheet.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import { useDataVersion } from '../lib/useDataVersion.js'
import { emitChange } from '@connect/core/events.js'
import { vibrate } from '../lib/utils.js'

// ============================================================
// LEADS — the MVP's working screen.
//
// One list, every source, one lifecycle. Calls and Customers were two screens for the
// same job: a missed call IS a call-sourced lead, and keeping them apart meant a lead's
// status lived on whichever screen you happened to open. See leads.js for why one call
// record is one lead rather than one ring of the phone.
//
// STATUS IS A CHIP ROW, not a segmented control. Five states do not fit a segment bar on
// a 375pt screen, and the manager's real question is "what is waiting for me" — which is
// a filter, not a mode.
// ============================================================

const SOURCE_ICON = { call: PhoneCall, form: FileText, walk_in: StoreIcon }

export default function Leads({ store, onOpenProfile, onSwitchStore, preset }) {
  const { t } = useTranslation()
  const version = useDataVersion()

  // PULL TO REFRESH. The data layer is in-memory, so "refresh" means re-derive: bump the
  // version every selector on this screen reads (see useDataVersion). The short await is
  // not theatre — a spinner that vanishes in the same frame reads as a control that did
  // nothing, and the gesture has to confirm it was received.
  const refresh = useCallback(async () => {
    emitChange()
    await new Promise(r => setTimeout(r, 450))
  }, [])
  const aggregate = !!store?.aggregate
  const scopeId = aggregate ? undefined : store?.id

  const [status, setStatus] = useState(preset?.status || 'all')
  const [source, setSource] = useState(preset?.source || 'all')

  // A preset arrives when another screen opened this tab ON something — Home's missed-
  // calls row lands here already narrowed to missed + call. Keyed on `seq`, not on the
  // values: tapping the same row twice has to re-apply the filter even though nothing
  // about it changed, and the manager may have widened it in between.
  useEffect(() => {
    if (!preset) return
    if (preset.status) setStatus(preset.status)
    if (preset.source) setSource(preset.source)
  }, [preset?.seq])
  const [openId, setOpenId] = useState(null)
  // THE GLOBAL TIME FILTER (PM feedback 8). Leads had none at all — Reviews kept its
  // period picker and this screen lost one, which is the half that "got stripped".
  // Default 'all': a lead list that silently hid anything older than 30 days would make
  // the lifecycle chips lie, and Expired leads are by definition the old ones.
  const [win, setWin] = useState('all')
  const [timeSheet, setTimeSheet] = useState(false)
  const [adding, setAdding] = useState(false)
  const windowLabel = useWindowLabeller()

  // Counts come from the store scope only — NOT from the status/source filters, or every
  // chip but the active one would read zero and the row would stop being usable.
  // The window feeds the COUNTS as well as the list. Narrow one and not the other and
  // the chips promise rows the list will not show — the same class of mismatch the
  // canonical-window work existed to kill.
  const counts = useMemo(() => leadCounts({ storeId: scopeId, win }), [scopeId, win, version])

  const list = useMemo(
    () => getLeads({ storeId: scopeId, status, source, win }),
    [scopeId, status, source, win, version],
  )

  const allGroups = useMemo(
    () => (aggregate ? groupByStore(list) : [{ storeId: null, label: null, count: list.length, items: list }]),
    [aggregate, list],
  )
  // No screen-local branch filter any more: the SCOPE PILL above is the one location
  // control and it narrows `list` at source, through assignedStoreIds(). Filtering a
  // second time here would mean this screen could disagree with the pill's own label.
  const groups = allGroups

  const open = useMemo(
    () => (openId ? getLeads({ storeId: scopeId }).find(l => l.id === openId) : null),
    [openId, scopeId, version],
  )

  return (
    <ScreenScroll onRefresh={refresh}>
      <LargeTitle
        title={t('leads.title', { defaultValue: 'Leads' })}
        sub={t('leads.subtitle', { defaultValue: 'Every enquiry, whatever brought it in' })}
        right={<div className="flex items-center"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>}
      />

      <div className="px-4">
        {/* ALWAYS, never gated on `aggregate` — see the note on Reviews. A switcher
            that vanishes when you narrow to one store cannot take you back out. */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          <ScopePill store={store} onSwitchStore={onSwitchStore} />
          {/* Period sits BESIDE the location, because together they are the scope every
              count below is measured over — the lifecycle chips underneath are value
              filters and belong on their own row. Same order as Reviews. */}
          <Chip icon={CalendarRange} active={win !== 'all'} onClick={() => { vibrate(6); setTimeSheet(true) }}>
            {windowLabel(win)}
          </Chip>
        </div>

        {/* WHERE THE LEAD HAS GOT TO — the manager's first question. */}
        <div className="flex items-center gap-2 mb-2.5 overflow-x-auto no-scrollbar">
          <Chip active={status === 'all'} onClick={() => { vibrate(6); setStatus('all') }}>
            {t('common.all', { defaultValue: 'All' })} {counts.total}
          </Chip>
          {LEAD_STATUSES.map(s => (
            <Chip key={s.id} active={status === s.id} onClick={() => { vibrate(6); setStatus(s.id) }}>
              {t(s.labelKey, { defaultValue: s.label })} {counts[s.id] ?? 0}
            </Chip>
          ))}
        </div>

        {/* WHERE IT CAME FROM. */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          <Chip active={source === 'all'} onClick={() => { vibrate(6); setSource('all') }}>
            {t('leads.allSources', { defaultValue: 'All sources' })}
          </Chip>
          {LEAD_SOURCES.map(s => (
            <Chip key={s.id} icon={SOURCE_ICON[s.id]} active={source === s.id} onClick={() => { vibrate(6); setSource(s.id) }}>
              {t(s.labelKey, { defaultValue: s.label })}
            </Chip>
          ))}
        </div>

        <div className="space-y-2.5">
          {groups.map(g => (
            <div key={g.storeId ?? 'all'} className="space-y-2.5">
              {g.label && <StoreGroupHeader label={g.label} count={g.count} />}
              {g.items.map((lead, i) => (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.024, duration: 0.24, ease: [0.2, 0, 0, 1] }}
                >
                  <LeadCard lead={lead} aggregate={aggregate} onOpen={() => setOpenId(lead.id)} />
                </motion.div>
              ))}
            </div>
          ))}

          {list.length === 0 && (
            <Card className="!p-6 text-center">
              <UsersIcon size={26} className="mx-auto text-white/40 mb-2" />
              <div className="m-headline text-white">{t('leads.emptyTitle', { defaultValue: 'Nothing here' })}</div>
              <div className="m-caption text-white/60 mt-0.5">
                {t('leads.emptySub', { defaultValue: 'No leads match this status and source.' })}
              </div>
            </Card>
          )}
          <div className="h-4" />
        </div>
      </div>

      {/* ADD A LEAD BY HAND. A walk-in and a referral never ring the phone and never
          fill the microsite form, so without this the only leads in the book are the ones
          the platform happened to observe. Reuses the Customers screen's own
          AddCustomerSheet — one form, one set of rules, rather than a second one here
          that drifts. Floating over the list: it is an action on the whole screen.
          Translator TODO: the catalogs have customers.addCustomer, nothing for a lead. */}
      <button
        type="button"
        onClick={() => { vibrate(8); setAdding(true) }}
        aria-label="Add a lead"
        className="absolute right-4 bottom-[104px] w-14 h-14 rounded-full grid place-items-center press z-10"
        style={{ background: '#0070FC', boxShadow: '0 8px 24px rgba(0,112,252,.45)' }}
      >
        {/* `color`, NOT className="text-white". The light theme carries a global
            `[data-theme="light"] .text-white { color: #111827 !important }` — an
            inversion written for text sitting on the page background, which is right
            almost everywhere and wrong on a solid brand-blue circle: it painted this
            glyph near-black on blue. lucide's `color` prop sets stroke="#fff" as an
            attribute, so no `color` rule can reach it. */}
        <UserPlus size={26} color="#fff" />
      </button>

      <BottomSheet open={adding} onClose={() => setAdding(false)} fullHeight label="Add a lead">
        {adding && (
          <AddCustomerSheet
            storeId={scopeId}
            onClose={() => setAdding(false)}
            onOpenExisting={(id) => { setAdding(false); setOpenId(`cust:${id}`) }}
          />
        )}
      </BottomSheet>

      <TimeFilterSheet
        open={timeSheet}
        value={win}
        defaultWindow="all"
        onClose={() => setTimeSheet(false)}
        onApply={setWin}
      />

      <BottomSheet open={!!open} onClose={() => setOpenId(null)} fullHeight label={open?.name || open?.masked}>
        {open && <LeadDetail lead={open} onClose={() => setOpenId(null)} />}
      </BottomSheet>
    </ScreenScroll>
  )
}

/**
 * THE LEAD CARD IS THE CUSTOMER CARD. Not a copy of it — the same component.
 *
 * On instruction: "from customer card, bring all data design and put all that design to
 * the leads card; combine here". Two card designs for the same person is how the Leads
 * tab and the Customers book ended up disagreeing about what a lead is — one showed the
 * AI read and the score, the other showed a chip row; the five facts asked for four
 * times running landed on whichever one was touched last. Importing CustomerCard rather
 * than porting its markup means that cannot happen again: there is one card, and a
 * change to it changes both screens by construction.
 *
 * WHAT IT NEEDS is a customer-shaped subject, and core already has the bridge:
 * resolveSubject() returns the real contact record when the lead names one, and
 * leadAsCustomer()'s projection when it does not — which is most of this fixture. So a
 * lead nobody has a contact record for still draws the full card, with the fields it
 * genuinely has and nothing invented for the ones it does not.
 *
 * ALL FIVE FACTS come out of CustomerCard's own anatomy, which is why this merge works
 * rather than costing something:
 *   1. lead status      — the pill it derives through leadStatusOf()
 *   2. lead type        — the CLIPill top-right, "95 · Hot"
 *   3. source type      — first item of the subline, "Call lead · ₹32.5K · 1 call"
 *   4. review requested — the "Review link sent" badge (and "Reviewed" once they have)
 *   5. reason of calling— the `reason` prop, passed from the lead below
 *
 * WHAT THIS CARD ADDS on top, because a lead list needs it and a contact book does not:
 * WHEN it came in and — for a missed call — the button to ring back. Both live in the
 * footer slot CustomerCard already owns, hairlined off inside the card.
 */
function LeadCard({ lead, onOpen, aggregate }) {
  const { t } = useTranslation()

  const subject = useMemo(() => {
    const base = resolveSubject(lead.id, { getCustomerById })
    if (!base) return null
    // The name the MANAGER recorded outranks the platform's: they typed it because what
    // we hold is a masked number. Applied here as well as inside the projection, because
    // a lead that resolves to a REAL contact record skips the projection entirely — and
    // a name saved on the detail sheet has to reach the card it was opened from.
    const named = recordedName(customerOf(lead))
    return {
      ...base,
      name: named || base.name,
      // FACT 1 MUST AGREE WITH THE LIST IT IS IN. CustomerCard derives the pill through
      // leadStatusOf(subject), and for a lead that resolves to a REAL contact that reads
      // the CONTACT's lifecycle, not this lead's — seven rows here sat under the
      // "Contacted 102" filter wearing a red "Missed" pill. The lead is what the list was
      // filtered by, so the lead is what the pill has to say. leadStatusOf() returns an
      // explicit `leadStatus` before any of its fallbacks, so setting it settles the
      // question rather than competing with it.
      leadStatus: lead.status,
      // FACT 2, hot/warm/cold, nearly went missing in this merge. A lead can score when
      // the contact record it resolves to does not — the ranking is computed on the CALL,
      // and a contact nobody has rung has nothing to rank. Taking base.cli alone silently
      // dropped the band off every card that had one. `??` not `||`: a real score of 0 is
      // a score, and must not fall through to the lead's.
      cli: base.cli ?? lead.cli ?? null,
    }
  }, [lead, lead.id])

  if (!subject) return null

  // The fifth fact. Passed rather than left for CustomerCard to derive: its own
  // derivation goes through callReasonForCustomer(customer.id), which finds nothing for
  // a projection whose id is `lead:…` rather than a contact id. The lead carries the
  // reason already — handing it over is both cheaper and correct for the orphan case.
  const reason = lead.callReason
    ? t(lead.callReasonKey, { defaultValue: lead.callReason })
    : null

  return (
    <CustomerCard
      customer={subject}
      onOpen={onOpen}
      aggregate={aggregate}
      reason={reason}
      footer={<LeadFooter lead={lead} who={subject.name || subject.masked} />}
    />
  )
}

/**
 * When it came in, and — for a missed call — the one action the row is for.
 *
 * A MISSED CALL IS THE ONE ROW WITH SOMETHING STILL OWED ON IT. Everything else in this
 * list is a record to read; a missed call is somebody waiting to be rung back. That used
 * to justify a whole separate card shape (MissedCallCard, an idiom borrowed from the
 * Calls screen). It does not justify a separate card shape any more — one design, on
 * instruction — but it still justifies the button, so the button is what survived.
 *
 * CALL BACK does two things, both real. It dials — a true `tel:` — but only where we
 * actually hold a number: a call record carries none, so that means the ones matched to
 * a customer. And it moves the lead `missed → contacted`, which is the transition this
 * whole screen exists to record, so the row stops being outstanding whether or not the
 * handset could be opened. The button never pretends: where there is no number it says
 * so by not dialling, and the status change is what it can honestly promise.
 */
function LeadFooter({ lead, who }) {
  const { t } = useTranslation()
  const missedCall = lead.source === 'call' && lead.status === 'missed'
  const digits = lead.customerId ? customerDialDigits(lead.customerId) : null

  function callBack(e) {
    e.stopPropagation()
    vibrate([10, 20, 10])
    updateLeadStatus(lead, 'contacted')
    if (digits) window.location.href = `tel:${digits}`
  }

  return (
    <div>
      {/* WHEN. The clock time and the relative both, because a dealer reads the list by
          "how long has this been sitting" and dials by "was that before or after lunch".
          Repeat count rides here rather than as a badge on the avatar: CustomerCard
          already states it twice over — "3 calls" in the subline, and its own callsCount
          pill once there are two or more. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="m-tabular">{dayClock(lead.atMs)}</span>
        <span className="opacity-50">·</span>
        <span>{relativeTime(lead.atMs)}</span>
        {lead.repeats > 1 && (
          <>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-0.5">
              <Repeat2 size={10} />
              {t('vmn.calledCount', { count: lead.repeats, defaultValue: 'Called {{count}}×' })}
            </span>
          </>
        )}
      </div>

      {missedCall && (
        <button
          onClick={callBack}
          // Eleven buttons all named "Call back" is eleven identical announcements and no
          // way to tell whose. The visible label stays short; the ACCESSIBLE name carries
          // the person.
          aria-label={t('common.callBack', { defaultValue: 'Call back' }) + ' ' + who}
          // h-11 === 44px === --m-touch-min.
          className="w-full h-11 mt-2.5 rounded-full m-headline press inline-flex items-center justify-center gap-2"
          style={{ background: '#0070FC', color: 'white', boxShadow: '0 1px 2px rgba(15,23,42,.08)' }}
        >
          <PhoneCall size={16} className="shrink-0" />
          <span className="truncate">{t('common.callBack', { defaultValue: 'Call back' })}</span>
        </button>
      )}
    </div>
  )
}

/**
 * The lead, and the two things the MVP says a manager does with it: move it along the
 * lifecycle, and ask a converted customer for a review.
 */
function LeadDetail({ lead, onClose }) {
  const { t } = useTranslation()
  const [, force] = useState(0)
  // The name the MANAGER recorded outranks the platform's: they typed it because
  // what we hold is a masked number. Read here rather than only on the detail, or a
  // name saved on the sheet never reaches the card it was opened from.
  const who = recordedName(customerOf(lead)) || lead.name || lead.masked
  const src = LEAD_SOURCES.find(s => s.id === lead.source)

  // The person behind the lead, when the platform holds one. A form or walk-in IS a
  // customer record; a call is only linked to one if it was ever matched to a contact,
  // and most in the fixture are not. Everything below degrades on that: what the LEAD
  // knows (who, source, chance-to-buy, when) always renders, and the customer-only parts
  // — the full history, notes — appear when there is a record to read them from.
  const customer = lead.customerId ? getCustomerById(lead.customerId) : null

  // Bumped on every note so the memo below re-reads a record that was mutated in place.
  const [noteRev, setNoteRev] = useState(0)
  const notes = useMemo(
    () => (customer ? getCustomerNotes(customer) : []),
    [customer, noteRev],
  )

  // WHAT ACTUALLY HAPPENED WITH THIS PERSON. The customer's own timeline when there is
  // one; otherwise the lead's own record still describes a real interaction — a call
  // came in at a time, it was missed or attended, and it may have repeated — so that is
  // shown rather than an empty state. Nothing here is invented: both branches are
  // records the app already holds.
  const history = useMemo(() => {
    const tl = (customer?.timeline || []).filter(e => e.type !== 'review-landed')
    if (tl.length) return tl
    if (lead.source !== 'call') return []
    return [{
      type: lead.outcome === 'attended' ? 'inbound' : 'missed',
      at: relativeTime(lead.atMs),
      detail: lead.repeats > 1
        ? t('vmn.calledCount', { count: lead.repeats, defaultValue: 'Called {{count}}×' })
        : t(src?.labelKey, { defaultValue: src?.label }),
    }]
  }, [customer, lead, src, t])

  function move(next) {
    vibrate(10)
    updateLeadStatus(lead, next)
    force(n => n + 1)
  }

  // "Request the review from an ALREADY CONVERTED customer" — the gate is the point, so
  // it is enforced here rather than left to the manager to remember.
  const canAskReview = lead.status === 'converted'

  return (
    <div className="px-4 pb-6">
      {/* WHO — the name when the book has one, the masked number when it does not. A
          call is anonymous until somebody names it, so `who` falls back rather than
          printing a blank line where a person should be. */}
      {/* pr-10 clears BottomSheet's close button, which is absolutely positioned over
          this row's top-right corner (right-3, 32px box) — without it the chance-to-buy
          pill renders underneath the X. */}
      <div className="flex items-start gap-2 pr-10">
        <div className="flex-1 min-w-0">
          <div className="m-title2 text-white truncate">{who}</div>
          {/* The name and the number are different facts: show both when we have both,
              or the manager cannot tell which number this Nikhil is. */}
          {lead.name && lead.masked && (
            <div className="m-caption text-white/45 m-tabular mt-0.5">{lead.masked}</div>
          )}
        </div>
        {/* SOURCE, not score. The band pill and "92/100 chance to buy" were removed on
            instruction and replaced by where this lead actually came from — FORM, CALL or
            WALK-IN. A chance-to-buy is a model's opinion; the source is a fact, and it is
            what tells the manager how to open the conversation. */}
        {src && (
          <span
            className="shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold uppercase"
            style={{ background: 'rgba(0,112,252,.10)', color: 'var(--si-primary-text)', border: '1px solid rgba(0,112,252,.28)' }}
          >
            {t(src.labelKey, { defaultValue: src.label })}
          </span>
        )}
      </div>

      <div className="m-caption text-white/55 mt-1">
        {[t(src?.labelKey, { defaultValue: src?.label }), lead.value ? rupees(lead.value) : null, relativeTime(lead.atMs)]
          .filter(Boolean).join(' · ')}
      </div>

      {/* What they asked about, when the record carries it. */}
      {lead.category && (
        <div className="m-caption text-white/55 mt-0.5">
          {t(lead.categoryKey, { defaultValue: lead.category })}
        </div>
      )}

      {/* WHO IS THIS? — the manager's own answer (PM feedback 11). A call is anonymous
          until somebody names it, and 42 of the 62 leads here never get a name from the
          platform at all, so this is frequently the only one there will ever be. Keyed
          by the SUBJECT id so it works whether or not a contact record backs the lead.
          Below the meta lines, not between them and the name: dropped in the middle it
          cut the identity ("Nikhil Barve · +91 …120") off from what it is identifying
          ("Form · ₹54K · 2 hours ago"). */}
      <NameField subjectId={customerOf(lead)} known={lead.name} />

      <div className="mt-4 m-subhead text-white/60 mb-2">
        {t('leads.statusTitle', { defaultValue: 'Where is this lead?' })}
      </div>
      <div className="space-y-2">
        {LEAD_STATUSES.map(s => {
          const on = lead.status === s.id
          return (
            <button
              key={s.id}
              onClick={() => move(s.id)}
              className="w-full flex items-center gap-3 px-3 h-12 rounded-xl press text-left"
              style={{
                background: on ? 'rgba(0,112,252,.10)' : 'var(--bg-subtle)',
                border: on ? '1px solid rgba(0,112,252,.40)' : '1px solid var(--border-glass)',
              }}
            >
              <span className="flex-1 min-w-0 m-callout text-white truncate">
                {t(s.labelKey, { defaultValue: s.label })}
              </span>
              {on && <Check size={15} className="shrink-0" style={{ color: '#0070FC' }} />}
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <PrimaryButton
          disabled={!canAskReview}
          onClick={() => { move('review_requested'); onClose?.() }}
        >
          {t('leads.askReview', { defaultValue: 'Request a review' })}
        </PrimaryButton>
        {!canAskReview && (
          <div className="m-caption text-white/45 mt-2 text-center">
            {t('leads.askReviewGate', { defaultValue: 'Mark the lead converted first — a review is only worth asking of someone who bought.' })}
          </div>
        )}
      </div>

      {/* CUSTOMER NOTES — what the customer themselves typed into the enquiry form on
          the microsite (PM feedback 13). Only a FORM lead carries one: nobody types a
          description into a phone call, and a walk-in is recorded by the manager. So
          this is absent on every other source rather than an empty heading.
          Translator TODO: no catalog key for the customer's own form text. */}
      {lead.micrositeNote && (
        <div className="mt-5">
          <div className="m-headline text-white mb-2">Customer notes</div>
          <Card className="!p-3.5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}>
                <FileText size={15} style={{ color: '#0070FC' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="m-body text-white/90 whitespace-pre-wrap">{lead.micrositeNote}</p>
                <div className="m-caption text-white/55 mt-2">From the enquiry form on your microsite</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* HISTORY — every interaction, oldest first, same row the Customers screen draws
          (see components/Timeline.jsx). */}
      <div className="mt-5">
        <div className="m-headline text-white mb-2">{t('customers.history')}</div>
        <Card className={history.length ? '!p-0 overflow-hidden' : '!p-4'}>
          {history.length > 0 ? (
            history.map((entry, i) => (
              <TimelineRow key={i} entry={entry} last={i === history.length - 1} />
            ))
          ) : (
            // Always rendered, even empty — "we have no history for this person" is an
            // answer, and a section that silently disappears reads as a missing feature.
            <div className="m-callout text-white/70">{t('customers.historyEmpty')}</div>
          )}
        </Card>
      </div>

      {/* NOTES — the manager's own words, read and appended through the data layer so
          addCustomerNote() owns the id, timestamp and author.

          Only when a customer record backs this lead: notes hang off that record, and
          addCustomerNote() returns null without one. Rendering the section anyway would
          put an input on screen that silently discards what was typed into it. */}
      {customer && (
        <div className="mt-5">
          <div className="m-headline text-white mb-2">{t('customers.notes')}</div>
          <Card className="!p-3.5">
            {notes.length === 0 ? (
              <>
                <div className="m-callout text-white">{t('customers.notesEmpty')}</div>
                <div className="m-caption text-white/55 mt-0.5">{t('customers.notesEmptySub')}</div>
              </>
            ) : (
              <div className="space-y-2.5">
                {notes.map(n => (
                  <NoteRow
                    key={n.id} note={n} customerId={customer.id} canEdit
                    onSaved={() => setNoteRev(v => v + 1)}
                  />
                ))}
              </div>
            )}
            <NoteComposer
              customerId={customer.id}
              onAdded={() => setNoteRev(n => n + 1)}
            />
          </Card>
        </div>
      )}
    </div>
  )
}

/**
 * Append a note to the customer behind this lead.
 *
 * Owns only the draft text: the record, its id, timestamp and author all come from
 * addCustomerNote(), so nothing here invents one. Clears on success and stays put on
 * refusal (an empty body is refused by the data layer, not by a second check here).
 */
function NoteComposer({ customerId, onAdded }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  function save() {
    if (!text.trim()) return
    vibrate(8)
    const note = addCustomerNote(customerId, text)
    if (note) { setText(''); onAdded?.() }
  }

  return (
    <div className="mt-3 flex items-end gap-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={2}
        placeholder={t('customers.notePlaceholder')}
        aria-label={t('customers.addNote')}
        className="flex-1 min-w-0 rounded-xl px-3 py-2 m-callout text-white resize-none"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}
      />
      <button
        type="button"
        onClick={save}
        disabled={!text.trim()}
        className="shrink-0 px-3 h-10 rounded-xl m-subhead font-semibold press disabled:opacity-40"
        style={{ background: 'rgba(0,112,252,.12)', color: 'var(--si-primary-text)', border: '1px solid rgba(0,112,252,.30)' }}
      >
        {t('customers.addNote')}
      </button>
    </div>
  )
}
