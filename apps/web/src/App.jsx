import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FEATURES } from './lib/features.js'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'

import PhoneFrame from './components/PhoneFrame.jsx'
import BottomTabBar from './components/BottomTabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ToastProvider, useToast } from './components/Toast.jsx'
import { ThemeProvider } from './lib/theme.jsx'
import { useDataVersion } from './lib/useDataVersion.js'

import Login from './screens/Login.jsx'
import StoreSelector from './screens/StoreSelector.jsx'
import Home from './screens/Home.jsx'
import CallsTab from './screens/CallsTab.jsx'
import Customers from './screens/Customers.jsx'
import Leads from './screens/Leads.jsx'
import Network from './screens/Network.jsx'
import Reviews from './screens/Reviews.jsx'
import Profile from './screens/Profile.jsx'
import Hierarchy from './screens/Hierarchy.jsx'
import LocationVerify from './screens/LocationVerify.jsx'
import BottomSheet from './components/BottomSheet.jsx'

import {
  getStoreLocations, isReturningUser, locationNeedsVerification, markReturningUser,
  openMissedCount, reviewsWaitingCount, leadCounts,
  setSessionAssignments, clearSessionAssignments,
} from '@connect/core'
import { setAnalyticsContext } from '@connect/core/analytics.js'
import NotificationCenter from './components/NotificationCenter.jsx'
import { NotificationsContext } from './lib/notifications.js'

const MAPPED_LOCATIONS = getStoreLocations()

// BADGES — the canonical counts, straight from the data layer. Nothing is computed here
// any more, and that is the fix: the VMN badge used to filter today's MISSED_CALLS array
// by hand (which silently drops the IVR drops the Calls screen counts, so the badge said
// 8 over a screen saying 11), and the reviews badge was the literal `2` with no data
// behind it at all while Home said 4 and the Reviews screen implied ten.
//
// Both selectors carry their own window (see CANONICAL_MISSED_WINDOW / _REVIEW_WINDOW),
// and both are the window the screen behind the badge opens on — a badge has nowhere to
// print a window, so it has to mean what you see when you tap it.
//
// Recomputed on every data-version bump (see useDataVersion), which is what makes marking
// a lead on the calls tab, or posting a reply on the reviews tab, drop the badge at once.

const HIERARCHY_ROLES = new Set(['city', 'regional', 'state', 'head'])

// Dev capture mode (?capture): route directly to any screen with motion disabled,
// so every state renders instantly for screenshots. No effect without the param.
const CAP = (() => {
  try {
    const p = new URLSearchParams(window.location.search)
    if (!p.has('capture')) return null
    return { stage: p.get('stage'), tab: p.get('tab'), role: p.get('role'), store: p.get('store'), welcome: p.has('welcome') }
  } catch { return null }
})()

