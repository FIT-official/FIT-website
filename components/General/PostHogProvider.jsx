'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import posthog from 'posthog-js'
import { useAnalyticsConsent } from './AnalyticsConsentProvider'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

// Pageview capture and user identification, gated on cookie consent. No-op entirely without a key.
export default function PostHogProvider({ children }) {
    const pathname = usePathname()
    const { user, isLoaded } = useUser()
    const { consent } = useAnalyticsConsent()
    const [ready, setReady] = useState(false)
    const prevUserIdRef = useRef(null)

    useEffect(() => {
        if (!KEY || consent !== 'accepted' || ready) return
        posthog.init(KEY, {
            api_host: '/ingest',
            ui_host: 'https://us.posthog.com',
            defaults: '2026-01-30',
            capture_exceptions: true,
            capture_pageview: false, // captured manually on route change below
            persistence: 'localStorage+cookie',
            debug: process.env.NODE_ENV === 'development',
        })
        setReady(true)
    }, [consent, ready])

    useEffect(() => {
        if (!ready) return
        if (consent === 'accepted') posthog.opt_in_capturing()
        else posthog.opt_out_capturing()
    }, [consent, ready])

    useEffect(() => {
        if (ready && consent === 'accepted' && pathname) posthog.capture('$pageview')
    }, [ready, pathname, consent])

    // Identify user when PostHog is ready and Clerk session is loaded
    useEffect(() => {
        if (!ready || !isLoaded || consent !== 'accepted') return
        if (user?.id) {
            if (prevUserIdRef.current !== user.id) {
                posthog.identify(user.id, {
                    role: user.publicMetadata?.role,
                })
                prevUserIdRef.current = user.id
            }
        } else if (prevUserIdRef.current) {
            posthog.reset()
            prevUserIdRef.current = null
        }
    }, [ready, isLoaded, consent, user?.id, user?.publicMetadata?.role])

    return children
}
