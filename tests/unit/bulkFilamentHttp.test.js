// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ stock: vi.fn(), products: vi.fn(), bambu: vi.fn(), lanbo: vi.fn() }))
vi.mock('@/lib/bulkFilamentStock', () => ({ loadBulkStock: mocks.stock }))
vi.mock('@/lib/seo/shop', () => ({ getShopProducts: mocks.products }))
vi.mock('@/lib/bulkFilamentBambu', () => ({ bambuBulkCatalogue: mocks.bambu }))
vi.mock('@/lib/bulkFilament', async importOriginal => ({ ...await importOriginal(), bulkCatalogue: mocks.lanbo }))
import { bulkFailure } from '@/lib/bulkFilamentHttp'
import { bulkStage } from '@/lib/bulkFilamentDiagnostics'
import { GET } from '@/app/api/bulk-filament/catalogue/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.stock.mockResolvedValue({ items: [], rows: [], source: 'snapshot' })
  mocks.products.mockResolvedValue([])
  mocks.bambu.mockReturnValue([])
  mocks.lanbo.mockReturnValue([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

it('logs unhandled failures on the server and keeps the existing generic public response', async () => {
  const response = bulkFailure(new Error('unexpected dependency failure'))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    error: 'We could not confirm your request. Your entries are kept; retry with the same reference.',
    code: 'service_unavailable',
  })
  expect(console.error).toHaveBeenCalledExactlyOnceWith('bulk-filament failure', {
    name: 'Error', message: 'Bulk request unavailable (details redacted)', stage: 'request',
  })
})

it('logs explicit server errors but does not log expected client errors', () => {
  bulkFailure(Object.assign(new Error('Try again.'), { status: 503, code: 'service_unavailable' }))
  expect(console.error).toHaveBeenCalledOnce()
  console.error.mockClear()
  expect(bulkFailure(Object.assign(new Error('Check quantity.'), { status: 400, code: 'invalid_request' })).status).toBe(400)
  expect(console.error).not.toHaveBeenCalled()
})

it.each([
  '{"private_key":"-----BEGIN PRIVATE KEY-----\\nsynthetic-key\\n-----END PRIVATE KEY-----","client_email":"synthetic@example.invalid"}',
  'mongodb+srv://synthetic-user:synthetic-password@database.invalid/db?token=synthetic-query-token',
  'Bearer synthetic-bearer-token',
  'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJzeW50aGV0aWMifQ.synthetic-signature',
  'token=synthetic-token api_key=synthetic-api-key password=synthetic-password',
  'Unexpected token in JSON at position 17: synthetic-secret-fragment',
])('does not print dependency secrets: case %#', message => {
  const error = Object.assign(new Error(message), { name: message, stage: message })
  bulkFailure(error)
  expect(console.error).toHaveBeenCalledExactlyOnceWith('bulk-filament failure', {
    name: 'Error', message: 'Bulk request unavailable (details redacted)', stage: 'request',
  })
})

it.each([
  ['stock', 'inventory', 'Inventory unavailable (details redacted)'],
  ['products', 'shop-products', 'Shop products unavailable (details redacted)'],
  ['bambu', 'bambu-mapping', 'Bambu catalogue unavailable (details redacted)'],
  ['lanbo', 'lanbo-mapping', 'Lanbo catalogue unavailable (details redacted)'],
])('attributes %s failures through the real HTTP route', async (dependency, stage, message) => {
  mocks[dependency].mockImplementation(() => { throw new TypeError('synthetic-secret-fragment') })
  const response = await GET()
  expect(response.status).toBe(503)
  expect(console.error).toHaveBeenCalledExactlyOnceWith('bulk-filament failure', { name: 'TypeError', message, stage })
  expect(JSON.stringify(await response.json())).not.toContain('synthetic-secret-fragment')
})

it('preserves safe actionable mapper messages in the server log', async () => {
  mocks.bambu.mockImplementation(() => { throw new Error('Bambu catalogue needs current variant prices') })
  expect((await GET()).status).toBe(503)
  expect(console.error).toHaveBeenCalledExactlyOnceWith('bulk-filament failure', {
    name: 'Error', message: 'Bambu catalogue needs current variant prices', stage: 'bambu-mapping',
  })
})

it('retains the inner inventory stage when the catalogue wraps a stock failure', async () => {
  const failure = await bulkStage('inventory-parse', () => { throw new Error('Conflicting inventory identities: Lanbo:PLA:312') })
    .catch(error => error)
  mocks.stock.mockRejectedValue(failure)
  expect((await GET()).status).toBe(503)
  expect(console.error).toHaveBeenCalledExactlyOnceWith('bulk-filament failure', {
    name: 'Error', message: 'Conflicting inventory identities: Lanbo:PLA:312', stage: 'inventory-parse',
  })
})

it('does not coerce or serialize objects supplied as error messages', () => {
  const message = { secret: 'synthetic-secret-token', toString: vi.fn(() => 'Conflicting inventory identities: Lanbo:PLA:312') }
  bulkFailure(Object.assign(new Error(), { message }))
  expect(message.toString).not.toHaveBeenCalled()
  expect(console.error).toHaveBeenCalledExactlyOnceWith('bulk-filament failure', {
    name: 'Error', message: 'Bulk request unavailable (details redacted)', stage: 'request',
  })
})
