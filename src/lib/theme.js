import { useEffect, useState } from 'react'

const KEY = 'j2:theme'

export function resolveTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

// Apply once, before React renders, so the page never flashes white
applyTheme(resolveTheme())

export function useTheme() {
  const [theme, setTheme] = useState(resolveTheme)
  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = () => {
      try { if (localStorage.getItem(KEY)) return } catch { /* ignore */ }
      setTheme(mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}
