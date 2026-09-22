import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }))
vi.mock('stripe', () => ({ default: class { constructor() { this.prices = { retrieve } } } }))
vi.mock('@/lib/stripeConfig', () => ({ getStripePriceIds: async () => ({ standard:'p_standard', pro:'p_pro' }) }))
import { GET } from '@/app/api/stripe/plans/route'
beforeEach(() => { vi.stubEnv('STRIPE_SECRET_KEY','sk_test_mock'); vi.stubEnv('STRIPE_STANDARD_MONTHLY_PRICE_ID','p_standard'); vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID','p_pro'); retrieve.mockReset() })
afterEach(() => vi.unstubAllEnvs())
const price = (amount, extra={}) => ({ active:true, currency:'sgd', unit_amount:amount, recurring:{interval:'month',interval_count:1}, product:{active:true}, ...extra })
describe('Plan catalogue', () => {
    it('always returns three canonical plans and no legacy marketing placeholders', async () => {
        retrieve.mockResolvedValueOnce(price(3900)).mockResolvedValueOnce(price(9900))
        const { plans } = await (await GET()).json()
        expect(plans.map(p=>[p.id,p.amount,p.available])).toEqual([['free',0,true],['standard',39,true],['pro',99,true]])
    })
    it.each([
        { currency:'usd' }, { unit_amount:300 }, { active:false }, { billing_scheme:'tiered' }, { recurring:{interval:'month',interval_count:1,usage_type:'metered'} },
        { recurring:{interval:'year',interval_count:1} }, { recurring:{interval:'month',interval_count:3} },
    ])('will not sell a price with invalid configuration %j', async (extra) => {
        retrieve.mockResolvedValue(price(3900,extra))
        const { plans } = await (await GET()).json()
        expect(plans[1]).toMatchObject({available:false,priceId:null})
        expect(plans[0].available).toBe(true)
    })
    it('keeps free registration independent of Stripe configuration and outages', async () => {
        vi.stubEnv('STRIPE_SECRET_KEY','')
        const { plans } = await (await GET()).json()
        expect(plans.map(p=>p.available)).toEqual([true,false,false])
        expect(retrieve).not.toHaveBeenCalled()
    })
})
