const PROD_PRICE_IDS = {
    tier1: 'price_1RoLEqL8rcZaPQbIbEJFpb8w',
    tier2: 'price_1RoLFaL8rcZaPQbIkidotx2y',
    tier3: 'price_1RoLGsL8rcZaPQbIMgKmvF5q',
    tier4: 'price_1RoLJEL8rcZaPQbIhoVl8diR',
};


const DEV_PRICE_IDS = {
    tier1: 'price_1RYmL7Q8qkF9EYSx0qQSc8zE',
    tier2: 'price_1RYmMAQ8qkF9EYSxkjocLoII',
    tier3: 'price_1RYmMwQ8qkF9EYSxJskJvmYC',
    tier4: 'price_1RYmNXQ8qkF9EYSxFGHrQ4ZB',
};


const isProduction = () => {
    return process.env.NODE_ENV === 'production';
};

export const getStripePriceIds = () => {
    return isProduction() ? PROD_PRICE_IDS : DEV_PRICE_IDS;
};

export const STRIPE_PRICE_TIER_1 = () => getStripePriceIds().tier1;
export const STRIPE_PRICE_TIER_2 = () => getStripePriceIds().tier2;
export const STRIPE_PRICE_TIER_3 = () => getStripePriceIds().tier3;
export const STRIPE_PRICE_TIER_4 = () => getStripePriceIds().tier4;

export const getAllPriceIds = () => {
    const priceIds = getStripePriceIds();
    return [priceIds.tier1, priceIds.tier2, priceIds.tier3, priceIds.tier4];
};


export const debugStripeConfig = () => {
    if (process.env.NODE_ENV === 'development') {
        console.log('Stripe Configuration Debug:');
        console.log('Environment:', process.env.NODE_ENV);
        console.log('Price IDs:', getStripePriceIds());
    }
};
