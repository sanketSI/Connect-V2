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
  reviewQr: !IS_MVP,
  notifications: true,
}

export const SCOPE_LABEL = IS_MVP ? 'MVP' : 'Full'
