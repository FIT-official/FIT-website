// /account/prints: "Add quoted print to cart" must appear for instant quotes,
// which store the price on quote.total (basePrice + printFee are 0). The
// quote breakdown total uses the same customPrintDisplayPrice selector.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import AccountPrintRequestsPage from '@/app/account/prints/page'

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: 'user_1' }, isLoaded: true }) }))
vi.mock('next/navigation', () => ({
    usePathname: () => '/account/prints',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => ({ get: () => null }),
}))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/components/Account/AccountShell', () => ({
    default: ({ header, children }) => <div>{header}{children}</div>,
}))

const state = vi.hoisted(() => ({ requests: [] }))

beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async (url) => {
        if (url === '/api/account/custom-print') return { ok: true, json: async () => ({ requests: state.requests }) }
        throw new Error('Unexpected request ' + url)
    })
})
afterEach(cleanup)

describe('account prints add-to-cart for instant quotes', () => {
    it('shows "Add quoted print to cart" and the quote total for an instant quote', async () => {
        state.requests = [{
            requestId: 'req_instant',
            status: 'quoted',
            quoteMode: 'instant',
            basePrice: 0,
            printFee: 0,
            currency: 'sgd',
            quote: { total: 18.5, lines: [{ key: 'material', label: 'Material', amount: 10 }, { key: 'time', label: 'Printing', amount: 8.5 }] },
            modelFile: { originalName: 'part.stl' },
            statusHistory: [],
        }]
        render(<AccountPrintRequestsPage />)
        const link = await screen.findByRole('link', { name: 'Add quoted print to cart' })
        expect(link).toHaveAttribute('href', '/cart?addCustomRequest=req_instant')
        expect(screen.getByText('Quote')).toBeInTheDocument()
        expect(screen.getByText('SGD 18.50')).toBeInTheDocument()
    })

    it('still shows it for a manual quote priced by basePrice + printFee', async () => {
        state.requests = [{
            requestId: 'req_manual',
            status: 'quoted',
            quoteMode: 'manual',
            basePrice: 12,
            printFee: 3,
            currency: 'sgd',
            modelFile: { originalName: 'bracket.stl' },
            statusHistory: [],
        }]
        render(<AccountPrintRequestsPage />)
        expect(await screen.findByRole('link', { name: 'Add quoted print to cart' })).toBeInTheDocument()
        expect(screen.getByText('SGD 15.00')).toBeInTheDocument()
    })

    it('hides it for an unquoted request and for a creator-handled job', async () => {
        state.requests = [
            { requestId: 'req_pending', status: 'pending_config', basePrice: 0, printFee: 0, statusHistory: [] },
            { requestId: 'req_creator', status: 'quoted', quoteMode: 'instant', quote: { total: 9 }, creatorUserId: 'creator_1', statusHistory: [] },
        ]
        render(<AccountPrintRequestsPage />)
        await screen.findAllByText('Open request')
        expect(screen.queryByRole('link', { name: /Add quoted print to cart/ })).not.toBeInTheDocument()
    })
})

describe('Account prints: creator print farm estimate', () => {
    const estimate = {
        currency: 'sgd', subtotal: 16.2, total: 16.2, expedite: { applied: false, amount: 0 },
        lines: [{ key: 'material', label: 'Material', amount: 4.2 }, { key: 'printTime', label: 'Print time', amount: 2 },
            { key: 'baseFee', label: 'Base fee', amount: 2 }, { key: 'priority', label: 'Priority', amount: 0 }, { key: 'delivery', label: 'Delivery', amount: 8 }],
        inputs: { weightGrams: 28, printHours: 0.8 }, delivery: { type: 'courier', label: 'Courier', price: 8 },
    }
    const creatorRequest = (extra = {}) => ({ requestId: 'req_farm', status: 'configured', basePrice: 0, printFee: 0, currency: 'sgd',
        creatorUserId: 'creator_1', creatorDisplayName: 'Kai Prints', modelFile: { originalName: 'bracket.stl' }, statusHistory: [], estimate, ...extra })
    const load = (requests) => {
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ requests }) }))
        render(<AccountPrintRequestsPage />)
    }

    it('shows the estimate with its dotted-leader breakdown and no add-to-cart link', async () => {
        load([creatorRequest()])
        const section = await screen.findByRole('region', { name: 'Estimate from Kai Prints' })
        expect(within(section).getByText('Estimate from Kai Prints')).toBeInTheDocument()
        expect(within(section).getByText('Material, 28 g')).toBeInTheDocument()
        expect(within(section).getByText('Printing, 0.8 h')).toBeInTheDocument()
        expect(within(section).getByText('Setup')).toBeInTheDocument()
        expect(within(section).queryByText('Priority')).toBeNull()
        expect(within(section).getByText('Courier')).toBeInTheDocument()
        expect(within(section).getByText('Estimate total')).toBeInTheDocument()
        expect(within(section).getByText('SGD 16.20')).toBeInTheDocument()
        expect(within(section).getByText('Kai Prints confirms the final price. Payment is arranged directly with the creator.')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /cart/i })).toBeNull()
    })

    it("adds the creator's quote when it exists, still without a cart link, and keeps it after they accept", async () => {
        load([creatorRequest({ status: 'quoted', quoteMode: 'manual', printFee: 18, adminNote: 'Collect Friday' }),
            creatorRequest({ requestId: 'req_farm_2', status: 'paid', quoteMode: 'manual', printFee: 20 })])
        await screen.findAllByRole('region', { name: 'Estimate from Kai Prints' })
        expect(screen.getAllByText('Quote from Kai Prints')).toHaveLength(2)
        expect(screen.getByText('SGD 18.00')).toBeInTheDocument()
        expect(screen.getByText('SGD 20.00')).toBeInTheDocument()
        expect(screen.getByText('Collect Friday')).toBeInTheDocument()
        expect(screen.queryByText('Base price')).toBeNull()
        expect(screen.queryByRole('link', { name: /cart/i })).toBeNull()
    })

    it('shows no estimate section when none was saved', async () => {
        load([creatorRequest({ estimate: { lines: [], expedite: { applied: false, amount: 0 } } })])
        await screen.findByText('bracket.stl')
        expect(screen.queryByRole('region', { name: /Estimate from/ })).toBeNull()
    })
})
