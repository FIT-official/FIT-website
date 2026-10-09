import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { productImageSrc } from '@/lib/productImage'
import ProductImage from '@/components/ProductImage'

vi.mock('next/image', () => ({ default: ({ unoptimized, ...props }) => <img {...props} data-unoptimized={String(unoptimized)} /> }))
afterEach(cleanup)

describe('product image sources', () => {
    it.each([
        ['images/a b.jpg', '/api/proxy?key=images%2Fa%20b.jpg'],
        ['/product-images/part.png', '/product-images/part.png'],
        ['https://supplier.example/part.jpg', 'https://supplier.example/part.jpg'],
        ['http://supplier.example/part.jpg', 'http://supplier.example/part.jpg'],
        ['', '/product-images/photo-pending.svg'], [undefined, '/product-images/photo-pending.svg'], [null, '/product-images/photo-pending.svg'],
        ['  ', '/product-images/photo-pending.svg'], [' /part.png ', '/part.png'],
        ['/placeholder.jpg', '/product-images/photo-pending.svg'],
        [' /placeholder.jpg?cache=1 ', '/product-images/photo-pending.svg'],
    ])('resolves %s', (input, expected) => expect(productImageSrc(input)).toBe(expected))

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
