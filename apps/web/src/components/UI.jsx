import React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { Sparkles, MapPin } from 'lucide-react'
import { storeLabelOf } from '@connect/core'

export function Card({ className, children, onClick, style }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        // si-card layers the cream on top of .glass for CARD surfaces only — see the
        // block in index.css. Inputs/chips that also wear .glass are unaffected.
        'rounded-2xl glass si-card p-4 press',
        onClick && 'cursor-pointer',
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}

export function AICard({ className, children, style, ...rest }) {
  return (
    <div
      className={cn('rounded-2xl ai-surface p-4 press', className)}
      style={style}
      {...rest}
    >
      <div className="relative z-10">{children}</div>
    </div>
  )
}

/**
 * Filter/action chip.
 *
 * Touch target vs. visual size: the BUTTON is the full 44×44 minimum (the WCAG 2.5.5 /
 * Material 48dp-ish floor, and what a shop owner tapping one-handed actually needs). The
 * painted pill stays compact — 32px tall — as an inner span, so chip rows read as chips
 * rather than as a wall of buttons. Growing the real box (rather than faking it with a
 * pseudo-element) means the 44px is measurable in the DOM and never overlaps a neighbour.
 */
export function Chip({ children, active, onClick, color = 'default', icon: Icon, dot, className }) {
  const styles = active
    ? { background: '#0070FC', color: '#fff', border: '1px solid rgba(255,255,255,.18)' }
    : { background: 'var(--bg-pill-idle)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active === undefined ? undefined : !!active}
      className={cn(
        'inline-flex items-center justify-center shrink-0 press',
        'min-h-[var(--m-touch-min)] min-w-[var(--m-touch-min)]',
        className,
      )}
    >
      <span
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full m-subhead whitespace-nowrap md-state"
        style={styles}
      >
        {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />}
        {Icon && <Icon size={13} className="shrink-0" />}
        {children}
      </span>
    </button>
  )
}

export function PrimaryButton({ children, onClick, className, disabled, loading, icon: Icon, full = true }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'on-dark relative h-12 rounded-xl m-headline text-white press md-state inline-flex items-center justify-center gap-2',
        full && 'w-full',
        disabled && 'opacity-50',
        className,
      )}
      style={{
        background: '#0070FC',
        boxShadow: '0 8px 24px rgba(0,112,252,.35), 0 0 0 1px rgba(255,255,255,.10) inset',
      }}
    >
      {loading ? <span className="spin" /> : Icon && <Icon size={18} />}
      <span>{children}</span>
    </button>
  )
}

export function GhostButton({ children, onClick, className, icon: Icon, full }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // h-11 === 44px === --m-touch-min. Do not shrink it.
        'h-11 px-4 rounded-xl m-headline text-white/90 press md-state inline-flex items-center justify-center gap-2',
        full && 'w-full',
        className
      )}
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
    >
      {Icon && <Icon size={18} />}
      <span>{children}</span>
    </button>
  )
}

/**
 * Circular icon button. Same split as Chip: 44×44 hit box, 40px painted circle.
 * `label` is required for a screen reader to name it — pass a t()'d string.
 */
export function IconBtn({ icon: Icon, onClick, className, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid place-items-center press shrink-0',
        'w-[var(--m-touch-min)] h-[var(--m-touch-min)]',
        className,
      )}
    >
      <span
        className="w-10 h-10 rounded-full grid place-items-center md-state"
        style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
      >
        <Icon size={18} className="text-white/85" aria-hidden="true" />
      </span>
    </button>
  )
}

