/* eslint-disable @next/next/no-img-element -- Native img is the mocked Next image boundary. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import evidence from '@/lib/bulkFilamentPreviews.json'
import { productColourPhoto } from '@/lib/productColourPhoto'
import { PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/productImage'
import ProductCard from '@/components/ProductCard'

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isLoaded: true, isSignedIn: false }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/image', () => ({ default: ({ unoptimized, priority, alt, ...props }) => <img alt={alt} {...props} /> }))
const photos = evidence.entries.filter(e => e.preview.status === 'verified_official_variant_photo')
function fixture(entry) {
    return { _id: entry.productId, slug: entry.slug, name: 'Synthetic filament', productType: 'shop', listing: 'fit',
        basePrice: { presentmentAmount: 100, presentmentCurrency: 'SGD' }, infiniteStock: true,
        images: ['/unreviewed-original.jpg'], likeCount: 0, salesCount: 0,
        delivery: { deliveryTypes: [{ type: 'standard-shipping' }, { type: 'pick-up' }] },
        variantTypes: [{ _id: entry.colourTypeId, name: 'Colour', options: [
            { _id: entry.optionId, name: entry.originalName, additionalFee: 0 },
        ] }, { _id: 'pack', name: 'Spool', options: [{ _id: 'refill', name: 'Without Spool', additionalFee: 0 }, { _id: 'spool', name: 'With Spool', additionalFee: 4 }] }] }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(photos)('uses the exact reviewed printed sample for $slug / $originalName', entry => {
    const product = fixture(entry), before = JSON.stringify(product)
    const photo = productColourPhoto(product, { Colour: entry.originalName, Spool: 'Without Spool' })
    expect(photo.src).toBe(entry.preview.src)
    expect(photo.caption).toContain('Printed colour sample:')
    expect(photo.caption).toContain('Spool or refill packaging follows your selection')
    expect(photo.sourceUrl).toBe(entry.photoEvidence.sourceUrl)
    const bytes = fs.readFileSync('public' + photo.src)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.photoEvidence.servedSha256)
    expect(JSON.stringify(product)).toBe(before)
})

it('fails closed for an unreviewed selected colour and changed type or option identity', () => {
    const entry = photos[0], p = fixture(entry)
    expect(productColourPhoto(p, { Colour: 'Other colour' }).src).toBe(PRODUCT_IMAGE_PLACEHOLDER)
    p.variantTypes[0].options[0]._id = 'different-option'
    expect(productColourPhoto(p, { Colour: entry.originalName }).src).toBe(PRODUCT_IMAGE_PLACEHOLDER)
    p.variantTypes[0]._id = 'different-type'
    expect(productColourPhoto(p, { Colour: entry.originalName }).src).toBe(PRODUCT_IMAGE_PLACEHOLDER)
})
it('does not apply a sample to a different product or material slug', () => {
    const entry = photos[0], p = fixture(entry)
    expect(productColourPhoto({ ...p, _id: 'unreviewed' }, { Colour: entry.originalName })).toBeNull()
    expect(productColourPhoto({ ...p, slug: 'other-material' }, { Colour: entry.originalName })).toBeNull()
    expect(productColourPhoto(null)).toBeNull()
})
it('updates the actual card photo on selection and preserves the exact selected cart payload', async () => {
    const entries = photos.filter(e => e.preview.material === 'PLA Basic').slice(0, 2)
    expect(entries).toHaveLength(2)
    const p = fixture(entries[0]); p.variantTypes[0].options.push({ _id: entries[1].optionId, name: entries[1].originalName, additionalFee: 0 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }))
    render(<ProductCard product={p} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', entries[0].preview.src)
    fireEvent.change(screen.getByLabelText('Synthetic filament Colour'), { target: { value: entries[1].originalName } })
    expect(screen.getByRole('img')).toHaveAttribute('src', entries[1].preview.src)
    expect(screen.getByTestId('product-colour-caption')).toHaveTextContent(entries[1].preview.label)
    fireEvent.change(screen.getByLabelText('Synthetic filament Spool'), { target: { value: 'With Spool' } })
    expect(screen.getByRole('img')).toHaveAttribute('src', entries[1].preview.src)
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added to cart')
    const call = global.fetch.mock.calls.find(([url, options]) => url === '/api/user/cart' && options.method === 'POST')
    expect(JSON.parse(call[1].body).cartItem).toMatchObject({ productId: p._id, quantity: 1, chosenDeliveryType: 'standard-shipping', selectedVariants: { Colour: entries[1].originalName, Spool: 'With Spool' } })
})
