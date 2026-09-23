import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Creators from '@/app/creators/join/Creators'
const state = vi.hoisted(() => ({ signedIn: false, subscription: null }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ isSignedIn: state.signedIn }) }))
vi.mock('@/utils/UserSubscriptionContext', () => ({ useUserSubscription: () => state }))
beforeEach(() => {
    state.signedIn = false; state.subscription = null
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ plans: [
        { id: 'standard', available: true, priceId: 'p_standard' },
        { id: 'pro', available: true, priceId: 'p_pro' },
        { id: 'standard', interval: 'year', available: true, priceId: 'p_standard_year' },
        { id: 'pro', interval: 'year', available: true, priceId: 'p_pro_year' },
    ] }) }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('Creator plans', () => {
    it('shows Free, Student, Standard and Pro with clear eligibility and limits', async () => {
        render(<Creators />)
        expect(screen.getAllByRole('heading', { level: 2 }).map(n => n.textContent)).toEqual(['Free','Student','Standard','Pro'])
        expect(screen.getByText('S$39')).toBeInTheDocument()
        expect(screen.getByText('S$99')).toBeInTheDocument()
        expect(screen.getByText('10 print requests each month')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Ask about student access' })).toHaveAttribute('href', 'mailto:fixittoday.contact@gmail.com?subject=Student%20creator%20access')
        expect(screen.getByText(/arrange payment directly/)).toBeInTheDocument()
        expect((await screen.findByRole('link', { name: 'Choose Standard' })).getAttribute('href')).toBe('/sign-up?priceId=p_standard')
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
        expect(await screen.findAllByText('Unable to check paid plans. Please refresh this page.')).toHaveLength(2)
    })
    it('does not claim paid sign-up is closed while checking prices', () => {
        global.fetch = vi.fn(() => new Promise(() => {}))
        render(<Creators />)
        expect(screen.getAllByText('Checking paid plan availability…')).toHaveLength(2)
        expect(screen.queryByText('Paid sign-up opens soon. You can start with Free.')).not.toBeInTheDocument()
    })
    it('shows the full annual charge, savings and unchanged monthly allowance', async () => {
        render(<Creators />)
        fireEvent.click(screen.getByRole('radio', { name: 'Pay yearly · 2 months free' }))
        expect(screen.getByText('S$390')).toBeInTheDocument()
        expect(screen.getByText('S$990')).toBeInTheDocument()
        expect(screen.getByText(/Save S\$78 each year/)).toBeInTheDocument()
        expect(screen.getByText(/Save S\$198 each year/)).toBeInTheDocument()
        expect(screen.getByText('100 print requests each month')).toBeInTheDocument()
        expect(screen.getByText('500 print and custom service requests each month')).toBeInTheDocument()
        expect(await screen.findByRole('link', { name: 'Choose Pro' })).toHaveAttribute('href', '/sign-up?priceId=p_pro_year')
        fireEvent.click(screen.getByRole('radio', { name: 'Pay monthly' }))
        expect(screen.getByText('S$99')).toBeInTheDocument()
    })
    it('does not treat a monthly subscriber as already subscribed yearly', async () => {
        state.signedIn = true
        state.subscription = { planId: 'pro', interval: 'month' }
        render(<Creators />)
        expect(screen.getByRole('link', { name: 'Manage plan' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('radio', { name: 'Pay yearly · 2 months free' }))
        expect(await screen.findByRole('link', { name: 'Choose Pro' })).toHaveAttribute('href', '/account/subscription?priceId=p_pro_year')
    })
    it('does not reuse a monthly price when yearly billing is unconfigured', async () => {
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ plans: [{id:'standard',interval:'month',available:true,priceId:'p_standard'}] }) }))
        render(<Creators />)
        await screen.findByRole('link', { name: 'Choose Standard' })
        fireEvent.click(screen.getByRole('radio', { name: 'Pay yearly · 2 months free' }))
        expect(screen.queryByRole('link', { name: 'Choose Standard' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Start free' })).toBeInTheDocument()
    })
})
