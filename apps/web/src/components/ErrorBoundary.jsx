import React from 'react'
import { TriangleAlert, RotateCcw, RefreshCw } from 'lucide-react'

// ============================================================
// ERROR BOUNDARY — the difference between "one card broke" and a white screen.
//
// React unmounts the ENTIRE tree when a render throws and nothing catches it.
// Without a boundary, a single bad record in one card blanks the whole app and
// the dealer sees nothing at all — no message, no way back, no clue.
//
// THREE PLACES IT IS MOUNTED (see App.jsx):
//   1. Outermost, above ThemeProvider — the last line of defence. Catches a
//      crash in the providers themselves.
//   2. Around the ScreenSwitch, keyed on `tab + role` — a crashed screen leaves
//      the chrome (tab bar) alive, so the dealer can just switch tabs, and the
//      key change auto-clears the error on the way out.
//   3. Around the app-level BottomSheet body — a crash inside a sheet must not
//      take the screen behind it down with it.
//
// SELF-SUFFICIENCY IS THE POINT. This component must render correctly when the
// thing it just caught was ThemeProvider or i18n, so:
//   • no useTranslation() — the copy is plain English, deliberately;
//   • no useTheme() — every colour is `var(--token, #brandFallback)`, so it
//     themes with the app when tokens exist and still looks right when they do
//     not (light-first: near-white #F9FAFD, ink #111827, electric blue #0070FC).
// White-on-accent text is set with an inline `color` rather than a utility
// class, because index.css rewrites `.text-white` under the light theme.
// ============================================================

const BRAND = {
  screen: 'var(--bg-screen, #F4FBFF)',
  card: 'var(--bg-card, #FFFFFF)',
  border: 'var(--border-glass, #E5E7EB)',
  ink: 'var(--text-primary, #111827)',
  ink2: 'var(--text-secondary, #374151)',
  ink3: 'var(--text-tertiary, #5F6878)',
  blue: '#0070FC',
  indigo: '#0E0071',
  error: '#DC2626',
}

const isDev = (() => {
  try { return !!import.meta.env?.DEV } catch { return false }
})()

/** The visible half — kept separate so the fallback is easy to read and reuse. */
function Fallback({ variant, title, message, error, onRetry, onReload }) {
  const inline = variant === 'inline'
  return (
    <div
      role="alert"
      className={inline ? 'w-full px-5 py-8' : 'absolute inset-0 flex items-center justify-center px-6'}
      style={{ background: inline ? 'transparent' : BRAND.screen }}
    >
      <div
        className="w-full max-w-[320px] mx-auto rounded-[20px] p-5 text-center"
        style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 8px 28px rgba(0,112,252,.10)',
        }}
      >
        <div
          className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-3"
          style={{ background: 'rgba(220,38,38,.10)' }}
        >
          <TriangleAlert size={22} style={{ color: BRAND.error }} strokeWidth={2} />
        </div>

        <h2 className="m-headline font-semibold" style={{ color: BRAND.ink }}>{title}</h2>
        <p className="m-footnote mt-1.5" style={{ color: BRAND.ink3 }}>{message}</p>

        {/* DEV only: the actual error, so a developer is not left guessing.
            Never shown in a production build — a stack trace is not a message
            for a store manager. */}
        {isDev && error && (
          <pre
            className="mt-3 text-left rounded-xl px-3 py-2 overflow-auto"
            style={{
              maxHeight: 140,
              fontSize: 11,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(220,38,38,.06)',
              border: '1px solid rgba(220,38,38,.18)',
              color: BRAND.ink2,
            }}
          >
            {String(error?.stack || error?.message || error)}
          </pre>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={onRetry}
            className="w-full h-11 rounded-full font-semibold press flex items-center justify-center gap-2"
            style={{ background: BRAND.blue, color: '#fff', fontSize: 15 }}
          >
            <RotateCcw size={16} style={{ color: '#fff' }} /> Try Again
          </button>
          <button
            onClick={onReload}
            className="w-full h-11 rounded-full font-semibold press flex items-center justify-center gap-2"
            style={{ background: 'transparent', color: BRAND.indigo, border: `1px solid ${BRAND.border}`, fontSize: 15 }}
          >
            <RefreshCw size={16} style={{ color: BRAND.indigo }} /> Reload App
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * @param variant   'screen' (fills its container) | 'inline' (sits in flow — use
 *                  inside a sheet, where the sheet chrome is still on screen)
 * @param title     override the heading
 * @param message   override the body copy
 * @param onReset   extra cleanup to run on "Try Again" (e.g. close the sheet)
 * @param label     tag used in the console log, so a report names the boundary
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, resetSeq: 0 }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // The one place a render crash is recorded. A real deployment swaps this for
    // the error reporter; the console is what we have and it is better than the
    // silence this component replaced.
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // Navigating away from a broken screen clears it: App.jsx passes
    // `resetKey={tab + role}`, so switching tabs is itself the recovery.
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ error: null, resetSeq: this.state.resetSeq + 1 })
    }
  }

  handleRetry = () => {
    // Bumping resetSeq re-keys the subtree so the children genuinely REMOUNT.
    // Clearing `error` alone would re-render the same broken state and throw
    // straight back into the fallback.
    this.setState(s => ({ error: null, resetSeq: s.resetSeq + 1 }))
    try { this.props.onReset?.() } catch (e) { console.error('[ErrorBoundary] onReset threw:', e) }
  }

  handleReload = () => {
    try { window.location.reload() } catch { /* nothing left to do */ }
  }

  render() {
    if (this.state.error) {
      return (
        <Fallback
          variant={this.props.variant || 'screen'}
          title={this.props.title || 'Something went wrong'}
          message={this.props.message || 'This part of the app stopped responding. Your data is safe — try again, or reload if it keeps happening.'}
          error={this.state.error}
          onRetry={this.handleRetry}
          onReload={this.handleReload}
        />
      )
    }
    return <React.Fragment key={this.state.resetSeq}>{this.props.children}</React.Fragment>
  }
}
