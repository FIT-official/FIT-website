'use client'
import { useUser } from '@clerk/nextjs'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useUserSubscription } from '@/utils/UserSubscriptionContext'
import { useToast } from '../General/ToastProvider'

function SubscriptionDetailsInner({ initialPlanId }) {
    const stripe = useStripe()
    const elements = useElements()
    const { user, isLoaded } = useUser()
    const params = useSearchParams()
    const { refresh, subscription } = useUserSubscription()
    const subscriptionRef = useRef(subscription)
    subscriptionRef.current = subscription
    const { showToast } = useToast()
    const [plans, setPlans] = useState([])
    const [priceId, setPriceId] = useState('')
    const defaultInterval = subscription?.interval === 'year' ? 'year' : 'month'
    const [interval, setInterval] = useState(defaultInterval)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [agreed, setAgreed] = useState(false)
    const [preview, setPreview] = useState(null)
    const [previewError, setPreviewError] = useState('')
    const [previewNonce, setPreviewNonce] = useState(0)
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        fetch('/api/stripe/plans').then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                if (cancelled) return
                const paid = (data.plans || []).filter(p => p.id !== 'free' && p.available && p.priceId)
                setPlans(paid)
                const incoming = params?.get('priceId')
                const chosen = paid.find(p => p.priceId === incoming) || paid.find(p => initialPlanId && p.id === initialPlanId && p.interval === (subscriptionRef.current?.interval || 'month'))
                setPriceId(chosen?.priceId || '')
                setInterval(current => chosen?.interval || current)
            }).catch(() => { if (!cancelled) setError('Plans could not be loaded. Please try again later.') })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [params, initialPlanId])
    const selected = plans.find(p => p.priceId === priceId)
    const changingPaidPlan = Boolean(subscription?.subscriptionId && selected && subscription.priceId !== selected.priceId && ['active', 'trialing'].includes(subscription.status))
    const currentPreview = preview?.priceId === priceId ? preview : null
    useEffect(() => {
        if (!changingPaidPlan) { setPreview(null); setPreviewError(''); return }
        let cancelled = false
        setPreview(null)
        setPreviewError('')
        fetch(`/api/user/subscription/preview?priceId=${encodeURIComponent(priceId)}`, { cache: 'no-store' })
            .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to show the upgrade amount.'); return data })
            .then(data => { if (!cancelled) setPreview(data) })
            .catch(error => { if (!cancelled) setPreviewError(error.message) })
        return () => { cancelled = true }
    }, [changingPaidPlan, priceId, previewNonce])
    const visiblePlans = plans.filter(plan => (plan.interval || 'month') === interval)
    function changeInterval(value) {
        setInterval(value)
        setPriceId(plans.find(plan => plan.id === selected?.id && (plan.interval || 'month') === value)?.priceId || '')
        setAgreed(false)
    }
    async function submit(e) {
        e.preventDefault()
        if (!isLoaded || !user || !stripe || !elements || !selected || !agreed || busy || (changingPaidPlan && !currentPreview)) return
        setBusy(true)
        setError('')
        try {
            const card = elements.getElement(CardElement)
            if (!card) throw new Error('Please enter your card details.')
            const token = await stripe.createToken(card)
            if (token.error || !token.token?.id) throw new Error(token.error?.message || 'Card details could not be verified.')
            const res = await fetch('/api/user/subscription/edit', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId, cardToken: token.token.id, ...(changingPaidPlan ? { prorationDate: currentPreview.prorationDate } : {}) }),
            })
            const data = await res.json()
            if (data.requires_action && data.clientSecret) {
                const result = await stripe.confirmCardPayment(data.clientSecret)
                if (result.error) throw new Error(result.error.message)
            } else if (!res.ok || !data.success) {
                throw new Error(data.error || 'Payment is not complete. Your current plan remains available.')
            }
            const fresh = await refresh()
            if (fresh?.planId !== selected.id || fresh?.priceId !== selected.priceId || fresh?.interval !== (selected.interval || 'month') || fresh?.pending_update || !['active', 'trialing'].includes(fresh?.status)) {
                throw new Error('Payment is still being confirmed. Refresh your account shortly; do not submit another payment.')
            }
            await user.reload()
            showToast('Your subscription is active.', 'success')
            setAgreed(false)
        } catch (err) { setError(err.message || 'Unable to update subscription.'); if (changingPaidPlan) setPreviewNonce(value => value + 1) }
        finally { setBusy(false) }
    }
    return <form onSubmit={submit} className="flex flex-col gap-4 py-5">
        <h2 className="text-lg font-semibold">Choose your plan</h2>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {loading && <p className="text-sm">Loading plans…</p>}
        <fieldset disabled={busy || loading} className="flex min-w-0 flex-col gap-4 disabled:opacity-60">
        <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">Billing period</legend>
            {[['month', 'Pay monthly'], ['year', 'Pay yearly · 2 months free']].map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-4 py-2 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-textColor ${interval === value ? 'border-textColor bg-textColor text-white' : 'border-borderColor'}`}><input className="sr-only" type="radio" name="billing-period" checked={interval === value} onChange={() => changeInterval(value)} />{label}</label>)}
        </fieldset>
        {visiblePlans.map(plan => <label key={plan.priceId} className="border rounded-xl p-4 flex gap-3 items-start">
            <input type="radio" name="plan" checked={priceId === plan.priceId} onChange={() => { setPriceId(plan.priceId); setAgreed(false) }} />
            <span><strong>{plan.name} / S${plan.amount}/{plan.interval || 'month'}</strong><br />{plan.interval === 'year' && <span className="text-sm">S${plan.monthlyEquivalent.toFixed(2)}/month equivalent · Save S${plan.annualSavings}/year<br /></span>}<span className="text-sm">{plan.limits.products} listings / {plan.limits.monthlyPrintRequests} requests/month</span></span>
        </label>)}
        {!loading && !visiblePlans.length && <p className="text-sm">{interval === 'year' ? 'Yearly billing is not available yet. Check the monthly options or continue with Free.' : 'Monthly paid plans are not available yet. Your Free storefront is ready to use.'}</p>}
        <p className="text-sm text-lightColor">Yearly billing charges the full year upfront and renews yearly. Request allowances still reset each month.</p>
        {changingPaidPlan && <div className="rounded-xl border p-4 text-sm" aria-live="polite">
            {currentPreview ? <><strong>Estimated amount due today: {currentPreview.currency} {(currentPreview.amountDue / 100).toFixed(2)}</strong><p className="mt-1">Stripe includes credit for unused time on your current plan. Your final payment may change if the preview expires or billing details change.</p><button type="button" onClick={() => setPreviewNonce(value => value + 1)} className="mt-2 underline underline-offset-2">Refresh amount</button></> : previewError ? <><p role="alert">{previewError}</p><button type="button" onClick={() => setPreviewNonce(value => value + 1)} className="mt-2 underline underline-offset-2">Retry preview</button></> : <p>Calculating your prorated amount…</p>}
        </div>}
        {selected && <>
            <p className="text-sm">Card details</p>
            <CardElement className="border rounded-lg p-4" options={{ hidePostalCode: true }} />
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />I agree to S${selected.amount} {selected.interval === 'year' ? 'upfront for one year, renewing yearly' : 'monthly recurring billing'} until I cancel renewal. Changing an existing billing period applies credit for unused time, starts a new billing period and may charge immediately. Other plan changes may also create a prorated charge. Printing and delivery are separate.</label>
            <button className="formBlackButton justify-center disabled:opacity-50" disabled={busy || !isLoaded || !stripe || !agreed || (changingPaidPlan && !currentPreview)} type="submit">{busy ? 'Confirming payment...' : changingPaidPlan ? 'Confirm plan change' : 'Confirm subscription'}</button>
        </>}
        </fieldset>
    </form>
}
export default function SubscriptionDetails({ initialPlanId }) {
    return <Suspense fallback={<p>Loading plans...</p>}><SubscriptionDetailsInner initialPlanId={initialPlanId} /></Suspense>
}
