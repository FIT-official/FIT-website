'use client'
import Link from 'next/link'
import { DashProvider, DashCard } from '@/components/dashboard-ui'
import { useUserSubscription } from '@/utils/UserSubscriptionContext'
export default function SubscriptionChangeSuccess() {
    const { subscription, loading, error, refresh } = useUserSubscription()
    const active = !loading && !error && ['active', 'trialing'].includes(subscription?.status) && !subscription?.pending_update && ['standard', 'pro'].includes(subscription?.planId)
    return <DashProvider><div className="min-h-[70vh] flex items-center justify-center p-8"><DashCard className="max-w-lg">
        <h1 className="dash-title">{loading ? 'Checking your subscription' : active ? 'Your plan is active' : 'Payment confirmation needed'}</h1>
        <p className="my-4">{active ? 'Your current subscription has been verified. You can continue setting up your storefront.' : 'A paid plan has not been confirmed. Your Free storefront remains available. Check your billing status before submitting another payment.'}</p>
        <div className="flex gap-4"><Link href="/account/subscription">Manage subscription</Link><Link href="/dashboard/shop">Open storefront</Link></div>
        {!active && !loading && <button type="button" onClick={refresh} className="mt-4 underline">Check status again</button>}
    </DashCard></div></DashProvider>
}
