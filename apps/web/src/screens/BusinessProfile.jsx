import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Navigation, AlertTriangle, Clock } from 'lucide-react'
import { Card } from '../components/UI.jsx'
import {
  getBusinessProfile, ATTRIBUTE_GROUPS, DAYS,
  profileCompleteness, computeLocationFlags,
} from '@connect/core'

// Per BRANCH, read at render — the listing identity and address differ per store.

// The day names and attribute-group labels come from the data layer as English
// catalogs, and their raw values double as lookup keys / stored values — so we
// keep the data untouched and only localise the *display* through these maps.
const DAY_KEYS = {
  Monday: 'profile.bpDayMonday', Tuesday: 'profile.bpDayTuesday', Wednesday: 'profile.bpDayWednesday',
  Thursday: 'profile.bpDayThursday', Friday: 'profile.bpDayFriday', Saturday: 'profile.bpDaySaturday',
  Sunday: 'profile.bpDaySunday',
}
const ATTR_GROUP_KEYS = {
  service: 'profile.bpAttrService', accessibility: 'profile.bpAttrAccessibility',
  amenities: 'profile.bpAttrAmenities', payments: 'profile.bpAttrPayments',
  parking: 'profile.bpAttrParking', offerings: 'profile.bpAttrOfferings',
  highlights: 'profile.bpAttrHighlights', planning: 'profile.bpAttrPlanning',
  crowd: 'profile.bpAttrCrowd', children: 'profile.bpAttrChildren',
  pets: 'profile.bpAttrPets', identity: 'profile.bpAttrIdentity',
}

