// RTL smokes for the creator print-service surfaces: the creator's
// /dashboard/print-jobs queue (list, drawer, quote + decline actions post the
// exact PATCH payloads), the /dashboard/print-service settings form (adds a
// material and PUTs the whole service), the admin queue's FIT-only default
// with the "Include creator jobs" toggle, and the customer's "Handled by"
// chip with off-platform payment note (no cart link for creator jobs).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import PrintJobsPage from '@/app/dashboard/print-jobs/page'
import PrintServicePage from '@/app/dashboard/print-service/page'
import CustomPrintRequests from '@/components/Admin/CustomPrintRequests'
import AccountPrintRequestsPage from '@/app/account/prints/page'

global.ResizeObserver =
    global.ResizeObserver ||
    class {
        observe() { }
        unobserve() { }
        disconnect() { }
    }

const showToast = vi.fn()
vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast }),
    ToastProvider: ({ children }) => children,
}))
vi.mock('@/components/DashboardComponents/CreatorShell', () => ({
    CreatorGate: ({ children }) => children,
    useShopIdentity: () => ({ displayName: 'Maker Lab', displayNameAvailable: true }),
}))
vi.mock('@/utils/AdminSettingsContext', () => ({
    useAdminSettings: () => ({ settings: { deliveryTypes: [] }, loading: false, error: null }),
}))
vi.mock('@/components/DashboardComponents/ProductFormFields/ShippingFields', () => ({
    default: () => <div data-testid="shipping-fields" />,
}))
vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: { id: 'user_buyer' }, isLoaded: true }),
}))
vi.mock('next/navigation', () => ({
    usePathname: () => '/account/prints',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => ({ get: () => null }),
}))
vi.mock('@/components/Account/AccountShell', () => ({
    default: ({ header, children }) => <div>{header}{children}</div>,
}))

const okJson = (data) => Promise.resolve({ ok: true, json: async () => data })

const jobs = [
    {
        requestId: 'req-1', userName: 'Alice', userEmail: 'alice@x.com', status: 'configured', currency: 'sgd',
        basePrice: 0, printFee: 0, createdAt: '2026-09-10T00:00:00Z', customerNote: 'Need it by Friday',
        modelFile: { originalName: 'a.stl', s3Key: 'models/a.stl' },
        printConfiguration: { generic: { material: 'PLA', colour: 'Red' } },
        statusHistory: [{ status: 'configured', updatedAt: '2026-09-10T00:00:00Z' }],
    },
    {
        requestId: 'req-2', userName: 'Bob', userEmail: 'bob@x.com', status: 'delivered', currency: 'sgd',
        basePrice: 0, printFee: 30, modelFile: { originalName: 'b.stl', s3Key: 'models/b.stl' }, statusHistory: [],
    },
]

