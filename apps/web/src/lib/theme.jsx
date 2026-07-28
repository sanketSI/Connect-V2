import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeCtx = createContext({ theme: 'light', setTheme: () => {} })
export const useTheme = () => useContext(ThemeCtx)

const STORAGE_KEY = 'si-theme'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'light' || saved === 'dark') return saved
    } catch {}
    return 'light' // NOVA default — light lavender product
  })

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, theme) } catch {}
  }, [theme])

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeCtx.Provider>
  )
}