function ScreenSwitch({
  tab, role, store, firstTime,
  onSeenWelcome, onGoTab, onChangeRole, onLogout, onSwitchStore,
  onOpenProfile, onCloseProfile, leadsPreset,
}) {
  // Hierarchy roles see a roll-up on the VMN tab instead of the call tracker.
  const isHierarchy = HIERARCHY_ROLES.has(role)

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tab + role}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="absolute inset-0"
      >
        {/* Per-screen boundary: a screen that throws leaves the tab bar alive, so
            the dealer can switch away — and `resetKey` clears the error when they
            do, without a reload. */}
        <ErrorBoundary
          label={`screen:${tab}`}
          resetKey={`${tab}|${role}`}
          message="This screen stopped responding. Your data is safe — try again, or switch to another tab."
        >
        {tab === 'home' && (
          <Home
            store={store}
            role={role}
            firstTime={firstTime}
            onSeenWelcome={onSeenWelcome}
            onGoTab={onGoTab}
            onSwitchStore={onSwitchStore}
            onOpenProfile={onOpenProfile}
          />
        )}
        {tab === 'vmn' && (isHierarchy
          ? <Hierarchy role={role} onOpenProfile={onOpenProfile} />
          : <CallsTab store={store} onOpenProfile={onOpenProfile} />)}
        {/* MVP: one Leads list in place of Calls + Customers. The full build keeps
            both, so neither path is deleted — see lib/features.js. */}
        {tab === 'leads' && <Leads store={store} onOpenProfile={onOpenProfile} preset={leadsPreset} />}
        {tab === 'network' && <Network store={store} onOpenProfile={onOpenProfile} />}
        {tab === 'customers' && <Customers store={store} onOpenProfile={onOpenProfile} />}
        {/* Reviews became a tab in scope round 2. The guard stays: the inbox must not be
            one stray onGoTab away from being reachable in a build meant to be without it,
            and features.js is the single place that decides. */}
        {tab === 'reviews' && FEATURES.reviewsInbox && <Reviews role={role} store={store} onOpenProfile={onOpenProfile} />}
        {tab === 'profile' && (
          <Profile
            role={role}
            store={store}
            onChangeRole={onChangeRole}
            onLogout={onLogout}
            onSwitchStore={onSwitchStore}
            onBack={onCloseProfile}
          />
        )}
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  )
}

