// Printable job sheet route (blueprint §6): renders the spec rows from the
// sessionStorage handoff, falls back to fetching by id, and embeds a QR.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import JobSheetPage from '@/app/admin/job-sheet/[requestId]/page'

let mockRequestId = 'REQ-001'
let mockSearch = ''
vi.mock('next/navigation', () => ({
    useParams: () => ({ requestId: mockRequestId }),
    useSearchParams: () => new URLSearchParams(mockSearch),
}))
vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}))
// Pulled in transitively via RequestPeek's exports — heavy, stub it out.
vi.mock('@/components/DashboardComponents/ProductFormFields/ShippingFields', () => ({
    default: () => null,
}))

const fixture = {
    requestId: 'REQ-001',
    userEmail: 'alice@example.com',
    status: 'paid',
    createdAt: '2026-07-01T10:00:00Z',
    modelFile: { originalName: 'benchy.stl', s3Key: 'models/benchy.stl' },
    printConfiguration: {
        printSettings: {
            layerHeight: 0.2,
            initialLayerHeight: 0.3,
            materialType: 'PLA',
            wallLoops: 3,
            sparseInfillDensity: 15,
            sparseInfillPattern: 'grid',
            internalSolidInfillPattern: 'zigzag',
            nozzleDiameter: 0.4,
            enableSupport: true,
            supportType: 'tree',
            printPlate: 'textured',
        },
        meshColors: { hull: '#ff0000' },
    },
    dimensions: { length: 10, width: 8, height: 4, weight: 0.5 },
    quoteMode: 'instant',
    quote: { total: 25.5, currency: 'sgd', inputs: { printHours: 3.2 } },
}

beforeEach(() => {
    mockRequestId = 'REQ-001'
    mockSearch = ''
    sessionStorage.clear()
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('Job sheet route', () => {
    it.each([
        ['instant', 5],
        ['manual', 22],
    ])('uses the checkout price for a %s quote with conflicting legacy fields', async (quoteMode, amount) => {
        sessionStorage.setItem('dashJobSheet.REQ-001', JSON.stringify({
            ...fixture, quoteMode, basePrice: 17, printFee: 5, quote: { total: 5 },
        }))
        render(<JobSheetPage />)
        expect(await screen.findByText(`SGD ${amount.toFixed(2)}`)).toBeInTheDocument()
        expect(screen.queryByText(`SGD ${(amount === 5 ? 22 : 5).toFixed(2)}`)).toBeNull()
    })

    it('renders the sheet from the sessionStorage handoff', async () => {
        sessionStorage.setItem('dashJobSheet.REQ-001', JSON.stringify(fixture))
        render(<JobSheetPage />)

        expect(await screen.findByText('benchy.stl')).toBeInTheDocument()
        expect(screen.getByText('alice@example.com')).toBeInTheDocument()
        expect(screen.getByText('REQ-001')).toBeInTheDocument()
        // DottedRow spec list carries every print setting.
        expect(screen.getByText('Layer height')).toBeInTheDocument()
        expect(screen.getByText('0.2mm')).toBeInTheDocument()
        expect(screen.getByText('PLA')).toBeInTheDocument()
        expect(screen.getByText('10×8×4 cm')).toBeInTheDocument()
        expect(screen.getByText('0.5 kg')).toBeInTheDocument()
        // Quantity 1 + server-priced total.
        expect(screen.getByText('Quantity')).toBeInTheDocument()
        expect(screen.getByText('SGD 25.50')).toBeInTheDocument()
        // Colour swatch chip.
        expect(screen.getByText('hull')).toBeInTheDocument()
        // QR of the sheet's own admin URL (plus the URL as text).
        expect(screen.getByRole('img', { name: /QR code/i })).toBeInTheDocument()
        expect(screen.getByText(/\/admin\/job-sheet\/REQ-001$/)).toBeInTheDocument()
    })

    it('falls back to fetching the request when sessionStorage is empty', async () => {
        global.fetch = vi.fn(() =>
            Promise.resolve({ ok: true, json: async () => ({ requests: [fixture] }) }),
        )
        render(<JobSheetPage />)
        expect(await screen.findByText('benchy.stl')).toBeInTheDocument()
        expect(global.fetch).toHaveBeenCalledWith('/api/admin/custom-print-requests')
    })

    it('shows a quiet miss message when the request cannot be found', async () => {
        mockRequestId = 'REQ-404'
        global.fetch = vi.fn(() =>
            Promise.resolve({ ok: true, json: async () => ({ requests: [] }) }),
        )
        render(<JobSheetPage />)
        expect(await screen.findByText(/REQ-404 not found/)).toBeInTheDocument()
    })
})
