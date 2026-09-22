#!/usr/bin/env node
// Preview by default. --apply creates/reuses catalogue records; never changes subscribers.
import 'dotenv/config'
import Stripe from 'stripe'
import { CREATOR_PLANS } from '../lib/creatorPlans.js'
const apply = process.argv.includes('--apply')
const live = process.argv.includes('--live')
const paid = CREATOR_PLANS.filter(p => p.id !== 'free')
if (!apply) {
    console.log(JSON.stringify({mode:'preview', currency:'SGD', interval:'month', plans:paid.map(p=>({name:p.name,amount:p.amount,limits:p.limits})), note:'No Stripe changes. Set STRIPE_SECRET_KEY and use --apply; live keys additionally require --live.'},null,2))
    process.exit(0)
}
const key = process.env.STRIPE_SECRET_KEY
if (!key) throw new Error('STRIPE_SECRET_KEY is required.')
if ((key.startsWith('sk_live_') || key.startsWith('rk_live_')) && !live) throw new Error('Live catalogue creation requires --live.')
const stripe = new Stripe(key)
const mapping = {}
for (const plan of paid) {
    const lookup = `fit_creator_${plan.id}_sgd_monthly_v1`
    const result = await stripe.prices.list({lookup_keys:[lookup],limit:10,expand:['data.product']})
    let price = result.data[0]
    if (!price) {
        const product = await stripe.products.create({
            name:`FIT ${plan.name}`,
            description:`One creator storefront, ${plan.limits.products} listings and ${plan.limits.monthlyPrintRequests} monthly print requests. Printing and delivery are separate.`,
            metadata:{fit_plan:plan.id,fit_catalogue:'creator_v1'},
        },{idempotencyKey:`fit-product:${lookup}`})
        price = await stripe.prices.create({
            product:product.id,currency:'sgd',unit_amount:plan.amount*100,
            recurring:{interval:'month'},lookup_key:lookup,
            tax_behavior:'inclusive',
            metadata:{fit_plan:plan.id},
        },{idempotencyKey:`fit-price:${lookup}`})
    }
    if (!price.active || price.unit_amount !== plan.amount*100 || price.currency !== 'sgd' || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 || price.product?.active === false) {
        throw new Error(`Existing ${lookup} does not match the plan. No existing price or subscription was modified.`)
    }
    mapping[`STRIPE_${plan.id.toUpperCase()}_MONTHLY_PRICE_ID`] = price.id
}
console.log(JSON.stringify({mode:'applied',priceIds:mapping,existingSubscriptionsChanged:false},null,2))
