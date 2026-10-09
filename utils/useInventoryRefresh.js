'use client'
import { useEffect, useRef } from 'react'

// Visible pages refresh every minute and on return. Coalesce focus + visibility
// events; never poll a hidden tab or create a second in-flight refresh.
export function useInventoryRefresh(refresh, enabled = true) {
  const callback = useRef(refresh)
  useEffect(() => { callback.current = refresh }, [refresh])
  useEffect(() => {
    if (!enabled) return
    let last = -Infinity, busy = false
    const update = async () => {
      if (document.visibilityState === 'hidden' || busy || Date.now() - last < 5000) return
      last = Date.now(); busy = true
      try { await callback.current() } finally { busy = false }
    }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    const timer = setInterval(update, 60000)
    return () => { clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [enabled])
}
