import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, Users, ChevronRight, Sparkles, PhoneMissed, PhoneIncoming, PhoneOutgoing,
  Link as LinkIcon, Star as StarIcon, PhoneCall, MessageCircle, Lock as LockIcon, Flame,
  NotebookPen, Copy, Send, Plus, Check, Info, AlertTriangle, UserPlus, Mail, MapPin, User as UserIcon,
  Pencil, UserPen, FileText, MessageSquare
} from 'lucide-react'
import { LargeTitle } from '../components/TopBar.jsx'
import { TimelineRow } from '../components/Timeline.jsx'
import { Card, AICard, Chip, IconBtn, CLIPill, AIShimmer, PrimaryButton, GhostButton, StoreBadge, StoreGroupHeader } from '../components/UI.jsx'
import BottomSheet, { SheetSubview, SheetViews } from '../components/BottomSheet.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import { useToast } from '../components/Toast.jsx'
import { vibrate, cn } from '../lib/utils.js'
import { useDataVersion } from '../lib/useDataVersion.js'
import { useTranslation } from 'react-i18next'
import {
  getCustomers, groupByStore, getCustomerById, getCustomerNotes, addCustomerNote, addCustomer,
  updateCustomerNote, recordedName, setRecordedName, LEAD_STATUSES, leadStatusOf,
  callReasonForCustomer,
  customerDialDigits, isIndianMobile, isEmailAddress, isManuallyAdded,
  customerSourceType, customerSourceKey, CUSTOMER_INTENTS, assignedStores,
  getCurrentUser, rupees, askAI, relativeTime, calendarDate,
} from '@connect/core'
import { track } from '@connect/core/analytics.js'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
const STORE = getCurrentUser().store

// ============================================================
// WHO IS THIS? — the identity rule for a customer row.
//
// Ten of eleven records hold no name (an ad caller is a number until he buys), so a
// list that leads with `masked` leads with the ONE thing that identifies nobody: two
// different people on this screen genuinely mask to "+91 ●●●●● ●●231" (cust-231 and
// cust-231b — see the seed's own note, last-three is a display convenience, never an
// identity). So the row leads with the most identifying REAL thing we hold:
//
//   name, when we have one                    → "Anand Rao"
//   otherwise what they want, and for how much → "Air Conditioner · ₹38K"
//
// The masked number drops to the third line where it belongs — a detail you confirm,
// not a label you recognise someone by — and when two records share their last three
// digits BOTH rows say so out loud rather than letting the dealer discover it on the
// call. Everything here is derived from the record; nothing new is invented.
// ============================================================

/** The masked forms that more than one customer answers to — the collision set. */
// Exported with the card: two customers whose masked digits end the same way is a
// warning the card renders, and a book that shows the card without it would be quietly
// dropping the caution.
export function collidingMasks(list) {
  const seen = new Map()
  for (const c of list) seen.set(c.masked, (seen.get(c.masked) || 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([m]) => m))
}

const FILTERS = [
  { id: 'all', labelKey: 'common.all' },
  { id: 'hot', labelKey: 'customers.filterHot', icon: Flame },
  { id: 'review-pending', labelKey: 'customers.filterReviewPending' },
  { id: 'reviewed', labelKey: 'customers.filterReviewed' },
  { id: 'repeat', labelKey: 'customers.filterRepeat' },
]

export default function Customers({ store, onOpenProfile }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('all')
  const [branch, setBranch] = useState('all') // cumulative view only
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)
  // addCustomer() pushes onto the SAME array getCustomers() returns, in place — invisible
  // to React until the version bumps. Reading it here is what subscribes this screen, so
  // a customer added on the sheet below shows up in the list behind it immediately.
  const v = useDataVersion()
  // The branch's own customer book; All-locations passes nothing, which the data layer
  // reads as every store.
  const aggregate = !!store?.aggregate
  const scopeId = aggregate ? undefined : store?.id
  const all = useMemo(() => getCustomers(scopeId), [v, scopeId])
  const sharedMasks = useMemo(() => collidingMasks(all), [v, all])

  const list = useMemo(() => {
    let arr = [...all]
    if (filter === 'hot') arr = arr.filter(c => c.cli >= 75)
    if (filter === 'review-pending') arr = arr.filter(c => c.reviewSent && !c.reviewed)
    if (filter === 'reviewed') arr = arr.filter(c => c.reviewed)
    if (filter === 'repeat') arr = arr.filter(c => c.callCount >= 2)
    // Scored customers first, highest chance-to-buy down. A hand-entered contact has NO
    // score (null, not zero — see toCustomerRecord in core), so it cannot be ranked
    // against one and sits below the ranked list, newest first: the row you just created
    // is the top of the unscored group, which is where you look for it.
    arr.sort((a, b) => {
      const av = a.cli, bv = b.cli
      if (av == null && bv == null) return (b.addedAtMs || 0) - (a.addedAtMs || 0)
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
    return arr
  }, [filter, v, all])

  // One group per branch in the cumulative view; a single unlabelled group otherwise,
  // so the list markup below has exactly one shape to render. Declared AFTER `list`,
  // which it reads — a const referenced before its line is a TDZ crash, not a warning.
  //
  // `allGroups` is grouped BEFORE the branch filter, because the picker's counts come
  // from it: filter first and every branch but the chosen one would read 0, which is
  // exactly when you need the counts to decide where to go next.
  const allGroups = useMemo(
    () => (aggregate ? groupByStore(list) : [{ storeId: null, label: null, count: list.length, items: list }]),
    [aggregate, list],
  )
  const groups = useMemo(
    () => (branch === 'all' ? allGroups : allGroups.filter(g => g.storeId === branch)),
    [allGroups, branch],
  )
  // Headings only earn their space when there is more than one branch below them; with
  // a branch chosen, the picker above already says which.

  const reviewPending = all.filter(c => c.reviewSent && !c.reviewed).length
  const totalValue = all.reduce((s, c) => s + (c.value || 0), 0)

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      <LargeTitle
        title={t('customers.title')}
        sub={t('customers.subtitle', { count: all.length })}
        right={
          <div className="flex items-center">
            <NotificationBell />
            <ProfileButton onClick={onOpenProfile} />
            <IconBtn icon={Search} label={t('common.search')} />
            <IconBtn
              icon={UserPlus}
              onClick={() => { vibrate(12); setAdding(true) }}
              label={t('customers.addCustomer', { defaultValue: 'Add customer' })}
            />
          </div>
        }
      />

      <div className="px-4">
        {/* KPI strip */}
        {/* Feedback round 4: the Hot KPI came off the hero — the Hot FILTER chip below
            already carries that count, and two of the three hero numbers were about
            temperature. The strip now answers "what is waiting" and "what is it worth". */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <KPI label={t('customers.statReviewPending')} value={reviewPending} color="#38BDF8" />
          <KPI label={t('customers.statTotalValue')} value={rupees(totalValue)} color="#0070FC" />
        </div>

        {/* WHICH BRANCH — cumulative view only. Above the filter chips and visually
            unlike them on purpose: it picks the SET of records, the chips narrow
            whatever set that is. */}
        {aggregate && (
          <div className="mb-3">
            <LocationPicker value={branch} onChange={setBranch} groups={allGroups} total={list.length} />
          </div>
        )}

        {/* Filter chips */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          {FILTERS.map(f => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} icon={f.icon}>{t(f.labelKey)}</Chip>
          ))}
        </div>

        {/* What the number on every pill means — said ONCE, here, where the pills are.
            Before this the list showed a bare "95 · Hot" and nothing on the screen said
            95 of what. The pill's own tooltip (common.chanceToBuyTitle) is a hover, and
            a dealer on a phone never hovers. */}
        <div className="flex items-start gap-1.5 mb-2.5 m-caption text-white/45">
          <Info size={11} className="mt-[3px] shrink-0" />
          <span>
            {t('customers.scoreLegend', {
              defaultValue: 'The pill on each card is our chance-to-buy score out of 100 — the higher it is, the readier they are to buy.',
            })}
          </span>
        </div>

        {/* List. In the cumulative view these are several shops' books shown together,
            not one book — so they are grouped under the branch they belong to instead of
            interleaved with a badge on every row. */}
        <div className="space-y-2.5">
          {groups.map(g => (
            <div key={g.storeId ?? 'all'} className="space-y-2.5">
              {g.label && branch === 'all' && <StoreGroupHeader label={g.label} count={g.count} />}
              {g.items.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                  <CustomerCard customer={c} aggregate={false} onOpen={() => setSelectedId(c.id)} sharedMask={sharedMasks.has(c.masked)} />
                </motion.div>
              ))}
            </div>
          ))}
          {list.length === 0 && (
            <Card className="!p-6 text-center">
              <Users size={28} className="mx-auto text-white/40 mb-2" />
              <div className="m-headline text-white">{t('customers.emptyTitle')}</div>
              <div className="m-caption text-white/60">{t('customers.emptySub')}</div>
              {/* An empty book is exactly where "add one" belongs — the header icon is
                  discoverable once you know it is there, this is discoverable when you
                  have nothing else to tap. */}
              {filter === 'all' && (
                <div className="mt-4">
                  <PrimaryButton icon={UserPlus} onClick={() => { vibrate(12); setAdding(true) }}>
                    {t('customers.addFirstCustomer', { defaultValue: 'Add your first customer' })}
                  </PrimaryButton>
                </div>
              )}
            </Card>
          )}
          <div className="h-4" />
        </div>
      </div>

      {/* Same entry point the Calls screen uses — see CustomerDetailSheet. */}
      <CustomerDetailSheet customerId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />

      <BottomSheet open={adding} onClose={() => setAdding(false)} fullHeight label={t('customers.addCustomer', { defaultValue: 'Add customer' })}>
        {adding && (
          <AddCustomerSheet
            onClose={() => setAdding(false)}
            onOpenExisting={(id) => { setAdding(false); setSelectedId(id) }}
          />
        )}
      </BottomSheet>
    </div>
  )
}

