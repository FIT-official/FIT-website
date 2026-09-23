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

const service = {
    enabled: true,
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
