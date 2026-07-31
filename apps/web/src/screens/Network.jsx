import React, { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, ChevronLeft, ChevronDown, PhoneCall, PhoneIncoming, Star, ArrowDownWideNarrow, ArrowUpNarrowWide, MapPin, Lock, Repeat2, FileText, Store as StoreIcon, Building2, Map as MapIcon, Check, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  networkRows, rankRows, assignedStoreIds, assignedStores,
  getCalls, getLeads, LEAD_SOURCES, LEAD_STATUSES, updateLeadStatus, storeLabelOf, dayClock, relativeTime,
  getCustomers, getCustomerById, leadAsCustomer, filterReviews, getReviewById,
} from '@connect/core'
import { Card, Chip, CLIPill } from '../components/UI.jsx'
import ScreenScroll from '../components/ScreenScroll.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
// The city view reuses Reviews' OWN card and detail rather than drawing a third
// version of a review — see the note on CityRecordsPage.
import { ReviewCard, ReviewDetail } from './Reviews.jsx'
import { LargeTitle, TopBar } from '../components/TopBar.jsx'
import { CustomerCard, CustomerDetail, collidingMasks } from './Customers.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
import { useDataVersion } from '../lib/useDataVersion.js'
import { emitChange } from '@connect/core/events.js'
import { vibrate } from '../lib/utils.js'

// ============================================================
// MULTI-LOCATION — the roll-up, the drill-down and the two leaderboards.
//
// THE DEPTH IS NOT A SETTING. assignmentLevels() derives it from what the brand admin
// granted: one city drills straight to stores, one state drills city → store, several
// states drill state → city → store. A manager with two Bangalore shops is never asked
// to walk through a state with one child.
//
// This replaces the demo role switcher, which asked the user to pick a persona
// ('cluster', 'regional', 'head') and then showed roll-ups seeded independently of the
// records underneath. Both halves of that were wrong: the persona is not the user's to
// choose, and a roll-up that does not sum the records it claims to summarise is how the
// same store shows two different missed counts on two screens.
//
// RANKED WORST FIRST by default, for both boards. The product exists to find the branch
// losing business, so the branch losing the most is the one to open.
// ============================================================

const BOARDS = [
  { id: 'calls', metric: 'missedPct', Icon: PhoneCall, labelKey: 'network.boardCalls', label: 'Calls' },
  { id: 'reviews', metric: 'negativePct', Icon: Star, labelKey: 'network.boardReviews', label: 'Reviews' },
]

// WHAT THE LEADERBOARD RANKS — the hierarchy's own rungs, the same four the Location
// Selector names. This replaced a drill: you used to walk state → city → store and
// walk back to compare, when the real question ("which CITY is losing calls") is a
// choice of grouping, not a journey. Labels are English for now, as in the selector.
const LEVELS = [
  { id: 'subBrand', label: 'Sub-brand', Icon: Building2 },
  { id: 'state', label: 'State', Icon: MapIcon },
  { id: 'city', label: 'City', Icon: MapPin },
  { id: 'store', label: 'Location', Icon: StoreIcon },
]

