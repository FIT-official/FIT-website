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
    const { refresh } = useUserSubscription()
    const { showToast } = useToast()
    const [plans, setPlans] = useState([])
    const [priceId, setPriceId] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [agreed, setAgreed] = useState(false)
    useEffect(() => {
        let cancelled = false
        fetch('/api/stripe/plans').then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                if (cancelled) return
                const paid = (data.plans || []).filter(p => p.id !== 'free' && p.available && p.priceId)
                setPlans(paid)
                const incoming = params?.get('priceId')
                setPriceId(paid.some(p => p.priceId === incoming) ? incoming : '')
            }).catch(() => { if (!cancelled) setError('Plans could not be loaded. Please try again later.') })
        return () => { cancelled = true }
    }, [params])
    const selected = plans.find(p => p.priceId === priceId)
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
                const fresh = await refresh()
                if (fresh?.planId !== selected.id || !['active', 'trialing'].includes(fresh?.status)) {
                    throw new Error('Payment is still being confirmed. Refresh your account shortly; do not submit another payment.')
                }
            } else if (!res.ok || !data.success) {
                throw new Error(data.error || 'Payment is not complete. Your current plan remains available.')
            } else { await refresh() }
            await user.reload()
            showToast('Your subscription is active.', 'success')
            setAgreed(false)
        } catch (err) { setError(err.message || 'Unable to update subscription.') }
        finally { setBusy(false) }
    }
    return <form onSubmit={submit} className="flex flex-col gap-4 py-5">
        <h2 className="text-lg font-semibold">Choose your plan</h2>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {plans.map(plan => <label key={plan.id} className="border rounded-xl p-4 flex gap-3 items-start">
            <input type="radio" name="plan" checked={priceId === plan.priceId} onChange={() => { setPriceId(plan.priceId); setAgreed(false) }} />
            <span><strong>{plan.name}  /  S${plan.amount}/month</strong><br /><span className="text-sm">{plan.limits.products} listings  /  {plan.limits.monthlyPrintRequests} requests/month</span></span>
        </label>)}
        {!plans.length && <p className="text-sm">Paid plans are not available yet. Your Free storefront is ready to use.</p>}
        {selected && <>
            <p className="text-sm">Card details</p>
            <CardElement className="border rounded-lg p-4" options={{ hidePostalCode: true }} />
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />I agree to S${selected.amount} monthly recurring billing until I cancel. Changes to an existing plan may create a prorated charge. Printing and delivery are separate.</label>
            <button className="formBlackButton justify-center disabled:opacity-50" disabled={busy || !isLoaded || !stripe || !agreed} type="submit">{busy ? 'Confirming payment...' : 'Confirm subscription'}</button>
        </>}
    </form>
}
export default function SubscriptionDetails() {
    return <Suspense fallback={<p>Loading plans...</p>}><SubscriptionDetailsInner /></Suspense>
}