export function Avatar({ initials, color = '#0070FC', size = 36 }) {
  return (
    <div
      className="on-dark rounded-full grid place-items-center font-semibold text-white"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${color} 0%, ${shade(color, -25)} 100%)`,
        fontSize: size * 0.4,
      }}
    >
      {initials}
    </div>
  )
}

function shade(hex, percent) {
  const c = hex.replace('#', '')
  const num = parseInt(c, 16)
  const r = Math.max(0, Math.min(255, (num >> 16) + percent))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + percent))
  const b = Math.max(0, Math.min(255, (num & 0xff) + percent))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function Stars({ value, size = 14 }) {
  const { t } = useTranslation()
  return (
    <span
      className="inline-flex items-center gap-[1px]"
      role="img"
      aria-label={t('common.starRating', { value, defaultValue: '{{value}} out of 5 stars' })}
    >
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} aria-hidden="true" fill={i <= value ? '#F59E0B' : 'transparent'} stroke={i <= value ? '#F59E0B' : 'var(--star-empty, #E5E7EB)'} size={size} strokeWidth={1.6} />
      ))}
    </span>
  )
}

export function IntentPill({ level }) {
  const { t } = useTranslation()
  const map = {
    high: { label: t('common.highIntent'), bg: 'rgba(220,38,38,.12)', border: 'rgba(220,38,38,.35)', dot: '#EF4444' },
    medium: { label: t('common.mediumIntent'), bg: 'rgba(202,138,4,.12)', border: 'rgba(202,138,4,.35)', dot: '#F59E0B' },
    low: { label: t('common.lowIntent'), bg: 'rgba(107,114,128,.12)', border: 'rgba(107,114,128,.30)', dot: '#9CA3AF' },
  }
  const s = map[level] || map.low
  return (
    <span
      data-level={level}
      className="intent-pill inline-flex items-center gap-1.5 px-2 h-6 rounded-full m-micro"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot, boxShadow: `0 0 6px ${s.dot}` }} />
      {s.label}
    </span>
  )
}

export function SourceChip({ src, sources }) {
  const meta = sources[src] || { label: src, dot: '#0070FC', text: '#9DC2FF' }
  return (
    <span
      className="source-chip inline-flex items-center gap-1.5 px-2 h-6 rounded-full m-micro"
      style={{ background: 'var(--bg-subtle)', '--src-text': meta.text, border: '1px solid var(--border-glass)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  )
}

import { Star } from 'lucide-react'

export function AIBadge({ children, className }) {
  const { t } = useTranslation()
  // Mirrors the old `children = 'AI'` default: only `undefined` falls back.
  const content = children === undefined ? t('common.ai') : children
  return (
    <span
      className={cn('on-dark inline-flex items-center gap-1 px-2 h-[22px] rounded-full m-micro', className)}
      style={{
        background: 'var(--si-ai-gradient)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,.20)',
      }}
    >
      <Sparkles size={10} />
      {content}
    </span>
  )
}

export function CLIPill({ score, size = 'md' }) {
  // Chance to buy: 0-100 score with color band + label
  const { t } = useTranslation()
  const band = score >= 75 ? 'hot' : score >= 55 ? 'warm' : score >= 35 ? 'cool' : 'cold'
  const label = band === 'hot' ? t('common.hot') : band === 'warm' ? t('common.warm') : band === 'cool' ? t('common.cool') : t('common.cold')
  const dimensions = size === 'sm'
    ? 'px-2 h-6 m-micro gap-1'
    : 'px-2.5 h-7 m-subhead gap-1.5'
  return (
    <span
      className={cn('cli-pill inline-flex items-center rounded-full', dimensions)}
      data-band={band}
      title={t('common.chanceToBuyTitle', { score })}
    >
      <span className="m-tabular">{score}</span>
      <span className="opacity-70">·</span>
      <span>{label}</span>
    </span>
  )
}

export function Skeleton({ className }) {
  return <div className={cn('shimmer rounded-xl', className)} />
}

export function AIShimmer({ className }) {
  return <div className={cn('ai-shimmer rounded-xl', className)} />
}

export function Lock({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * WHICH BRANCH THIS ROW CAME FROM.
 *
 * Rendered ONLY in the All-locations view. In a single-store session every row belongs
 * to the same store, so a badge on each one is pure noise — the screen header already
 * says where you are. Branch name only (see storeLabelOf in core): every store in a
 * dealer's list shares the brand, and repeating it would push the one distinguishing
 * word off the edge of a 375px card.
 */
/**
 * The heading over one branch's slice of a cumulative list.
 *
 * Replaces the per-row StoreBadge inside a group: once rows sit under a branch heading,
 * repeating the branch on every card is noise, and it was costing the row layout real
 * width on a 375pt screen.
 *
 * Sticky, so on a long list you can always see whose rows you are reading. It sits at
 * the top of the screen's own scroll container, which is why it carries the screen
 * background — without it the cards would scroll visibly underneath the text.
 */
export function StoreGroupHeader({ label, count }) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2 py-1.5 -mx-4 px-4"
      style={{ background: 'var(--bg-screen)' }}
    >
      <MapPin size={11} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
      <span className="m-subhead font-semibold text-white truncate">{label}</span>
      {/* The count is the group's size in THIS view — filtered, windowed, whatever the
          screen is currently showing — not the branch's lifetime total. */}
      <span className="m-caption m-tabular shrink-0" style={{ color: 'var(--text-tertiary)' }}>{count}</span>
    </div>
  )
}

export function StoreBadge({ storeId, className }) {
  const label = storeLabelOf(storeId)
  if (!label) return null
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-1.5 h-5 rounded-md m-caption font-medium shrink-0 max-w-[46%]', className)}
      style={{ background: 'var(--bg-subtle)', color: 'var(--text-tertiary)', border: '1px solid var(--border-glass)' }}
    >
      <MapPin size={9} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  )
}