export default function Network({ onOpenProfile, store }) {
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

  // ALWAYS THE WHOLE ASSIGNMENT — because this screen only exists when that is what the
  // manager is looking at. The tab is offered on two conditions (see BottomTabBar):
  // more than one store assigned, AND "All locations" in the picker. Narrow to one
  // branch and the tab goes away rather than degrading into a leaderboard with a single
  // row, which is Home with extra steps.
  //
  // Depends on `version` rather than [] — the assignment is session state now (see
  // setSessionAssignments), and a value cached against no dependency at all is the first
  // thing to go stale when someone signs out and back in as somebody else.
  const storeIds = useMemo(() => assignedStoreIds(), [version])

  const [level, setLevel] = useState('city')
  const [board, setBoard] = useState('calls')
  const [dir, setDir] = useState('desc')
  // Which store's calls are open. Store id, or null.
  const [openStore, setOpenStore] = useState(null)
  const [openCity, setOpenCity] = useState(null)

  const atStore = level === 'store'
  const meta = BOARDS.find(b => b.id === board)

  // The scope in session already narrows `storeIds`, so the leaderboard needs no path
  // of its own — pick a level and it ranks every group at that level, inside scope.
  const filter = useMemo(() => ({ level, storeIds, win: 'all' }), [level, storeIds])

  const rows = useMemo(
    () => rankRows(networkRows(filter), meta.metric, dir),
    [filter, meta.metric, dir, version],
  )

  const totals = useMemo(() => rows.reduce((a, r) => ({
    missed: a.missed + r.missed, total: a.total + r.total,
    negative: a.negative + r.negative, reviews: a.reviews + r.reviews,
    stores: a.stores + r.stores,
  }), { missed: 0, total: 0, negative: 0, reviews: 0, stores: 0 }), [rows])

  // Search over the ranked rows — every line a card prints, so what you can see you can
  // find. Declared HERE, with the other hooks, and above the openStore early return
  // below: a useState after that return runs on some renders and not others, which is
  // exactly the "Rendered fewer hooks than expected" crash it caused.
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter(r => [r.label, r.subBrands.join(' '), r.states.join(' '), r.cities.join(' '), r.address]
      .filter(Boolean).join(' ').toLowerCase().includes(q))
    : rows

  // THE LAST LEVEL IS A DESTINATION, NOT A PEEK. A store's enquiries are something a
  // manager reads down and works through, so the tab SWAPS to a full page rather than
  // sliding a sheet over the leaderboard — a sheet keeps the list it came from half
  // visible behind a scrim, which is right for a quick confirm and wrong for the screen
  // you came all this way to reach. After the hooks above, so the hook order is fixed.
  if (openCity) {
    return (
      <CityRecordsPage
        city={openCity}
        board={board}
        onBack={() => { vibrate(6); setOpenCity(null) }}
        onOpenStore={(id) => { setOpenCity(null); setOpenStore(id) }}
        onOpenProfile={onOpenProfile}
      />
    )
  }

  if (openStore) {
    return (
      <StoreCallsPage
        storeId={openStore}
        onBack={() => { vibrate(6); setOpenStore(null) }}
        onOpenProfile={onOpenProfile}
      />
    )
  }

  return (
    <ScreenScroll onRefresh={refresh}>
      <div className="px-4 pt-1">
        {/* TITLE FIRST, then the controls that act on it. There is no scope dropdown
            here on purpose: scope is chosen in ONE place (the Location Selector, off
            Home's pill), and this page is a VIEW of it. Two hierarchy controls on one
            screen — a dropdown that restricts and tabs that group, side by side and
            looking alike — is the confusion this removes. The subtitle still SAYS what
            is restricting the page, which was the dropdown's only honest job. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="m-title2 text-white">{t('network.title', { defaultValue: 'Your locations' })}</div>
            <div className="m-caption text-white/55 mt-0.5 truncate">
              {store?.aggregate
                ? (store.label || t('stores.allLocations', { defaultValue: 'All locations' }))
                : `${store?.name} · ${store?.branch}`}
              {' · '}
              {t('stores.nStoresShort', { count: storeIds.length, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })}
            </div>
          </div>
          <div className="flex items-center shrink-0"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>
        </div>

        {/* WHAT THE BOARD RANKS — the hierarchy's rungs. The one hierarchy control on
            this page. */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar">
          {LEVELS.map(lv => (
            <Chip key={lv.id} icon={lv.Icon} active={level === lv.id} onClick={() => { vibrate(6); setLevel(lv.id); setQuery('') }}>
              {lv.label}
            </Chip>
          ))}
        </div>

        {/* Search — reads every line a card prints. */}
        <div
          className="mt-2.5 h-11 rounded-xl flex items-center gap-2 px-3"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)' }}
        >
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('common.search', { defaultValue: 'Search' })}
            aria-label={t('common.search', { defaultValue: 'Search' })}
            className="flex-1 bg-transparent text-white m-callout outline-none placeholder:text-white/30"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label={t('common.close', { defaultValue: 'Close' })} className="press shrink-0">
              <X size={14} className="text-white/40" />
            </button>
          )}
        </div>

        {/* WHICH BOARD, and which way it is sorted. */}
        <div className="flex items-center gap-2 mt-2.5 mb-3 overflow-x-auto no-scrollbar">
          {BOARDS.map(b => (
            <Chip key={b.id} icon={b.Icon} active={board === b.id} onClick={() => { vibrate(6); setBoard(b.id) }}>
              {t(b.labelKey, { defaultValue: b.label })}
            </Chip>
          ))}
          <Chip
            icon={dir === 'desc' ? ArrowDownWideNarrow : ArrowUpNarrowWide}
            onClick={() => { vibrate(6); setDir(d => (d === 'desc' ? 'asc' : 'desc')) }}
          >
            {dir === 'desc'
              ? t('network.worstFirst', { defaultValue: 'Worst first' })
              : t('network.bestFirst', { defaultValue: 'Best first' })}
          </Chip>
        </div>

        {/* The level's own totals — what the ranked rows below are a breakdown of. */}
        <Card className="!p-3.5 mb-3">
          <div className="grid grid-cols-3">
            <Stat value={totals.stores} label={t('stores.storesLabel', { defaultValue: 'Stores' })} />
            <Stat
              value={totals.total ? `${Math.round((totals.missed / totals.total) * 100)}%` : '—'}
              label={t('network.missedPct', { defaultValue: 'Missed' })} color="#DC2626" bordered
            />
            <Stat
              value={totals.reviews ? `${Math.round((totals.negative / totals.reviews) * 100)}%` : '—'}
              label={t('network.negativePct', { defaultValue: 'Negative' })} color="#B45309" bordered
            />
          </div>
        </Card>

        <div className="space-y-2.5">
          {shown.map((r, i) => (
            <motion.div
              key={r.key}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.24, ease: [0.2, 0, 0, 1] }}
            >
              <RowCard
                row={r} rank={i + 1} metric={meta.metric}
                drillable={false}
                onDrill={undefined}
                // PM feedback 1/2: the drill runs sub-brand → state → CITY, and a city
                // is where it stops being a summary. Clicking one lands on the individual
                // records inside it — the leads, or the reviews, whichever board is
                // showing — rather than on yet another list of groups. Sub-brand and
                // state still step down a level; a store still opens its own calls.
                onOpen={atStore
                  ? () => { vibrate(8); setOpenStore(r.key) }
                  : level === 'city'
                    ? () => { vibrate(8); setOpenCity(r.city || r.key) }
                    : () => { vibrate(8); setLevel(level === 'subBrand' ? 'state' : 'city') }}
              />
            </motion.div>
          ))}

          {shown.length === 0 && (
            <Card className="!p-6 text-center">
              <div className="m-headline text-white">{t('leads.emptyTitle', { defaultValue: 'Nothing here' })}</div>
              <div className="m-caption text-white/55 mt-0.5">{t('customers.emptySub', { defaultValue: 'Try another filter.' })}</div>
            </Card>
          )}
          <div className="h-4" />
        </div>
      </div>

    </ScreenScroll>
  )
}

