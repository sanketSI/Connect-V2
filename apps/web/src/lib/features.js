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

// SCOPE ROUND 2 (stakeholder feedback). Reviews, Manage Media and Business Profile were
// pulled INTO the launch scope: the bottom nav now carries Reviews, and Profile is where
// a manager edits the listing. They are plain `true` rather than `!IS_MVP` because they
// are no longer what distinguishes the two builds — writing them as flags that are
// always on would say the opposite of what is true.
//
// The Premium AI Auto-Responder UPSELL did NOT come with them. The inbox ships; the ad
// for a tier this manager has not bought does not. That is its own flag, not a fold of
// reviewsInbox, because "can read and reply" and "is shown a paywall" are different
// questions and the launch answer differs.
export const FEATURES = {
  /** Cover photo, gallery, posts, Smart Image Protection. In scope since round 2. */
  manageMedia: true,
  /** The Google Business Profile view — info, hours, attributes. In scope since round 2. */
  businessProfile: true,
  /** On-site location verification (pin drift, pincode, storefront photo). */
  locationVerify: !IS_MVP,
  /** The reviews INBOX: reading, filtering, replying, AI drafts. In scope since round 2. */
  reviewsInbox: true,
  /** The Premium AI Auto-Responder pitch INSIDE the inbox — the chip and its sheet. */
  reviewsAutoReplyPitch: !IS_MVP,
  /** The printable review QR sheet. IN SCOPE since Feedback-2 item 10: "this was there
   *  in the previous build of the app. It got stripped in this version" — the QR is how a
   *  buyer standing at the counter is asked for a Google review, which is the top of the
   *  funnel the whole Reviews tab sits on. Plain `true`, not a flag that is always on. */
  reviewQr: true,
  /** The notification centre and its bell. In scope since round 3. */
  notifications: true,
  /** The "Number changed or new to the team? Request access" flow on Login. OUT of the
   *  launch scope on instruction ("remove request access flow from mbp scope"): the MVP
   *  ships to managers whose numbers are already registered, and a self-serve access
   *  request needs a human on the other end of it to be anything but a dead end. The
   *  screen and its sheet are gated, not deleted — the full build keeps them. */
  requestAccess: !IS_MVP,
}

/**
 * WHICH NOTIFICATIONS THIS BUILD CAN HONESTLY RAISE.
 *
 * The feed has three sources and one of them — `verify` — points at a flow the launch
 * scope does not contain. A notification is a promise that something can be done about
 * it, so a build without location verification must not be told a location needs
 * verifying: that is a dead end with a red badge on it.
 *
 * Exported as one list rather than checked in two places, because the BELL counts and
 * the CENTRE lists, and a badge that disagrees with the sheet it opens is worse than
 * either being wrong alone.
 */
export const NOTIFICATION_KINDS = [
  'missed_call',
  'review',
  ...(FEATURES.locationVerify ? ['verify'] : []),
]

/** For the one place that should say which build this is: Profile's footer. */
export const SCOPE_LABEL = IS_MVP ? 'MVP' : 'Full'
