import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation, Trans } from 'react-i18next'
import {
  Building2, ChevronRight, TrendingUp, TrendingDown, Sparkles, Star, Trophy,
  Filter, PhoneMissed, PhoneIncoming, PhoneOutgoing, MapPin, Users, BarChart3,
  Layers, ArrowLeft, ArrowRight, ChevronDown
} from 'lucide-react'
import { LargeTitle, TopBar } from '../components/TopBar.jsx'
import ProfileButton from '../components/ProfileButton.jsx'
import { Card, AICard, AIBadge, Chip, Avatar, AIShimmer, PrimaryButton } from '../components/UI.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import { cityRollup, clusterRollup, regionalRollup, ROLES, askAI } from '@connect/core'
// Derived from the SAME call and review records the Calls and Reviews screens render —
// see the note on the roll-ups in packages/core/data/network.js. Read at module scope as
// before; the underlying records are resolved once at load.
const CITY_STORES = cityRollup()
const CLUSTER_STORES = clusterRollup()
const REGIONAL_CITIES = regionalRollup()

// `units` is NOT user-visible — it is interpolated into the askAI prompt only,
// which stays English (AI output is localized centrally in src/data/ai.js).
const ROLE_TITLES = {
  cluster: { titleKey: 'hierarchy.roleTitleCluster', subKey: 'hierarchy.roleSubCluster', units: 'stores' },
  city: { titleKey: 'hierarchy.roleTitleCity', subKey: 'hierarchy.roleSubCity', units: 'stores' },
  regional: { titleKey: 'hierarchy.roleTitleRegional', subKey: 'hierarchy.roleSubRegional', units: 'cities' },
  state: { titleKey: 'hierarchy.roleTitleState', subKey: 'hierarchy.roleSubState', units: 'cities' },
  head: { titleKey: 'hierarchy.roleTitleHead', subKey: 'hierarchy.roleSubHead', units: 'states' },
}

