export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function vibrate(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern) } catch {}
  }
}

export function timeAgo(min) {
  if (min < 1) return 'now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function uid() {
  return Math.random().toString(36).slice(2, 10)
}