let calls
beforeEach(() => {
    calls = []
    showToast.mockClear()
    global.fetch = vi.fn((url, init = {}) => {
        const u = String(url)
        calls.push({ url: u, init })
        if (u.startsWith('/api/user/print-jobs/') && init.method === 'PATCH') {
            const body = JSON.parse(init.body)
            return okJson({ success: true, job: { requestId: 'req-1', status: body.action === 'quote' ? 'quoted' : 'cancelled', printFee: body.amount ?? 0, statusHistory: [] } })
        }
        if (u.startsWith('/api/user/print-jobs')) return okJson({ jobs })
        if (u.startsWith('/api/user/print-service') && init.method === 'PUT') {
            return okJson({ success: true, service: { ...JSON.parse(init.body), updatedAt: null } })
        }
        if (u.startsWith('/api/user/print-service')) {
            return okJson({ service: { enabled: false, headline: '', description: '', materials: [], minimumCharge: 0, leadTimeDays: 7, maxBuildMm: { x: 250, y: 250, z: 250 }, acceptedFormats: ['stl', '3mf'], turnaroundNote: '' } })
        }
        if (u.startsWith('/api/admin/custom-print-requests')) {
            return okJson({
                requests: [
                    { requestId: 'FIT-1', userEmail: 'fit@x.com', status: 'configured', modelFile: { originalName: 'fit.stl' }, statusHistory: [] },
                    { requestId: 'CRE-1', userEmail: 'cre@x.com', status: 'configured', creatorUserId: 'user_creator', creatorDisplayName: 'Maker Lab', modelFile: { originalName: 'creator.stl' }, statusHistory: [] },
                ],
            })
        }
        if (u.startsWith('/api/account/custom-print')) {
            return okJson({
                requests: [{
                    requestId: 'REQ-9', status: 'quoted', basePrice: 0, printFee: 25, currency: 'sgd',
                    creatorUserId: 'user_creator', creatorDisplayName: 'Maker Lab',
                    modelFile: { originalName: 'chip.stl' }, statusHistory: [],
                }],
            })
        }
        return Promise.resolve({ ok: false, json: async () => ({}) })
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('/dashboard/print-jobs', () => {
    it('lists jobs with creator-facing status labels and view counts', async () => {
        render(<PrintJobsPage />)
        expect(await screen.findByText('a.stl')).toBeInTheDocument()
        expect(screen.getByText('Needs quote', { selector: 'span' })).toBeInTheDocument()
        expect(screen.getByText('Completed', { selector: 'span' })).toBeInTheDocument()
        expect(document.body.textContent).toContain('SGD 30.00')
    })

    it('opens the drawer and sends a quote with the exact PATCH payload', async () => {
        render(<PrintJobsPage />)
        fireEvent.click(await screen.findByText('a.stl'))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Need it by Friday')).toBeInTheDocument()
        expect(within(dialog).getByRole('link', { name: /Download model/ })).toHaveAttribute(
            'href',
            '/api/proxy?key=models%2Fa.stl&download=1&filename=a.stl',
        )
        fireEvent.change(within(dialog).getByLabelText('Quote (SGD)'), { target: { value: '25' } })
        fireEvent.change(within(dialog).getByLabelText('Note to customer (optional)'), { target: { value: 'Collect Fri' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Send quote' }))
        await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true))
        const patch = calls.find((c) => c.init.method === 'PATCH')
        expect(patch.url).toBe('/api/user/print-jobs/req-1')
        expect(JSON.parse(patch.init.body)).toEqual({ action: 'quote', amount: 25, note: 'Collect Fri' })
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Quote sent to the customer.', 'success'))
    })

    it('declines through ConfirmDialog with a reason (never window.confirm)', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm')
        render(<PrintJobsPage />)
        fireEvent.click(await screen.findByText('a.stl'))
        const drawer = await screen.findByRole('dialog')
        fireEvent.click(within(drawer).getByRole('button', { name: 'Decline' }))
        const confirm = await screen.findByRole('dialog', { name: 'Decline this job?' })
        fireEvent.click(within(confirm).getByRole('button', { name: 'Decline job' }))
        expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false) // reason required
        fireEvent.change(within(confirm).getByLabelText('Reason'), { target: { value: 'Too big' } })
        fireEvent.click(within(confirm).getByRole('button', { name: 'Decline job' }))
        await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true))
        expect(JSON.parse(calls.find((c) => c.init.method === 'PATCH').init.body)).toEqual({ action: 'reject', reason: 'Too big' })
        expect(confirmSpy).not.toHaveBeenCalled()
    })
})

describe('/dashboard/print-service', () => {
    it('adds a material and PUTs the whole service', async () => {
        render(<PrintServicePage />)
        expect(await screen.findByRole('heading', { name: /Print service/ })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Add material' }))
        fireEvent.change(screen.getByLabelText('Material 1 name'), { target: { value: 'PLA' } })
        fireEvent.change(screen.getByLabelText('Material 1 colours'), { target: { value: 'Black, White,' } })
        fireEvent.click(screen.getByLabelText('Accept print requests'))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true))
        const body = JSON.parse(calls.find((c) => c.init.method === 'PUT').init.body)
        expect(body.enabled).toBe(true)
        expect(body.materials).toEqual([{ name: 'PLA', colours: ['Black', 'White'], pricePerGram: 0.1, note: '' }])
        expect(body.acceptedFormats).toEqual(['stl', '3mf'])
        expect(screen.getByRole('link', { name: /View page/ })).toHaveAttribute('href', '/creators/Maker%20Lab')
    })
})

describe('Admin queue: creator jobs', () => {
    it('defaults to FIT-only and reveals creator jobs with the toggle', async () => {
        render(<CustomPrintRequests />)
        expect(await screen.findByText('fit.stl')).toBeInTheDocument()
        expect(screen.queryByText('creator.stl')).toBeNull()
        const toggle = screen.getByRole('switch', { name: /Include creator jobs/ })
        expect(toggle).toHaveTextContent('Include creator jobs (1)')
        fireEvent.click(toggle)
        expect(await screen.findByText('creator.stl')).toBeInTheDocument()
        expect(screen.getByText('Creator: Maker Lab')).toBeInTheDocument()
        fireEvent.click(toggle)
        await waitFor(() => expect(screen.queryByText('creator.stl')).toBeNull())
    })
})

describe('Customer prints: creator job', () => {
    it('shows the Handled by chip and the off-platform payment note, no cart link', async () => {
        render(<AccountPrintRequestsPage />)
        expect(await screen.findByText('chip.stl')).toBeInTheDocument()
        expect(screen.getByText('Handled by Maker Lab')).toBeInTheDocument()
        expect(screen.getByText('Payment is arranged directly with the creator.')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /to cart/ })).toBeNull()
    })
})
