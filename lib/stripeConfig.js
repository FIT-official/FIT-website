const PROD_PRICE_IDS = {
    tier1: 'price_1RoLEqL8rcZaPQbIbEJFpb8w',
    tier2: 'price_1RoLFaL8rcZaPQbIkidotx2y',
    tier3: 'price_1RoLGsL8rcZaPQbIMgKmvF5q',
    tier4: 'price_1RoLJEL8rcZaPQbIhoVl8diR',
};



import AppSettings from '../models/AppSettings.js';
import { connectToDatabase } from './db.js';

let cachedDevPriceIds = null;
async function fetchDevPriceIds() {
    if (cachedDevPriceIds) return cachedDevPriceIds;
    await connectToDatabase();
    let settings;
    try {
        const appSettingsId = process.env.NODE_ENV === 'development' ? 'app-settings-dev' : 'app-settings';
        settings = await AppSettings.findOne({ _id: appSettingsId }).lean();
    } catch (err) {
        console.error('[stripeConfig] Error fetching AppSettings from MongoDB:', err);
        throw new Error('Error fetching AppSettings from MongoDB: ' + err.message);
    }
    if (!settings) {
        console.error('[stripeConfig] AppSettings document not found in MongoDB');
        throw new Error('AppSettings document not found in MongoDB');
    }
    if (!settings.stripePriceTiers) {
        console.error('[stripeConfig] stripePriceTiers not found in AppSettings document');
        throw new Error('stripePriceTiers not found in AppSettings document');
    }
    cachedDevPriceIds = settings.stripePriceTiers;
    return cachedDevPriceIds;
}



const isProduction = () => {
    return process.env.NODE_ENV === 'production';
};


export const getStripePriceIds = async () => {
    try {
        if (isProduction()) return PROD_PRICE_IDS;
        return await fetchDevPriceIds();
    } catch (err) {
        console.error('[stripeConfig] getStripePriceIds error:', err);
        throw err;
    }
};


// Deprecated: Do not use these in client components. Use the API route instead.
export const STRIPE_PRICE_TIER_1 = async () => (await getStripePriceIds()).tier1;
export const STRIPE_PRICE_TIER_2 = async () => (await getStripePriceIds()).tier2;
export const STRIPE_PRICE_TIER_3 = async () => (await getStripePriceIds()).tier3;
export const STRIPE_PRICE_TIER_4 = async () => (await getStripePriceIds()).tier4;


export const getAllPriceIds = async () => {
    const priceIds = await getStripePriceIds();
    return [priceIds.tier1, priceIds.tier2, priceIds.tier3, priceIds.tier4];
};