// The build-scope gates, ported from apps/web/src/lib/features.js — SAME flags, SAME
// defaults, different env plumbing (EXPO_PUBLIC_SCOPE instead of VITE_SCOPE). The two
// files must agree: a surface the web MVP hides must not appear on the phone.
const SCOPE = String(process.env.EXPO_PUBLIC_SCOPE || 'mvp').toLowerCase()

export const IS_MVP = SCOPE !== 'full'

export const FEATURES = {
  manageMedia: true,
  businessProfile: true,
  locationVerify: !IS_MVP,
  reviewsInbox: true,
  reviewsAutoReplyPitch: !IS_MVP,
  /** The printable review QR sheet. IN SCOPE since Feedback-2 item 10: "this was there
   *  in the previous build of the app. It got stripped in this version" — the QR is how a
   *  buyer standing at the counter is asked for a Google review, which is the top of the
   *  funnel the whole Reviews tab sits on. Plain `true`, not a flag that is always on. */
  reviewQr: true,
  notifications: true,
}

export const SCOPE_LABEL = IS_MVP ? 'MVP' : 'Full'
