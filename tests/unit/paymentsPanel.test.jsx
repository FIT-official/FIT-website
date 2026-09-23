// RTL smokes for the redesigned admin payments panel (§9.10 accounting views):
// summary tiles + date-grouped ledger render from a sessions fixture, the
// By-creator/Statements sub-views aggregate client-side, the processed toggle
// PATCHes the legacy endpoint, and an enabled export button exists per view
// (view-specific export CONTENT is exercised manually — xlsx is mocked here).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import CreatorPayments from '@/components/Admin/CreatorPayments'

vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}))
// xlsx stays out of jsdom — the export path only needs a safe surface.
vi.mock('xlsx', () => ({
    utils: {
        json_to_sheet: vi.fn(() => ({})),
        book_new: vi.fn(() => ({})),
        book_append_sheet: vi.fn(),
    },
    writeFile: vi.fn(),
}))

const sessionsFixture = [
    {
        sessionId: 'cs_test_alpha_0123456789',
        userId: 'buyer_1',
        createdAt: '2026-07-15T10:00:00Z',
        processed: false,
        currency: 'sgd',
        totalAmount: 5000,
        salesData: {
            creator_1: {
                totalAmount: 5000,
                productRevenue: 4000,
                shippingRevenue: 1000,
                items: [
                    { productId: 'prod_1', variantId: 'var_1', quantity: 2, unitPrice: 20, deliveryType: 'standard' },
                ],
            },
        },
        digitalProductData: {},
    },
    {
        sessionId: 'cs_test_beta_0123456789',
        userId: 'buyer_1',
        createdAt: '2026-06-15T10:00:00Z',
        processed: true,
        currency: 'sgd',
        totalAmount: 2500,
        salesData: {
            creator_1: {
                totalAmount: 1500,
                productRevenue: 1500,
                shippingRevenue: 0,
                items: [
                    { productId: 'prod_1', variantId: 'var_1', quantity: 1, unitPrice: 15, deliveryType: 'digital' },
                ],
            },
            creator_2: {
                totalAmount: 1000,
                productRevenue: 800,
                shippingRevenue: 200,
                items: [
                    { productId: 'prod_2', variantId: 'var_2', quantity: 1, unitPrice: 10, deliveryType: 'standard' },
                ],
            },
        },
        digitalProductData: {
            prod_1: { buyer: 'buyer_1_long_identifier_here', links: ['https://example.com/dl'] },
        },
    },
]

const usersFixture = [
    { id: 'buyer_1', name: 'Bella Buyer', email: 'bella@example.com', phone: 'No phone', address: 'No address' },
    { id: 'creator_1', name: 'Carl Creator', email: 'carl@example.com', stripeAccountId: 'acct_123' },
    { id: 'creator_2', name: 'Dana Designer', email: 'dana@example.com' },
]

const productsFixture = [
    { _id: 'prod_1', name: 'Benchy', variants: [{ _id: 'var_1', name: 'Red' }] },
    { _id: 'prod_2', name: 'Vase', variants: [{ _id: 'var_2', name: 'Blue' }] },
]

const ok = (payload) => Promise.resolve({ ok: true, json: async () => payload })

