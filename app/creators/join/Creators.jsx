'use client'
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { CREATOR_PLANS, getCreatorBillingPlan } from '@/lib/creatorPlans'
import { useUserSubscription } from '@/utils/UserSubscriptionContext'

export default function Creators() {
    const { isSignedIn } = useUser()
    const { subscription } = useUserSubscription() || {}
    const [catalogue, setCatalogue] = useState([])
    const [fabricationUploadsAvailable, setFabricationUploadsAvailable] = useState(false)
    const [interval, setInterval] = useState('month')
    useEffect(() => {
        let cancelled = false
        fetch('/api/stripe/plans').then(r => r.ok ? r.json() : Promise.reject())
            .then(d => {
                if (!cancelled) {
                    setCatalogue(d.plans || [])
                    setFabricationUploadsAvailable(d.capabilities?.fabricationUploadsAvailable === true)
                }
            })
            .catch(() => { if (!cancelled) setCatalogue([]) })
        return () => { cancelled = true }
    }, [])
    return <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-sm text-lightColor mb-3">Creator plans</p>
            <h1>Build your making business</h1>
            <p className="text-sm text-lightColor mt-4">Create your page, showcase your work and manage print requests from your own customers. Start free, then expand as your business grows.</p>
        </div>
        <fieldset className="mb-8 flex flex-wrap justify-center gap-3">
            <legend className="sr-only">Billing period</legend>
            {[['month', 'Pay monthly'], ['year', 'Pay yearly · 2 months free']].map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-5 py-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-textColor ${interval === value ? 'border-textColor bg-textColor text-white' : 'border-borderColor bg-white text-textColor'}`}>
                <input className="sr-only" type="radio" name="billing-period" value={value} checked={interval === value} onChange={() => setInterval(value)} />{label}
            </label>)}
        </fieldset>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CREATOR_PLANS.map(plan => {
                const free = plan.id === 'free'
                const billing = getCreatorBillingPlan(plan.id, free ? 'month' : interval)
                const configured = catalogue.find(p => p.id === plan.id && (p.interval || 'month') === billing.interval)
                const current = isSignedIn && subscription?.planId === plan.id && (subscription?.interval || 'month') === billing.interval
                const dark = plan.id === 'pro'
                return <section key={plan.id} className={`relative rounded-2xl border p-7 flex flex-col gap-5 ${dark ? 'bg-textColor text-white border-textColor' : plan.id === 'standard' ? 'bg-amber-300 border-amber-300' : 'bg-white border-borderColor'}`}>
                    <h2 className="text-xl font-semibold" style={{ color: 'inherit' }}>{plan.name}</h2>
                    <div><p><span className="text-4xl font-semibold">S${billing.amount}</span><span className="text-sm">{free ? ' · always free' : ` / ${billing.interval}`}</span></p>
                        {!free && interval === 'year' && <p className="mt-2 text-sm">S${billing.monthlyEquivalent.toFixed(2)}/month equivalent<br />Save S${billing.annualSavings} each year · billed yearly</p>}
                    </div>
                    <ul className="space-y-3 text-sm flex-1">
                        <li>One creator storefront</li>
                        <li>{plan.limits.products} product listings</li>
                        <li>{plan.limits.monthlyPrintRequests} {dark ? 'print and custom service' : 'print'} requests each month</li>
                        <li>Page editor and print-service settings</li>
                        <li>Quotes, job tracking and customer messages</li>
                        {dark && <><li>Unlimited custom service varieties</li><li>Your own materials, finishes and priced options</li><li>{fabricationUploadsAvailable ? 'Name and image personalisation with editable text areas' : 'Image personalisation (not available yet)'}</li><li>Area, volume, length, per-item or manual quotes</li></>}
                    </ul>
                    {free ? <Link className="formBlackButton justify-center" href={isSignedIn ? '/dashboard/shop' : '/sign-up'}>{isSignedIn ? 'Open your storefront' : 'Start free'}</Link>
                    : current ? <Link className="formBlackButton justify-center" href="/account/subscription">Manage plan</Link>
                    : configured?.available && configured.priceId ? <Link className={`formBlackButton justify-center ${dark ? '!bg-white !text-textColor' : ''}`} href={`${isSignedIn ? '/account/subscription' : '/sign-up'}?priceId=${encodeURIComponent(configured.priceId)}`}>Choose {plan.name}</Link>
                    : <p className="text-sm">Paid sign-up opens soon. You can start with Free.</p>}
                </section>
            })}
        </div>
        <div className="max-w-3xl mx-auto mt-10 space-y-4 text-sm text-lightColor">
            <p>Subscriptions cover the software. Printing, materials, delivery and payment processing charges are separate. For creator print jobs, agree the quote and arrange payment directly with your customer; FIT does not automatically pay out these jobs.</p>
            <p>Monthly request limits reset on the first day of each calendar month (UTC). Existing jobs remain available when you reach a limit. Cancel renewal from your account; your paid allowance continues until the billing period ends. A lower plan limits new work without deleting existing records.</p>
            <p>Prices are in Singapore dollars. Yearly plans charge the full amount upfront and renew each year until cancelled. The annual price equals 10 monthly payments, saving 16.7% compared with 12 monthly payments. Request allowances still reset monthly. One account operates each storefront. No equipment, repairs, customer acquisition or guaranteed earnings are included.</p>
            <p>Pro lets you build a catalogue around what your shop makes: laser cutting, engraving, name tags, dot peen marking, SLS, metal printing, CNC, sewing, casting and your own services. Add material variants, finishes, mounting choices and priced extras. There is no plan cap on service varieties; the 500-request allowance, file limits and upload safeguards still apply.</p>
            <p>Custom service estimates require provider confirmation. {fabricationUploadsAvailable ? 'Image text placement is an editable preview, and customers enter the real dimensions.' : 'Image uploads and visual text placement are not available yet. Describe customisation in your request notes.'} Existing service jobs remain available after a downgrade; accepting new custom service requests requires Pro.</p>
        </div>
    </main>
}
