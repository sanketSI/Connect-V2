import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import { cn } from '../lib/utils'

export function TopBar({ title, onBack, right, subtitle, transparent }) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'h-12 px-2 flex items-center justify-between sticky top-0 z-30',
        !transparent && 'glass-tabbar'
      )}
      style={{ borderBottom: transparent ? 'none' : '1px solid rgba(255,255,255,.04)' }}
    >
      {/* 44px reserved either side so the centred title stays centred whether or not
          there is a back button / trailing control. */}
      <div className="min-w-[var(--m-touch-min)] shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            // Full 44px hit box, 36px painted circle — see UI.jsx Chip/IconBtn.
            className="w-[var(--m-touch-min)] h-[var(--m-touch-min)] grid place-items-center press"
            aria-label={t('common.back')}
          >
            <span
              className="w-9 h-9 rounded-full grid place-items-center md-state"
              style={{ background: 'var(--bg-iconbtn)', border: '1px solid var(--border-glass)' }}
            >
              <ChevronLeft size={20} className="text-white" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0 text-center px-1">
        <div className="m-headline text-white truncate" role="heading" aria-level={1}>{title}</div>
        {subtitle && <div className="m-caption text-white/55 -mt-0.5 truncate">{subtitle}</div>}
      </div>
      <div className="min-w-[var(--m-touch-min)] shrink-0 flex justify-end">{right}</div>
    </div>
  )
}

export function LargeTitle({ title, sub, right }) {
  return (
    <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="m-title1 text-white" role="heading" aria-level={1}>{title}</div>
        {/* m-callout, not m-body: a page subtitle is a secondary label, not paragraph
            copy. On Paragraph metrics (16/24) it wrapped to two lines on every screen
            and pushed the content down for a caption nobody reads twice. */}
        {sub && <div className="m-callout text-white/55 mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  )
}
