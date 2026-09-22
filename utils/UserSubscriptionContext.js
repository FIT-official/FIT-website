"use client"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
const UserSubscriptionContext = createContext(null)
export function UserSubscriptionProvider({ children }) {
    const { isLoaded, isSignedIn, user } = useUser()
    const [subscription, setSubscription] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const generation = useRef(0)
    const refresh = useCallback(async () => {
        const run = ++generation.current
        if (!isLoaded) return null
        if (!isSignedIn || !user?.id) { setSubscription(null); setLoading(false); setError(null); return null }
        setLoading(true)
        try {
            const res = await fetch('/api/user/subscription', { cache: 'no-store' })
            if (!res.ok && res.status !== 404) throw new Error('Failed to fetch subscription')
            const data = res.ok ? await res.json() : null
            if (run === generation.current) { setSubscription(data); setError(null) }
            return data
        } catch (err) {
            if (run === generation.current) setError(err)
            return null
        } finally { if (run === generation.current) setLoading(false) }
    }, [isLoaded, isSignedIn, user?.id])
    useEffect(() => {
        refresh()
        const guard = generation
        return () => { guard.current++ }
    }, [refresh])
    return <UserSubscriptionContext.Provider value={{ subscription, loading, error, refresh }}>{children}</UserSubscriptionContext.Provider>
}
export function useUserSubscription() { return useContext(UserSubscriptionContext) }
