'use client'
import { useEffect, useRef } from 'react'
export function useClassPolling(refresh, key) {
    const current = useRef(refresh); current.current = refresh
    useEffect(() => { let stopped = false, timer, failures = 0, running = false
        async function tick() { if (stopped || running) return; running = true
            try { if (navigator.onLine !== false && !document.hidden) { const ok = await current.current(); failures = ok === false ? Math.min(failures + 1, 3) : 0 } }
            catch { failures = Math.min(failures + 1, 3) }
            finally { running = false; if (!stopped) timer = setTimeout(tick, Math.min(60000, (document.hidden || navigator.onLine === false ? 30000 : 8000 * 2 ** failures) * (0.85 + Math.random() * 0.3))) }
        }
        const wake = () => { clearTimeout(timer); if (!running) tick() }
        tick(); window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake)
        return () => { stopped = true; clearTimeout(timer); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake) }
    }, [key])
}
