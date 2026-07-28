// ============================================================
// THE LEAD LIFECYCLE — a LEAF module, imported by everyone and importing nothing.
//
// calls.js validates writes against this set, and leads.js projects records into it.
// If either owned the list the other would have to import it back, closing a cycle —
// the same reason PRIMARY_STORE_ID sits in the leaf seed and network.js exists at all.
// ============================================================

/**
 * In lifecycle order, which is the order the pickers render.
 *
 * 'missed' is any lead nobody has answered yet, not only a missed call — a web form
 * that has sat unanswered is missed in exactly the sense that matters to the shop.
 * 'expired' is a fact about TIME, not a verdict on the customer.
 */
export const LEAD_STATUSES = [
  { id: 'missed', label: 'Missed', labelKey: 'leads.statusMissed' },
  { id: 'contacted', label: 'Contacted', labelKey: 'leads.statusContacted' },
  { id: 'converted', label: 'Converted', labelKey: 'leads.statusConverted' },
  { id: 'review_requested', label: 'Review requested', labelKey: 'leads.statusReviewRequested' },
  { id: 'expired', label: 'Expired', labelKey: 'leads.statusExpired' },
]

export const LEAD_STATUS_IDS = LEAD_STATUSES.map(s => s.id)

/** Where the lead came from. */
export const LEAD_SOURCES = [
  { id: 'call', label: 'Call', labelKey: 'leads.sourceCall' },
  { id: 'form', label: 'Form', labelKey: 'leads.sourceForm' },
  { id: 'walk_in', label: 'Walk-in', labelKey: 'leads.sourceWalkIn' },
]

export const LEAD_SOURCE_IDS = LEAD_SOURCES.map(s => s.id)
