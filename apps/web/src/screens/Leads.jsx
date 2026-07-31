import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PhoneCall, FileText, Store as StoreIcon, Users as UsersIcon, Check, Lock, Repeat2, ChevronRight } from 'lucide-react'
import { NameField, NoteRow } from './Customers.jsx'

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
  getCustomerById, getCustomerNotes, addCustomerNote, customerDialDigits, recordedName,
} from '@connect/core'
import { Card, Chip, CLIPill, StoreGroupHeader, PrimaryButton } from '../components/UI.jsx'
import ScreenScroll from '../components/ScreenScroll.jsx'
import { LargeTitle } from '../components/TopBar.jsx'
import { TimelineRow } from '../components/Timeline.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
import ScopePill from '../components/ScopePill.jsx'
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

  // Counts come from the store scope only — NOT from the status/source filters, or every
  // chip but the active one would read zero and the row would stop being usable.
  const counts = useMemo(() => leadCounts({ storeId: scopeId }), [scopeId, version])

  const list = useMemo(
    () => getLeads({ storeId: scopeId, status, source }),
    [scopeId, status, source, version],
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
        <div className="mb-3">
          <ScopePill store={store} onSwitchStore={onSwitchStore} />
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
                  <LeadCard lead={lead} onOpen={() => setOpenId(lead.id)} />
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

      <BottomSheet open={!!open} onClose={() => setOpenId(null)} fullHeight label={open?.name || open?.masked}>
        {open && <LeadDetail lead={open} onClose={() => setOpenId(null)} />}
      </BottomSheet>
    </ScreenScroll>
  )
}

/** The status pill — the one thing the manager scans for. */
function StatusPill({ status }) {
  const { t } = useTranslation()
  const meta = LEAD_STATUSES.find(s => s.id === status)
  if (!meta) return null
  // Missed is the only state that is a PROBLEM; converted and review-requested are wins;
  // the rest are simply where the lead is. Colour says which of the three it is rather
  // than giving five states five colours nobody can hold in their head.
  const tone = status === 'missed'
    ? { bg: 'rgba(220,38,38,.10)', fg: '#B91C1C', bd: 'rgba(220,38,38,.30)' }
    : status === 'converted' || status === 'review_requested'
      ? { bg: 'rgba(22,163,74,.10)', fg: '#15803D', bd: 'rgba(22,163,74,.30)' }
      : { bg: 'var(--bg-subtle)', fg: 'var(--text-secondary)', bd: 'var(--border-glass)' }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold shrink-0"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}
    >
      {t(meta.labelKey, { defaultValue: meta.label })}
    </span>
  )
}

