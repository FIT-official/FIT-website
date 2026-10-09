import { supportedCountries } from './supportedCountries'

export const CURRENCY_CACHE_KEY = 'fit-display-currency'
export const CURRENCY_CACHE_TTL = 24 * 60 * 60 * 1000
const supported = value => supportedCountries.some(country => country.currency === value)

// Cache failures too: an unavailable location service should not be retried on
// every page. This preference never changes checkout prices.
export async function detectDisplayCurrency({ storage, fetcher = fetch, now = Date.now() }) {
    try {
        const cached = JSON.parse(storage?.getItem(CURRENCY_CACHE_KEY) || 'null')
        if (supported(cached?.currency) && Number.isFinite(cached?.checkedAt)
            && now >= cached.checkedAt && now - cached.checkedAt < CURRENCY_CACHE_TTL) return cached.currency
    } catch { /* Blocked storage or an old cache is a cache miss. */ }

    let currency = 'SGD'
    try {
        const response = await fetcher('/api/display-currency')
        if (response.ok) {
            const data = await response.json()
            if (supported(data.currency)) currency = data.currency
        }
    } catch { /* Location is optional; use the store currency. */ }
    try { storage?.setItem(CURRENCY_CACHE_KEY, JSON.stringify({ currency, checkedAt: now })) }
    catch { /* Browsers can disable storage. */ }
    return currency
}
