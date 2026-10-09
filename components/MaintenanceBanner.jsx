'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'fit-maintenance-banner-dismissed'

export default function MaintenanceBanner() {
    const [banner, setBanner] = useState(null)
    const [dismissed, setDismissed] = useState(false)
    useEffect(() => {
        let mounted = true
        let controller
        async function refresh() {
            controller?.abort()
            controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 5_000)
            try {
                const response = await fetch('/api/maintenance/status', { signal: controller.signal })
                const data = response.ok ? await response.json() : null
                if (mounted) setBanner(data?.banner?.active === true ? data.banner : null)
            } catch { if (mounted) setBanner(null) } finally { clearTimeout(timer) }
        }
        try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1') } catch { /* Storage may be disabled. */ }
        refresh()
        const interval = setInterval(refresh, 30_000)
        return () => { mounted = false; controller?.abort(); clearInterval(interval) }
    }, [])

    if (!banner || dismissed) return null
    function dismiss() {
        setDismissed(true)
        try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* Dismiss for this mount if storage is unavailable. */ }
    }
    // A fixed notice below the 56px navigation bar keeps the header usable and
    // prevents an asynchronous flag read from moving the page, including mobile.
    return <aside role="status" aria-live="polite" className="fixed left-1/2 top-14 z-40 w-screen max-w-[1350px] -translate-x-1/2 border-b border-amber-200 bg-amber-50 text-amber-950 shadow-sm md:w-[90vw] lg:w-[85vw]">
        <div className="flex max-h-[30dvh] items-start gap-3 overflow-y-auto px-5 py-3 text-sm">
            <div className="min-w-0 flex-1 break-words">
                <p>{banner.message || 'Scheduled maintenance'}</p>
                {banner.window && <p className="mt-1 text-xs">{banner.window}</p>}
            </div>
            <button type="button" onClick={dismiss} aria-label="Dismiss maintenance notice" className="shrink-0 rounded-full px-3 py-2 font-medium hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2">Dismiss</button>
        </div>
    </aside>
}
