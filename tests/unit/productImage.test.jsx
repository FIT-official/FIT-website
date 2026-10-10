import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { productImageSrc } from '@/lib/productImage'
import ProductImage from '@/components/ProductImage'

vi.mock('next/image', () => ({ default: ({ unoptimized, ...props }) => <img {...props} data-unoptimized={String(unoptimized)} /> }))
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_PRODUCT_IMAGE_PATHS', JSON.stringify(['/product-images/part.png', '/product-images/part two.png'])))
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('product image sources', () => {
    it.each([
        'images/1789459046895-zt8j010bzg.jpg',
        '/api/proxy?key=images%2F1789459046895-zt8j010bzg.jpg',
        'https://www.fixitoday.com/api/proxy?key=images%2F1789459046895-zt8j010bzg.jpg',
        'https://fixittoday.s3.amazonaws.com/images/1789459046895-zt8j010bzg.jpg',
    ])('never renders the rejected clock-board photo: %s', src => {
        render(<ProductImage src={src} alt="0.28inch Digital 7 Segment Display" width={400} height={400} />)
        expect(screen.getByRole('img')).toHaveAttribute('src', '/product-images/photo-pending.svg')
    })
    it.each([
        ['images/a b.jpg', '/api/proxy?key=images%2Fa%20b.jpg'],
        ['/product-images/part.png', '/product-images/part.png'],
        ['/product-images/part.png?version=1', '/product-images/part.png?version=1'],
        ['/product-images/part%20two.png', '/product-images/part%20two.png'],
        ['/product-images/copper-stripboard.png', '/product-images/photo-pending.svg'],
        ['/product-images/rain-water-sensor-representative.png?version=1', '/product-images/photo-pending.svg'],
        ['/product-images/bh1750-representative.png', '/product-images/photo-pending.svg'],
        ['/product-images/%invalid.png', '/product-images/photo-pending.svg'],
        ['https://supplier.example/part.jpg', 'https://supplier.example/part.jpg'],
        ['http://supplier.example/part.jpg', 'http://supplier.example/part.jpg'],
        ['', '/product-images/photo-pending.svg'], [undefined, '/product-images/photo-pending.svg'], [null, '/product-images/photo-pending.svg'],
        ['  ', '/product-images/photo-pending.svg'], [' /part.png ', '/part.png'],
        ['/placeholder.jpg', '/product-images/photo-pending.svg'],
        [' /placeholder.jpg?cache=1 ', '/product-images/photo-pending.svg'],
    ])('resolves %s', (input, expected) => expect(productImageSrc(input)).toBe(expected))

    it.each(['copper-stripboard.png', 'rain-water-sensor-representative.png', 'bh1750-representative.png'])('renders the placeholder immediately for missing %s without an error event', file => {
        render(<ProductImage src={`/product-images/${file}`} alt="Part" width={400} height={400} />)
        expect(screen.getByAltText('Part')).toHaveAttribute('src', '/product-images/photo-pending.svg')
        expect(screen.getByAltText('Part')).toHaveAttribute('data-unoptimized', 'true')
        expect(document.querySelector(`img[src*="${file}"]`)).toBeNull()
    })

    it('recovers from a failed image only once and resets for a different source', () => {
        const { rerender } = render(<ProductImage src="/missing.png" alt="Part" width={400} height={400} />)
        const img = screen.getByAltText('Part')
        fireEvent.error(img)
        expect(img).toHaveAttribute('src', '/product-images/photo-pending.svg')
        expect(img).toHaveAttribute('data-unoptimized', 'true')
        fireEvent.error(img)
        expect(img).toHaveAttribute('src', '/product-images/photo-pending.svg')
        rerender(<ProductImage src="/other.png" alt="Part" width={400} height={400} />)
        expect(img).toHaveAttribute('src', '/other.png')
        expect(img).toHaveAttribute('width', '400')
        expect(img).toHaveAttribute('height', '400')
    })

    it('uses absolute supplier URLs without requiring an optimizer host rule', () => {
        render(<ProductImage src="https://supplier.example/part.jpg" alt="Part" width={400} height={400} />)
        expect(screen.getByAltText('Part')).toHaveAttribute('data-unoptimized', 'true')
    })
})