function LeadCard({ lead, onOpen }) {
  const { t } = useTranslation()
  const Icon = SOURCE_ICON[lead.source] || PhoneCall
  // The name the MANAGER recorded outranks the platform's: they typed it because
  // what we hold is a masked number. Read here rather than only on the detail, or a
  // name saved on the sheet never reaches the card it was opened from.
  const who = recordedName(customerOf(lead)) || lead.name || lead.masked
  const src = LEAD_SOURCES.find(s => s.id === lead.source)

  // A MISSED CALL IS THE ONE ROW WITH AN ACTION ON IT. Everything else in this list is a
  // record to read; a missed call is somebody still waiting to be rung back, so it gets
  // the treatment the Calls screen gives it — how many times they tried, when, and the
  // call-back button — instead of being flattened into the same row as a walk-in from
  // last Tuesday. Same idiom as Missed.jsx's CallCard, on lead data.
  const missedCall = lead.source === 'call' && lead.status === 'missed'
  if (missedCall) return <MissedCallCard lead={lead} onOpen={onOpen} />

  return (
    <Card onClick={onOpen} label={who} className="!p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-2xl grid place-items-center shrink-0"
          style={{ background: 'rgba(0,112,252,.14)', border: '1px solid rgba(0,112,252,.28)' }}
        >
          <Icon size={18} style={{ color: '#0070FC' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="m-headline text-white truncate">{who}</div>
            {lead.cli != null && <CLIPill score={lead.cli} size="sm" />}
          </div>
          <div className="m-subhead text-white/55 mt-0.5 truncate">
            {[t(src?.labelKey, { defaultValue: src?.label }), lead.value ? rupees(lead.value) : null, lead.category]
              .filter(Boolean).join(' · ')}
          </div>
          <div className="m-caption text-white/45 mt-0.5">{relativeTime(lead.atMs)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <StatusPill status={lead.status} />
      </div>
    </Card>
  )
}

/**
 * The missed call, as the Calls screen draws it: repeat count on the glyph, the masked
 * number under a lock, when it came in and how often, the chance-to-buy band, and one
 * filled Call back pill on its own hairline-separated row.
 *
 * CALL BACK does two things, both real. It dials — a true `tel:` — but only where we
 * actually hold a number: a call record carries none, so that means the ones matched to
 * a customer. And it moves the lead `missed → contacted`, which is the transition this
 * whole screen exists to record, so the row stops being outstanding whether or not the
 * handset could be opened. The button never pretends: where there is no number it says
 * so by not dialling, and the status change is what it can honestly promise.
 */
function MissedCallCard({ lead, onOpen }) {
  const { t } = useTranslation()
  const digits = lead.customerId ? customerDialDigits(lead.customerId) : null
  // Eleven buttons all named "Call back" is eleven identical announcements and no way to
  // tell whose. The visible label stays short; the ACCESSIBLE name carries the person.
  // The name the MANAGER recorded outranks the platform's: they typed it because
  // what we hold is a masked number. Read here rather than only on the detail, or a
  // name saved on the sheet never reaches the card it was opened from.
  const who = recordedName(customerOf(lead)) || lead.name || lead.masked

  function callBack(e) {
    e.stopPropagation()
    vibrate([10, 20, 10])
    updateLeadStatus(lead, 'contacted')
    if (digits) window.location.href = `tel:${digits}`
  }

  return (
    <Card onClick={onOpen} label={who} className="!p-0 overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="relative shrink-0">
          <div
            className="w-11 h-11 rounded-2xl grid place-items-center"
            style={{ background: 'rgba(0,112,252,.14)', border: '1px solid rgba(0,112,252,.28)' }}
          >
            <PhoneCall size={18} style={{ color: '#0070FC' }} />
          </div>
          {lead.repeats > 1 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold grid place-items-center px-1"
              style={{ background: '#0070FC', color: 'white', boxShadow: '0 2px 8px rgba(0,112,252,.55)' }}
            >
              {lead.repeats}×
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Lock size={10} className="shrink-0 text-white/45" aria-hidden="true" />
              <span className="m-headline text-white m-tabular truncate">{who}</span>
            </div>
            {/* Band only, no score: on a row whose job is "ring this person back", the
                number is noise — hot/warm/cold is the whole decision. */}
            {lead.cli != null && <CLIPill score={lead.cli} size="sm" showScore={false} />}
          </div>

          <div className="m-subhead text-white/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
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

          {(lead.value || lead.category) && (
            <div className="m-caption text-white/45 mt-0.5 truncate">
              {[lead.value ? rupees(lead.value) : null, lead.category && t(lead.categoryKey, { defaultValue: lead.category })]
                .filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

        <ChevronRight size={16} className="shrink-0 self-center text-white/30" aria-hidden="true" />
      </div>

      <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--border-hairline)' }}>
        <button
          onClick={callBack}
          aria-label={t('common.callBack', { defaultValue: 'Call back' }) + ' ' + who}
          // h-11 === 44px === --m-touch-min.
          className="w-full h-11 rounded-full m-headline press inline-flex items-center justify-center gap-2"
          style={{ background: '#0070FC', color: 'white', boxShadow: '0 1px 2px rgba(15,23,42,.08)' }}
        >
          <PhoneCall size={16} className="shrink-0" />
          <span className="truncate">{t('common.callBack', { defaultValue: 'Call back' })}</span>
        </button>
      </div>
    </Card>
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
        {/* CHANCE TO BUY — hot / warm / cool / cold, off the same score the list ranks
            on. It was on the card and not in the sheet, which is backwards: the card is
            where you scan, the sheet is where you decide. */}
        {lead.cli != null && <CLIPill score={lead.cli} />}
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
