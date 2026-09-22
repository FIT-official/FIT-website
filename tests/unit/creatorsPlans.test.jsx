import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Creators from '@/app/creators/join/Creators'
const state = vi.hoisted(() => ({ signedIn: false, subscription: null }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ isSignedIn: state.signedIn }) }))
vi.mock('@/utils/UserSubscriptionContext', () => ({ useUserSubscription: () => state }))
beforeEach(() => {
    state.signedIn = false; state.subscription = null
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ plans: [
        { id: 'standard', available: true, priceId: 'p_standard' },
        { id: 'pro', available: true, priceId: 'p_pro' },
    ] }) }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('Creator plans', () => {
    it('shows exactly Free, Standard and Pro with explicit SGD prices and real limits', async () => {
        render(<Creators />)
        expect(screen.getAllByRole('heading', { level: 2 }).map(n => n.textContent)).toEqual(['Free','Standard','Pro'])
        expect(screen.getByText('S$39')).toBeInTheDocument()
        expect(screen.getByText('S$99')).toBeInTheDocument()
        expect(screen.getByText('10 print requests each month')).toBeInTheDocument()
        expect(screen.getByText(/arrange payment directly/)).toBeInTheDocument()
        expect((await screen.findByRole('link', { name: 'Choose Standard' })).getAttribute('href')).toBe('/sign-up')
        expect(screen.queryByText('Current plan')).not.toBeInTheDocument()
    })
    it('links a signed-in creator only to a verified available price', async () => {
        state.signedIn = true
        render(<Creators />)
        expect((await screen.findByRole('link', { name:'Choose Pro' })).getAttribute('href')).toBe('/account/subscription?priceId=p_pro')
        expect(screen.getByRole('link', {name:'Open your storefront'})).toHaveAttribute('href','/dashboard/shop')
    })
    it('keeps free account creation available when billing fails', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('offline'))
        render(<Creators />)
        expect(screen.getByRole('link', {name:'Start free'})).toHaveAttribute('href','/sign-up')
        expect(screen.queryByRole('link', {name:'Choose Standard'})).not.toBeInTheDocument()
    })
})