export default function Hierarchy({ role, onDrillDown, onOpenAssistant, onOpenProfile }) {
  const { t } = useTranslation()
  const meta = ROLE_TITLES[role] || ROLE_TITLES.city
  const [tab, setTab] = useState('calls')
  const [insight, setInsight] = useState(null)
  const [insightLoading, setInsightLoading] = useState(true)
  const [storeDetail, setStoreDetail] = useState(null)

  const { rows, totals } = useMemo(() => {
    if (role === 'cluster') {
      const rows = CLUSTER_STORES.map(s => ({
        ...s, total: s.missed + s.answered, label: s.branch, sub: s.city,
      }))
      const totals = sumRows(rows)
      return { rows, totals }
    }
    if (role === 'city') {
      const rows = CITY_STORES.map(s => ({ ...s, label: s.name, sub: s.manager }))
      return { rows, totals: sumRows(rows) }
    }
    // regional / state / head — show cities
    const rows = REGIONAL_CITIES.map(c => ({
      ...c, total: c.missed + c.answered, label: c.name, sub: t('hierarchy.citySub', { count: c.stores, head: c.head }),
    }))
    return { rows, totals: sumRows(rows) }
  }, [role, t])

  useEffect(() => {
    let cancelled = false
    async function gen() {
      setInsightLoading(true)
      const worst = [...rows].sort((a, b) => a.recovery - b.recovery)[0]
      const best = [...rows].sort((a, b) => b.recovery - a.recovery)[0]
      const out = await askAI(
        `You are an AI exec analyst for a multi-location electronics retailer. Generate a SHORT executive narrative (max 60 words, 2 short sentences) summarizing this week's call-recovery performance across the ${meta.units} below. Flag the underperformer with a specific number, and praise the bright spot. Tone: sharp, confident, second-person.

Best: ${best.label} — ${best.recovery}% recovery
Worst: ${worst.label} — ${worst.recovery}% recovery (${worst.missed} missed, ${worst.recovered} called back)
Average across ${rows.length} ${meta.units}: ${avg(rows.map(r => r.recovery))}%

Return only the narrative.`,
        {
          temperature: 0.8,
          fallback: t('hierarchy.execInsightFallback', {
            count: worst.missed - worst.recovered,
            worstLabel: worst.label,
            worstRecovery: worst.recovery,
            bestLabel: best.label,
            bestRecovery: best.recovery,
          }),
        },
      )
      if (!cancelled) {
        setInsight(out)
        setInsightLoading(false)
      }
    }
    gen()
    return () => { cancelled = true }
  }, [role])

  return (
    <div className="absolute top-[44px] left-0 right-0 bottom-0 pb-[88px] overflow-y-auto no-scrollbar">
      <LargeTitle
        title={t(meta.titleKey)}
        sub={t(meta.subKey)}
        right={<ProfileButton onClick={onOpenProfile} />}
      />

      <div className="px-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-3">
          <Chip active={tab === 'calls'} onClick={() => setTab('calls')} icon={BarChart3}>{t('vmn.title')}</Chip>
          <Chip active={tab === 'reviews'} onClick={() => setTab('reviews')} icon={Star}>{t('reviews.title')}</Chip>
        </div>

        {tab === 'calls' && (
          <>
            {/* KPI hero */}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <KPI label={t('hierarchy.kpiTotalCalls')} value={totals.total} icon={PhoneIncoming} accent="#7BB0FF" />
              <KPI label={t('hierarchy.kpiMissed')} value={totals.missed} icon={PhoneMissed} accent="#FF6B7E" />
              <KPI label={t('hierarchy.kpiCalledBack')} value={totals.recovered} icon={PhoneOutgoing} accent="#22D38B" />
              <KPI label={t('hierarchy.kpiRecoveryPct')} value={totals.recovery} suffix="%" icon={TrendingUp} accent="#0070FC" />
            </div>

            {/* AI exec insight */}
            <AICard className="mb-3 !p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="on-dark w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--si-ai-gradient-warm)' }}>
                  <Sparkles size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="m-headline text-white">{t('hierarchy.aiInsightTitle')}</span>
                    <AIBadge>Gemini</AIBadge>
                  </div>
                  <div className="mt-1.5 min-h-[44px]">
                    {insightLoading ? (
                      <div className="space-y-2">
                        <AIShimmer className="h-3 w-[95%]" />
                        <AIShimmer className="h-3 w-[80%]" />
                      </div>
                    ) : (
                      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="m-body text-white/85">{insight}</motion.p>
                    )}
                  </div>
                  <button onClick={onOpenAssistant} className="mt-2 ai-text m-callout font-semibold inline-flex items-center gap-1 press">
                    {t('hierarchy.askFollowUp')} <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </AICard>

            {/* Sort/filter chips */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
              <Chip active>{t('hierarchy.sortByRecovery')}</Chip>
              <Chip>{t('hierarchy.sortByMissed')}</Chip>
              <Chip>{t('hierarchy.sortByTotalCalls')}</Chip>
              <Chip icon={Filter}>{t('vmn.more')}</Chip>
            </div>

            {/* Rows */}
            <div className="space-y-2.5">
              {[...rows].sort((a, b) => b.recovery - a.recovery).map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <HierarchyRow row={r} rank={i + 1} onOpen={() => {
                    if (role === 'cluster' || role === 'city') setStoreDetail(r)
                    else onDrillDown?.(r)
                  }} />
                </motion.div>
              ))}
              <div className="h-4" />
            </div>
          </>
        )}

        {tab === 'reviews' && <ReviewsView rows={rows} role={role} />}
      </div>

      <BottomSheet open={!!storeDetail} onClose={() => setStoreDetail(null)} fullHeight label={storeDetail?.name}>
        {storeDetail && <StoreDetail row={storeDetail} />}
      </BottomSheet>
    </div>
  )
}

function sumRows(rows) {
  const total = rows.reduce((s, r) => s + (r.total || (r.missed + r.answered)), 0)
  const missed = rows.reduce((s, r) => s + r.missed, 0)
  const answered = rows.reduce((s, r) => s + r.answered, 0)
  const recovered = rows.reduce((s, r) => s + r.recovered, 0)
  const recovery = missed ? Math.round((recovered / missed) * 100) : 0
  return { total, missed, answered, recovered, recovery }
}

