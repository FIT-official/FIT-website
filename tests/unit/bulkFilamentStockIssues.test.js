// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import evidence from '../fixtures/bambuStock-2026-10-09.json'
const mocks = vi.hoisted(() => ({ stock: vi.fn(), products: vi.fn() }))
vi.mock('@/lib/bulkFilamentStock', () => ({ loadBulkStock: mocks.stock }))
vi.mock('@/lib/seo/shop', () => ({ getShopProducts: mocks.products }))
import { loadBulkCatalogue } from '@/lib/bulkFilamentHttp'

afterEach(() => vi.restoreAllMocks())
it('logs stockIssues on the server without publishing Sheet rows or issues in the catalogue', async () => {
  const rows = structuredClone(evidence.rows)
  rows.push({ ...rows.find(r => r.product === 'ASA Gray 45102') })
  mocks.stock.mockResolvedValue({ rows, items: [], source: 'sheet' })
  mocks.products.mockResolvedValue(evidence.products)
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const products = await loadBulkCatalogue()
  expect(warning).toHaveBeenCalledOnce()
  const { stockIssues } = warning.mock.calls[0][1]
  expect(stockIssues).toContainEqual(expect.objectContaining({ colourCode: '45102', kind: 'duplicate_sheet_identity', rowCount: 2 }))
  for (const issue of stockIssues) expect(Object.keys(issue).sort()).toEqual(['colourCode', 'kind', 'productId', 'rowCount', 'spool'])
  for (const p of products) {
    expect(p).not.toHaveProperty('stockIssues')
    expect(p).not.toHaveProperty('rows')
  }
})
