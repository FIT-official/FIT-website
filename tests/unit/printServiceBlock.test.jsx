// components/CreatorPage/blocks/PrintServiceBlock: reads the creator's
// print service from GET /api/creators/<id>/print-service and degrades to
// nothing while the Track B endpoint is missing, errors, or is disabled.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import PrintServiceBlock from '@/components/CreatorPage/blocks/PrintServiceBlock'

vi.mock('@/components/General/MarkdownRenderer', () => ({
    default: ({ source }) => <div data-testid="markdown">{source}</div>,
}))

const creator = { id: 'user_creator', displayName: 'Ada Prints', shop: { accentColor: '#3b82f6' } }

// A legacy service (saved before per-farm pricing), wrapped exactly as
// GET /api/creators/[id]/print-service returns it. The block used to read
// these fields from the top of the response, so live pages showed no
// materials; the mocks now use the real { enabled, creator, service } shape.
const legacyService = {
    headline: 'Prints from my Bambu',
    description: 'PLA and PETG, **fast**.',
    materials: [
        { name: 'PLA', colours: ['Black', 'White'], pricePerGram: 0.12, note: 'Most colours in stock' },
        { name: 'PETG', colours: ['Clear'], pricePerGram: 0.18 },
    ],
    minimumCharge: 8,
    leadTimeDays: 3,
    turnaroundNote: 'Pickup at Tampines.',
}
const service = { enabled: true, creator: { userId: 'user_creator', displayName: 'Ada Prints' }, service: legacyService }

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('PrintServiceBlock', () => {
    it('renders nothing on 404 / network error / disabled', async () => {
        global.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
        const { container, rerender } = render(<PrintServiceBlock settings={{}} creator={creator} />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/creators/user_creator/print-service'))
        expect(container).toBeEmptyDOMElement()

        global.fetch = vi.fn(async () => { throw new Error('offline') })
        rerender(<PrintServiceBlock settings={{}} creator={{ ...creator, id: 'user_other' }} />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()

        global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) }))
        rerender(<PrintServiceBlock settings={{}} creator={{ ...creator, id: 'user_third' }} />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })

    it('renders headline, description, materials table, minimum, lead time and the upload link when enabled', async () => {
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => service }))
        render(<PrintServiceBlock settings={{ heading: '' }} creator={creator} />)

        expect(await screen.findByRole('heading', { name: 'Prints from my Bambu' })).toBeInTheDocument()
        expect(screen.getByTestId('markdown')).toHaveTextContent('PLA and PETG, **fast**.')
        expect(screen.getByRole('columnheader', { name: 'Material' })).toBeInTheDocument()
        expect(screen.getByText('PLA')).toBeInTheDocument()
        expect(screen.getByText('Most colours in stock')).toBeInTheDocument()
        expect(screen.getByText('Black')).toBeInTheDocument()
        expect(screen.getByText('Clear')).toBeInTheDocument()
        expect(screen.getByText('0.12')).toBeInTheDocument()
        expect(screen.getByText('S$8.00')).toBeInTheDocument()
        expect(screen.getByText('3 days')).toBeInTheDocument()
        expect(screen.getByText('Pickup at Tampines.')).toBeInTheDocument()
        const link = screen.getByRole('link', { name: 'Upload your model' })
        expect(link).toHaveAttribute('href', '/prints/request?creator=user_creator')
        expect(link.style.backgroundColor).toBe('rgb(59, 130, 246)')
    })

    it('uses the block heading over the service headline when set', async () => {
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => service }))
        render(<PrintServiceBlock settings={{ heading: 'Print with me' }} creator={creator} />)
        expect(await screen.findByRole('heading', { level: 2, name: 'Print with me' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 3, name: 'Prints from my Bambu' })).toBeInTheDocument()
    })
})

// Exactly what the public route returns for a farm with per-farm pricing:
// publicPrintService(doc) + publicFarmProfile(resolveFarmPricing(...)).
const routeResponse = {
    enabled: true,
    creator: { userId: 'user_creator', displayName: 'Ada Prints' },
    service: {
        headline: 'Prints from my Bambu', description: '', materials: [], minimumCharge: 0, leadTimeDays: 7,
        maxBuildMm: { x: 250, y: 250, z: 250 }, acceptedFormats: ['stl', '3mf'], turnaroundNote: '',
    },
    profile: {
        materials: [
            { filament: 'pla', label: 'PLA', ratePerGram: 0.125, note: 'Most colours in stock', colours: [
                { filament: 'pla', name: 'Jade White', code: '10100', hex: '#ffffff' },
                { filament: 'pla', name: 'Black', code: '10101', hex: '#000000' },
            ] },
            { filament: 'petg', label: 'PETG', ratePerGram: 0.18, note: '', colours: [{ filament: 'petg', name: 'White', code: '30106', hex: '#f7f7f4' }] },
        ],
        reviewMaterials: [{ key: 'review-1', label: 'Nylon', note: 'Dried first', colours: [{ name: 'Black', hex: null }] }],
        minimumPrice: 8,
        deliveryOptions: [
            { type: 'pickup', displayName: 'Collect in Tampines', description: '', price: 0, needsAddress: false },
            { type: 'courier', displayName: 'Courier', description: '', price: 8, needsAddress: true },
        ],
        leadTimeDays: 4,
        machineLimits: { maxLengthCm: 25.6, maxWidthCm: 25.6, maxHeightCm: 25.6, maxWeightKg: null },
        offers: { postProcessing: true, specialRequest: true, priority: false, expedite: false },
    },
}

describe('PrintServiceBlock with a per-farm pricing profile', () => {
    it('renders the offered materials, colours, S$/g, lead time, size limit and delivery from the public route shape', async () => {
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => routeResponse }))
        render(<PrintServiceBlock settings={{}} creator={creator} />)
        expect(await screen.findByText('PETG')).toBeInTheDocument()
        const rows = screen.getAllByRole('row').slice(1)
        expect(rows).toHaveLength(3)
        expect(rows[0]).toHaveTextContent('Most colours in stock')
        expect(rows[2]).toHaveTextContent('Nylon')
        expect(rows[2]).toHaveTextContent('Dried first')
        expect(rows[2]).toHaveTextContent('On review')
        expect(rows[0]).toHaveTextContent('PLA')
        expect(rows[0]).toHaveTextContent('Jade White')
        expect(rows[0]).toHaveTextContent('Black')
        expect(rows[0]).toHaveTextContent('0.125')
        expect(rows[1]).toHaveTextContent('0.18')
        // Lead time comes from the profile, not the legacy service default.
        expect(screen.getByText('4 days')).toBeInTheDocument()
        expect(screen.getByText('256 × 256 × 256 mm')).toBeInTheDocument()
        expect(screen.getByText('Collect in Tampines (free), Courier (S$8.00)')).toBeInTheDocument()
        expect(screen.getByText('Minimum order').closest('span')).toHaveTextContent('Minimum order S$8.00')
        expect(screen.getByRole('link', { name: 'Upload your model' })).toHaveAttribute('href', '/prints/request?creator=user_creator')
    })
})