/**
 * WHAT THE RANKING WAS MADE OF — one store's calls, split by what happened to them.
 *
 * The two halves answer different questions, so they carry different facts rather than
 * one row shape padded out with blanks:
 *
 *   MISSED    how often they tried and how long ago they gave up — the two things that
 *             decide who to ring first. No reason: nobody spoke, so we do not have one,
 *             and printing the seed's campaign guess would claim we heard them (the same
 *             rule the Calls screen applies).
 *   ATTENDED  where the lead came from, how warm it was, and what they rang about —
 *             which only exists BECAUSE somebody picked up.
 */
/**
 * EVERY RECORD IN ONE CITY — where the drill stops summarising (PM feedback 1/2).
 *
 * "Once he has reached the city level, on clicking the city level, the user should be
 * redirected to the individual data points within the city": the leads themselves, each
 * opening its lead page, or the reviews themselves, each opening its review page.
 *
 * WHICH ONE depends on the board the manager was already reading. They arrived here by
 * tapping a row ranked on missed calls or on negative reviews; showing them the other
 * kind would answer a question they did not ask. The toggle stays on screen so it is one
 * tap either way.
 *
 * A city is a SET of stores, so everything is filtered by that set rather than by a
 * single storeId. The rows reuse the cards their own screens draw — CustomerCard via
 * AttendedRow, and Reviews' own ReviewCard — so a record looks the same here as it does
 * where it lives, and cannot drift into a third design.
 */