// ============================================================
// ADD A CUSTOMER
//
// PM feedback: "Flow of addition new customer is missing. While adding new customer,
// record customer details: NAME, PHONE NUMBER, EMAIL, Address."
//
// The form owns nothing but the typing. addCustomer() in the data layer owns the id, the
// timestamp, the author, the mask, the validation and the persistence — so this component
// cannot invent a record, and the same rules apply to any other screen that later grows
// an add button.
//
// VALIDATION IS SHOWN, NOT ENFORCED BY DISABLING ALONE. A dead grey button teaches
// nothing: the dealer is left guessing which of four fields it is unhappy about. So each
// field states its own problem the moment it can be judged (on blur, or as soon as a
// wrong-length number can no longer become a right one), and the submit still re-asks the
// data layer — which is the only thing that can answer the duplicate question.
// ============================================================

/** One labelled field, in the login screen's idiom: label, framed box, message underneath. */
function Field({ label, hint, error, optional, icon: Icon, children }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 ml-1">
        <label className="m-subhead text-white/60">{label}</label>
        {optional && (
          <span className="m-caption text-white/40">
            {t('customers.addOptional', { defaultValue: 'Optional' })}
          </span>
        )}
      </div>
      <div
        className="mt-2 rounded-2xl flex items-start px-4 glass"
        style={error ? { borderColor: 'rgba(220,38,38,.55)', boxShadow: '0 0 0 4px rgba(220,38,38,.10)' } : undefined}
      >
        {Icon && <Icon size={18} className="text-white/50 shrink-0 mt-[15px]" />}
        {Icon && <span className="mx-3 h-6 w-px bg-white/15 mt-[13px]" />}
        {children}
      </div>
      <div className={cn('m-footnote mt-2 px-1 min-h-[16px] flex items-start gap-1.5', error ? 'text-[#DC2626]' : 'text-white/45')}>
        {error && <AlertTriangle size={11} className="shrink-0 mt-[2px]" />}
        <span>{error || hint}</span>
      </div>
    </div>
  )
}

// Every input is ≥44px tall (--m-touch-min); h-14 is the login screen's own field height.
const INPUT = 'flex-1 h-14 bg-transparent text-white m-headline outline-none placeholder:text-white/30'

