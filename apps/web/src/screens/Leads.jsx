import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PhoneCall, FileText, Store as StoreIcon, Users as UsersIcon, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  getLeads, leadCounts, updateLeadStatus, groupByStore,
  LEAD_STATUSES, LEAD_SOURCES, rupees, relativeTime,
} from '@connect/core'
import { Card, Chip, CLIPill, StoreGroupHeader, PrimaryButton } from '../components/UI.jsx'
import { LargeTitle } from '../components/TopBar.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import { useDataVersion } from '../lib/useDataVersion.js'
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

export default function Leads({ store, onOpenProfile }) {
  const { t } = useTranslation()
  const version = useDataVersion()
  const aggregate = !!store?.aggregate
  const scopeId = aggregate ? undefined : store?.id

  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [branch, setBranch] = useState('all')
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
  const groups = useMemo(
    () => (branch === 'all' ? allGroups : allGroups.filter(g => g.storeId === branch)),
    [allGroups, branch],
  )

  const open = useMemo(
    () => (openId ? getLeads({ storeId: scopeId }).find(l => l.id === openId) : null),
    [openId, scopeId, version],
  )

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      <LargeTitle
        title={t('leads.title', { defaultValue: 'Leads' })}
        sub={t('leads.subtitle', { defaultValue: 'Every enquiry, whatever brought it in' })}
        right={<div className="flex items-center"><NotificationBell /><ProfileButton onClick={onOpenProfile} /></div>}
      />

      <div className="px-4">
        {aggregate && (
          <div className="mb-3">
            <LocationPicker value={branch} onChange={setBranch} groups={allGroups} total={list.length} />
          </div>
        )}

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
              {g.label && branch === 'all' && <StoreGroupHeader label={g.label} count={g.count} />}
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
    </div>
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
  const who = lead.name || lead.masked
  const src = LEAD_SOURCES.find(s => s.id === lead.source)
  return (
    <Card onClick={onOpen} className="!p-4">
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
 * The lead, and the two things the MVP says a manager does with it: move it along the
 * lifecycle, and ask a converted customer for a review.
 */
function LeadDetail({ lead, onClose }) {
  const { t } = useTranslation()
  const [, force] = useState(0)
  const who = lead.name || lead.masked
  const src = LEAD_SOURCES.find(s => s.id === lead.source)

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
      <div className="m-title2 text-white truncate">{who}</div>
      <div className="m-caption text-white/55 mt-0.5">
        {[t(src?.labelKey, { defaultValue: src?.label }), lead.value ? rupees(lead.value) : null, relativeTime(lead.atMs)]
          .filter(Boolean).join(' · ')}
      </div>

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
    </div>
  )
}
