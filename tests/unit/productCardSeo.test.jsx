import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

const session = vi.hoisted(() => ({ user: { id: 'user_customer' }, isLoaded: true, isSignedIn: true }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => session }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/Product', () => ({ default: { find: vi.fn() } }))

import ProductCard from '@/components/ProductCard'
import Product from '@/models/Product'
import { getShopProducts } from '@/lib/seo/shop'

const publicProduct = {
    _id: '000000000000000000000001', slug: 'lanbo-pla', name: 'Lanbo PLA',
    images: [], basePrice: { presentmentAmount: 20, presentmentCurrency: 'SGD' },
    likeCount: 3, salesCount: 7,
}

beforeEach(() => {
    session.user = { id: 'user_customer' }
    session.isLoaded = true
    session.isSignedIn = true
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ product: { creatorUserId: 'user_seller', likes: ['user_customer', 'user_other'] } }),
    }))
})
afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe('server-rendered shop cards', () => {
    it('keeps links and sold counts in initial HTML while withholding unresolved user controls', () => {
        const html = renderToStaticMarkup(<ProductCard product={publicProduct} />)
        expect(html).toContain('href="/products/lanbo-pla"')
        expect(html).toContain('7 sold')
        expect(html).not.toContain('aria-label="Like"')
        expect(html).not.toContain('aria-label="Unlike"')
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('restores this viewer’s saved like and the current public count after browser enrichment', async () => {
        render(<ProductCard product={publicProduct} />)
        const button = await screen.findByRole('button', { name: 'Unlike' })
        expect(button).toHaveAttribute('title', '2 likes')
        const url = new URL(global.fetch.mock.calls[0][0], 'https://www.fixitoday.com')
        expect(url.searchParams.get('productId')).toBe(publicProduct._id)
        expect(url.searchParams.get('fields')).toBe('likes,creatorUserId')
    })

    it('keeps a creator’s own like control hidden after resolving ownership', async () => {
        session.user = { id: 'user_seller' }
        await act(async () => { render(<ProductCard product={publicProduct} />) })
        expect(global.fetch).toHaveBeenCalledOnce()
        expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Unlike' })).toBeNull()
    })

    it('does not fetch private relationship data for anonymous visitors', () => {
        session.user = null
        session.isSignedIn = false
        render(<ProductCard product={publicProduct} />)
        expect(global.fetch).not.toHaveBeenCalled()
        expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
    })

    it('preserves existing callers that already supply their relationship data', () => {
        render(<ProductCard product={{ ...publicProduct, likes: ['user_customer'], creatorUserId: 'user_seller' }} />)
        expect(screen.getByRole('button', { name: 'Unlike' })).toBeInTheDocument()
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('updates the count from a successful like response', async () => {
        render(<ProductCard product={publicProduct} />)
        const button = await screen.findByRole('button', { name: 'Unlike' })
        global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ liked: false, likeCount: 1 }) })
        fireEvent.click(button)
        expect(await screen.findByRole('button', { name: 'Like' })).toHaveAttribute('title', '1 like')
    })
})

describe('shop data privacy', () => {
    it('serializes public counts without sending customer ID or sales arrays in the HTML seed', async () => {
        const select = vi.fn(() => ({ lean: async () => [{
            ...publicProduct,
            sales: [{ _id: 'sale_private' }, { _id: 'sale_other' }],
            likes: ['user_private', 'user_other', 'user_another'],
        }] }))
        Product.find.mockReturnValue({ select })
        const products = await getShopProducts()
        expect(products[0].likeCount).toBe(3)
        expect(products[0].salesCount).toBe(2)
        expect(products[0]).not.toHaveProperty('likes')
        expect(products[0]).not.toHaveProperty('sales')
        expect(JSON.stringify(products)).not.toMatch(/user_private|sale_private/)
        expect(select.mock.calls[0][0]).not.toMatch(/creatorUserId|paidAssets|sales\.userId/)
    })
})
