import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import OrderSection from '@/components/Account/OrderSection'
import Subscription from '@/app/account/subscription/Subscription'
import { getEntitlements } from '@/utils/entitlements'

const state = vi.hoisted(() => ({ subscription: null }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: 'buyer' } }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/utils/useOrderStatuses', () => ({ useOrderStatuses: () => ({ orderStatuses: [] }), getStatusDisplayName: value => value }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/utils/UserSubscriptionContext', () => ({ useUserSubscription: () => ({ subscription: state.subscription, loading: false, refresh: vi.fn() }) }))
vi.mock('@/components/Account/SubscriptionDetails', () => ({ default: () => <div>Plan editor</div> }))
vi.mock('@/components/Account/AccountShell', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('@stripe/react-stripe-js', () => ({ Elements: ({ children }) => <div>{children}</div> }))
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn() }))

beforeEach(() => { state.subscription = null })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('legacy payment account views', () => {
    it('shows a paid review when there are no orders and offers no invented fulfilment actions', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ orders: [], paymentReviews: [{
            sessionId: 'cs_legacy_owner', status: 'reconciliation_required',
            receipt: { amountTotalCents: 2450, currency: 'sgd', recordedAt: '2026-09-23T00:00:00Z' },
        }] }) })))
        render(<OrderSection />)
        expect(await screen.findByText('Payment received — order details under review')).toBeInTheDocument()
        expect(screen.getByText(/Please do not pay again/)).toBeInTheDocument()
        expect(screen.getByText('SGD 24.50')).toBeInTheDocument()
        expect(screen.getByText('Payment reference: cs_legacy_owner')).toBeInTheDocument()
        expect(screen.queryByText('No Orders Yet')).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /View order|Buy again|Track print/ })).not.toBeInTheDocument()
    })
    it('displays the retained legacy name and actual monthly price', () => {
        state.subscription = { planId: 'legacy', plan: { name: 'Professional', legacy: true }, priceId: 'price_old',
            status: 'active', price: 2400, interval: 'month' }
        render(<Subscription />)
        expect(screen.getByText('Professional')).toBeInTheDocument()
        expect(screen.getByText(/S\$24\.00 per month/)).toBeInTheDocument()
        expect(screen.getByText(/existing plan and current price are retained/)).toBeInTheDocument()
    })
    it.each(['active', 'trialing'])('recognises %s legacy paid access in UI affordances', async status => {
        expect(await getEntitlements({ role: 'user', planId: 'legacy', status })).toMatchObject({ tier: 'legacy', isPaidTier: true })
    })
    it.each(['past_due', 'unpaid', 'paused', 'canceled'])('does not call %s legacy access paid', async status => {
        expect(await getEntitlements({ role: 'user', planId: 'legacy', status })).toMatchObject({ tier: 'free', isPaidTier: false })
    })
})
