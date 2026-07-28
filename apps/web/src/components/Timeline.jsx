import React from 'react'
import { PhoneMissed, PhoneIncoming, PhoneOutgoing, Link as LinkIcon } from 'lucide-react'

// ============================================================
// ONE INTERACTION, ONE ROW.
//
// Lifted out of Customers.jsx so the Leads sheet renders a customer's history the same
// way the Customers screen does. Two implementations of "what happened with this person"
// is how the two screens start disagreeing about it — and Customers is a full-build
// screen, so in the launch build this row would otherwise have had no home at all.
// ============================================================
export function TimelineRow({ entry, last }) {
  const iconMap = {
    missed:        { Icon: PhoneMissed, color: '#DC2626', bg: 'rgba(220,38,38,.10)' },
    inbound:       { Icon: PhoneIncoming, color: '#38BDF8', bg: 'rgba(56,189,248,.10)' },
    outbound:      { Icon: PhoneOutgoing, color: '#0070FC', bg: 'rgba(0,112,252,.10)' },
    'review-sent': { Icon: LinkIcon,     color: '#38BDF8', bg: 'rgba(56,189,248,.10)' },
  }
  const s = iconMap[entry.type] || iconMap.inbound
  const Icon = s.Icon
  return (
    <div className="relative px-3.5 py-3 flex items-start gap-3">
      <div className="relative shrink-0">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center"
          style={{ background: s.bg, border: `1px solid ${s.color}30` }}
        >
          <Icon size={15} style={{ color: s.color }} />
        </div>
        {!last && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-9 bottom-[-12px] w-px"
            style={{ background: 'var(--border-glass)' }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="m-callout text-white">{entry.detail}</div>
        {/* Still the seed's frozen `at` string, as on Calls. Migrating the timeline to
            dayClock(entry.atMs) is a whole-app job (the seed's offsets are pinned to a
            ~12:20 PM session start, so an evening demo would show a sale closing at
            11:50 pm) — not something to slip in behind a design-review fix. */}
        <div className="m-caption text-white/55 mt-0.5">{entry.at}</div>
      </div>
    </div>
  )
}

export default TimelineRow
