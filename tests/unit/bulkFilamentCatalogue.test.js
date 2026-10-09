// @vitest-environment node
import { expect, it, vi } from 'vitest'
import records from '../fixtures/bambuShop.json'
const mock = vi.hoisted(() => ({ shop: vi.fn(), stock: vi.fn() }))
vi.mock('@/lib/seo/shop', () => ({ getShopProducts: mock.shop }))
vi.mock('@/lib/bulkFilamentStock', () => ({ loadBulkStock: mock.stock }))
import { GET } from '@/app/api/bulk-filament/catalogue/route'

it('reads the shop on every catalogue request and exposes refreshed variant stock and price', async () => {
  mock.stock.mockResolvedValue({ items: [], rows: [], source: 'snapshot', checkedAt: '2026-10-09' })
  mock.shop.mockResolvedValueOnce(records)
  const first = await GET(), initial = (await first.json()).products
  expect(first.status).toBe(200)
  expect(initial).toHaveLength(12)
  const next = structuredClone(records)
  next[0].basePrice.presentmentAmount = 23.5
  next[0].variantTypes[0].options[0].stock = 0
  mock.shop.mockResolvedValueOnce(next)
  const refreshed = (await (await GET()).json()).products.find(p => p.id === next[0]._id)
  expect(refreshed.basePrice.presentmentAmount).toBe(23.5)
  expect(refreshed.types[0].options[0].stock).toBe(0)
  expect(refreshed.version).not.toBe(initial.find(p => p.id === next[0]._id).version)
  expect(mock.shop).toHaveBeenCalledTimes(2)
  expect(first.headers.get('cache-control')).toContain('no-store')
})