// Read-only mirror of the Google Business Profile listing. Phase one ships no
// editing at all: the dealer sees exactly what customers see on Google, and any
// change goes through the SingleInterface team. The one action that survives is
// location *verification* — its own flow, not a field edit — which the parent
// routes to LocationVerify. Rendered inside a full-height BottomSheet.
export default function BusinessProfile({ store, onStartVerify, onClose }) {
  const BUSINESS_PROFILE = useMemo(() => getBusinessProfile(store?.id), [store])
  const { t } = useTranslation()
  const p = BUSINESS_PROFILE

  const flags = store ? computeLocationFlags(store) : []
  const strength = profileCompleteness(p)
  // Painted as TEXT (the "% complete" caption), so it reads off the accessible text
  // variants of the brand colours — see --si-primary-text in index.css.
  const strengthColor = strength >= 80 ? 'var(--si-success-text)' : strength >= 50 ? 'var(--si-primary-text)' : '#CA8A04'

  const about = p.about, contact = p.contact, loc = p.location, hours = p.hours
  const moreSets = hours.more || []

  // An attribute group with nothing selected says nothing to a reader, so the
  // read-only view drops it rather than stacking a dozen empty rows.
  const attrGroups = ATTRIBUTE_GROUPS
    .map(g => ({ ...g, values: p.attributes[g.key] || [] }))
    .filter(g => g.values.length > 0)

  return (
    <div className="px-4 pb-8">
      {/* Header + strength meter */}
      <div className="m-title2 text-white">{t('profile.businessProfile')}</div>
      <div className="m-callout text-white/55">{t('profile.bpSubtitleReadOnly')}</div>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="m-caption text-white/55">{t('profile.bpStrength')}</span>
          <span className="m-caption font-semibold" style={{ color: strengthColor }}>{t('profile.bpPctComplete', { pct: strength })}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
          <div className="h-full rounded-full" style={{ width: `${strength}%`, background: strengthColor, transition: 'width .4s ease' }} />
        </div>
      </div>

      {/* 1 — About your business */}
      <Section label={t('profile.bpSecAbout')}>
        <Card className="!p-0 overflow-hidden">
          <Row label={t('profile.bpBusinessName')} value={about.name} />
          <Row label={t('profile.bpPrimaryCategory')} value={about.primaryCategory} />
          <ChipsRow label={t('profile.bpAdditionalCategories')} values={about.secondaryCategories} />
          <Row label={t('profile.bpDescription')} value={about.description} />
          <Row label={t('profile.bpOpeningDate')} value={about.openingDate} last />
        </Card>
      </Section>

      {/* 2 — Contact information */}
      <Section label={t('profile.bpSecContact')}>
        <Card className="!p-0 overflow-hidden">
          <Row label={t('profile.bpPhoneNumber')} value={contact.phone} />
          <Row label={t('profile.bpChat')} value={contact.chat} />
          <Row label={t('profile.bpWebsite')} value={contact.website} />
          <Row label={t('profile.bpMenuLink')} value={contact.menuLink} last />
        </Card>
      </Section>

      {/* 3 — Location & areas */}
      <Section label={t('profile.bpSecLocation')}>
        <Card className="!p-0 overflow-hidden">
          <Row label={t('profile.bpBusinessLocation')} value={loc.address} />
          <ChipsRow label={t('profile.bpServiceArea')} values={loc.serviceArea} last />
        </Card>

        {flags.length > 0 && (
          <div className="rounded-2xl p-3.5 mt-3" style={{ background: 'rgba(202,138,4,.10)', border: '1px solid rgba(202,138,4,.35)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle size={16} style={{ color: 'var(--si-warning-text)' }} />
              <span className="m-headline text-white">{t('profile.gbpNeedsVerification')}</span>
            </div>
            <div className="space-y-1.5">
              {flags.map((f, i) => (
                <div key={i} className="m-caption text-white/70 flex items-start gap-1.5">
                  <span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: f.type === 'address' ? '#DC2626' : '#CA8A04' }} />
                  {f.reason}
                </div>
              ))}
            </div>
            <button onClick={() => onStartVerify && onStartVerify()} className="on-dark mt-3 w-full h-10 rounded-xl m-headline text-white press inline-flex items-center justify-center gap-2" style={{ background: '#0070FC' }}>
              <Navigation size={16} /> {t('profile.bpStartVerify')}
            </button>
          </div>
        )}
      </Section>

      {/* 4 — Opening hours */}
      <Section label={t('profile.bpSecHours')}>
        <Card className="!p-0 overflow-hidden">
          <div className="px-3.5 py-3 flex items-center gap-3 border-b border-white/5">
            <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.25)' }}>
              <Clock size={14} style={{ color: '#0070FC' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="m-subhead text-white/55">{t('profile.bpHours')}</div>
              <div className="m-callout text-white truncate">{hours.status}</div>
            </div>
          </div>

          <HoursBlock label={t('profile.bpMainHours')} hours={hours.main} />

          {moreSets.map(set => (
            <HoursBlock key={set.label} label={t('profile.bpNamedHours', { name: set.label })} hours={set.hours} />
          ))}

          <Row
            label={t('profile.bpSpecialHours')}
            value={(hours.special && hours.special.length) ? hours.special.join(' · ') : null}
            last
          />
        </Card>
      </Section>

      {/* 5 — From the business */}
      {attrGroups.length > 0 && (
        <Section label={t('profile.bpSecFromBusiness')}>
          <Card className="!p-0 overflow-hidden">
            {attrGroups.map((g, i) => (
              <ChipsRow
                key={g.key}
                label={ATTR_GROUP_KEYS[g.key] ? t(ATTR_GROUP_KEYS[g.key]) : g.label}
                values={g.values}
                last={i === attrGroups.length - 1}
              />
            ))}
          </Card>
        </Section>
      )}

      <div className="mt-5 m-caption text-white/50 px-1 flex items-start gap-1.5">
        <Shield size={12} className="mt-0.5 shrink-0" />
        <span>{t('profile.bpReadOnlyNote')}</span>
      </div>
    </div>
  )
}

/* ---------------------------------- helpers --------------------------------- */

function Section({ label, children }) {
  return (
    <div className="mt-5">
      <div className="m-subhead text-white/50 px-1 mb-2" style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      {children}
    </div>
  )
}

// Empty is still information — the field is part of the listing schema and its
// absence is what the strength meter is counting.
function NotAdded() {
  const { t } = useTranslation()
  return <div className="m-callout text-white/35">{t('profile.bpNotAdded')}</div>
}

// A static field row: label + value. Values wrap rather than truncate — with no
// editor to open, a clipped description would be unreadable.
function Row({ label, value, last }) {
  const empty = value == null || value === ''
  return (
    <div className={'px-3.5 py-3 ' + (last ? '' : 'border-b border-white/5')}>
      <div className="m-subhead text-white/55">{label}</div>
      {empty ? <NotAdded /> : <div className="m-callout text-white break-words">{value}</div>}
    </div>
  )
}

// A row whose value is a set of pills (categories, service areas, attributes).
function ChipsRow({ label, values, last }) {
  const list = values || []
  return (
    <div className={'px-3.5 py-3 ' + (last ? '' : 'border-b border-white/5')}>
      <div className="m-subhead text-white/55 mb-1.5">{label}</div>
      {list.length === 0
        ? <NotAdded />
        : (
          <div className="flex flex-wrap gap-1.5">
            {list.map(v => (
              <span key={v} className="inline-flex items-center px-2 h-6 rounded-full m-caption"
                style={{ background: 'var(--bg-pill-idle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}>
                {v}
              </span>
            ))}
          </div>
        )}
    </div>
  )
}

// One hours set: label + a 7-day read-out.
function HoursBlock({ label, hours }) {
  const { t } = useTranslation()
  return (
    <div className="px-3.5 py-3 border-b border-white/5">
      <div className="m-subhead text-white/55">{label}</div>
      <div className="mt-2 space-y-1">
        {DAYS.map(d => {
          // `v` stays the raw data value — it drives the comparisons below and is
          // only localised for display.
          const v = hours[d] || 'Closed'
          const off = v === 'Closed' || v === 'Not set'
          const display = off
            ? t(v === 'Not set' ? 'profile.bpNotSet' : 'profile.bpClosed')
            : v.replace('–', ' – ')
          return (
            <div key={d} className="flex items-center justify-between">
              <span className="m-caption text-white/55">{DAY_KEYS[d] ? t(DAY_KEYS[d]) : d}</span>
              <span className="m-caption m-tabular" style={off ? { color: 'rgba(148,163,184,.9)' } : { color: 'var(--text-secondary)' }}>
                {display}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
