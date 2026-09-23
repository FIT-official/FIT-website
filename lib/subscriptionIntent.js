export function subscriptionPriceId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_]{1,220}$/.test(value) ? value : null
}

export function withSubscriptionIntent(path, value) {
    const priceId = subscriptionPriceId(value)
    return priceId ? `${path}?priceId=${encodeURIComponent(priceId)}` : path
}

export function subscriptionIntentTarget(value, fallback = '/dashboard/shop') {
    return subscriptionPriceId(value) ? withSubscriptionIntent('/account/subscription', value) : fallback
}
