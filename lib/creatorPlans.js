// Public plan contract. Stripe identifiers and payment credentials stay server-side.
export const CREATOR_PLANS = Object.freeze([
    Object.freeze({
        id: 'free', name: 'Free', amount: 0, annualAmount: 0, currency: 'SGD', interval: 'month',
        limits: Object.freeze({ products: 3, monthlyPrintRequests: 10 }),
        features: Object.freeze(['Your own storefront', '3 product listings', '10 customer print requests per month', 'Quotes and customer orders']),
    }),
    Object.freeze({
        id: 'standard', name: 'Standard', amount: 39, annualAmount: 390, currency: 'SGD', interval: 'month',
        limits: Object.freeze({ products: 25, monthlyPrintRequests: 100 }),
        features: Object.freeze(['Your own storefront', '25 product listings', '100 customer print requests per month', 'Quotes and customer orders']),
    }),
    Object.freeze({
        id: 'pro', name: 'Pro', amount: 99, annualAmount: 990, currency: 'SGD', interval: 'month',
        limits: Object.freeze({ products: 100, monthlyPrintRequests: 500 }),
        features: Object.freeze(['Your own storefront', '100 product listings', '500 print and custom service requests per month', 'Quotes and customer orders', 'Unlimited custom service varieties', 'Your own materials, finishes and priced options', 'Image personalisation with editable text areas', 'Area, volume, length, per-item or manual quotes']),
    }),
]);

export function getCreatorPlan(planId) {
    return CREATOR_PLANS.find(plan => plan.id === planId) || CREATOR_PLANS[0];
}

export function getCreatorBillingPlan(planId, interval = 'month') {
    const plan = CREATOR_PLANS.find(entry => entry.id === planId);
    if (!plan || !['month', 'year'].includes(interval) || (plan.id === 'free' && interval === 'year')) return null;
    return interval === 'month' ? plan : Object.freeze({
        ...plan, amount: plan.annualAmount, interval: 'year',
        monthlyEquivalent: plan.annualAmount / 12,
        annualSavings: plan.amount * 12 - plan.annualAmount,
    });
}

export const CREATOR_BILLING_PLANS = Object.freeze(CREATOR_PLANS.flatMap(plan =>
    plan.id === 'free' ? [plan] : [plan, getCreatorBillingPlan(plan.id, 'year')]
));