function CityRecordsPage({ city, board, onBack, onOpenStore, onOpenProfile }) {
  const { t } = useTranslation()
  const version = useDataVersion()
  const [tab, setTab] = useState(board === 'reviews' ? 'reviews' : 'leads')

  // The stores this city holds, within the manager's own scope.
  const cityStores = useMemo(
    () => assignedStores().filter(l => l.city === city),
    [city, version],
  )
  const idSet = useMemo(() => new Set(cityStores.map(l => l.id)), [cityStores])

  const leads = useMemo(
    () => getLeads().filter(l => idSet.has(l.storeId)),
    [idSet, version],
  )
  const reviews = useMemo(
    () => filterReviews({ window: 'all' }).filter(r => idSet.has(r.storeId)),
    [idSet, version],
  )
  const callById = useMemo(
    () => new Map(getCalls('all').filter(c => idSet.has(c.storeId)).map(c => [c.id, c])),
    [idSet, version],
  )
  const customers = useMemo(
    () => getCustomers().filter(c => idSet.has(c.storeId)),
    [idSet, version],
  )
  const sharedMasks = useMemo(() => collidingMasks(customers), [customers])

  const [openSubject, setOpenSubject] = useState(null)
  const [openLeadId, setOpenLeadId] = useState(null)
  const openLead = useMemo(() => leads.find(l => l.id === openLeadId) || null, [leads, openLeadId])
  const [openReviewId, setOpenReviewId] = useState(null)
  const openReview = useMemo(() => (openReviewId ? getReviewById(openReviewId) : null), [openReviewId, version])

  // After the hooks, so hook order is fixed regardless of which view renders.
  if (openSubject) {
    return (
      <CustomerPage
        subject={openSubject}
        lead={openLead}
        onBack={() => { vibrate(6); setOpenSubject(null); setOpenLeadId(null) }}
        onOpenProfile={onOpenProfile}
      />
    )
  }

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      <TopBar onBack={onBack} title="" transparent
        right={<div className="flex items-center"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>}
      />
      <LargeTitle
        title={city}
        subtitle={t('stores.nStoresShort', {
          count: cityStores.length,
          defaultValue_one: '{{count}} store',
          defaultValue_other: '{{count}} stores',
        })}
      />

      <div className="px-4">
        <div className="flex items-center gap-2 mb-3">
          <Chip icon={PhoneCall} active={tab === 'leads'} onClick={() => { vibrate(6); setTab('leads') }}>
            {t('leads.title', { defaultValue: 'Leads' })} {leads.length}
          </Chip>
          <Chip icon={Star} active={tab === 'reviews'} onClick={() => { vibrate(6); setTab('reviews') }}>
            {t('reviews.title', { defaultValue: 'Reviews' })} {reviews.length}
          </Chip>
        </div>

        {tab === 'leads' ? (
          leads.length ? leads.map(lead => (
            <AttendedRow
              key={lead.id}
              lead={lead}
              call={lead.recordKind === 'call' ? callById.get(lead.recordId) : null}
              customer={lead.customerId ? getCustomerById(lead.customerId) : null}
              sharedMask={sharedMasks.has(lead.masked)}
              onOpen={(subject, l) => { setOpenSubject(subject); setOpenLeadId(l.id) }}
            />
          )) : <EmptyNote t={t} />
        ) : (
          reviews.length ? reviews.map(r => (
            <ReviewCard key={r.id} review={r} aggregate onOpen={() => { vibrate(8); setOpenReviewId(r.id) }} />
          )) : <EmptyNote t={t} />
        )}

        {/* The stores themselves are still one tap away — the city view answers "what
            happened here", not "which branch was it". */}
        {cityStores.length > 1 && (
          <div className="mt-4">
            <div className="m-subhead text-white/55 mb-2">{t('stores.storesLabel', { defaultValue: 'Stores' })}</div>
            {cityStores.map(l => (
              <Card key={l.id} className="!p-3 mb-2" onClick={() => { vibrate(8); onOpenStore(l.id) }} label={l.branch}>
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-white/45 shrink-0" />
                  <span className="m-callout text-white flex-1 min-w-0 truncate">{l.branch}</span>
                  <ChevronRight size={15} className="text-white/40 shrink-0" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomSheet open={!!openReview} onClose={() => setOpenReviewId(null)} fullHeight label={openReview?.customer}>
        {openReview && <ReviewDetail review={openReview} onClose={() => setOpenReviewId(null)} />}
      </BottomSheet>
    </div>
  )
}

function EmptyNote({ t }) {
  return (
    <Card className="!p-6 text-center">
      <div className="m-callout text-white">{t('leads.emptyTitle', { defaultValue: 'Nothing here' })}</div>
      <div className="m-caption text-white/55 mt-0.5">{t('customers.emptySub', { defaultValue: 'Try another filter.' })}</div>
    </Card>
  )
}

function StoreCallsPage({ storeId, onBack, onOpenProfile }) {
  const { t } = useTranslation()
  const version = useDataVersion()
  const [outcome, setOutcome] = useState('missed')

  // LEADS, not just calls — because "where did this come from" is only a question worth
  // printing if the answer can be something other than "a call". A form submission and a
  // walk-in are this shop's enquiries too, and they never rang the phone.
  const leads = useMemo(() => getLeads({ storeId }), [storeId, version])
  // The reason someone rang lives on the CALL record, not the lead, so the two are
  // joined here rather than duplicating the field into the lead projection.
  const callById = useMemo(
    () => new Map(getCalls('all', { storeId }).map(c => [c.id, c])),
    [storeId, version],
  )

  // A missed call is the only row that is still outstanding on the phone. Everything
  // else — answered, filled a form, walked in — is an enquiry somebody has engaged with.
  const missed = useMemo(
    () => leads.filter(l => l.source === 'call' && l.status === 'missed'),
    [leads],
  )
  const attended = useMemo(
    () => leads.filter(l => !(l.source === 'call' && l.status === 'missed')),
    [leads],
  )
  const list = outcome === 'missed' ? missed : attended

  // ONE MOBILE NUMBER IS ONE CUSTOMER — where the platform actually holds that person.
  // A form or walk-in IS a customer record; a call is only linked to one if it was ever
  // matched to a contact, and most in this fixture never were. So the row opens whatever
  // the RICHEST truthful thing about them is: the customer when there is one, the lead
  // itself when there is not. Never a screen that invents a person to fill the gap.
  const [openSubject, setOpenSubject] = useState(null)
  // The lead id, not the lead: moving it along the lifecycle mutates the record in
  // place, so the page has to re-read it rather than hold a copy that has gone stale.
  const [openLeadId, setOpenLeadId] = useState(null)
  const openLead = useMemo(() => leads.find(l => l.id === openLeadId) || null, [leads, openLeadId])
  const customers = useMemo(() => getCustomers(storeId), [storeId, version])
  const sharedMasks = useMemo(() => collidingMasks(customers), [customers])
  const store = useMemo(() => assignedStores().find(l => l.id === storeId), [storeId, version])

  // Straight to the person — no list in between, and a PAGE rather than a sheet so it
  // matches the store page it was opened from. After the hooks above, so hook order is
  // fixed regardless of which view renders.
  if (openSubject) {
    return (
      <CustomerPage
        subject={openSubject}
        lead={openLead}
        onBack={() => { vibrate(6); setOpenSubject(null); setOpenLeadId(null) }}
        onOpenProfile={onOpenProfile}
      />
    )
  }

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      {/* The way back to the leaderboard this was opened from. The bottom bar is still
          there — this is a page WITHIN the tab, not a screen stacked over the app — so
          the manager can leave sideways too; this returns them to where they were. */}
      <TopBar onBack={onBack} title="" transparent />
      <LargeTitle
        title={storeLabelOf(storeId)}
        // The address, not a count: this page is about ONE shop, and "1 store assigned
        // to you" would be answering a question nobody asked here. Data, so no catalog
        // key needed.
        sub={store?.address}
        right={<div className="flex items-center"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>}
      />

      <div className="px-4 flex items-center gap-2 mb-3">
        <Chip active={outcome === 'missed'} onClick={() => { vibrate(6); setOutcome('missed') }}>
          {t('calls.outcomeMissed', { defaultValue: 'Missed' })} {missed.length}
        </Chip>
        <Chip active={outcome === 'attended'} onClick={() => { vibrate(6); setOutcome('attended') }}>
          {t('calls.outcomeAttended', { defaultValue: 'Attended' })} {attended.length}
        </Chip>
      </div>

      {/* px-4 like every other list in the app — the cards line up with the title
          above them instead of running to the screen edge. */}
      <div className="px-4 space-y-2.5">
        {list.map(l => (
          outcome === 'missed'
            ? <MissedRow key={l.id} lead={l} />
            : (
              <AttendedRow
                key={l.id}
                lead={l}
                call={l.recordKind === 'call' ? callById.get(l.recordId) : null}
                customer={l.customerId ? getCustomerById(l.customerId) : null}
                sharedMask={sharedMasks}
                onOpen={(subject, l) => { setOpenSubject(subject); setOpenLeadId(l.id) }}
              />
            )
        ))}
        {list.length === 0 && (
          <Card className="!p-6 text-center">
            <div className="m-callout text-white/70">
              {t('leads.emptyTitle', { defaultValue: 'Nothing here' })}
            </div>
          </Card>
        )}
        <div className="h-4" />
      </div>

    </div>
  )
}

/**
 * WHEN IT CAME IN, said once.
 *
 * dayClock() already prefixes the day for anything that is not today ("3 days ago ·
 * 4:31 pm"), so pasting relativeTime() after it produced "3 days ago · 4:31 pm · 3 days
 * ago". Today's calls are the ones that need the relative half — "4:26 pm" alone does
 * not tell you it was five minutes back — and older ones already carry it.
 */
function whenLine(atMs) {
  const clock = dayClock(atMs)
  // The separator is present only when dayClock has prefixed a day.
  return clock.includes('·') ? clock : `${clock} · ${relativeTime(atMs)}`
}

/** Missed: how often they tried, and how long they have been waiting. */
function MissedRow({ lead }) {
  const { t } = useTranslation()
  return (
    <Card className="!p-3.5">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
          style={{ background: 'rgba(220,38,38,.10)', border: '1px solid rgba(220,38,38,.30)' }}
        >
          <PhoneCall size={15} style={{ color: '#DC2626' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* The padlock means "this number is masked". A lead the book has NAMED
                  shows no number, so there is nothing for it to be saying. */}
              {!lead.name && <Lock size={10} className="shrink-0 text-white/45" aria-hidden="true" />}
              <span className="m-headline text-white m-tabular truncate">{lead.name || lead.masked}</span>
            </div>
            {lead.cli != null && <CLIPill score={lead.cli} size="sm" showScore={false} />}
          </div>
          {/* HOW OFTEN — a second and third attempt is the strongest signal on the row. */}
          <div className="m-subhead text-white/55 mt-0.5 inline-flex items-center gap-1">
            <Repeat2 size={11} className="shrink-0" />
            {t('vmn.calledCount', { count: lead.repeats ?? 1, defaultValue: 'Called {{count}}×' })}
          </div>
          {/* HOW LONG AGO — clock time for "when", relative for "how stale". */}
          <div className="m-caption text-white/45 mt-0.5 m-tabular">
            {whenLine(lead.atMs)}
          </div>
        </div>
      </div>
    </Card>
  )
}

const SOURCE_ICON = { call: PhoneIncoming, form: FileText, walk_in: StoreIcon }

// The projection that lets a lead with no contact record open the same card and detail
// as a real one lives in core (leadAsCustomer), because native needs the identical
// derivation and two copies of "what do we know about this caller" is how they start
// disagreeing about it.

/**
 * ATTENDED — the person, not just the call.
 *
 * One mobile number is one customer, so where the platform holds that person this row IS
 * the customer card the Customers screen draws: name, what they are worth, how many
 * calls, the AI read with its "+N more", the badges. Reusing it rather than echoing it
 * is the point — the card is the app's one answer to "who is this", and a second copy
 * here would start drifting from it the first time either changed.
 *
 * The call's REASON rides on top, because that is the one thing the customer record
 * cannot know: it was spoken on this call, not derived from the book.
 *
 * Where there is NO customer record — most attended calls in this fixture were never
 * matched to a contact — the row falls back to what the lead itself knows and does not
 * pretend to open a person we do not have. Nothing is invented to fill the gap.
 */
function AttendedRow({ lead, call, customer, sharedMask, onOpen }) {
  const { t } = useTranslation()
  const reason = call?.callReasonKey
    ? t(call.callReasonKey, { defaultValue: call.callReason })
    : (call?.callReason
      || (lead.category ? t(lead.categoryKey, { defaultValue: lead.category }) : null))

  // ONE CARD FOR EVERY ROW. The real record when the platform holds it, the lead
  // projected into the same shape when it does not — so the list reads as one kind of
  // thing and every row leads somewhere, instead of two designs and half a feature.
  const subject = customer || leadAsCustomer(lead, reason)

  return (
    <CustomerCard
      customer={subject}
      // The reason this call was about — the card had no way to show it, and PM
      // feedback 8 asks for it on every lead row.
      reason={reason}
      aggregate={false}
      onOpen={() => { vibrate(8); onOpen(subject, lead) }}
      sharedMask={sharedMask?.has?.(subject.masked)}
      // The reason rides in the card's footer slot: it belongs to THIS call, not to the
      // person, so it cannot live in the customer record above it.
      footer={reason && (
        <span className="flex items-center gap-1.5 flex-wrap">
          <PhoneIncoming size={11} className="shrink-0" style={{ color: 'var(--si-success-text)' }} />
          <span className="truncate">{reason}</span>
          {call?.source && <span className="opacity-60">· {call.source}</span>}
          <span className="m-tabular opacity-60">· {relativeTime(lead.atMs)}</span>
        </span>
      )}
    />
  )
}

/**
 * WHERE THIS ENQUIRY HAS GOT TO — and the one control that moves it.
 *
 * LEAD_STATUSES is already the lifecycle in order (missed → contacted → converted →
 * review requested → expired), so the list is rendered in that order rather than sorted
 * here: one definition of the sequence, in the data layer, where the selectors that
 * count each state also read it.
 *
 * Writes through updateLeadStatus(), which mutates the record and emits — so the store
 * page behind, the tab badges and Home's triage all re-derive without being told.
 */
function LeadStatusPicker({ lead }) {
  const { t } = useTranslation()

  return (
    <div className="mt-5">
      <div className="m-headline text-white mb-2">
        {t('calls.leadStatusTitle', { defaultValue: 'Lead status' })}
      </div>
      {/* A CHIP ROW, not five stacked 56px rows.
          This is one choice among five, and as a full-height list it took ~290px — a
          third of the screen — on a page whose job is to tell you who this person is and
          let you ring them back. It is also the idiom the Leads tab already uses to pick
          a state, so the same decision now looks the same in both places.
          Wraps rather than scrolls: a state you cannot see is a state you will not set. */}
      <div className="flex items-center gap-2 flex-wrap">
        {LEAD_STATUSES.map(s => {
          const on = lead.status === s.id
          return (
            <Chip
              key={s.id}
              active={on}
              icon={on ? Check : undefined}
              onClick={() => { vibrate(10); updateLeadStatus(lead, s.id) }}
            >
              {t(s.labelKey, { defaultValue: s.label })}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}

function CustomerPage({ subject, lead, onBack, onOpenProfile }) {
  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      {/* ONE row of chrome, not two. Back on the left, bell and avatar in TopBar's own
          right slot — stacking them cost ~90px before the customer's name even appeared,
          on the screen whose whole job is to show that name. */}
      <TopBar
        onBack={onBack}
        title=""
        transparent
        right={<div className="flex items-center"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>}
      />
      {/* canNote follows the record, not the screen: a projected lead has nowhere to
          write a note to. */}
      <CustomerDetail
        customer={subject}
        canNote={!subject.synthetic}
        beforeHistory={lead ? <LeadStatusPicker lead={lead} /> : null}
      />
    </div>
  )
}

function Stat({ value, label, color, bordered }) {
  return (
    <div className={bordered ? 'text-center border-l' : 'text-center'} style={bordered ? { borderColor: 'var(--border-glass)' } : undefined}>
      <div className="m-title2 m-tabular" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      <div className="m-caption text-white/55 mt-0.5">{label}</div>
    </div>
  )
}

function RowCard({ row, rank, metric, drillable, onDrill, onOpen }) {
  const { t } = useTranslation()
  const pct = row[metric]
  // Both boards rank a PROBLEM, so a high number is bad on either. One colour rule for
  // both keeps the reading identical when you switch between them.
  const tone = pct == null ? 'var(--text-tertiary)' : pct >= 50 ? '#DC2626' : pct >= 25 ? '#B45309' : '#15803D'
  const counts = metric === 'missedPct'
    ? t('network.ofCalls', { missed: row.missed, total: row.total, defaultValue: '{{missed}} missed of {{total}} calls' })
    : t('network.ofReviews', { negative: row.negative, total: row.reviews, defaultValue: '{{negative}} negative of {{total}} reviews' })

  // The Location Selector's card rhythm: title, the context it sits in, then the facts.
  const context = row.level === 'store'
    ? `${row.city}, ${row.state}`
    : row.level === 'city'
      ? [row.subBrands.join(' · '), row.state].filter(Boolean).join(' · ')
      : row.level === 'state'
        ? row.subBrands.join(' · ')
        : row.states.join(', ')
  const meta = row.level === 'store'
    ? [row.address, counts].filter(Boolean).join(' · ')
    : `${t('stores.nStoresShort', { count: row.stores, defaultValue_one: '{{count}} store', defaultValue_other: '{{count}} stores' })} · ${counts}`

  return (
    <Card onClick={drillable ? onDrill : onOpen} label={row.label} className="!p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-7 shrink-0 m-subhead m-tabular text-center pt-0.5" style={{ color: 'var(--text-tertiary)' }}>#{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <span className="m-headline text-white truncate">{row.label}</span>
          </div>
          {context && <div className="m-callout text-white/70 mt-0.5 truncate">{context}</div>}
          <div className="m-caption text-white/40 mt-0.5 truncate">{meta}</div>
        </div>
        <div className="shrink-0 text-right pt-0.5">
          <div className="m-title3 m-tabular" style={{ color: tone }}>{pct == null ? '—' : `${pct}%`}</div>
        </div>
        {drillable && <ChevronRight size={16} className="text-white/45 shrink-0 self-center" />}
      </div>
    </Card>
  )
}