export function AddCustomerSheet({ storeId, onClose, onOpenExisting }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  // null until the shop owner actually picks one — see the note at the selector below.
  const [intent, setIntent] = useState(null)
  // WHICH BRANCH THIS CUSTOMER JOINS. In a single-store session that is settled — the
  // session IS a branch. On All-locations there is no answer to assume, and quietly
  // filing a walk-in against the flagship would put them in a book they never walked
  // into, so the sheet asks. Required exactly when it is genuinely unknown.
  const needsBranch = !storeId
  const [branch, setBranch] = useState(null)
  const effectiveStoreId = storeId || branch
  // Which fields the dealer has finished with. Nothing is scolded while it is still
  // being typed — a half-typed number is not a wrong number.
  const [touched, setTouched] = useState({})
  // What the data layer refused, if it did. Only it can answer "already in the book?".
  const [refusal, setRefusal] = useState(null)
  const touch = (k) => setTouched(prev => ({ ...prev, [k]: true }))

  const nameOk = name.trim().length > 0
  const phoneOk = isIndianMobile(phone)
  const emailOk = !email.trim() || isEmailAddress(email)
  const ready = nameOk && phoneOk && emailOk && !!effectiveStoreId

  const nameError = touched.name && !nameOk
    ? t('customers.addErrorName', { defaultValue: 'Enter the customer’s name.' })
    : null
  // A number is judged once it is 10 digits (right or wrong), or once the field is left.
  const phoneError = (touched.phone || phone.length >= 10) && !phoneOk
    ? t('customers.addErrorPhone', { defaultValue: 'Enter a 10-digit mobile number starting 6–9.' })
    : (refusal?.reason === 'duplicate'
        ? t('customers.addErrorDuplicate', { defaultValue: 'That number is already in your customer book.' })
        : null)
  const emailError = touched.email && !emailOk
    ? t('customers.addErrorEmail', { defaultValue: 'That doesn’t look like an email address — check for a typo.' })
    : null

  function submit() {
    setTouched({ name: true, phone: true, email: true, address: true })
    const res = addCustomer({ name, phone, email, address, intent, storeId: effectiveStoreId })
    if (!res.ok) {
      setRefusal(res)
      vibrate(30)
      return
    }
    setRefusal(null)
    vibrate(15)
    // NO track() HERE, deliberately. `customer_added` is not in the ANALYTICS_EVENTS
    // allowlist (packages/core/analytics.js), and track() drops any event the schema
    // does not declare — so calling it would be a line that looks like telemetry, emits
    // a dev warning, and measures nothing. The event belongs in that schema first (with
    // customer_id / has_email / has_address, no PII), and that file is not this change's
    // to edit. Wiring it up is one line here once it is declared.
    toast?.push({
      kind: 'success',
      title: t('customers.addedToast', { name: res.customer.name, defaultValue: '{{name}} added to your customers' }),
    })
    onClose?.()
  }

  // Anything the data layer refused that is not already sitting under a field.
  const generalError = refusal && !refusal.ok && !['phone', 'duplicate', 'name', 'email'].includes(refusal.reason)
    ? t(refusal.errorKey, { defaultValue: refusal.error })
    : null

  return (
    <div className="px-4 pb-6">
      <div className="m-title2 text-white">{t('customers.addCustomer', { defaultValue: 'Add customer' })}</div>
      <div className="m-caption text-white/55 mt-0.5">
        {t('customers.addSubtitle', {
          store: STORE.name,
          defaultValue: 'Someone who walked in or was referred — record them so {{store}} can follow up.',
        })}
      </div>

      <Field
        label={t('customers.addName', { defaultValue: 'Full name' })}
        hint={t('customers.addNameHint', { defaultValue: 'How you would greet them on the phone.' })}
        error={nameError}
        icon={UserIcon}
      >
        <input
          autoFocus
          value={name}
          onChange={e => { setName(e.target.value.slice(0, 120)); setRefusal(null) }}
          onBlur={() => touch('name')}
          placeholder={t('customers.addNamePlaceholder', { defaultValue: 'Anand Rao' })}
          autoComplete="off"
          className={INPUT}
        />
      </Field>

      <Field
        label={t('customers.addPhone', { defaultValue: 'Mobile number' })}
        hint={t('customers.addPhoneHint', { defaultValue: 'Stored in full so you can call them; shown masked everywhere.' })}
        error={phoneError}
        icon={PhoneCall}
      >
        <span className="m-headline text-white/85 m-tabular self-center">+91</span>
        <span className="mx-3 h-6 w-px bg-white/15 self-center" />
        <input
          inputMode="numeric"
          pattern="\d*"
          maxLength={10}
          value={phone}
          onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setRefusal(null) }}
          onBlur={() => touch('phone')}
          placeholder="98450 12342"
          autoComplete="off"
          className={cn(INPUT, 'm-tabular')}
        />
      </Field>

      {/* The duplicate refusal is the one that has somewhere better to send you. */}
      {refusal?.reason === 'duplicate' && refusal.existingId && (
        <button
          onClick={() => onOpenExisting?.(refusal.existingId)}
          className="w-full mt-1 mb-1 px-3 rounded-xl min-h-[var(--m-touch-min)] press flex items-center justify-between gap-2"
          style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}
        >
          <span className="m-subhead text-white/85 text-left">
            {t('customers.addOpenExisting', { defaultValue: 'Open the customer we already have' })}
          </span>
          <ChevronRight size={16} className="text-white/55 shrink-0" />
        </button>
      )}

      <Field
        label={t('customers.addEmail', { defaultValue: 'Email' })}
        hint={t('customers.addEmailHint', { defaultValue: 'For the invoice or the warranty — leave it blank if they did not give one.' })}
        error={emailError}
        optional
        icon={Mail}
      >
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={e => { setEmail(e.target.value.slice(0, 254)); setRefusal(null) }}
          onBlur={() => touch('email')}
          placeholder={t('customers.addEmailPlaceholder', { defaultValue: 'anand@example.com' })}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={INPUT}
        />
      </Field>

      <Field
        label={t('customers.addAddress', { defaultValue: 'Address' })}
        hint={t('customers.addAddressHint', { defaultValue: 'Where a delivery or an installation would go.' })}
        optional
        icon={MapPin}
      >
        <textarea
          value={address}
          onChange={e => { setAddress(e.target.value.slice(0, 500)); setRefusal(null) }}
          onBlur={() => touch('address')}
          placeholder={t('customers.addAddressPlaceholder', { defaultValue: '127, 100 Feet Road, Indiranagar, Bangalore 560038' })}
          rows={3}
          className="flex-1 bg-transparent text-white m-body outline-none resize-none py-3.5 min-h-[var(--m-touch-min)] placeholder:text-white/30"
        />
      </Field>

      {/* All-locations only: the branch this walk-in belongs to. */}
      {needsBranch && (
        <div className="mt-4">
          <div className="m-subhead text-white/60 ml-1" id="add-branch-label">
            {t('stores.branch', { defaultValue: 'Branch' })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="add-branch-label">
            {assignedStores().map(loc => (
              <Chip key={loc.id} active={branch === loc.id} onClick={() => { vibrate(6); setBranch(loc.id) }}>
                {loc.branch}
              </Chip>
            ))}
          </div>
          {!branch && (
            <div className="mt-1.5 m-caption text-white/45 ml-1">
              {t('customers.pickBranchHint', { defaultValue: 'Pick the store they walked into.' })}
            </div>
          )}
        </div>
      )}

      {/* Design review 3, item 12: the shop owner's own read of how keen they are.
          OPTIONAL, and clearable by tapping the chosen one again — a contact nobody has
          sized up yet must stay unscored rather than defaulting to "cold", which would be
          the app inventing a verdict it has no basis for. Stored as `intent`, never as a
          fabricated chance-to-buy score. */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 ml-1">
          <span className="m-subhead text-white/60" id="add-intent-label">
            {t('customers.addIntent', { defaultValue: 'How keen are they?' })}
          </span>
          <span className="m-caption text-white/40">
            {t('customers.addOptional', { defaultValue: 'Optional' })}
          </span>
        </div>
        <div className="mt-2 flex gap-2" role="group" aria-labelledby="add-intent-label">
          {CUSTOMER_INTENTS.map(v => {
            const active = intent === v
            const label = v === 'hot' ? t('common.hot') : v === 'warm' ? t('common.warm') : t('common.cold')
            return (
              <button
                key={v}
                type="button"
                aria-pressed={active}
                onClick={() => { vibrate(6); setIntent(active ? null : v) }}
                className="inline-flex items-center justify-center press min-h-[var(--m-touch-min)]"
              >
                <span
                  className="inline-flex items-center px-3.5 h-9 rounded-full m-subhead font-medium md-state"
                  style={active
                    ? { background: '#0070FC', color: '#fff', border: '1px solid rgba(255,255,255,.18)' }
                    : { background: 'var(--bg-pill-idle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {generalError && (
        <div className="m-footnote text-[#DC2626] mt-1 px-1 flex items-start gap-1.5">
          <AlertTriangle size={11} className="shrink-0 mt-[2px]" /> <span>{generalError}</span>
        </div>
      )}

      <div className="mt-5">
        <PrimaryButton icon={UserPlus} onClick={submit} disabled={!ready}>
          {t('customers.addCustomer', { defaultValue: 'Add customer' })}
        </PrimaryButton>
        <div className="m-caption text-white/45 mt-2.5 flex items-start gap-1.5">
          <LockIcon size={11} className="shrink-0 mt-[2px]" />
          <span>
            {t('customers.addPrivacyHint', {
              defaultValue: 'Saved on this device and to your store’s records. The number is shown masked on every screen, like everyone else’s.',
            })}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * The customer detail, as a self-contained sheet openable from anywhere with just an id.
 *
 * This is the destination behind a call card: a call record carries `customerId`, so the
 * Calls screens can render
 *
 *   <CustomerDetailSheet customerId={call.customerId} open={!!open} onClose={close} />
 *
 * and get the identity, the AI read, the history, the notes and the review-link builder
 * without knowing anything about this screen. An unknown id renders nothing rather than
 * an empty sheet.
 */
export function CustomerDetailSheet({ customerId, open, onClose }) {
  const customer = customerId ? getCustomerById(customerId) : null
  return (
    <BottomSheet open={open && !!customer} onClose={onClose} fullHeight label={customer?.name || customer?.masked}>
      {open && customer && <CustomerDetail customer={customer} />}
    </BottomSheet>
  )
}

function KPI({ label, value, color }) {
  return (
    <Card className="!p-3">
      <div className="m-caption text-white/55">{label}</div>
      <div className="m-title2 text-white m-tabular mt-1">{value}</div>
      <div className="mt-1.5 h-1 rounded-full" style={{ background: 'var(--bg-subtle)' }}>
        <div className="h-1 rounded-full" style={{ width: '60%', background: color }} />
      </div>
    </Card>
  )
}

/**
 * The product interest on a record, or null.
 *
 * A hand-entered contact has NO category — nobody has asked them what they came for yet —
 * and `t(undefined)` would render an empty string that reads like a missing translation.
 * Null here means "we genuinely don't know", and every caller branches on it.
 */
function categoryLabel(t, customer) {
  if (!customer.category && !customer.categoryKey) return null
  return t(customer.categoryKey, { defaultValue: customer.category })
}

/** English fallbacks for the source labels — the catalogs carry the localised ones. */
const SOURCE_FALLBACK = { call: 'Call lead', form: 'Form lead', walk_in: 'Walk-in' }

/**
 * The shop owner's hand-set intent, rendered as a band with NO number.
 *
 * Reuses the CLI pill's band styling so hot / warm / cold read identically wherever they
 * appear, but prints only the word: a typed-in contact has no measured chance-to-buy, and
 * printing one would be inventing a score the platform never calculated.
 */
function IntentTag({ intent }) {
  const { t } = useTranslation()
  const label = intent === 'hot' ? t('common.hot') : intent === 'warm' ? t('common.warm') : t('common.cold')
  return (
    <span
      className="cli-pill inline-flex items-center rounded-full px-2 h-6 m-micro shrink-0"
      data-band={intent}
    >
      {label}
    </span>
  )
}

// Exported so the store drill-down can render the customer book with the SAME card and
// the SAME detail rather than growing a second, drifting pair. Customers is a full-build
// SCREEN, but that is about what is routable, not about what may be imported — and the
// bundle already carries this file either way (see lib/features.js on scope vs size).
export function CustomerCard({ customer, onOpen, sharedMask, aggregate, footer, reason }) {
  const { t } = useTranslation()
  const category = categoryLabel(t, customer)
  // `> 0`, NOT `!= null`. A lead's value is never null — fromCall and fromCustomer both
  // `?? 0` it — so the old null check was always true and rupees(0) printed "₹0" on 10
  // records. The shop did not estimate zero, it estimated nothing, and "₹0" is the card
  // asserting this person is worth nothing.
  const amount = customer.value > 0 ? rupees(customer.value) : null
  const calls = t('customers.calls', { count: customer.callCount })
  // Lead with the name when the shop knows it; otherwise with what they came for; and
  // failing THAT, with the number, which is the only handle left.
  //
  // Six records have neither a name nor a category, and both enquiry strings interpolate
  // {{category}} — so they rendered as the literal " enquiry", a card with a blank
  // headline. A masked number is a poor title and an honest one.
  const titleIsNumber = !customer.name && !category
  const title = customer.name
    ? customer.name
    : !category
      ? customer.masked
      : customer.value > 0
        ? t('customers.enquiryTitle', { category, amount, defaultValue: '{{category}} · {{amount}}' })
        : t('customers.enquiryTitleNoValue', { category, defaultValue: '{{category}} enquiry' })
  // The facts we actually hold, in order, joined only where they exist. A hand-entered
  // contact has none of the last two, so it says when it was added instead — which is
  // the only true thing there is to say about it yet.
  //
  // Design review 3, item 13: the row leads with HOW they reached the shop (call lead /
  // form lead / walk-in) rather than what they were browsing. The product interest still
  // titles an UNNAMED record above — for someone with no name it is the only handle
  // there is — but for a named customer the channel is the more useful fact.
  const sourceType = customerSourceType(customer)
  const sourceLabel = t(customerSourceKey(sourceType), { defaultValue: SOURCE_FALLBACK[sourceType] })
  const namedFacts = [sourceLabel, amount, customer.callCount > 0 ? calls : null].filter(Boolean)
  const subline = customer.name
    ? (namedFacts.length
        ? namedFacts.join(' · ')
        : t('customers.addedByYou', {
            when: customer.addedAtMs ? relativeTime(customer.addedAtMs) : '',
            defaultValue: 'Added by you {{when}}',
          }))
    // An UNNAMED row leads with the source too. It used to open with the call count,
    // because the title above already said what they were browsing — true on the
    // Customers book, wrong on the Leads tab, where "how did this reach us" is one of the
    // five facts every card owes and 285 of 305 leads have no name to trigger the branch
    // above. Same rule both ways now: channel first, per design review 3 item 13.
    : `${sourceLabel} · ${calls} · ${t('customers.seenAgo', { when: relativeTime(customer.lastSeenAtMs), defaultValue: 'seen {{when}}' })}`

  // Built here, rendered by CardInsight on the same line as its "+N more" toggle.
  // `.filter(Boolean)` keeps this a countable list, so an absent badge costs nothing.
  // Prefer what the caller knows; fall back to the customer's own most recent call.
  const derived = reason ? null : callReasonForCustomer(customer.id)
  const shownReason = reason || (derived ? t(derived.reasonKey, { defaultValue: derived.reason }) : null)

  // Derived ONCE, because two badges below turn on it and they must not contradict:
  // the lifecycle pill labels `review_requested` "Review link sent", which is word for
  // word what the reviewSent badge says. On the Leads tab that drew the same sentence
  // twice on one card, in two different colours.
  const derivedStatus = leadStatusOf(customer)

  const badges = [
    // PM feedback 8 asked the LEAD CARD for five facts. Four of them were already here
    // (source in the subline, the two review states below, hot/warm/cold as the CLI pill
    // top-right) but the lifecycle STATUS and the CALLING REASON were not — and this is
    // the card the feedback screenshot was actually of: CustomerCard, drawn by the
    // Customers screen and the store drill-down, not the Leads tab's own row.
    // DERIVED through core's leadStatusOf, not read off the record: a customer row
    // carries no `leadStatus` field of its own (most of these were never a call), and
    // leadStatusOf is the same function the Leads tab resolves a status with. A second
    // derivation here is how this card and that list start disagreeing about the same
    // person.
    (() => {
      const st = derivedStatus
      const meta = LEAD_STATUSES.find(x => x.id === st)
      if (!meta) return null
      const good = st === 'converted' || st === 'review_requested'
      const bad = st === 'missed'
      return (
        <span
          key="status"
          className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold"
          style={bad
            ? { background: 'rgba(220,38,38,.10)', color: '#B91C1C', border: '1px solid rgba(220,38,38,.30)' }
            : good
              ? { background: 'rgba(22,163,74,.10)', color: '#15803D', border: '1px solid rgba(22,163,74,.30)' }
              : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}
        >
          {t(meta.labelKey, { defaultValue: meta.label })}
        </span>
      )
    })(),
    // WHY THEY RANG — the fifth fact the lead card owes. Passed in by callers that
    // already hold a call record (AttendedRow), and DERIVED from the customer otherwise
    // so the same card does not show four facts on one screen and five on another.
    // That asymmetry is what made this look unimplemented four times running.
    shownReason && (
      <span
        key="reason"
        className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption"
        style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}
      >
        <MessageSquare size={10} /> {shownReason}
      </span>
    ),
    customer.reviewed && (
      <span key="reviewed" className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold" style={{ background: 'rgba(22,163,74,.10)', color: '#15803D', border: '1px solid rgba(22,163,74,.30)' }}>
        <StarIcon size={10} fill="#F59E0B" stroke="#F59E0B" /> {t('customers.reviewed')}
      </span>
    ),
    // Only where the STATUS pill has not already said it — see derivedStatus above.
    customer.reviewSent && !customer.reviewed && derivedStatus !== 'review_requested' && (
      <span key="sent" className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold" style={{ background: 'rgba(56,189,248,.10)', color: '#0369A1', border: '1px solid rgba(56,189,248,.30)' }}>
        <LinkIcon size={10} /> {t('customers.reviewLinkSent')}
      </span>
    ),
    customer.callCount >= 2 && (
      <span key="calls" className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}>
        {t('customers.callsCount', { count: customer.callCount })}
      </span>
    ),
  ].filter(Boolean)

  return (
    <Card onClick={onOpen} label={title} className="!p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-2xl grid place-items-center shrink-0"
          style={{
            background: 'rgba(0,112,252,.14)',
            border: '1px solid rgba(0,112,252,.28)',
          }}
        >
          <Users size={18} style={{ color: '#0070FC' }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* The band rides on the TITLE's line, inside this column — not as a sibling
              of it. A sibling reserves its width for the column's whole height, so in
              the aggregate view the branch badge pushed the subline and the phone
              number onto extra lines each. Here it only ever shortens the title, which
              already truncates. */}
          <div className="flex items-center justify-between gap-2">
            <div className="m-headline text-white truncate">{title}</div>
            {/* No score is NOT a score of zero. A contact nobody has spoken to through
                the platform has nothing to rank, and a "0 · Cold" pill would be the app
                asserting they will never buy — which it has no basis for. Where the shop
                owner recorded their OWN read instead (design review 3, item 12), show
                that — as a band with no number, because nobody measured one. */}
            <span className="flex items-center gap-1.5 shrink-0">
              {/* Which branch this customer belongs to — aggregate view only. */}
              {aggregate && <StoreBadge storeId={customer.storeId} />}
              {customer.cli != null
                ? <CLIPill score={customer.cli} size="sm" />
                : customer.intent && <IntentTag intent={customer.intent} />}
            </span>
          </div>

          {/* The two detail lines and the chevron, in one row so `items-center` puts
              the glyph at the midpoint of BOTH of them — not on the title above, and
              not on the whole card (which a row-level sibling would do, dragging it
              down past the insight and the badges). */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {/* The facts that separate one caller from the next. A named row still
                  shows what they are buying; an unnamed row already says that in the
                  title, so it shows when they last rang instead — which is how a dealer
                  tells two ●●231s apart at a glance. */}
              <div className="m-subhead text-white/55 mt-0.5">{subline}</div>

              {/* The number, demoted to what it is: a detail you confirm before dialling. */}
              {/* Not when the TITLE is already the number — see titleIsNumber above.
                  Printing it twice in two type sizes reads as two different numbers. */}
              <div className="m-caption text-white/45 mt-0.5 flex items-center gap-1.5 flex-wrap">
                {!titleIsNumber && (
                  <span className="m-tabular inline-flex items-center gap-1">
                    <LockIcon size={9} /> {customer.masked}
                  </span>
                )}
                {sharedMask && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full m-caption font-semibold"
                    style={{ background: 'rgba(202,138,4,.10)', color: '#A16207', border: '1px solid rgba(202,138,4,.30)' }}
                    title={t('customers.sharedDigitsHint', {
                      defaultValue: 'Another customer’s number ends in the same three digits. Check the name and the product before you call.',
                    })}
                  >
                    <AlertTriangle size={9} /> {t('customers.sharedDigits', { defaultValue: 'Shared last 3' })}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={16} className="text-white/45 shrink-0" />
          </div>
        </div>
      </div>

      {/* Below the identity row, NOT inside it: the read and the badges start at the
          card's own left edge, under the avatar rather than indented past it. A
          paragraph that begins in the middle of the card has nothing to align to and
          loses ~56px of measure on a 375px screen.

          The badges are handed to CardInsight rather than rendered as their own row,
          because they belong on the SAME line as its "+N more" toggle. An array (not
          a fragment) so CardInsight can count them and skip the row when it is empty,
          instead of leaving 8px of margin behind nothing. */}
      <CardInsight customer={customer} badges={badges} />

      {/* An optional line the CALLER owns, inside the card and hairlined off from it.
          The store drill-down uses it for the reason spoken on the call — a fact the
          customer record cannot hold, because it belongs to one conversation rather
          than to the person. Outside the card it read as a caption for the NEXT row. */}
      {footer && (
        <div
          className="mt-3 pt-2.5 m-caption text-white/55"
          style={{ borderTop: '1px solid var(--border-hairline)' }}
        >
          {footer}
        </div>
      )}
    </Card>
  )
}

/**
 * The one-line AI read on a customer card.
 *
 * THE BUG: `line-clamp-1` on a 240 px column ended these mid-sentence — "Repeat
 * customer · already…", "Lives near the store · weekday…" — which reads as a broken
 * string rather than a shortened one, and loses the fact the dealer needed.
 *
 * These reads are a '·'-separated list of facts, so we truncate on that separator
 * instead of on a pixel: two whole facts, then "+2 more" to open the rest in place.
 * A read that carries no separator (a translated catalog may not) falls back to two
 * lines of room, which is a word boundary by construction — CSS never breaks a word
 * mid-glyph, it was only ever the ONE-line budget that made it look like it did.
 */
function CardInsight({ customer, badges = [] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  // No read at all is the honest state of a contact somebody just typed in: the AI has
  // seen nothing of them — but the badges are still theirs to show.
  const hasRead = !!(customer.aiGuess || customer.aiGuessKey)
  const text = hasRead ? t(customer.aiGuessKey, { defaultValue: customer.aiGuess }) : ''
  const facts = hasRead ? String(text).split('·').map(s => s.trim()).filter(Boolean) : []
  const hidden = Math.max(0, facts.length - 2)
  const shown = expanded || !hidden ? facts : facts.slice(0, 2)
  // One row, and only if something goes in it.
  const showFooter = hidden > 0 || badges.length > 0
  if (!hasRead && !showFooter) return null

  // No leading Sparkles glyph. `.ai-text` paints a brand gradient and clips it to the
  // TEXT (`background-clip: text; color: transparent`), which also strokes any lucide
  // glyph inside it in transparent — the icon was rendering at rgba(0,0,0,0), i.e.
  // 11px of invisible padding that pushed this paragraph 17px right of the avatar it
  // is supposed to align under. The gradient IS the AI signal here; it needs no badge.
  //
  // No `leading-snug` either: 1.375 × 14px = 19.25px, which is off the 4pt grid.
  // m-callout already carries 20px.
  return (
    <>
      {hasRead && (
        <div className="mt-2 ai-text m-callout">
          <span className={expanded ? '' : 'line-clamp-2'}>{shown.join(' · ')}</span>
        </div>
      )}
      {/* The toggle and the badges share ONE row. `items-center` is what squares the
          14px link against the 24px pills — they have different box heights, so
          aligning their tops or baselines leaves one of them visibly adrift. */}
      {showFooter && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {hidden > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
              className="ai-text m-callout font-semibold underline underline-offset-2 press"
            >
              {expanded
                ? t('customers.insightLess', { defaultValue: 'Show less' })
                : t('customers.insightMore', { n: hidden, defaultValue: '+{{n}} more' })}
            </button>
          )}
          {badges}
        </div>
      )}
    </>
  )
}

/**
 * "Call back" from the customer book is a callback like any other, so it reports the
 * same event the Calls screen reports — callback_initiated, which the Calls path fires
 * from placeCall() in Missed.jsx — here with `from: 'customer_detail'` (vs its `'calls'`),
 * so the pilot can still tell the two entry points apart. `minutes_since_miss` is measured
 * against the most recent MISSED entry on this customer's own timeline; a customer we never
 * missed simply carries no gap, rather than a made-up zero.
 */
function trackCallback(customer) {
  const lastMiss = [...customer.timeline].reverse().find(e => e.type === 'missed')
  track('callback_initiated', {
    customer_id: customer.id,
    channel: 'phone',
    from: 'customer_detail',
    minutes_since_miss: lastMiss ? Math.round((Date.now() - lastMiss.atMs) / 60000) : undefined,
  })
}

export function CustomerDetail({ customer, canNote = true, beforeHistory = null }) {
  const { t } = useTranslation()
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(true)
  // Views WITHIN this sheet, not sheets on top of it. `dir` drives the slide, and
  // scrollTop is put back on the way home so returning from the review link lands you
  // where you were reading, not at the top of the customer again.
  const [view, setView] = useState('detail') // 'detail' | 'review-link'
  const [dir, setDir] = useState(1)
  const rootRef = useRef(null)
  const scrollBack = useRef(0)

  function pushView(next) {
    const sc = rootRef.current?.closest('.overflow-y-auto')
    scrollBack.current = sc ? sc.scrollTop : 0
    setDir(1)
    setView(next)
  }
  function popView() {
    setDir(-1)
    setView('detail')
  }
  // After the detail is back on screen, restore where it was.
  useLayoutEffect(() => {
    if (view !== 'detail') return
    const sc = rootRef.current?.closest('.overflow-y-auto')
    if (sc && scrollBack.current) sc.scrollTop = scrollBack.current
  }, [view])

  // Notes expand in place — see the accordion below.
  const [notesOpen, setNotesOpen] = useState(false)
  // Bumped when a note is added, so the summary row re-reads through the data layer
  // instead of keeping its own copy of the list.
  const [noteRev, setNoteRev] = useState(0)

  const notes = useMemo(() => getCustomerNotes(customer), [customer.id, noteRev])
  const who = customer.name || customer.masked
  // The real number, for the two things that need to address a handset: Call back, and the
  // review-link hand-off. Null when we hold no valid number — both fall back honestly.
  const dialDigits = customerDialDigits(customer)
  const category = categoryLabel(t, customer)
  // A contact somebody typed in: no score, no AI read, no history. Every section below
  // says so plainly rather than rendering an empty version of itself.
  // NOTHING FOR THE AI TO HAVE READ. Two ways that happens: a contact somebody typed
  // in by hand, and a caller the platform never matched to a record (the store
  // drill-down projects those into this shape — see leadAsCustomer in Network.jsx).
  // Both carry no aiGuess, and the fallback below is built by prefixing it, so without
  // this the paragraph opened with the literal string "null".
  const handEntered = isManuallyAdded(customer) || !(customer.aiGuess || customer.aiGuessKey)

  // The 5★-review-on-Google entry is gone from the detail (PM, screen 12) — `reviewed`
  // on the card is where that fact lives now. Notes took its place below.
  const timeline = useMemo(
    () => customer.timeline.filter(e => e.type !== 'review-landed'),
    [customer.id],
  )

  useEffect(() => {
    let cancelled = false
    // Nothing to read. Asking the model for an "About this customer" tip when the only
    // facts on file are a name and a number gets you a confident paragraph invented from
    // nothing — the exact failure this app refuses everywhere else. So we don't ask.
    if (handEntered) {
      setInsight(null)
      setLoading(false)
      return () => { cancelled = true }
    }
    async function gen() {
      setLoading(true)
      const out = await askAI(
        `You are an AI inside a store CRM giving a one-sentence "About this customer" tip to the manager, in plain everyday words (max 22 words). No jargon. Tone: warm, helpful, second-person to the manager.

Customer data:
- ${customer.name || 'Anonymous (masked)'} · ${customer.masked}
- Chance to buy score: ${customer.cli}/100 (${customer.band})
- Likely product: ${customer.category}
- Estimated value: ${rupees(customer.value)}
- Times contacted: ${customer.callCount}
- Quick guess so far: ${customer.aiGuess}
- Last seen: ${customer.lastSeen}

Return ONE sentence only.`,
        {
          temperature: 0.8,
          fallback: customer.aiGuess + '. ' + t('customers.insightFallback'),
        },
      )
      if (!cancelled) {
        setInsight(out)
        setLoading(false)
      }
    }
    gen()
    return () => { cancelled = true }
  }, [customer.id, handEntered])

  return (
    <div ref={rootRef}>
      <SheetViews viewKey={view} dir={dir}>
        {view === 'review-link' ? (
          /* PUSHED, not stacked. Sending a review link is about the customer above it,
             so it belongs in their sheet with a way back to them — not on a second layer
             that covers them and takes two Escapes to leave. */
          <SheetSubview
            title={t('customers.sendReviewLink', { defaultValue: 'Send review link' })}
            onBack={popView}
          >
            <ReviewLinkBuilder
              link={reviewLinkFor(customer)}
              who={who}
              customerId={customer.id}
              greetingName={firstName(customer.name)}
              requiredLast3={maskedLast3(customer.masked)}
              knownDigits={dialDigits}
            />
          </SheetSubview>
        ) : (
    <div className="px-4 pb-6">
      {/* Identity */}
      <div className="flex items-center gap-3">
        <div
          className="on-dark w-14 h-14 rounded-2xl grid place-items-center"
          style={{
            background: '#0070FC',
            boxShadow: '0 6px 18px rgba(0,112,252,.4)',
          }}
        >
          <Users size={22} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Same identity rule as the list: the name when we have it, otherwise what
              they came in for. The number is never the headline. */}
          {/* The record's name IS the page/sheet title, so it carries the heading role.
              As a sheet, BottomSheet's aria-label covered this; routed as a page (the
              store drill-down) there was no h1 on the screen at all. */}
          <div className="m-title2 text-white truncate" role="heading" aria-level={1}>
            {customer.name || category}
          </div>
          <div className="m-caption text-white/55 mt-0.5 inline-flex items-center gap-1 m-tabular">
            <LockIcon size={10} /> {customer.masked}
          </div>
          <div className="m-caption text-white/55">
            {/* The category is already the headline when we hold no name — don't say it twice.
                A hand-entered contact has neither, and says who added it instead. */}
            {[customer.name ? category : null, customer.value != null
              ? t('customers.valueAmount', { amount: rupees(customer.value) })
              : null].filter(Boolean).join(' · ')
              || (handEntered
                ? t('customers.addedBy', { who: customer.addedBy, defaultValue: 'Added by {{who}}' })
                : '')}
          </div>
          {/* The pill's number, in words. It belongs to the identity block, beside the
              name it describes — as its own full-width line under the avatar it read as
              a stray caption and sat further from the pill than from the next section. */}
          {customer.cli != null && (
            <div className="m-caption text-white/45 mt-0.5">
              {t('common.chanceToBuyTitle', { score: customer.cli })}
            </div>
          )}
          {/* WHO IS THIS? — the manager's own answer (PM feedback 11). Most callers
              arrive as a masked number and nothing else, so this is often the first and
              only name anyone will ever hold for them. It sits in the identity block
              because it IS the identity, not a field buried in a form below. */}
          <NameField subjectId={customer.id} known={customer.name} />
        </div>
        {/* self-start: the pill labels the NAME, so it lines up with it rather than
            drifting to the middle of a three-line block. */}
        {customer.cli != null && <CLIPill score={customer.cli} className="self-start" />}
      </div>

      {/* What the manager recorded when he added them. Only rendered for a record that
          HAS these details — the seed's callers have neither, and an "Email —" row would
          be an empty promise rather than information. */}
      {(customer.email || customer.address) && (
        <div className="mt-4">
          <div className="m-headline text-white mb-2">
            {t('customers.contactDetails', { defaultValue: 'Contact details' })}
          </div>
          <Card className="!p-0 overflow-hidden">
            {customer.email && (
              <DetailRow icon={Mail} label={t('customers.addEmail', { defaultValue: 'Email' })}>
                {/* A real mailto:, for the same reason "Call back" is a real tel: — the
                    detail is here so the dealer can act on it, not admire it. */}
                <a href={`mailto:${customer.email}`} className="text-white underline underline-offset-2 break-all">
                  {customer.email}
                </a>
              </DetailRow>
            )}
            {customer.address && (
              <DetailRow icon={MapPin} label={t('customers.addAddress', { defaultValue: 'Address' })} last>
                <span className="text-white whitespace-pre-wrap">{customer.address}</span>
              </DetailRow>
            )}
          </Card>
        </div>
      )}

      {/* Smart guess — skipped entirely when there is nothing for the AI to have read. */}
      {!handEntered && (
        <div className="mt-4">
          {/* No leading glyph — the same call CardInsight already made on the card: the
              gradient below IS the AI signal, and the icon was pushing this heading 46px
              right of "Lead status", "History" and "Notes" for no meaning. */}
          <div className="m-headline text-white mb-2">{t('customers.aboutCustomer')}</div>
          <AICard className="!p-3.5">
            {loading ? (
              <div className="space-y-2">
                <AIShimmer className="h-3 w-[90%]" />
                <AIShimmer className="h-3 w-[70%]" />
              </div>
            ) : (
              <p className="m-body text-white/90">{insight}</p>
            )}
          </AICard>
        </div>
      )}

      {/* A slot the CALLER owns, between what the AI reads and what actually happened.
          The store drill-down puts the lead's lifecycle here: where this enquiry has got
          to is the present tense, and it belongs above the past. Empty on the Customers
          screen, which has a customer but no lead to move. */}
      {beforeHistory}

      {/* CUSTOMER NOTES — the customer's OWN words, typed into the enquiry form on the
          microsite (PM feedback 13). Conditional by nature: only a form lead carries one,
          because nobody types a description into a phone call and a walk-in is recorded
          by the manager. Absent entirely otherwise, rather than an empty heading.
          Read-only and tinted differently from the manager's notes below — this is
          evidence of what the customer asked for, not a working pad.
          Translator TODO: the catalogs carry no key for the customer's own form text. */}
      {customer.micrositeNote && (
        <div className="mt-5">
          <div className="m-headline text-white mb-2">Customer notes</div>
          <Card className="!p-3.5">
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}
              >
                <FileText size={15} style={{ color: '#0070FC' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="m-body text-white/90 whitespace-pre-wrap">{customer.micrositeNote}</p>
                <div className="m-caption text-white/55 mt-2">From the enquiry form on your microsite</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* History timeline */}
      <div className="mt-5">
        <div className="m-headline text-white mb-2">{t('customers.history')}</div>
        <Card className={timeline.length ? '!p-0 overflow-hidden' : '!p-4'}>
          {timeline.length > 0 ? (
            timeline.map((entry, i) => (
              <TimelineRow
                key={i}
                entry={entry}
                last={i === timeline.length - 1}
              />
            ))
          ) : (
            <div className="m-callout text-white/70">
              {handEntered
                ? t('customers.historyAddedEmpty', {
                    who: customer.addedBy,
                    when: customer.addedAtMs ? calendarDate(customer.addedAtMs) : '',
                    defaultValue: 'Nothing yet — {{who}} added this contact on {{when}}. Calls and review links will show up here.',
                  })
                : t('customers.historyEmpty', { defaultValue: 'Nothing recorded against this customer yet.' })}
            </div>
          )}
        </Card>
      </div>

      {/* Notes — what the manager recorded during conversations.
          An ACCORDION, not a second bottom sheet. Adding a note is a small edit to the
          record you are already looking at, and stacking a sheet on top of a sheet buried
          the customer behind the thing you were writing about them — you could no longer
          see the number you quoted or when they last called while typing it down. It
          expands in place instead, so the context stays on screen. */}
      <div className="mt-5">
        <div className="m-headline text-white mb-2">{t('customers.notes', { defaultValue: 'Notes' })}</div>
        <Card className="!p-3.5">
          <button
            type="button"
            onClick={() => { vibrate(6); setNotesOpen(v => !v) }}
            aria-expanded={notesOpen}
            aria-controls={`notes-${customer.id}`}
            className="w-full flex items-center gap-3 text-left press"
          >
            <div
              className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
              style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}
            >
              <NotebookPen size={15} style={{ color: '#0070FC' }} />
            </div>
            <div className="flex-1 min-w-0">
              {notes.length === 0 ? (
                <>
                  <div className="m-callout text-white">{t('customers.notesEmpty', { defaultValue: 'No notes yet' })}</div>
                  <div className="m-caption text-white/55 mt-0.5">{t('customers.notesEmptySub', { defaultValue: 'Jot down what was said — the price you quoted, what you promised, when to follow up.' })}</div>
                </>
              ) : (
                <>
                  <div className="m-callout text-white line-clamp-1">{notes[0].text}</div>
                  <div className="m-caption text-white/55 mt-0.5">
                    {t('customers.notesCount', {
                      count: notes.length,
                      defaultValue_one: '{{count}} note',
                      defaultValue_other: '{{count}} notes',
                    })} · {relativeTime(notes[0].atMs)}
                  </div>
                </>
              )}
            </div>
            {/* The chevron turns down: it is a disclosure now, not a way out to
                somewhere else, and an arrow still pointing right would promise one. */}
            <motion.span
              animate={{ rotate: notesOpen ? 90 : 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="shrink-0 grid place-items-center"
            >
              <ChevronRight size={16} className="text-white/45" />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {notesOpen && (
              <motion.div
                id={`notes-${customer.id}`}
                key="notes-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
                className="overflow-hidden"
              >
                <NotesPanel
                  canNote={canNote}
                  customer={customer}
                  notes={notes}
                  onAdded={() => setNoteRev(v => v + 1)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      {/* Actions.
          "Call back" had no onClick at all — a button that looked live and did nothing.
          It is an <a href="tel:"> now: the phone's own dialler opens with the number filled
          in, the same real hand-off the review link makes to WhatsApp. Rendered as a dead
          control only when we genuinely hold no number, because a dialler we can't address
          is the one case where doing nothing is the honest outcome. */}
      {/* STACKED, not a two-column grid. Side by side gave the two actions equal weight
          when they are not equal — ringing the customer back is the job, sending a review
          link is the follow-up — and at 375px "Send review link" wrapped to two lines
          against "Call back"'s one, so the pair sat ragged. Full width also stops the
          wrap happening again in a language whose label runs longer than English. */}
      <div className="mt-5 space-y-2">
        {dialDigits ? (
          <a
            href={`tel:+91${dialDigits}`}
            onClick={() => { vibrate(15); trackCallback(customer) }}
            className="on-dark h-12 rounded-xl m-headline text-white press flex items-center justify-center gap-2"
            style={{ background: '#0070FC', boxShadow: '0 6px 18px rgba(0,112,252,.35)' }}
          >
            <PhoneCall size={18} /> {t('common.callBack')}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="on-dark h-12 rounded-xl m-headline text-white flex items-center justify-center gap-2 opacity-40"
            style={{ background: '#0070FC' }}
          >
            <PhoneCall size={18} /> {t('common.callBack')}
          </span>
        )}
        <GhostButton icon={MessageCircle} full onClick={() => pushView('review-link')}>
          {t('customers.sendReviewLink')}
        </GhostButton>
      </div>

    </div>
        )}
      </SheetViews>
    </div>
  )
}

/** One "label — value" row on the contact-details card, in the timeline card's idiom. */
function DetailRow({ icon: Icon, label, children, last }) {
  return (
    <div
      className="px-3.5 py-3 flex items-start gap-3"
      style={last ? undefined : { borderBottom: '1px solid var(--border-glass)' }}
    >
      <div
        className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
        style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}
      >
        <Icon size={15} style={{ color: '#0070FC' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="m-caption text-white/55">{label}</div>
        <div className="m-callout mt-0.5">{children}</div>
      </div>
    </div>
  )
}

// ============================================================
// NOTES
//
// The manager's own words about a customer. Read + append, both through the data layer —
// addCustomerNote() owns the id, the timestamp and the author, so nothing here invents a
// record. Note text is never keyed and never translated (see the CUSTOMERS seed note).
// ============================================================

/**
 * The notes body, inside the customer's own card — not a sheet of its own.
 *
 * It takes `notes` from CustomerDetail rather than reading its own copy: the summary
 * line in the header above and this list are the same list, and two components each
 * calling getCustomerNotes() is how they would start disagreeing about the count. One
 * read, one `noteRev` bump, both re-render.
 *
 * No heading and no "what you recorded during conversations with X" subtitle either —
 * the header row it expands from already says Notes, and the whole sheet is already
 * about X.
 */
/**
 * THE NAME THE MANAGER RECORDED (PM feedback 11).
 *
 * Read-only until tapped: on most visits the manager is here to ring somebody, not to
 * edit a field, and an always-open input in the identity block turns the page into a
 * form. Stored as an OVERLAY keyed by subject id (see setRecordedName in core), which is
 * what lets it work on a PROJECTED lead — the callers with no contact record are exactly
 * the ones nobody has a name for.
 */
export function NameField({ subjectId, known }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const own = recordedName(subjectId)
  const [draft, setDraft] = useState(own || known || '')

  function save() {
    setRecordedName(subjectId, draft)
    vibrate(12)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { vibrate(6); setDraft(own || known || ''); setEditing(true) }}
        className="mt-1.5 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full m-micro press md-state"
        style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.28)', color: 'var(--si-primary-text)' }}
      >
        <UserPen size={12} />
        {/* Translator TODO — no catalog key for the empty prompt. */}
        {own || known ? t('reviews.edit', { defaultValue: 'Edit' }) : 'Add name'}
      </button>
    )
  }

  return (
    <div className="mt-2">
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        autoFocus
        maxLength={80}
        placeholder={t('customers.addNamePlaceholder', { defaultValue: 'Anand Rao' })}
        aria-label={t('customers.addName', { defaultValue: 'Full name' })}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        className="w-full h-10 rounded-xl px-3 bg-transparent text-white m-body outline-none placeholder:text-white/35"
        style={{ border: '1px solid var(--border-glass-strong)' }}
      />
      <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={save} className="on-dark h-8 px-3 rounded-full m-subhead font-semibold text-white press" style={{ background: '#0070FC' }}>
          {t('common.save', { defaultValue: 'Save' })}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="h-8 px-3 rounded-full m-subhead text-white/60 press">
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    </div>
  )
}

function NotesPanel({ customer, notes, canNote = true, onAdded }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')

  function add() {
    const note = addCustomerNote(customer.id, draft)
    if (!note) return
    vibrate(15)
    setDraft('')
    onAdded?.()
  }

  return (
    <div className="pt-3.5 mt-3.5" style={{ borderTop: '1px solid var(--border-glass)' }}>
      {/* Composer. No nested Card — this already sits inside one, and a card drawn on
          a card reads as a seam rather than a container.

          Hidden when the record is not one the data layer can write to. A caller that
          was never matched to a saved contact has nowhere for a note to hang, and
          addCustomerNote() would refuse it — an input that silently discards what was
          typed into it is worse than no input. */}
      {canNote && (
      <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('customers.notePlaceholder', { defaultValue: 'What did you agree on? Price quoted, model, when they’re coming in…' })}
          className="w-full bg-transparent text-white m-body outline-none resize-none min-h-[64px] placeholder:text-white/35"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className={cn(
              'on-dark h-10 px-4 rounded-xl m-headline text-white press md-state inline-flex items-center justify-center gap-2',
              !draft.trim() && 'opacity-40',
            )}
            style={{ background: '#0070FC', boxShadow: '0 6px 18px rgba(0,112,252,.35)' }}
          >
            <Plus size={16} /> {t('customers.addNote', { defaultValue: 'Add note' })}
          </button>
        </div>
      </div>
      )}

      {/* History, newest first — ALL of them, including the one previewed in the header.
          That preview is line-clamped to one line and carries no author, so skipping it
          here would leave the newest note as the only one you could never read in full. */}
      {notes.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {notes.map(n => (
            <NoteRow key={n.id} note={n} customerId={customer.id} canEdit={canNote} onSaved={onAdded} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * ONE NOTE — view-only by default, editable on demand (PM feedback 12).
 *
 * "if the dealer is frequently updating the notes, the cursor automatically goes to the
 * last endpoint. He starts editing the notes from where he left last edit, with also a
 * view-only option of notes as well."
 *
 * So: VIEW-ONLY IS THE DEFAULT — a note is read far more often than it is changed, and a
 * list of open textareas is unreadable — and opening an edit drops the caret AFTER the
 * existing text rather than selecting it. Without setSelectionRange the browser restores
 * whatever offset it last had, which after a re-render is 0: the dealer's next keystroke
 * lands in front of everything they wrote yesterday.
 *
 * Editing keeps the note's id, author and ORIGINAL TIME (see updateCustomerNote). An edit
 * is a correction, not a new note, and must not jump to the top of a newest-first list.
 */
export function NoteRow({ note, customerId, canEdit, onSaved }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)
  const ref = useRef(null)

  // Caret to the end, once, after the textarea actually exists.
  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [editing])

  function save() {
    if (!draft.trim()) return
    updateCustomerNote(customerId, note.id, draft)
    vibrate(12)
    setEditing(false)
    onSaved?.()
  }

  if (!editing) {
    return (
      <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-glass)' }}>
        <div className="flex items-start gap-2">
          <p className="m-body text-white/90 whitespace-pre-wrap flex-1 min-w-0">{note.text}</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => { vibrate(6); setDraft(note.text); setEditing(true) }}
              aria-label={t('reviews.edit', { defaultValue: 'Edit' })}
              className="shrink-0 -m-2 p-2 press text-white/40 hover:text-white/70"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
        {/* relativeTime, not dayClock: a note has no frozen string to fall back on,
            and a note history reads as a feed. It also refuses to claim a wall-clock
            time the seed's offsets can't honestly back (see TimelineRow). */}
        <div className="m-caption text-white/55 mt-2">{note.author} · {relativeTime(note.atMs)}</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid rgba(0,112,252,.45)' }}>
      <textarea
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        className="w-full bg-transparent text-white m-body outline-none resize-none min-h-[64px]"
      />
      <div className="flex items-center justify-end gap-2 mt-1">
        <button
          type="button"
          onClick={() => { setDraft(note.text); setEditing(false) }}
          className="h-9 px-3 rounded-full m-subhead text-white/60 press"
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!draft.trim()}
          className={cn('on-dark h-9 px-4 rounded-full m-subhead font-semibold text-white press md-state', !draft.trim() && 'opacity-40')}
          style={{ background: '#0070FC' }}
        >
          {t('common.save', { defaultValue: 'Save' })}
        </button>
      </div>
      <div className="m-caption text-white/45 mt-1">{note.author} · {relativeTime(note.atMs)}</div>
    </div>
  )
}

// ============================================================
// REVIEW LINK BUILDER
//
// Generates the customer's own feedback link and hands the message off to the phone —
// WhatsApp or Messages, the dealer picks. The hand-off is a real navigation to a real URL
// scheme, not a toast: the anchors below carry `https://wa.me/…` and `sms:…`, and the OS
// (or WhatsApp Web, on a desktop) does the rest.
//
// THE NUMBER IS READ, NOT TYPED. Customer records now hold a real `phone` behind
// src/data/customers.js, so the field arrives PREFILLED from the record and the dealer's
// job is to confirm it, not to key it in. That is the whole difference: he is no longer
// re-entering a number the CRM already has, and a slip of the thumb can no longer send a
// customer's review link to a stranger.
//
// It stays EDITABLE on purpose — a number can be stale, and a dealer who knows the customer
// moved to a new handset must be able to fix it — so the 10-digit validation stays, and so
// does the last-three check against the masked form (now a real cross-check between two
// derivations of the same record rather than the only thing we knew).
//
// PRIVACY IS UNCHANGED. The screen still renders `masked` everywhere a human reads a number
// (the header, the card, the subtitle). The raw digits exist here for exactly one purpose —
// addressing the `wa.me` / `sms:` hand-off — and they reach this screen through
// customerDialDigits(), the one named door in the data layer.
//
// Everything below is screen-agnostic on purpose: Reviews · Generate needs the identical
// builder (feedback 15.1), and lifts as-is — its keys already live in the neutral
// `reviewLink.*` namespace.
// ============================================================

/** 'Anand Rao' → 'Anand'; null → null. */
function firstName(name) {
  return name ? name.split(' ')[0] : null
}

/** '+91 ●●●●● ●●775' → '775'. The only digits of the number we actually hold. */
function maskedLast3(masked) {
  const m = String(masked || '').match(/(\d{3})\s*$/)
  return m ? m[1] : null
}

/**
 * FNV-1a → six base36 chars. Small, dependency-free and DETERMINISTIC: the same customer
 * at the same store gets the same link every time, which is the whole point of a per-
 * customer link — one you can re-send, and later attribute a landed review to.
 */
function linkCode(seed) {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).toUpperCase().padStart(6, '0').slice(-6)
}

/** That customer's feedback link. `si.link/r/…` is the short-link shape Reviews already uses. */
export function reviewLinkFor(customer) {
  return `https://si.link/r/${linkCode(`${STORE.id}:${customer.id}`)}`
}

/**
 * The two real hand-off URLs for a 10-digit Indian mobile.
 *
 * sms: is RFC 5724. iOS parses `&body=`, Android parses `?body=` — `?&body=` is the one
 * form both accept, and is why every cross-platform SMS link in the wild looks like this.
 *
 * wa.me is WhatsApp's official click-to-chat endpoint: it deep-links into the app on a
 * phone and falls back to WhatsApp Web on a desktop, so it degrades honestly rather than
 * dead-ending on a `whatsapp://` scheme no browser has a handler for.
 */
export function reviewShareHrefs(digits, message) {
  const text = encodeURIComponent(message)
  return {
    sms: `sms:+91${digits}?&body=${text}`,
    whatsapp: `https://wa.me/91${digits}?text=${text}`,
  }
}

// isIndianMobile used to be defined here, as a second copy of the rule
// customerDialDigits() already applied in the data layer. It now lives ONCE, in
// packages/core/data/customers.js, and is imported at the top of this file — two places
// to decide what a valid number is was one too many.

const SHARE_BTN = 'h-12 rounded-xl m-headline text-white press flex items-center justify-center gap-2'

function ReviewLinkBuilder({ link, who, customerId, greetingName, requiredLast3, knownDigits, from = 'customer_detail' }) {
  const { t } = useTranslation()
  const toast = useToast()
  // Prefilled from the record when we hold the number. Falls back to an empty field rather
  // than a placeholder digit-string: for a customer we hold no number for, an empty box is
  // the truth and a prefilled one would be a fabrication the dealer might just press send on.
  const [digits, setDigits] = useState(() => knownDigits || '')
  const [message, setMessage] = useState(() =>
    greetingName
      ? t('reviewLink.messageNamed', {
          name: greetingName, store: STORE.name, link,
          defaultValue: 'Hi {{name}}, thanks for shopping at {{store}}. If we did right by you, could you leave us a quick review? It takes a minute: {{link}}',
        })
      : t('reviewLink.message', {
          store: STORE.name, link,
          defaultValue: 'Hi, thanks for shopping at {{store}}. If we did right by you, could you leave us a quick review? It takes a minute: {{link}}',
        }),
  )

  const complete = isIndianMobile(digits)
  // The masked form is derived from the same `phone` this field is prefilled from, so on an
  // untouched field this check passes by construction. It earns its keep the moment the
  // dealer EDITS the number: it catches a typo, and it catches him pasting a different
  // customer's number into this customer's link.
  const mismatch = complete && requiredLast3 != null && !digits.endsWith(requiredLast3)
  const valid = complete && !mismatch
  const hrefs = valid ? reviewShareHrefs(digits, message) : null
  // Untouched and straight off the record — the dealer is confirming, not entering.
  const prefilled = !!knownDigits && digits === knownDigits

  /**
   * The review request, recorded the moment it is handed to the phone.
   *
   * This is the LAST point we control: after the anchor navigates, WhatsApp (or the
   * SMS app) owns the interaction and we can never know whether the dealer pressed
   * send. So the event means "review request handed off on <channel>", and the
   * README says exactly that — a metric that overstates itself quietly is worse than
   * no metric at all.
   *
   * NOTHING PERSONAL GOES WITH IT: the customer id, the channel, and whether the
   * number came off the record. The digits in `digits`, the name in `message` and
   * the link itself never leave the device (analytics.js would strip them anyway —
   * that is the point of enforcing privacy in the module rather than at call sites).
   */
  function trackSend(channel) {
    track('review_request_sent', { customer_id: customerId, channel, from, prefilled })
  }

  const error = digits.length > 0 && !complete
    ? t('reviewLink.numberInvalid', { defaultValue: 'Enter a 10-digit mobile number starting 6–9.' })
    : mismatch
      ? t('reviewLink.numberMismatch', { last3: requiredLast3, defaultValue: 'That number doesn’t end in {{last3}} — check you have the right contact.' })
      : null

  // Three genuinely different situations, three different sentences. The old copy only knew
  // the middle one, because a typed number was the only kind there was.
  const hint = error
    ? error
    : prefilled
      ? t('reviewLink.numberFromRecord', {
          who,
          defaultValue: 'This is the number we hold for {{who}}. Check it looks right — you can edit it before sending.',
        })
      : knownDigits
        ? t('reviewLink.numberEdited', {
            defaultValue: 'Edited — this no longer matches the number on their record.',
          })
        : requiredLast3
          ? t('reviewLink.numberWhy', { last3: requiredLast3, defaultValue: 'We only keep this number masked (●●●{{last3}}). Type it in full to send from your phone.' })
          : t('reviewLink.numberWhyNoMask', { defaultValue: 'Type the number to send from your phone.' })

  return (
    <div className="px-4 pb-6">
      {/* No title of its own — the SheetSubview header above already carries it, and
          this was written when it was a sheet that had to name itself. The subtitle
          stays: it says WHO the link is for, which the header does not. */}
      <div className="m-caption text-white/55">
        {t('reviewLink.subtitle', { who, defaultValue: 'A feedback link just for {{who}} — send it on WhatsApp or SMS.' })}
      </div>

      {/* The link */}
      <Card className="!p-3.5 mt-4">
        <div className="m-subhead text-white/55">
          {t('reviewLink.linkLabel', { defaultValue: 'Their feedback link' })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div
            className="flex-1 px-3 h-11 rounded-xl flex items-center m-headline text-white m-tabular truncate"
            style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.25)' }}
          >
            {link}
          </div>
          <IconBtn
            icon={Copy}
            onClick={() => {
              navigator.clipboard?.writeText(link)
              toast?.push({ kind: 'success', title: t('reviewLink.copied', { defaultValue: 'Link copied' }) })
            }}
            label={t('reviewLink.copy', { defaultValue: 'Copy link' })}
          />
        </div>
      </Card>

      {/* Their number — off the record, confirmed by the dealer. */}
      <Card className="!p-3.5 mt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="m-subhead text-white/55">
            {t('reviewLink.mobileNumber', { defaultValue: 'Their mobile number' })}
          </div>
          {prefilled && (
            <span
              className="inline-flex items-center gap-1 px-2 h-6 rounded-full m-caption font-semibold shrink-0"
              style={{ background: 'rgba(22,163,74,.10)', color: '#15803D', border: '1px solid rgba(22,163,74,.30)' }}
            >
              <Check size={10} /> {t('reviewLink.fromRecord', { defaultValue: 'From their record' })}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="m-headline text-white/55 m-tabular shrink-0">+91</span>
          <input
            value={digits}
            onChange={e => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder={t('reviewLink.mobilePlaceholder', { defaultValue: '10-digit number' })}
            inputMode="numeric"
            autoComplete="off"
            className="flex-1 h-11 px-3 rounded-xl bg-transparent outline-none text-white m-headline m-tabular placeholder:text-white/35"
            style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${error ? 'rgba(220,38,38,.45)' : 'rgba(255,255,255,.10)'}` }}
          />
        </div>
        <div className={cn('m-caption mt-2', error ? 'text-[#DC2626]' : 'text-white/55')}>
          {hint}
        </div>
      </Card>

      {/* The message */}
      <div className="mt-3">
        <div className="m-subhead text-white/55 mb-2">
          {t('reviewLink.messageLabel', { defaultValue: 'Message' })}
        </div>
        <Card className="!p-3.5">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="w-full bg-transparent text-white/90 m-body outline-none resize-none min-h-[92px]"
          />
        </Card>
      </div>

      {/* Channel — the dealer picks, the phone takes over */}
      <div className="mt-4">
        <div className="m-subhead text-white/55 mb-2">
          {t('reviewLink.chooseChannel', { defaultValue: 'Send it on' })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {valid ? (
            <a
              href={hrefs.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { vibrate(15); trackSend('whatsapp') }}
              className={SHARE_BTN}
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', boxShadow: '0 6px 18px rgba(37,211,102,.35)' }}
            >
              <MessageCircle size={18} /> WhatsApp
            </a>
          ) : (
            <span
              aria-disabled="true"
              className={cn(SHARE_BTN, 'opacity-40')}
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
            >
              <MessageCircle size={18} /> WhatsApp
            </span>
          )}

          {valid ? (
            <a
              href={hrefs.sms}
              onClick={() => { vibrate(15); trackSend('sms') }}
              className={SHARE_BTN}
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
            >
              <Send size={18} /> {t('reviewLink.sms', { defaultValue: 'SMS' })}
            </a>
          ) : (
            <span
              aria-disabled="true"
              className={cn(SHARE_BTN, 'opacity-40')}
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
            >
              <Send size={18} /> {t('reviewLink.sms', { defaultValue: 'SMS' })}
            </span>
          )}
        </div>
        <div className="m-caption text-white/45 mt-2">
          {t('reviewLink.handoffHint', { defaultValue: 'Opens WhatsApp or Messages with the message ready — you press send.' })}
        </div>
      </div>
    </div>
  )
}
