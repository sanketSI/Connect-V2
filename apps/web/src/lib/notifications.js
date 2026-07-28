import { createContext, useContext } from 'react'

// ============================================================
// Notifications UI context — the one seam between the bell (rendered inside each
// screen's header) and the app-level NotificationCenter sheet (rendered once, in
// AppContent, next to the location-verify sheet).
//
// The bell only needs to ask "open the center"; the center owns its own open/close
// and deep-link-to-tab wiring where setTab lives. Keeping this a tiny leaf module
// (no component imports) means NotificationBell and App can both pull it in without
// a cycle.
// ============================================================
export const NotificationsContext = createContext({ open: () => {}, storeId: undefined, aggregate: false })

/**
 * `{ open(), storeId, aggregate }` — open() raises the centre; storeId scopes the feed to
 * the branch in session (undefined on All-locations = every store) and `aggregate` tells
 * the rows whether to name their branch.
 */
export function useNotifications() {
  return useContext(NotificationsContext)
}
