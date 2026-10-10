/** Local render harness only. Production and unconfigured runtimes fail closed. */
export function shippingFixturesEnabled(env = process.env) {
    return env.NODE_ENV === 'development' && env.SHIPPING_FIXTURES === '1';
}
