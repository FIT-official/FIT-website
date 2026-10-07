// Regression: a signed-in customer viewing another creator's product must see
// the purchase buttons. Mirrors the live catalogue shape (shop product,
// standard-shipping, no viewable model) reported missing buttons on 2026-07-04.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { useUser } from '@clerk/nextjs'

vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(() => ({
        user: { id: 'user_customer_saba' },
        isLoaded: true,
        isSignedIn: true,
    })),
}))
vi.mock('next/navigation', () => ({
    useParams: () => ({ slug: 'arduino-uno-r3-compatible' }),
    useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/ProductPage/ReviewSection', () => ({ default: () => null }))
vi.mock('@/components/3D/ModelViewer', () => ({ default: () => null }))

import ProductPage from '@/app/products/[slug]/ProductPage'

// jsdom has no ResizeObserver (the page observes its image container).
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const shopProduct = {
    _id: 'prod1',
    name: 'Arduino Uno R3 Compatible',
    slug: 'arduino-uno-r3-compatible',
    productType: 'shop',
    creatorUserId: 'user_35KQJAephgWnwhNfPkBCpfZyV2Z', // Fix It Today — not the viewer
    basePrice: { presentmentAmount: 12.9, presentmentCurrency: 'SGD' },
    images: [],
    variantTypes: [],
    delivery: { deliveryTypes: [{ type: 'standard-shipping' }] },
    viewableModel: null,
    infiniteStock: true,
}

function mockFetchByUrl() {
    global.fetch = vi.fn((url) => {
        const body = String(url).startsWith('/api/product?slug=')
            ? { product: shopProduct }
            : String(url).startsWith('/api/user/owns-product')
                ? { owns: false }
                : {} // events, orders, likes — irrelevant here
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    })
}

describe('ProductPage purchase buttons', () => {
    it('allows the signed-in FIT owner to add their first-party stock', async () => {
        useUser.mockReturnValue({ user: { id: shopProduct.creatorUserId }, isLoaded: true, isSignedIn: true })
        const item = { ...shopProduct, listing: 'fit' }
        global.fetch = vi.fn(url => Promise.resolve({ ok: true, json: async () => String(url).startsWith('/api/product?slug=') ? { product: item } : {} }))
        render(<ProductPage initialProduct={item} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Add to Cart' }))
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/user/cart', expect.objectContaining({ method: 'POST' })))
    })
    it('offers an enquiry instead of checkout for a quote-only item', async () => {
        useUser.mockReturnValue({ user: null, isLoaded: true, isSignedIn: false });
        const item = { ...shopProduct, quoteOnly: true };
        global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ product: item }) }));
        render(<ProductPage initialProduct={item} />);
        expect(await screen.findByRole('link', { name: 'Ask for a quote' })).toHaveAttribute('href', expect.stringContaining('mailto:fixittoday.contact@gmail.com'));
        expect(screen.getByText('Price on request')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add to Cart' })).not.toBeInTheDocument();
    });
    beforeEach(() => {
        useUser.mockReturnValue({ user: { id: 'user_customer_saba' }, isLoaded: true, isSignedIn: true })
        mockFetchByUrl()
    })
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows Add to Cart to a signed-in customer on a shop product', async () => {
        render(<ProductPage />)
        expect(await screen.findByText('Add to Cart')).toBeInTheDocument()
    })

    it('lets a guest add a seeded shop product without private creator data', async () => {
        useUser.mockReturnValue({ user: null, isLoaded: true, isSignedIn: false })
        const product = { ...shopProduct, creatorUserId: undefined, slug: '1kg-pla-3d-printing-filament-lanbo' }
        render(<ProductPage initialProduct={product} />)
        fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/user/cart', expect.objectContaining({ method: 'POST' })))
        expect(await screen.findByText('Added to cart')).toBeInTheDocument()
    })

    it('shows Order Print only when the product has a viewable model', async () => {
        global.fetch = vi.fn((url) =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        String(url).startsWith('/api/product?slug=')
                            ? {
                                product: {
                                    ...shopProduct,
                                    productType: 'print',
                                    viewableModel: 'models/example.stl',
                                    printConfig: { layerHeight: 0.2 },
                                },
                            }
                            : String(url).startsWith('/api/user/owns-product')
                                ? { owns: false }
                                : {},
                    ),
            }),
        )
        render(<ProductPage />)
        expect(await screen.findByText('Order Print')).toBeInTheDocument()
        // Print products without a digital download deliberately hide Add to Cart.
        expect(screen.queryByText('Add to Cart')).toBeNull()
    })

    it('shows Order Print on the custom-print-request base product (no model needed)', async () => {
        global.fetch = vi.fn((url) =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        String(url).startsWith('/api/product?slug=')
                            ? {
                                product: {
                                    ...shopProduct,
                                    slug: 'custom-print-request',
                                    productType: 'print',
                                    viewableModel: null,
                                },
                            }
                            : String(url).startsWith('/api/user/owns-product')
                                ? { owns: false }
                                : {},
                    ),
            }),
        )
        render(<ProductPage />)
        // Labelled Order Print, but wired to the custom-print request flow
        // (create request → upload in cart), not the fixed-config editor path.
        expect(await screen.findByText('Order Print')).toBeInTheDocument()
        expect(screen.queryByText('Add to Cart')).toBeNull()
    })

    it('explains, rather than hides, a print product with no viewable model', async () => {
        global.fetch = vi.fn((url) =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        String(url).startsWith('/api/product?slug=')
                            ? { product: { ...shopProduct, productType: 'print', viewableModel: null } }
                            : String(url).startsWith('/api/user/owns-product')
                                ? { owns: false }
                                : {},
                    ),
            }),
        )
        render(<ProductPage />)
        expect(await screen.findByText(/Print ordering isn't available/)).toBeInTheDocument()
        expect(screen.queryByText('Add to Cart')).toBeNull()
        expect(screen.queryByText('Order Print')).toBeNull()
    })
})
