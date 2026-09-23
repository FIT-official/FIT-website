// lib/creatorPage/blocks.js: the server-side contract for creator page
// blocks — defaults, per-type limits, unknown types, id rules, sanitising.
import { describe, it, expect } from 'vitest'
import {
    BLOCK_TYPES,
    DEFAULT_BLOCKS,
    MAX_BLOCKS,
    validateBlocks,
    normalizeTheme,
    makeBlock,
    newBlockId,
    cloneDefaultBlocks,
} from '@/lib/creatorPage/blocks'

const block = (type, settings = {}, id = 'abcdefgh') => ({ id, type, settings })

describe('BLOCK_TYPES / DEFAULT_BLOCKS', () => {
    it('exposes exactly the seven block types', () => {
        expect(BLOCK_TYPES.map((b) => b.type)).toEqual([
            'hero', 'text', 'gallery', 'products', 'printService', 'links', 'contact',
        ])
    })

    it('default blocks are hero, products(all, 24), links, contact(message button) and validate as-is', () => {
        expect(DEFAULT_BLOCKS.map((b) => b.type)).toEqual(['hero', 'products', 'links', 'contact'])
        expect(DEFAULT_BLOCKS[0].settings).toMatchObject({ showBanner: true, showLogo: true })
        expect(DEFAULT_BLOCKS[1].settings).toMatchObject({ mode: 'all', limit: 24 })
        expect(DEFAULT_BLOCKS[3].settings).toMatchObject({ showMessageButton: true })
        const result = validateBlocks(DEFAULT_BLOCKS)
        expect(result.ok).toBe(true)
        expect(result.blocks).toEqual(DEFAULT_BLOCKS)
    })

    it('cloneDefaultBlocks returns an independent copy', () => {
        const copy = cloneDefaultBlocks()
        copy[0].settings.headline = 'changed'
        expect(DEFAULT_BLOCKS[0].settings.headline).toBe('')
    })

    it('makeBlock/newBlockId produce ids that satisfy the validator', () => {
        expect(newBlockId()).toMatch(/^[a-z0-9]{12}$/)
        const b = makeBlock('text', { heading: 'Hi' })
        expect(b.settings).toEqual({ heading: 'Hi', body: '' })
        expect(validateBlocks([b]).ok).toBe(true)
    })
})

describe('validateBlocks', () => {
    it('rejects non-arrays, bad ids, duplicates and unknown types', () => {
        expect(validateBlocks(null).ok).toBe(false)
        expect(validateBlocks([null]).ok).toBe(false)
        expect(validateBlocks([block('text', {}, 'short')]).error).toMatch(/block id/)
        expect(validateBlocks([block('text', {}, 'HAS-UPPER1')]).error).toMatch(/block id/)
        expect(validateBlocks([block('text'), block('text')]).error).toMatch(/duplicate/)
        expect(validateBlocks([block('iframe')]).error).toMatch(/unknown block type: iframe/)
        expect(validateBlocks([{ id: 'abcdefgh', type: 'text', settings: [] }]).error).toMatch(/settings/)
    })

    it('caps the list at 12 blocks', () => {
        const many = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) =>
            block('text', {}, `block${String(i).padStart(4, '0')}`))
        expect(validateBlocks(many).error).toMatch(/at most 12/)
        expect(validateBlocks(many.slice(0, MAX_BLOCKS)).ok).toBe(true)
    })

    it('fills defaults for missing settings and strips unknown keys', () => {
        const { ok, blocks } = validateBlocks([
            { id: 'abcdefgh', type: 'hero' },
            block('contact', { evil: true }, 'abcdefgh1'),
        ])
        expect(ok).toBe(true)
        expect(blocks[0].settings).toEqual({ headline: '', subheadline: '', showBanner: true, showLogo: true })
        expect(blocks[1].settings).toEqual({ heading: '', blurb: '', showMessageButton: true })
    })

    it('sanitises and truncates strings per type', () => {
        const long = 'x'.repeat(3000)
        const { blocks } = validateBlocks([
            block('hero', { headline: `<script>${long}`, subheadline: long }),
            block('text', { heading: long, body: `$$${long}` }, 'abcdefgh1'),
            block('contact', { blurb: long }, 'abcdefgh2'),
        ])
        expect(blocks[0].settings.headline).toHaveLength(80)
        expect(blocks[0].settings.headline.startsWith('script')).toBe(true)
        expect(blocks[0].settings.subheadline).toHaveLength(160)
        expect(blocks[1].settings.heading).toHaveLength(80)
        expect(blocks[1].settings.body).toHaveLength(2000)
        expect(blocks[1].settings.body.includes('$')).toBe(false)
        expect(blocks[2].settings.blurb).toHaveLength(300)
    })

    it('rejects non-string text fields', () => {
        expect(validateBlocks([block('text', { body: 42 })]).ok).toBe(false)
        expect(validateBlocks([block('hero', { headline: {} })]).ok).toBe(false)
    })

    it('gallery: at most 8 safe S3 keys', () => {
        const keys = Array.from({ length: 9 }, (_, i) => `shops/u/gallery-${i}.jpg`)
        expect(validateBlocks([block('gallery', { images: keys })]).error).toMatch(/at most 8/)
        expect(validateBlocks([block('gallery', { images: keys.slice(0, 8) })]).ok).toBe(true)
        expect(validateBlocks([block('gallery', { images: ['shops/u/../x.jpg'] })]).ok).toBe(false)
        expect(validateBlocks([block('gallery', { images: ['https://evil/x.jpg'] })]).ok).toBe(false)
        expect(validateBlocks([block('gallery', { images: 'nope' })]).ok).toBe(false)
        expect(validateBlocks([block('gallery', { images: [''] })]).ok).toBe(false)
    })

    it('products: mode enum and limit 4..24 (default 24)', () => {
        expect(validateBlocks([block('products')]).blocks[0].settings).toEqual({ heading: '', mode: 'all', limit: 24 })
        expect(validateBlocks([block('products', { mode: 'random' })]).ok).toBe(false)
        expect(validateBlocks([block('products', { limit: 3 })]).ok).toBe(false)
        expect(validateBlocks([block('products', { limit: 25 })]).ok).toBe(false)
        expect(validateBlocks([block('products', { limit: 4.5 })]).ok).toBe(false)
        expect(validateBlocks([block('products', { mode: 'featured', limit: '8' })]).blocks[0].settings).toEqual({
            heading: '', mode: 'featured', limit: 8,
        })
    })

    it('booleans only accept real booleans and otherwise fall back', () => {
        const { blocks } = validateBlocks([
            block('hero', { showBanner: 'no', showLogo: false }),
            block('contact', { showMessageButton: 0 }, 'abcdefgh1'),
        ])
        expect(blocks[0].settings.showBanner).toBe(true)
        expect(blocks[0].settings.showLogo).toBe(false)
        expect(blocks[1].settings.showMessageButton).toBe(true)
    })
})

describe('normalizeTheme', () => {
    it('falls back to light/sans for anything unknown', () => {
        expect(normalizeTheme(undefined)).toEqual({ mode: 'light', font: 'sans' })
        expect(normalizeTheme({ mode: 'dark', font: 'mono' })).toEqual({ mode: 'dark', font: 'mono' })
        expect(normalizeTheme({ mode: 'neon', font: 'comic' })).toEqual({ mode: 'light', font: 'sans' })
    })
})
