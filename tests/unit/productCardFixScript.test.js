import { describe, expect, it, vi } from 'vitest'
import { executePlan, planChanges, validateManifest } from '@/scripts/apply-product-card-fixes.mjs'

const slug = 'esp32-wroomdevkit-30pin'
const manifest = () => ({ version: 1, createdAtMs: 1791514800000, images: [], prices: [{ slug, currency: 'SGD', amount: 10.3, quoteOnly: true }] })
const product = () => ({ _id: 'product-id', slug, images: ['old.jpg'], basePrice: { presentmentCurrency: 'SGD', presentmentAmount: 8 }, quoteOnly: true, variantTypes: [] })

describe('product card data fixes', () => {
    it('rejects unapproved prices and duplicate slugs', () => {
        const input = manifest()
        input.prices[0].amount = 29.9
        expect(() => validateManifest(input)).toThrow('Unapproved')
        const duplicate = manifest()
        duplicate.prices.push(duplicate.prices[0])
        expect(() => validateManifest(duplicate)).toThrow('duplicate')
    })
    it('never writes or uploads in the default dry-run', async () => {
        const plan = planChanges(manifest(), [product()], new Map())
        const update = vi.fn(), upload = vi.fn()
        await executePlan(plan, { update, upload, log: vi.fn() })
        expect(update).not.toHaveBeenCalled()
        expect(upload).not.toHaveBeenCalled()
        expect(plan[0].after.quoteOnly).toBe(true)
        expect(plan[0].changes).toEqual({ 'basePrice.presentmentAmount': 10.3 })
    })
    it('matches by slug, guards current values and becomes a no-op after applying', async () => {
        const doc = product(), input = manifest()
        const update = vi.fn().mockResolvedValue({ matchedCount: 1 })
        await executePlan(planChanges(input, [doc], new Map()), { apply: true, update, log: vi.fn() })
        expect(update.mock.calls[0][0]).toMatchObject({ slug, quoteOnly: true, basePrice: doc.basePrice })
        doc.basePrice.presentmentAmount = 10.3
        expect(planChanges(input, [doc], new Map())[0].changes).toEqual({})
    })
    it('rejects missing products, nonzero variant fees and changed quote-only state', () => {
        expect(() => planChanges(manifest(), [], new Map())).toThrow('exactly one')
        expect(() => planChanges(manifest(), [{ ...product(), quoteOnly: false }], new Map())).toThrow('remain ON')
        expect(() => planChanges(manifest(), [{ ...product(), variantTypes: [{ options: [{ additionalFee: 2 }] }] }], new Map())).toThrow('Variant price')
    })
    it('leaves UNCERTAIN entries alone and refuses stale image replacements', () => {
        const input = manifest()
        input.images = [{ slug, status: 'UNCERTAIN' }]
        expect(validateManifest(input)).toBe(input)
        expect(planChanges(input, [product()], new Map())[0].changes.images).toBeUndefined()
        input.images = [{ slug, status: 'READY', expectedFirstImage: 'different.jpg' }]
        expect(() => planChanges(input, [product()], new Map([[slug, [{ key: 'images/new.jpg' }]]]))).toThrow('Image changed')
    })
    it('uploads before changing Mongo and stops if a concurrent edit wins', async () => {
        const input = manifest()
        input.images = [{ slug, expectedFirstImage: 'old.jpg' }]
        const file = { key: 'images/new.jpg' }, order = []
        const plan = planChanges(input, [product()], new Map([[slug, [file]]]))
        await expect(executePlan(plan, { apply: true, log: vi.fn(), upload: async () => order.push('upload'), update: async () => { order.push('update'); return { matchedCount: 0 } } })).rejects.toThrow('Concurrent')
        expect(order).toEqual(['upload', 'update'])
        expect(plan[0].filter.images).toEqual(['old.jpg'])
    })
})