function avg(arr) { return Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) }

function KPI({ label, value, icon: Icon, accent, suffix }) {
  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between">
        <span className="m-caption text-white/55">{label}</span>
        <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
          <Icon size={13} style={{ color: accent }} />
        </span>
      </div>
      <div className="mt-2 m-title1 text-white m-tabular">
        {value}{suffix}
      </div>
    </Card>
  )
}

function HierarchyRow({ row, rank, onOpen }) {
  const { t } = useTranslation()
  const tone =
    row.recovery >= 65 ? { color: '#22D38B', label: t('hierarchy.toneStrong'), bg: 'rgba(34,211,139,.10)' }
    : row.recovery >= 50 ? { color: '#FFC061', label: t('hierarchy.toneWatch'), bg: 'rgba(255,193,97,.10)' }
    : { color: '#FF6B7E', label: t('hierarchy.toneAtRisk'), bg: 'rgba(255,107,126,.10)' }
  const answered = row.answered || (row.total - row.missed)

  return (
    <Card onClick={onOpen} label={row?.label || row?.name} className="!p-3.5">
      <div className="flex items-start gap-3">
        <div className="text-center">
          <div className="m-caption text-white/45">#</div>
          <div className="m-title3 text-white m-tabular">{rank}</div>
        </div>
        <div
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.25)' }}
        >
          <Building2 size={16} className="text-[#7BB0FF]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="m-headline text-white truncate">{row.label}</div>
            <span className="m-caption font-semibold px-2 h-5 rounded-full inline-flex items-center" style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.color}40` }}>
              {tone.label}
            </span>
          </div>
          <div className="m-caption text-white/55 mb-2">{row.sub}</div>

          {/* Recovery bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.05)' }}>
              <div className="h-1.5 rounded-full" style={{ width: `${row.recovery}%`, background: tone.color, boxShadow: `0 0 8px ${tone.color}50` }} />
            </div>
            <span className="m-callout text-white font-semibold m-tabular w-10 text-right">{row.recovery}%</span>
          </div>

          <div className="mt-2 flex items-center gap-3 m-caption text-white/65">
            <span>
              <Trans
                i18nKey="hierarchy.rowMissed"
                count={row.missed}
                values={{ count: row.missed }}
                components={{ 1: <span className="m-tabular text-white/85" /> }}
              />
            </span>
            <span className="opacity-40">·</span>
            <span>
              <Trans
                i18nKey="hierarchy.rowAnswered"
                count={answered}
                values={{ count: answered }}
                components={{ 1: <span className="m-tabular text-white/85" /> }}
              />
            </span>
            <span className="opacity-40">·</span>
            <span>
              <Trans
                i18nKey="hierarchy.rowBack"
                count={row.recovered}
                values={{ count: row.recovered }}
                components={{ 1: <span className="m-tabular text-[#7BE3B2]" /> }}
              />
            </span>
          </div>
        </div>
        <ChevronRight size={16} className="text-white/45 self-center" />
      </div>
    </Card>
  )
}

function StoreDetail({ row }) {
  const { t } = useTranslation()
  return (
    <div className="px-4 pb-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.25)' }}>
          <Building2 size={20} className="text-[#7BB0FF]" />
        </div>
        <div>
          <div className="m-title3 text-white">Lakshmi Electronics — {row.label}</div>
          <div className="m-caption text-white/55">{row.manager || row.sub}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <KPI label={t('hierarchy.kpiTotalCalls')} value={row.total || (row.missed + row.answered)} icon={PhoneIncoming} accent="#7BB0FF" />
        <KPI label={t('hierarchy.kpiMissed')} value={row.missed} icon={PhoneMissed} accent="#FF6B7E" />
        <KPI label={t('hierarchy.kpiCalledBack')} value={row.recovered} icon={PhoneOutgoing} accent="#22D38B" />
        <KPI label={t('hierarchy.kpiRecoveryPct')} value={row.recovery} suffix="%" icon={TrendingUp} accent="#0070FC" />
      </div>

      <AICard className="mt-3 !p-3.5">
        <div className="flex items-start gap-2">
          <Sparkles size={12} className="ai-text mt-0.5" />
          <p className="m-callout text-white/85">
            {row.recovery >= 65
              ? t('hierarchy.storeAiStrong', { label: row.label })
              : row.recovery >= 50
              ? t('hierarchy.storeAiAverage', { label: row.label, count: row.missed - row.recovered })
              : t('hierarchy.storeAiRisk', { label: row.label, count: row.missed - row.recovered })}
          </p>
        </div>
      </AICard>

      <div className="mt-3 m-subhead text-white/60">{t('hierarchy.drillTitle')}</div>
      <Card className="mt-2 !p-0 overflow-hidden">
        <DrillRow label={t('hierarchy.drillMissedQueue')} badge={`${row.missed}`} />
        <Divider />
        <DrillRow label={t('hierarchy.drillConnectedCalls')} badge={`${row.answered || (row.total - row.missed)}`} />
        <Divider />
        <DrillRow label={t('hierarchy.drillReviewsNps')} badge={`${row.nps || 60}`} />
      </Card>
    </div>
  )
}

function DrillRow({ label, badge }) {
  return (
    <button className="w-full px-3.5 py-3 flex items-center gap-3 press">
      <div className="flex-1 text-left m-headline text-white">{label}</div>
      <span className="px-2 h-6 rounded-full m-caption font-semibold" style={{ background: 'rgba(0,112,252,.12)', color: 'var(--si-primary-text)', border: '1px solid rgba(0,112,252,.25)' }}>
        {badge}
      </span>
      <ChevronRight size={16} className="text-white/45" />
    </button>
  )
}

function Divider() {
  return <div className="h-px bg-white/5 mx-3.5" />
}

function ReviewsView({ rows, role }) {
  const { t } = useTranslation()
  const sorted = [...rows].sort((a, b) => (b.nps || 50) - (a.nps || 50))
  return (
    <>
      <Card className="!p-3.5 mb-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="m-caption text-white/55">{t('hierarchy.totalReviews')}</div>
            <div className="m-title2 text-white m-tabular">{sum(rows, r => r.reviews || 25)}</div>
          </div>
          <div>
            <div className="m-caption text-white/55">{t('hierarchy.avgNps')}</div>
            <div className="m-title2 text-white m-tabular">{avg(rows.map(r => r.nps || 55))}</div>
          </div>
          <div>
            <div className="m-caption text-white/55">{t('reviews.replied')}</div>
            <div className="m-title2 text-white m-tabular">82%</div>
          </div>
        </div>
      </Card>

      <AICard className="mb-3 !p-3.5">
        <div className="flex items-start gap-2">
          <Sparkles size={12} className="ai-text mt-0.5" />
          <p className="m-callout text-white/85">
            {t('hierarchy.reviewsAiInsight')}
          </p>
        </div>
      </AICard>

      <div className="m-subhead text-white/55 mb-2">{t('hierarchy.leaderboardByNps')}</div>
      <div className="space-y-2">
        {sorted.map((r, i) => (
          <Card key={r.id} className="!p-3.5">
            <div className="flex items-center gap-3">
              <div className="w-7 text-center">
                <div className="m-title3 text-white m-tabular">#{i + 1}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="m-headline text-white truncate">{r.label}</div>
                <div className="m-caption text-white/55">{t('home.reviewsCount', { count: r.reviews || 25 })} · {r.sub}</div>
              </div>
              <div className="text-right">
                <div className="m-title3 text-white m-tabular">{r.nps || 55}</div>
                <div className="m-caption text-white/55">{t('hierarchy.nps')}</div>
              </div>
              {i === 0 && <Trophy size={16} className="text-[#FFC061]" />}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

function sum(arr, sel) {
  return arr.reduce((s, x) => s + sel(x), 0)
}
