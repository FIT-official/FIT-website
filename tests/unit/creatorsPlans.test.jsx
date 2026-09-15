// /creators/join pricing page: plans come from Stripe via /api/stripe/plans
// and fill the tier cards; the free card and current-plan state are always
// there. (/creators itself is now the public creator directory.)
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Creators from '@/app/creators/join/Creators'

const subState = { subscription: null }
vi.mock('@/utils/UserSubscriptionContext', () => ({
    useUserSubscription: () => subState,
}))

const PLANS = [
    {
        tier: 'tier1', priceId: 'price_basic', name: 'Maker', description: 'Solo sellers',
        amount: 12, currency: 'SGD', interval: 'month', popular: false,
        features: ['Sell up to 20 products'],
    },
    {
        tier: 'tier2', priceId: 'price_pro', name: 'Studio', description: 'Growing shops',
        amount: 29, currency: 'SGD', interval: 'month', popular: true,
        features: [],
    },
]

beforeEach(() => {
    subState.subscription = null
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ plans: PLANS }) }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Creators pricing page', () => {
    it('renders a card per Stripe plan with name, price and interval', async () => {
        render(<Creators />)
        expect(await screen.findByText('Maker')).toBeInTheDocument()
        expect(screen.getByText('Studio')).toBeInTheDocument()
        expect(screen.getByText('$12')).toBeInTheDocument()
        expect(screen.getByText('$29')).toBeInTheDocument()
        expect(screen.getAllByText('/month')).toHaveLength(2)
    })

    it('always shows the free Shopper card and marks it current with no subscription', async () => {
        render(<Creators />)
        await screen.findByText('Maker')
        expect(screen.getByText('Shopper')).toBeInTheDocument()
        expect(screen.getByText('Current plan')).toBeInTheDocument()
    })

    it('links each paid plan into the subscription flow with its priceId', async () => {
        render(<Creators />)
        await screen.findByText('Maker')
        const links = screen.getAllByRole('link', { name: 'Choose plan' })
        const hrefs = links.map((l) => l.getAttribute('href'))
        expect(hrefs).toContain('/account/subscription?priceId=price_basic')
        expect(hrefs).toContain('/account/subscription?priceId=price_pro')
    })

    it('marks the subscribed plan current and honours the popular flag', async () => {
        subState.subscription = { priceId: 'price_pro' }
        render(<Creators />)
        await screen.findByText('Studio')
        expect(screen.getByText('Current plan')).toBeInTheDocument()
        expect(screen.getByText('Most popular')).toBeInTheDocument()
    })

    it('uses Stripe features when present and honest entitlement fallbacks when not', async () => {
        render(<Creators />)
        await screen.findByText('Maker')
        expect(screen.getByText('Sell up to 20 products')).toBeInTheDocument()
        // Studio has no marketing features -> entitlement-derived fallback.
        expect(screen.getByText('Creator dashboard with sales and orders')).toBeInTheDocument()
    })

    it('shows an unavailable note when the plans API fails', async () => {
        global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
        render(<Creators />)
        expect(await screen.findByText(/Creator plans are unavailable/)).toBeInTheDocument()
    })
})

describe('Creators pricing salience', () => {
    it('paints the priciest plan ink and the runner-up sun', async () => {
        render(<Creators />)
        await screen.findByText('Maker')
        // Studio ($29) is the priciest -> flat black card; Maker ($12) -> yellow.
        const studioCard = screen.getByText('Studio').closest('div.relative')
        const makerCard = screen.getByText('Maker').closest('div.relative')
        expect(studioCard.className).toContain('bg-textColor')
        expect(makerCard.className).toContain('bg-amber-300')
    })
})
