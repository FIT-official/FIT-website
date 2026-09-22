import { describe, expect, it } from 'vitest'
import { editableProduct, productForViewer } from '@/lib/productAccess'

describe('catalogue ownership and public data', () => {
  const product = { creatorUserId: 'owner', name: 'Vase', sales: [{ userId: 'buyer', price: 20 }], paidAssets: ['private.stl'], likes: ['buyer', 'viewer'] }
  it('drops internal fields supplied by a browser', () => {
    expect(editableProduct({ ...product, flaggedForModeration: false, listing: 'fit', downloads: 999 })).toEqual({ name: 'Vase', paidAssets: ['private.stl'] })
  })
  it('redacts other buyers and private asset keys for public viewers', () => {
    const result = productForViewer(product, 'viewer')
    expect(result).not.toHaveProperty('sales')
    expect(result.paidAssets).toEqual([])
    expect(result.hasPaidAssets).toBe(true)
    expect(result.likes).toEqual(['viewer'])
    expect(productForViewer(product, null).likes).toEqual([])
  })
  it('hides unpublished/moderated products from nonowners', () => {
    expect(productForViewer({ ...product, hidden: true }, 'other')).toBeNull()
    expect(productForViewer({ ...product, flaggedForModeration: true }, null)).toBeNull()
    expect(productForViewer({ ...product, hidden: true }, 'owner').sales).toEqual(product.sales)
    expect(productForViewer(product, 'admin', true).paidAssets).toEqual(['private.stl'])
  })
})
