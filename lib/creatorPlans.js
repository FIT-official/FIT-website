// Public plan contract. Stripe identifiers and payment credentials stay server-side.
export const CREATOR_PLANS = Object.freeze([
    Object.freeze({
        id: 'free', name: 'Free', amount: 0, currency: 'SGD', interval: 'month',
        limits: Object.freeze({ products: 3, monthlyPrintRequests: 10 }),
        features: Object.freeze(['Your own storefront', '3 product listings', '10 customer print requests per month', 'Quotes and customer orders']),
    }),
    Object.freeze({
        id: 'standard', name: 'Standard', amount: 39, currency: 'SGD', interval: 'month',
        limits: Object.freeze({ products: 25, monthlyPrintRequests: 100 }),
        features: Object.freeze(['Your own storefront', '25 product listings', '100 customer print requests per month', 'Quotes and customer orders']),
    }),
    Object.freeze({
        id: 'pro', name: 'Pro', amount: 99, currency: 'SGD', interval: 'month',
        limits: Object.freeze({ products: 100, monthlyPrintRequests: 500 }),
        features: Object.freeze(['Your own storefront', '100 product listings', '500 customer print requests per month', 'Quotes and customer orders']),
    }),
]);

export function getCreatorPlan(planId) {
    return CREATOR_PLANS.find(plan => plan.id === planId) || CREATOR_PLANS[0];
}
