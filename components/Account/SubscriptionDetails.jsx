'use client'
import { useUser } from '@clerk/nextjs'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { useUserSubscription } from '@/utils/UserSubscriptionContext'
import { useToast } from '../General/ToastProvider'

function SubscriptionDetailsInner() {
    const stripe = useStripe()
    const elements = useElements()
    const { user, isLoaded } = useUser()
    const params = useSearchParams()
    const { refresh, subscription } = useUserSubscription()
    const { showToast } = useToast()
    const [plans, setPlans] = useState([])
    const [priceId, setPriceId] = useState('')
    const defaultInterval = subscription?.interval === 'year' ? 'year' : 'month'
    const [interval, setInterval] = useState(defaultInterval)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [agreed, setAgreed] = useState(false)
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        fetch('/api/stripe/plans').then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                if (cancelled) return
                const paid = (data.plans || []).filter(p => p.id !== 'free' && p.available && p.priceId)
                setPlans(paid)
                const incoming = params?.get('priceId')
                const chosen = paid.find(p => p.priceId === incoming)
                setPriceId(chosen?.priceId || '')
                setInterval(current => chosen?.interval || current)
            }).catch(() => { if (!cancelled) setError('Plans could not be loaded. Please try again later.') })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [params])
    const selected = plans.find(p => p.priceId === priceId)
    const visiblePlans = plans.filter(plan => (plan.interval || 'month') === interval)
    function changeInterval(value) {
        setInterval(value)
        setPriceId(plans.find(plan => plan.id === selected?.id && (plan.interval || 'month') === value)?.priceId || '')
        setAgreed(false)
    }
    async function submit(e) {
        e.preventDefault()
        if (!isLoaded || !user || !stripe || !elements || !selected || !agreed || busy) return
        setBusy(true)
        setError('')
        try {
            const card = elements.getElement(CardElement)
            if (!card) throw new Error('Please enter your card details.')
            const token = await stripe.createToken(card)
            if (token.error || !token.token?.id) throw new Error(token.error?.message || 'Card details could not be verified.')
            const res = await fetch('/api/user/subscription/edit', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId, cardToken: token.token.id }),
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
        } catch (err) { setError(err.message || 'Unable to update subscription.') }
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
        {selected && <>
            <p className="text-sm">Card details</p>
            <CardElement className="border rounded-lg p-4" options={{ hidePostalCode: true }} />
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />I agree to S${selected.amount} {selected.interval === 'year' ? 'upfront for one year, renewing yearly' : 'monthly recurring billing'} until I cancel renewal. Changing an existing billing period applies credit for unused time, starts a new billing period and may charge immediately. Other plan changes may also create a prorated charge. Printing and delivery are separate.</label>
            <button className="formBlackButton justify-center disabled:opacity-50" disabled={busy || !isLoaded || !stripe || !agreed} type="submit">{busy ? 'Confirming payment...' : 'Confirm subscription'}</button>
        </>}
        </fieldset>
    </form>
}
export default function SubscriptionDetails() {
    return <Suspense fallback={<p>Loading plans...</p>}><SubscriptionDetailsInner /></Suspense>
}
