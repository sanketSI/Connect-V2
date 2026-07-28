// ============================================================
// BUILD SCOPE — which product this build is.
//
//   mvp  (default) — what the team is shipping next sprint. Everything outside the
//                    written MVP scope is absent: not hidden behind a disabled control
//                    that hints at a paid tier, absent.
//   full           — the north-star build. Same code, every surface on.
//
// DEFAULTS TO MVP ON PURPOSE. `npm run build` and the Vercel deploy must produce the
// thing being launched; the fuller build is the one you have to ask for. A flag that
// defaults the other way ships the wrong app the first time someone forgets to set it.
//
//   VITE_SCOPE=full npm run build   → north star
//   npm run build                   → MVP
//
// SCOPE, NOT SIZE. These gates decide what a manager can REACH, not what ships in the
// bundle: the screens are still imported by their parents, so their code and catalog
// strings stay in the build. I checked — the MVP and full bundles carry the same
// strings. Dropping them for real needs the call sites to import dynamically, which is
// worth doing for load time but is a separate change and not what "strip the scope"
// asked for.
//
// WHAT STAYS IN THE MVP, and why it is not on this list:
//   • the review REQUEST flow — an explicit must-have ("request the review from an
//     already converted customer"),
//   • review COUNTS — they feed profile performance and the negative-review leaderboard.
// Only the inbox, the reply composer and the auto-responder pitch come out.
// ============================================================
const SCOPE = String(import.meta.env?.VITE_SCOPE || 'mvp').toLowerCase()

/** True for the launch build. */
export const IS_MVP = SCOPE !== 'full'

export const FEATURES = {
  /** Cover photo, gallery, posts, Smart Image Protection. */
  manageMedia: !IS_MVP,
  /** The Google Business Profile editor — info, hours, attributes. */
  businessProfile: !IS_MVP,
  /** On-site location verification (pin drift, pincode, storefront photo). */
  locationVerify: !IS_MVP,
  /** The reviews INBOX: reading, filtering, replying, AI drafts, the Premium pitch. */
  reviewsInbox: !IS_MVP,
  /** The printable review QR sheet. */
  reviewQr: !IS_MVP,
  /** The notification centre and its bell. */
  notifications: !IS_MVP,
}

/** For the one place that should say which build this is: Profile's footer. */
export const SCOPE_LABEL = IS_MVP ? 'MVP' : 'Full'
