// @vitest-environment node
import { readFileSync, statSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import nextConfig from '../../next.config.mjs'
import { publicProductImages } from '@/lib/publicProductImages.mjs'
import { productImageSrc, PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/productImage'

afterEach(() => vi.unstubAllEnvs())

it('ships a build-time image list backed by real public assets and an SVG placeholder', () => {
    const manifest = JSON.parse(nextConfig.env.NEXT_PUBLIC_PRODUCT_IMAGE_PATHS)
    expect(manifest).toEqual(publicProductImages())
    expect(manifest).toContain(PRODUCT_IMAGE_PLACEHOLDER)
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_IMAGE_PATHS', nextConfig.env.NEXT_PUBLIC_PRODUCT_IMAGE_PATHS)
    for (const path of manifest) {
        expect(statSync(new URL(`../../public${path}`, import.meta.url)).isFile()).toBe(true)
        expect(productImageSrc(path)).toBe(path)
    }
    for (const file of ['copper-stripboard.png', 'rain-water-sensor-representative.png', 'bh1750-representative.png']) {
        expect(manifest).not.toContain(`/product-images/${file}`)
        expect(productImageSrc(`/product-images/${file}`)).toBe(PRODUCT_IMAGE_PLACEHOLDER)
    }
    const placeholder = readFileSync(new URL(`../../public${PRODUCT_IMAGE_PLACEHOLDER}`, import.meta.url), 'utf8')
    expect(placeholder).toContain('<svg')
    expect(placeholder).toContain('Photo coming soon')
    expect(placeholder).not.toMatch(/<image|https?:\/\/(?!www.w3.org)/)
})
