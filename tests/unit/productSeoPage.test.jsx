import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/Event', () => ({ default: { find: vi.fn() } }))
vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: null, isLoaded: true, isSignedIn: false }),
}))
vi.mock('next/navigation', () => ({
    useParams: () => ({ slug: 'lanbo-pla' }),
    useRouter: () => ({ push: vi.fn() }),
    notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/ProductPage/ReviewSection', () => ({ default: () => null }))
vi.mock('@/components/3D/ModelViewer', () => ({ default: () => null }))

import Product from '@/models/Product'
import Event from '@/models/Event'
import ProductPage from '@/app/products/[slug]/ProductPage'
import ProductPageLayout, { generateMetadata } from '@/app/products/[slug]/page'
import { publicProductSeed } from '@/lib/seo/product'

const product = {
    _id: 'filament1', slug: 'lanbo-pla', name: 'Lanbo PLA Filament',
    description: 'PLA filament for everyday 3D printing.', productType: 'shop',
    images: [], basePrice: { presentmentAmount: 20, presentmentCurrency: 'SGD' },
    variantTypes: [{ _id: 'colour1', name: 'Colour', options: [
        { _id: 'blue1', name: 'Blue', additionalFee: 5, stock: 4 },
    ] }],
}
const params = Promise.resolve({ slug: 'lanbo-pla' })

beforeEach(() => {
    vi.clearAllMocks()
    Product.findOne.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(product) })) })
    Event.find.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) })
})

describe('product server rendering', () => {
    it('renders product title, description and selected-variant discounted price before any effects or browser fetch', () => {
        const html = renderToStaticMarkup(<ProductPage
            initialProduct={publicProductSeed(product)}
            initialGlobalDiscountRules={[{ percentage: 20 }]}
        />)
        expect(html).toContain('<h1>Lanbo PLA Filament</h1>')
        expect(html).toContain(product.description)
        expect(html).toContain('SGD 20.00')
        expect(html).toContain('value="Blue" selected=""')
        expect(html).not.toContain('animate-pulse')
    })

    it('renders metadata, matching schema and visible HTML without calling the website API', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected self fetch'))
        const metadata = await generateMetadata({ params })
        const html = renderToStaticMarkup(await ProductPageLayout({ params }))
        expect(metadata.alternates.canonical).toBe('https://www.fixitoday.com/products/lanbo-pla')
        expect(html).toContain('<h1>Lanbo PLA Filament</h1>')
        expect(html).toContain('"price":"25.00"')
        expect(html).toContain('https://schema.org/InStock')
        expect(fetchSpy).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
    })

    it('returns a true not-found page for an absent product', async () => {
        Product.findOne.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(null) })) })
        expect((await generateMetadata({ params })).robots.index).toBe(false)
        await expect(ProductPageLayout({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('keeps hidden deep links available without indexing, schema or a server-rendered seed', async () => {
        Product.findOne.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue({ ...product, hidden: true }) })) })
        expect((await generateMetadata({ params })).robots.index).toBe(false)
        const html = renderToStaticMarkup(await ProductPageLayout({ params }))
        expect(html).not.toContain('application/ld+json')
        expect(html).not.toContain('<h1>Lanbo PLA Filament</h1>')
    })

    it('keeps a product readable but omits uncertain offer prices when promotions cannot be read', async () => {
        Event.find.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn().mockRejectedValue(new Error('Unavailable')) })) })
        const html = renderToStaticMarkup(await ProductPageLayout({ params }))
        expect(html).toContain('<h1>Lanbo PLA Filament</h1>')
        expect(html).not.toContain('"offers"')
    })
})
