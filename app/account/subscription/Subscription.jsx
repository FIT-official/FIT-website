'use client'
// Subscription management on the "Sunlit Paper" language: plan facts as
// dotted-leader rows, cancel behind a ConfirmDialog (window.confirm/alert are
// banned), the edit flow unchanged (Stripe Elements + SubscriptionDetails).
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import dayjs from 'dayjs'
import SubscriptionDetails from '@/components/Account/SubscriptionDetails'
import AccountShell from '@/components/Account/AccountShell'
import { money } from '@/components/Account/accountUi'
import { useToast } from '@/components/General/ToastProvider'
import { ConfirmDialog, DashCard, DottedRow, StatusPill, SkeletonTile } from '@/components/dashboard-ui'

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null

import { useUserSubscription } from '@/utils/UserSubscriptionContext'

const statusText = (key) =>
    key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ') : 'Unknown'

function Subscription() {
    const params = useSearchParams()
    const requestedPriceId = params?.get('priceId')
    const [updating, setUpdating] = useState(() => Boolean(requestedPriceId))
    useEffect(() => { if (requestedPriceId) setUpdating(true) }, [requestedPriceId])
    const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
    const [cancelBusy, setCancelBusy] = useState(false)
    const { subscription, loading: subLoading, error: subError, refresh } = useUserSubscription()
    const { showToast } = useToast()

    const updateSubButton = () => setUpdating((prev) => !prev)

    const cancelSubButton = async () => {
        setCancelBusy(true)
        try {
        const res = await fetch('/api/user/subscription/cancel', { method: 'POST' })
        if (res.ok) {
            showToast('Renewal cancelled. Your plan continues until the end of the billing period.', 'success')
            await refresh()
        } else {
            showToast('Failed to cancel subscription', 'error')
        }
        } catch { showToast('Unable to cancel renewal. Please try again.', 'error') }
        finally {
        setCancelBusy(false)
        setConfirmCancelOpen(false)
        }
    }

    const header = (
        <div>
            <p className="dash-label">Your plan</p>
            <h1 className="dash-title mt-1">Subscription</h1>
            <p className="dash-data dash-soft mt-1">View, change or cancel your plan at any time.</p>
        </div>
    )

    if (subLoading && !subscription) {
        return (
            <AccountShell active="subscription" header={header}>
                <SkeletonTile className="max-w-xl" />
            </AccountShell>
        )
    }

    const hasSubscription = !!subscription?.priceId

    return (
        <AccountShell active="subscription" header={header}>
            {updating ? (
                <DashCard className="max-w-xl">
                    <button
                        type="button"
                        onClick={updateSubButton}
                        className="text-[12px] font-medium dash-soft hover:text-[var(--dash-ink)] cursor-pointer"
                    >
                        Back to plan
                    </button>
                    {stripePromise ? <Elements stripe={stripePromise}>
                        <SubscriptionDetails />
                    </Elements> : <p>Paid plans are not available yet. Your Free storefront is ready to use.</p>}
                </DashCard>
            ) : hasSubscription ? (
                <DashCard title="Your plan" className="max-w-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <StatusPill tone={subscription.status === 'active' ? 'ok' : 'hatch'}>
                                {statusText(subscription.status)}
                            </StatusPill>
                            <div className="mt-3">
                                {Number.isFinite(subscription.price) && (
                                    <DottedRow label="Price">S${money(subscription.price / 100)} per {subscription.interval === 'year' ? 'year' : subscription.interval === 'month' ? 'month' : 'cycle'}</DottedRow>
                                )}
                                {subscription.current_period_end && (
                                    <DottedRow label={subscription.cancel_at_period_end ? 'Ends' : 'Renews'}>
                                        {dayjs(subscription.current_period_end * 1000).format('D MMM YYYY')}
                                    </DottedRow>
                                )}
                                {subscription.created && (
                                    <DottedRow label="Member since">
                                        {dayjs(subscription.created * 1000).format('D MMM YYYY')}
                                    </DottedRow>
                                )}
                            </div>
                        </div>
                        <p className="text-[13px] dash-soft">
                            You are currently subscribed. You can edit or cancel your subscription at any time.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={updateSubButton}
                                className="dash-hoverable inline-flex items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-4 py-2 text-[13px] font-medium cursor-pointer active:scale-[0.97]"
                            >
                                Edit subscription
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmCancelOpen(true)}
                                className="dash-hoverable inline-flex items-center rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-4 py-2 text-[13px] font-medium text-[var(--dash-bad)] cursor-pointer hover:bg-[var(--dash-bad-bg)]"
                            >
                                Cancel subscription
                            </button>
                        </div>
                    </div>
                </DashCard>
            ) : (
                <DashCard title="Free" className="max-w-xl">
                    <p className="text-[13px] dash-soft">
                        Your storefront includes 3 product listings and 10 print requests each month. Upgrade when you need more capacity.
                    </p>
                    <button
                        type="button"
                        onClick={updateSubButton}
                        className="dash-hoverable mt-4 inline-flex items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] px-4 py-2 text-[13px] font-medium cursor-pointer active:scale-[0.97]"
                    >
                        Sign up for subscription
                    </button>
                </DashCard>
            )}

            <ConfirmDialog
                open={confirmCancelOpen}
                onClose={() => setConfirmCancelOpen(false)}
                onConfirm={cancelSubButton}
                title="Cancel your subscription?"
                body="You will lose access to premium features at the end of the current billing period."
                confirmLabel="Cancel subscription"
                cancelLabel="Keep plan"
                tone="bad"
                busy={cancelBusy}
            />
        </AccountShell>
    )
}

export default Subscription