function AppContent() {
  const [stage, setStage] = useState(CAP ? (CAP.stage || 'app') : 'login') // login | store (the switcher) | app
  const [tab, setTab] = useState(CAP?.tab || 'home')
  // Profile is reached from the avatar, not the bar, so leaving it has to return the
  // manager to the tab they opened it from — not to a fixed screen. Guarded against
  // re-entry so opening Profile while already on it cannot make "back" a no-op.
  const [tabBeforeProfile, setTabBeforeProfile] = useState('home')
  const openProfile = () => {
    setTabBeforeProfile(p => (tab === 'profile' ? p : tab))
    setTab('profile')
  }
  const closeProfile = () => setTab(tabBeforeProfile)
  // A tab can be opened ON something — Home's "N missed calls" opens Leads already
  // narrowed to missed calls rather than dropping the manager into the full list to
  // find them again. Carries a nonce so tapping the same CTA twice re-applies the
  // filter even when the values are identical and the manager has since changed them.
  const [leadsPreset, setLeadsPreset] = useState(null)
  const presetSeq = useRef(0)
  const goTab = (next, preset) => {
    if (preset) { presetSeq.current += 1; setLeadsPreset({ ...preset, seq: presetSeq.current }) }
    setTab(next)
  }
  const [role, setRole] = useState(CAP?.role || 'single')
  const [store, setStore] = useState(() => (CAP?.store && MAPPED_LOCATIONS.find(l => l.id === CAP.store)) || MAPPED_LOCATIONS[0])
  // True only between a multi-store sign-in and the moment a store is chosen.
  const [picking, setPicking] = useState(false)
  const [verifyStore, setVerifyStore] = useState(null)
  const [firstTime, setFirstTime] = useState(() => CAP ? !!CAP.welcome : !isReturningUser())
  const toast = useToast()
  const [notifOpen, setNotifOpen] = useState(false)
  // Declared before notifApi below, which closes over it.
  const scopeId = store?.aggregate ? undefined : store?.id
  const notifApi = useMemo(
    () => ({ open: () => setNotifOpen(true), storeId: scopeId, aggregate: !!store?.aggregate }),
    [scopeId, store],
  )

  // Cross-screen reactivity: bumps whenever any core mutator commits, so the
  // badge below re-derives from the (mutated-in-place) records.
  const dataVersion = useDataVersion()
  // Scoped to the branch in session — on "All locations" storeId is undefined, which the
  // selectors read as "every store". Before attribution these badges always counted the
  // whole network, so a single-store manager saw other branches' work in his own badge.
  const vmnBadge = useMemo(() => openMissedCount(undefined, scopeId), [dataVersion, scopeId])
  // What is waiting on the Leads tab: leads nobody has answered yet.
  const leadsBadge = useMemo(() => leadCounts({ storeId: scopeId }).missed, [dataVersion, scopeId])
  const reviewsBadge = useMemo(() => reviewsWaitingCount(undefined, scopeId), [dataVersion, scopeId])

  useEffect(() => {
    if (stage !== 'app' || CAP) return
    const t1 = setTimeout(() => {
      toast.push({
        kind: 'missed',
        title: 'Hot lead just called again',
        body: '+91 ●●●●● ●●231 · 3× today · ₹38K · CLI 92',
        duration: 5200,
      })
    }, 6000)
    const t2 = setTimeout(() => {
      toast.push({
        kind: 'review',
        title: 'New 5-star review',
        body: 'Arjun Mehta · "Best electronics store in Indiranagar"',
        duration: 5200,
      })
    }, 14000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [stage, toast])

  // Scope the session to a store and go to the app. One path, whether the store came
  // from the sign-in code or from the switcher — a flagged one opens verification on
  // arrival either way. The tab is left alone: a switch re-scopes the view you are
  // already on (VMN → that store's calls, Profile → that store's profile), and
  // cancelling a switch must leave you exactly where you started.
  function openStore(picked) {
    if (!picked) return
    setPicking(false)
    // Scope every event from here on to this store and the current viewing role. This is
    // the ONE path for both sign-in and the in-app switcher, so store_id can never go
    // stale — a switch re-points the analytics context exactly as it re-points the view.
    setAnalyticsContext({ store_id: picked.id, role })
    setStore(picked)
    setStage('app')
    // The verification flow is not in the MVP build, so a flagged store must not be
    // sent into a sheet that build does not contain.
    if (FEATURES.locationVerify && locationNeedsVerification(picked)) setVerifyStore(picked)
  }

  // Sign-in resolves the store from the NUMBER. One outlet and there is nothing to
  // choose, so we open it; several and Login hands us a null, which is not a failure —
  // it is "this needs a decision", and the picker is where that decision belongs.
  //
  // `picking` has to be its own flag: `store` defaults to MAPPED_LOCATIONS[0] so the
  // app always has something to render, which means a null store can never be the
  // signal for "nothing chosen yet".
  function handleAuthed(picked, myStores) {
    // BEFORE anything renders. Login has already resolved this number to the stores it
    // holds; handing that set to core makes it the ONE answer to "which stores are
    // mine" — the tab bar's shape, the roll-up's depth and the picker's count all read
    // it. Skip this and they each go back to guessing from the whole fixture.
    setSessionAssignments((myStores || []).map(s => s.id))
    setTab('home') // a fresh session always starts on Home
    if (picked) { openStore(picked); return }
    setPicking(true)
    setStage('store')
  }

  // Sign-out has to drop the scope as well as the screen, or the next number to sign in
  // inherits this one's stores until it happens to overwrite them.
  function handleLogout() {
    clearSessionAssignments()
    setStage('login')
  }

  // The store picker is reached only as the in-app switcher, from Home/Profile.
  // Backing out of a switch returns to the app — it must never sign anyone out.
  function startSwitch() {
    setPicking(false)
    setStage('store')
  }

  function markWelcomeSeen() {
    markReturningUser()
    setFirstTime(false)
  }

  function requestNumberChange(payload) {
    toast.push({
      kind: 'ai',
      title: 'Request sent to Nova admin',
      body: 'Your number-change request is pending brand-owner approval.',
      duration: 5200,
    })
  }

  function changeRole(r) {
    // Keep the analytics role dimension honest: switching the viewing role changes what
    // the dealer sees and does, so every event after this must carry the new role.
    setAnalyticsContext({ role: r })
    setRole(r)
    setTab(HIERARCHY_ROLES.has(r) ? 'vmn' : 'home')
    toast.push({
      kind: 'ai',
      title: 'Role switched',
      body: r === 'single' ? 'Now viewing single store · Lakshmi Indiranagar'
           : r === 'cluster' ? 'Now viewing cluster · 3 Bangalore stores'
           : r === 'city' ? 'Now viewing City Manager · Bangalore'
           : r === 'regional' ? 'Now viewing Regional Head · South India'
           : r === 'state' ? 'Now viewing State Manager · Karnataka'
           : 'Now viewing Distribution Head · PAN India',
    })
  }

  return (
    <NotificationsContext.Provider value={notifApi}>
      <AnimatePresence mode="wait">
        {stage === 'login' && (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="absolute inset-0">
            <Login onAuthed={handleAuthed} onRequestNumberChange={requestNumberChange} />
          </motion.div>
        )}
        {stage === 'store' && (
          <motion.div key="store" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="absolute inset-0">
            {/* No store yet means we arrived straight from sign-in, so this is the
                gate, not the switcher: nothing is "current" to mark, and backing out
                returns to login rather than to an app with no store scoped to it. */}
            <StoreSelector
              mode={picking ? 'pick' : 'switch'}
              current={picking ? null : store}
              onPick={openStore}
              onBack={() => { if (picking) { setPicking(false); handleLogout() } else setStage('app') }}
            />
          </motion.div>
        )}
        {stage === 'app' && (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0">
            <ScreenSwitch
              tab={tab}
              role={role}
              store={store}
              firstTime={firstTime}
              onSeenWelcome={markWelcomeSeen}
              onGoTab={goTab}
              onChangeRole={changeRole}
              onLogout={handleLogout}
              onSwitchStore={startSwitch}
              onOpenProfile={openProfile}
              onCloseProfile={closeProfile}
              leadsPreset={leadsPreset}
            />

            <BottomTabBar
              active={tab}
              onChange={(t) => setTab(t)}
              badges={{
                leads: leadsBadge,
                vmn: vmnBadge,
                reviews: reviewsBadge,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* App-level location-verification sheet — reachable straight from a flagged store card.
          Its own boundary, INSIDE the sheet: a crash in LocationVerify must not take
          down the screen behind the sheet. `inline` keeps the sheet chrome (grabber,
          close button) on screen so there is always a way out, and onReset closes the
          sheet so "Try Again" lands somewhere known-good. */}
      <BottomSheet open={!!verifyStore} onClose={() => setVerifyStore(null)} fullHeight label={verifyStore?.branch}>
        <ErrorBoundary
          label="sheet:locationVerify"
          variant="inline"
          resetKey={verifyStore?.id}
          title="Verification could not load"
          message="Close this sheet and try again from the store card."
          onReset={() => setVerifyStore(null)}
        >
          {verifyStore && <LocationVerify location={verifyStore} onClose={() => setVerifyStore(null)} />}
        </ErrorBoundary>
      </BottomSheet>

      {/* App-level notification center — one instance, opened from any screen's
          bell via NotificationsContext; deep-links to the tab that can act. */}
      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onNavigate={(tab) => { if (tab) setTab(tab); setNotifOpen(false) }}
      />
    </NotificationsContext.Provider>
  )
}

export default function App() {
  return (
    // Outermost boundary sits ABOVE the providers on purpose: if ThemeProvider or
    // ToastProvider is what throws, nothing below could catch it. It renders with
    // hard-coded brand fallbacks precisely so it does not need them.
    <ErrorBoundary label="app">
      <ThemeProvider>
        <MotionConfig reducedMotion={CAP ? 'always' : 'user'}>
          <PhoneFrame>
            <ToastProvider>
              {/* Second ring, inside the frame: a crash in AppContent keeps the
                  phone chrome and renders the fallback on the phone screen. */}
              <ErrorBoundary label="appContent">
                <AppContent />
              </ErrorBoundary>
            </ToastProvider>
          </PhoneFrame>
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
