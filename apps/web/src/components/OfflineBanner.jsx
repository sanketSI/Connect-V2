import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// ============================================================
// Offline banner — a non-blocking strip that slides in below the status bar when the
// device loses connectivity, and slides away when it returns. It is HONEST: Connect has
// no offline write queue yet, so it says "you're offline / live updates are paused" and
// promises nothing it cannot keep (no "will sync later").
//
// role="status" + aria-live="polite" so a screen reader announces the state change
// without stealing focus. Sits at z-[46]: above app content and the sheet-portal host
// (z-45), below the status-bar glyphs (z-50).
// ============================================================
export default function OfflineBanner() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  )

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // Re-sync in case connectivity flipped between first render and effect attach.
    setOffline(navigator.onLine === false)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -44, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -44, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          className="absolute top-[44px] left-0 right-0 z-[46] flex items-center justify-center gap-2 px-3 py-1.5 m-caption font-medium"
          /* #8A5A00, not the brand amber #CA8A04: white text on #CA8A04 measures 3.09 —
             under the 4.5 floor for this 13px line. The darker step of the same hue
             carries white at 5.97 and reads identically as "warning amber". */
          style={{ background: '#8A5A00', color: '#fff' }}
        >
          <WifiOff size={13} aria-hidden="true" />
          {t('common.offline', { defaultValue: 'You’re offline — live updates are paused' })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
