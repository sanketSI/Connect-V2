// ============================================================
// DATA / SERVICE LAYER — the ONE boundary the UI talks to.
//
// Screens import everything from here (`../data/index.js`) and never reach into
// the seed file or the AI vendor directly. Behind this barrel, each domain module
// reads from the seed adapter (src/lib/seedData.js) today; to go live, rewrite the
// domain modules to call a real API — the screens don't change.
//
//   • Records are exposed as getters:  getCalls(), getReviews(), …
//   • Business logic lives in the domain modules:  callingReasons(), reviewMetrics(), …
//   • Mutators persist behind the boundary:  setLeadStatus(), addCustomerNote(), …
//   • AI is hidden behind askAI() — the vendor stays inside src/data/ai.js.
//
// Anything windowed takes the SAME window argument — see src/data/timeWindow.js.
// ============================================================

// The "data moved" signal the mutators fire. Named, not `export *`: `subscribe`
// and `getSnapshot` are far too generic to put in a barrel this wide.
export { dataStore, emitChange } from '../events.js'

export * from './ai.js'        // askAI, isAILive, typewriter
export * from './format.js'    // rupees, relativeTime, clockTime, dayClock, calendarDate, resolveAt, nowOffsetMs, offsetForInstant
export * from './timeWindow.js' // TIME_WINDOWS, resolveWindow, inWindow, previousWindow, windowDays
export * from './session.js'   // isReturningUser, markReturningUser, getCurrentUser, maskPhone, resolveStoreCode, verifyStoreLogin, normalizeStoreCode, getStoreByCode, storeCodesFor, allStoreCodes, phoneOnFileFor, isValidStoreCodeFormat, ROLES, LANGUAGES, DEALER_PHONE, STORE_CODE_EXAMPLE
export * from './calls.js'     // getCalls, getCallById, getMissedCalls/Connected/IvrDrops, getTranscript, isMissed/isAttended, callCounts, missedCount, openMissedCount, CANONICAL_MISSED_WINDOW, callingReasons, setLeadStatus, markReviewLinkSent, callbackQueue, missedOpportunities, totalRecoverable, highIntentCount, categoryKeyFor, callReasonKeyFor, CALL_OUTCOMES, LEAD_STATUSES, CALL_SENTIMENTS, CALL_REASONS, SOURCES, OUTBOUND_AGENT_ENABLED
export * from './customers.js' // getCustomers, getCustomerById, getCustomerNotes, addCustomerNote, customerDialDigits
export * from './reviews.js'   // getReviews, getReviewById, getReviewReplies, getReviewsForCustomer, negativeReviewFor, filterReviews, reviewMetrics, sentimentForRating, canPublishReply, reviewTag, getReviewLeaderboard, newReviewsCount, reviewsWaitingCount, storeReviewLink, reviewLinkCode, CANONICAL_REVIEW_WINDOW, REVIEW_TAGS, PUBLISHING_PLATFORMS, REVIEW_SENTIMENTS, REVIEW_RATING_TYPES, REVIEW_STATUSES, DEFAULT_REVIEW_FILTERS, REVIEW_AI_COST
export * from './insights.js'  // getStoreInsights, insightStoreIds, INSIGHT_METRICS, ACTION_METRICS, CANONICAL_INSIGHTS_WINDOW
export * from './assignments.js' // which stores this manager holds + the roll-up depth
export * from './leadStatus.js' // the 5-state lifecycle + 3 sources (leaf)
export * from './leads.js' // getLeads/leadCounts/leadStatusOf + the 5-state lifecycle
export * from './locations.js' // getStoreLocations/Cluster/City/Regional, computeLocationFlags, locationNeedsVerification, verifyLocation, metersBetween, makePlusCode, sinceLastLogin, getLastLogin, LAST_LOGIN, makeAllLocationsStore, AGGREGATE_STORE_ID
export * from './network.js'   // storeRollup, storeRollups, networkRollup — every count DERIVED from the records
export * from './profile.js'   // getBusinessProfile, profileCompleteness, categoryOptionKey, attributeOptionKey, GBP_FIELDS, CATEGORY_OPTIONS, ATTRIBUTE_GROUPS, DAYS
export * from './content.js'   // getMediaLibrary, getUploadSamples, getPostTemplates, checkCompliance, complianceCapability, COMPETITOR_BRANDS, NON_BRAND_NAME_SIGNALS
export * from './notifications.js' // getNotifications, unreadNotificationCount, notificationCount, markNotificationRead, markAllNotificationsRead, NOTIFICATION_KINDS
