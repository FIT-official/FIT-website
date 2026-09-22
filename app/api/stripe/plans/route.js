import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { getStripePriceIds } from '@/lib/stripeConfig'
import { CREATOR_PLANS } from '@/lib/creatorPlans'
import { isPriceValidForPlan, getPlanForPriceId } from '@/lib/creatorEntitlements'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
    const ids = await getStripePriceIds()
    const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
    const plans = await Promise.all(CREATOR_PLANS.map(async (plan) => {
        if (plan.id === 'free') return { ...plan, available: true, priceId: null }
        const priceId = ids[plan.id]
        if (!stripe || !priceId) return { ...plan, available: false, priceId: null }
        try {
            const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
            const available = getPlanForPriceId(priceId)?.id === plan.id && isPriceValidForPlan(price, plan)
            return { ...plan, available: Boolean(available), priceId: available ? priceId : null }
        } catch { return { ...plan, available: false, priceId: null } }
    }))
    return NextResponse.json({ plans })
}
