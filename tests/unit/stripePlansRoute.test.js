import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }))
vi.mock('stripe', () => ({ default: class { constructor() { this.prices = { retrieve } } } }))
import { GET } from '@/app/api/stripe/plans/route'

const price = (amount, extra = {}) => ({ active: true, currency: 'sgd', unit_amount: amount,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, product: { active: true }, ...extra })
const validPrices = {
    p_standard: price(3900), p_pro: price(9900),
    p_standard_yearly: price(39000, { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } }),
    p_pro_yearly: price(99000, { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } }),
}
beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock')
    vi.stubEnv('STRIPE_STANDARD_MONTHLY_PRICE_ID', 'p_standard')
    vi.stubEnv('STRIPE_STANDARD_YEARLY_PRICE_ID', 'p_standard_yearly')
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'p_pro')
    vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'p_pro_yearly')
    retrieve.mockReset().mockImplementation(async id => ({ ...validPrices[id], id }))
})
afterEach(() => vi.unstubAllEnvs())

describe('Plan catalogue', () => {
    it('returns Free plus both paid tiers with monthly and annual billing', async () => {
        const { plans } = await (await GET()).json()
        expect(plans.map(p => [p.id, p.interval, p.amount, p.available])).toEqual([
            ['free', 'month', 0, true], ['standard', 'month', 39, true], ['standard', 'year', 390, true],
            ['pro', 'month', 99, true], ['pro', 'year', 990, true],
        ])
        expect(plans[2]).toMatchObject({ monthlyEquivalent: 32.5, annualSavings: 78, limits: { products: 25, monthlyPrintRequests: 100 } })
        expect(plans[4]).toMatchObject({ monthlyEquivalent: 82.5, annualSavings: 198, limits: { products: 100, monthlyPrintRequests: 500 } })
    })
    it.each([
        { currency: 'usd' }, { unit_amount: 300 }, { active: false }, { billing_scheme: 'tiered' },
        { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
        { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } },
        { recurring: { interval: 'month', interval_count: 3, usage_type: 'licensed' } },
    ])('will not sell a monthly price with invalid configuration %j', async extra => {
        retrieve.mockImplementation(async id => id === 'p_standard' ? price(3900, extra) : validPrices[id])
        const { plans } = await (await GET()).json()
        expect(plans[1]).toMatchObject({ available: false, priceId: null })
        expect(plans[0].available).toBe(true)
        expect(plans[2].available).toBe(true)
    })
    it.each([
        { unit_amount: 3900 }, { unit_amount: 46800 },
        { recurring: { interval: 'month', interval_count: 12, usage_type: 'licensed' } },
        { recurring: { interval: 'year', interval_count: 2, usage_type: 'licensed' } },
        { recurring: { interval: 'year', interval_count: 1, usage_type: 'metered' } },
    ])('will not sell an annual price with invalid configuration %j', async extra => {
        retrieve.mockImplementation(async id => id === 'p_standard_yearly' ? { ...validPrices[id], ...extra } : validPrices[id])
        const { plans } = await (await GET()).json()
        expect(plans[2]).toMatchObject({ available: false, priceId: null })
        expect(plans[1].available).toBe(true)
    })
    it('keeps monthly options available when annual IDs have not been configured', async () => {
        vi.stubEnv('STRIPE_STANDARD_YEARLY_PRICE_ID', '')
        vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', '')
        const { plans } = await (await GET()).json()
        expect(plans.map(p => p.available)).toEqual([true, true, false, true, false])
        expect(retrieve).toHaveBeenCalledTimes(2)
    })
    it('rejects a reused price ID across billing intervals without hiding unrelated tiers', async () => {
        vi.stubEnv('STRIPE_STANDARD_YEARLY_PRICE_ID', 'p_standard')
        const { plans } = await (await GET()).json()
        expect(plans.map(p => p.available)).toEqual([true, false, false, true, true])
    })
    it('only hides the affected billing option when its Stripe lookup fails', async () => {
        retrieve.mockImplementation(async id => {
            if (id === 'p_pro_yearly') throw new Error('Price unavailable')
            return validPrices[id]
        })
        const { plans } = await (await GET()).json()
        expect(plans.map(p => p.available)).toEqual([true, true, true, true, false])
    })
    it('keeps free registration independent of Stripe configuration and outages', async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', '')
        const { plans } = await (await GET()).json()
        expect(plans.map(p => p.available)).toEqual([true, false, false, false, false])
        expect(retrieve).not.toHaveBeenCalled()
    })
})