beforeEach(() => {
    global.fetch = vi.fn((url, init = {}) => {
        const u = String(url)
        if (init.method === 'PATCH') return ok({})
        if (u.includes('/api/user/batch')) return ok({ users: usersFixture })
        if (u.includes('/api/product/batch')) return ok({ products: productsFixture })
        if (u.includes('/api/admin/sessions')) return ok({ sessions: sessionsFixture })
        return ok({})
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('CreatorPayments — accounting views', () => {
    it('separates paid reviews from payout totals, exports and processed controls', async () => {
        const review = { sessionId: 'cs_legacy_review', userId: 'legacy-buyer', status: 'reconciliation_required', processed: true,
            totalAmount: 99999, currency: 'usd', createdAt: '2026-07-16T10:00:00Z',
            salesData: { creator_3: { totalAmount: 99999, items: [] } },
            reconciliation: { amountTotalCents: 1234, currency: 'sgd', recordedAt: '2026-07-16T10:01:00Z', amountMismatch: true } }
        const originalFetch = global.fetch
        global.fetch = vi.fn((url, init) => String(url).includes('/api/admin/sessions')
            ? ok({ sessions: [review, ...sessionsFixture] }) : originalFetch(url, init))
        render(<CreatorPayments />)
        const reviewSection = await screen.findByRole('region', { name: 'Payments requiring review' })
        expect(within(reviewSection).getByText('Captured: SGD $12.34')).toBeInTheDocument()
        expect(within(reviewSection).getByText('Session: cs_legacy_review')).toBeInTheDocument()
        expect(within(reviewSection).queryByRole('button')).not.toBeInTheDocument()
        await screen.findByText('$75.00')
        expect(screen.queryByText('$999.99')).not.toBeInTheDocument()
        expect(global.fetch.mock.calls.some(([url]) => String(url).includes('legacy-buyer'))).toBe(false)
    })
    it('renders the summary tiles and the transactions ledger from the fixture', async () => {
        render(<CreatorPayments />)

        // Buyer + truncated, copyable session ids in the ledger rows.
        expect((await screen.findAllByText('Bella Buyer')).length).toBeGreaterThan(0)
        expect(screen.getByText(/^cs_test_alpha_0123/)).toBeInTheDocument()
        expect(screen.getByText(/^cs_test_beta_0123/)).toBeInTheDocument()

        // Volume tile — the ink hero — sums salesData across creators: $75.00.
        expect(screen.getByText('$75.00')).toBeInTheDocument()
        // Pending tile context.
        expect(screen.getByText('to process')).toBeInTheDocument()
        // Per-row totals, right-aligned tabular money.
        expect(screen.getByText('$50.00')).toBeInTheDocument()
        expect(screen.getByText('$25.00')).toBeInTheDocument()

        // One processed StatusPill toggle per row: hatch Pending / ink Processed.
        expect(screen.getByRole('button', { name: 'Mark as processed' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Mark as pending' })).toBeInTheDocument()
    })

    it('toggles processed state via the existing PATCH endpoint', async () => {
        render(<CreatorPayments />)
        await screen.findAllByText('Bella Buyer')

        fireEvent.click(screen.getByRole('button', { name: 'Mark as processed' }))

        await waitFor(() => {
            const patchCall = global.fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')
            expect(patchCall).toBeTruthy()
            expect(String(patchCall[0])).toBe('/api/admin/sessions')
            expect(JSON.parse(patchCall[1].body)).toEqual({
                sessionId: 'cs_test_alpha_0123456789',
                processed: true,
            })
        })
    })

    it('aggregates the loaded sessions per creator in the By-creator sub-view', async () => {
        render(<CreatorPayments />)
        await screen.findAllByText('Bella Buyer')

        fireEvent.click(screen.getByRole('tab', { name: 'By creator' }))

        // Carl: two sessions, owed 5000 + 1500 = $65.00, Stripe chip copyable.
        expect(screen.getByText('Carl Creator')).toBeInTheDocument()
        expect(screen.getByText('$65.00')).toBeInTheDocument()
        expect(screen.getByText('acct_123')).toBeInTheDocument()
        // Dana: one session, owed $10.00, flagged without a Stripe account.
        expect(screen.getByText('Dana Designer')).toBeInTheDocument()
        expect(screen.getByText('$10.00')).toBeInTheDocument()
        expect(screen.getByText('No Stripe account')).toBeInTheDocument()
    })

    it('rolls sessions up by month with a totals row in the Statements sub-view', async () => {
        render(<CreatorPayments />)
        await screen.findAllByText('Bella Buyer')

        fireEvent.click(screen.getByRole('tab', { name: 'Statements' }))

        expect(screen.getByText('July 2026')).toBeInTheDocument()
        expect(screen.getByText('June 2026')).toBeInTheDocument()
        expect(screen.getByText('Total')).toBeInTheDocument()
        // Month gross values ($50.00 / $25.00) and the grand total ($75.00,
        // also on the volume tile).
        expect(screen.getByText('$50.00')).toBeInTheDocument()
        expect(screen.getByText('$25.00')).toBeInTheDocument()
        expect(screen.getAllByText('$75.00').length).toBeGreaterThanOrEqual(2)
    })

    it('keeps the export action available in every sub-view', async () => {
        render(<CreatorPayments />)
        await screen.findAllByText('Bella Buyer')

        for (const tab of ['Transactions', 'By creator', 'Statements']) {
            fireEvent.click(screen.getByRole('tab', { name: tab }))
            expect(screen.getByRole('button', { name: /Export/ })).toBeEnabled()
        }
    })

    it('opens the peek with the per-creator breakdown and Stripe chips', async () => {
        render(<CreatorPayments />)
        await screen.findAllByText('Bella Buyer')

        // Row click via the buyer cell (the beta session — second row — carries
        // two creators and a digital delivery). The id cell itself copies.
        fireEvent.click(screen.getAllByText('Bella Buyer')[1])

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Carl Creator')).toBeInTheDocument()
        expect(within(dialog).getByText('Dana Designer')).toBeInTheDocument()
        expect(within(dialog).getAllByText('Product revenue').length).toBe(2)
        expect(within(dialog).getByText('acct_123')).toBeInTheDocument()
        expect(within(dialog).getByText('No Stripe account')).toBeInTheDocument()
        // Digital delivery block + the processed action.
        expect(within(dialog).getByText(/1 link/)).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Mark as pending' })).toBeInTheDocument()
    })
})
