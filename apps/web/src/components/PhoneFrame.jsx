import React, { createContext, useEffect, useState } from 'react'
import { useTheme } from '../lib/theme.jsx'
import OfflineBanner from './OfflineBanner.jsx'

// Bottom sheets portal into this host so they always position against the phone
// screen — never trapped inside a scrolled or transformed screen container.
export const SheetPortalContext = createContext(null)

// Two layouts, decided by viewport width (CSS media query at 640px, mirrored here):
//   < 640px  — a real phone: the app fills the viewport edge-to-edge (no bezel art).
//              Sizing lives entirely in index.css (.si-device mobile override).
//   ≥ 640px  — desktop/tablet: the app renders in a fixed 390×844 device frame
//              (iPhone 14/15 logical points) centered on the dark stage. If the
//              viewport is SHORTER than the frame, we scale the whole frame down
//              uniformly so it always fits without page scroll — everything inside
//              is absolutely positioned against the frame, so uniform scaling is
//              safe (sheets, toasts and the tab bar all track the frame edges).
const FRAME_W = 390
const FRAME_H = 844
const STAGE_MARGIN = 24 // breathing room around the frame before we start scaling

function computeScale() {
  if (typeof window === 'undefined') return 1
  const w = window.innerWidth
  const h = window.innerHeight
  if (w < 640) return 1 // mobile layout is fluid — never scaled
  return Math.min(1, (w - STAGE_MARGIN) / FRAME_W, (h - STAGE_MARGIN) / FRAME_H)
}

export default function PhoneFrame({ children }) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [sheetHost, setSheetHost] = useState(null)
  const [scale, setScale] = useState(computeScale)

  useEffect(() => {
    const onResize = () => setScale(computeScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="phone-stage">
      <div
        className="si-device relative"
        data-theme={theme}
        style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}
      >
        {/* outer device shell — on real phones this flattens to a plain
            full-viewport surface (radius/shadow removed in index.css) */}
        <div className="si-shell absolute overflow-hidden">
          {/* glow — decorative, desktop frame only */}
          <div
            className="si-frame-decor absolute -inset-20 pointer-events-none"
            style={{
              opacity: isLight ? 0.30 : 0.50,
              background:
                'radial-gradient(40% 40% at 50% 0%, rgba(0,112,252,.35), transparent), radial-gradient(40% 40% at 100% 100%, rgba(14,0,113,.25), transparent)',
              filter: 'blur(20px)',
            }}
          />
          {/* screen — THE app box. Sheets, toasts, tab bar and every screen anchor
              to this element's edges. On phones it fills the viewport (inset from
              the notch via safe-area env() — see index.css). */}
          <div className="si-screen absolute overflow-hidden">
            {/* status bar — sits ABOVE content with blur so scrolled content fades under.
                The 44px band is part of the app's layout contract (screens start at
                top-[44px]) and stays in BOTH layouts; only the fake hardware glyphs
                inside it (clock, island, battery) are desktop-frame decoration. */}
            <div
              className="si-statusbar absolute top-0 left-0 right-0 h-[44px] z-50 flex items-center justify-between px-7 pointer-events-none"
              style={{
                background: 'var(--bg-statusbar-grad)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              <span
                className="si-frame-decor m-callout font-semibold m-tabular"
                style={{ color: isLight ? 'rgba(17,24,39,.85)' : 'rgba(255,255,255,.95)' }}
              >
                9:41
              </span>
              {/* Dynamic island — always dark (the physical pill) */}
              <div
                className="si-frame-decor absolute left-1/2 -translate-x-1/2 top-[10px] w-[110px] h-[28px] rounded-full bg-black"
                style={{ boxShadow: '0 0 0 1px rgba(255,255,255,.05), 0 4px 14px rgba(0,0,0,.6)' }}
              />
              <div
                className="si-frame-decor flex items-center gap-1.5"
                style={{ color: isLight ? 'rgba(17,24,39,.85)' : 'rgba(255,255,255,.95)' }}
              >
                <SignalIcon />
                <WifiIcon />
                <BatteryIcon />
              </div>
            </div>

            {/* Offline banner — slides in just below the status bar when the device drops
                connectivity, and away when it returns. Non-blocking; part of the chrome so
                it shows on every stage (login and app). */}
            <OfflineBanner />

            {/* content area — screens manage their own top spacing (status bar = 44px).
                --screen-wash is the whisper-strength brand radial at the very top: the
                "light from above" that keeps the field from reading flat. */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ backgroundColor: 'var(--bg-screen)', backgroundImage: 'var(--screen-wash)' }}
            >
              <SheetPortalContext.Provider value={sheetHost}>
                {children}
              </SheetPortalContext.Provider>
            </div>

            {/* Bottom-sheet portal host — above app content (incl. tab bar), below the status bar.
                Empty and click-through until a sheet mounts its own interactive layers here. */}
            <div ref={setSheetHost} className="absolute inset-0 z-[45]" style={{ pointerEvents: 'none' }} />

            {/* home indicator — desktop frame decoration (real phones draw their own) */}
            <div
              className="si-frame-decor absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[5px] rounded-full z-50 pointer-events-none"
              style={{ background: isLight ? 'rgba(17,24,39,.45)' : 'rgba(255,255,255,.35)' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function SignalIcon() {
  return (
    <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
      <rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor" />
      <rect x="5" y="5" width="3" height="6" rx="0.5" fill="currentColor" />
      <rect x="10" y="2.5" width="3" height="8.5" rx="0.5" fill="currentColor" />
      <rect x="15" y="0" width="3" height="11" rx="0.5" fill="currentColor" />
    </svg>
  )
}
function WifiIcon() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
      <path d="M8 9.5c.7 0 1.2.5 1.2 1.1 0 .3-.2.4-.4.4H7.2c-.2 0-.4-.1-.4-.4 0-.6.5-1.1 1.2-1.1Z" fill="currentColor"/>
      <path d="M8 6.6c1.5 0 2.8.6 3.8 1.5.2.2.2.5 0 .7l-.6.6c-.2.2-.4.2-.6 0-.6-.6-1.5-1-2.6-1s-2 .4-2.6 1c-.2.2-.4.2-.6 0L4.2 8.8c-.2-.2-.2-.5 0-.7 1-1 2.3-1.5 3.8-1.5Z" fill="currentColor"/>
      <path d="M8 3.6c2.4 0 4.5 1 6 2.5.2.2.2.5 0 .7l-.6.6c-.2.2-.4.2-.6 0C11.7 6.3 9.9 5.6 8 5.6S4.3 6.3 3.2 7.4c-.2.2-.4.2-.6 0L2 6.8c-.2-.2-.2-.5 0-.7 1.5-1.5 3.6-2.5 6-2.5Z" fill="currentColor"/>
      <path d="M8 .6c3.3 0 6.3 1.3 8.5 3.5.2.2.2.5 0 .7l-.6.6c-.2.2-.4.2-.6 0C13.3 3.5 10.8 2.6 8 2.6S2.7 3.5.7 5.4c-.2.2-.4.2-.6 0L-.5 4.8c-.2-.2-.2-.5 0-.7C1.7 1.9 4.7.6 8 .6Z" fill="currentColor"/>
    </svg>
  )
}
function BatteryIcon() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
      <rect x="0.5" y="0.5" width="22" height="12" rx="3" stroke="currentColor" strokeOpacity=".4"/>
      <rect x="2" y="2" width="19" height="9" rx="1.5" fill="currentColor"/>
      <rect x="24" y="4" width="2.5" height="5" rx="1" fill="currentColor" fillOpacity=".5"/>
    </svg>
  )
}
