#!/usr/bin/env node
// Preview by default. --apply creates/reuses catalogue records; never changes subscribers.
import 'dotenv/config'
import Stripe from 'stripe'
import { CREATOR_BILLING_PLANS } from '../lib/creatorPlans.js'
const apply = process.argv.includes('--apply')
const live = process.argv.includes('--live')
const paid = CREATOR_BILLING_PLANS.filter(p => p.amount > 0)
const frequency = plan => plan.interval === 'year' ? 'yearly' : 'monthly'
const lookupKey = plan => `fit_creator_${plan.id}_sgd_${frequency(plan)}_v1`
const environmentKey = plan => `STRIPE_${plan.id.toUpperCase()}_${frequency(plan).toUpperCase()}_PRICE_ID`
if (!apply) {
    console.log(JSON.stringify({mode:'preview', currency:'SGD', plans:paid.map(p=>({name:p.name,amount:p.amount,interval:p.interval,limits:p.limits,lookupKey:lookupKey(p),environmentKey:environmentKey(p)})), note:'No Stripe changes. Set STRIPE_SECRET_KEY and use --apply; live keys additionally require --live. Usage limits remain monthly.'},null,2))
    process.exit(0)
}
const key = process.env.STRIPE_SECRET_KEY
if (!key) throw new Error('STRIPE_SECRET_KEY is required.')
if ((key.startsWith('sk_live_') || key.startsWith('rk_live_')) && !live) throw new Error('Live catalogue creation requires --live.')
const stripe = new Stripe(key)
const mapping = {}
const products = new Map()
for (const plan of paid) {
    const lookup = lookupKey(plan)
    const result = await stripe.prices.list({lookup_keys:[lookup],limit:10,expand:['data.product']})
    if (result.has_more || result.data.length > 1) throw new Error(`Multiple prices match ${lookup}. Review the catalogue before continuing.`)
    let price = result.data[0]
    if (!price) {
        let productId = products.get(plan.id)
        if (!productId) {
            const product = await stripe.products.create({
            name:`FIT ${plan.name}`,
            description:`One creator storefront, ${plan.limits.products} listings and ${plan.limits.monthlyPrintRequests} monthly ${plan.id === 'pro' ? 'print and custom service' : 'print'} requests. Printing and delivery are separate.`,
            metadata:{fit_plan:plan.id,fit_catalogue:'creator_v1'},
            },{idempotencyKey:`fit-product:${lookup}`})
            productId = product.id
        }
        price = await stripe.prices.create({
            product:productId,currency:'sgd',unit_amount:plan.amount*100,
            recurring:{interval:plan.interval,interval_count:1,usage_type:'licensed'},lookup_key:lookup,
            tax_behavior:'inclusive',
            metadata:{fit_plan:plan.id},
        },{idempotencyKey:`fit-price:${lookup}`})
    }
    if (!price.active || price.unit_amount !== plan.amount*100 || price.currency !== 'sgd' ||
        price.recurring?.interval !== plan.interval || price.recurring?.interval_count !== 1 ||
        price.recurring?.usage_type !== 'licensed' || price.transform_quantity ||
        price.billing_scheme !== 'per_unit' || price.product?.active === false || price.product?.deleted) {
        throw new Error(`Existing ${lookup} does not match the plan. No existing price or subscription was modified.`)
    }
    products.set(plan.id, typeof price.product === 'string' ? price.product : price.product.id)
    mapping[environmentKey(plan)] = price.id
}
console.log(JSON.stringify({mode:'applied',priceIds:mapping,existingSubscriptionsChanged:false},null,2))
