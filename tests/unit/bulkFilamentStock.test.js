// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { loadBulkStock } from '@/lib/bulkFilamentStock'
import { bulkCatalogue } from '@/lib/bulkFilament'
import { bulkFailure } from '@/lib/bulkFilamentHttp'
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('uses the dated Sheet snapshot when the service account is absent',async()=>{
  vi.stubEnv('FIT_INVENTORY_SERVICE_ACCOUNT_JSON','');vi.stubGlobal('fetch',vi.fn())
  const stock=await loadBulkStock(),products=bulkCatalogue(stock)
  expect(stock.source).toBe('snapshot');expect(stock.checkedAt).toBe('2026-10-09')
  expect(products.find(p=>p.brand==='FIT').types[0].options.map(o=>[o.name,o.stock])).toEqual([['Grey Marble',20],['Marble',15],['Beige Marble',10]])
  expect(stock.items.find(i=>i.brand==='Lanbo'&&i.colour==='Marble').available).toBe(7)
  expect(stock.items.find(i=>i.material==='PETG'&&i.colour==='Black').available).toBe(12)
  expect(fetch).not.toHaveBeenCalled()
})
function credentials() {
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048})
  vi.stubEnv('FIT_INVENTORY_SERVICE_ACCOUNT_JSON',JSON.stringify({client_email:'synthetic@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'}))
}
it('reads live quantities without using Sheet selling prices or caching stale stock',async()=>{
  credentials();const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({access_token:'synthetic'})})
    .mockResolvedValueOnce({ok:true,json:async()=>({values:[['Lanbo PLA','PLA','Lanbo','Black',3,0.01,'312']]})})
  vi.stubGlobal('fetch',fetcher)
  const stock=await loadBulkStock();expect(stock.source).toBe('sheet');expect(stock.items[0].available).toBe(3)
  expect(fetcher.mock.calls[1][0]).toContain('valueRenderOption=UNFORMATTED_VALUE')
  expect(fetcher.mock.calls[1][1].cache).toBe('no-store');expect(stock.items[0]).not.toHaveProperty('price')
})
it('fails closed on configured live access failure',async()=>{
  credentials();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}))
  await expect(loadBulkStock()).rejects.toThrow('unavailable')
})
it('rejects a credential token endpoint override before making a request',async()=>{
  vi.stubEnv('FIT_INVENTORY_SERVICE_ACCOUNT_JSON',JSON.stringify({client_email:'synthetic',private_key:'synthetic',token_uri:'https://invalid.test'}))
  vi.stubGlobal('fetch',vi.fn());await expect(loadBulkStock()).rejects.toThrow('Incomplete');expect(fetch).not.toHaveBeenCalled()
})

async function stockDiagnostic() {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const error = await loadBulkStock().then(() => { throw new Error('Expected inventory failure') }, error => error)
  const response = bulkFailure(error)
  expect(response.status).toBe(503)
  expect((await response.json()).code).toBe('service_unavailable')
  expect(log).toHaveBeenCalledOnce()
  expect(log.mock.calls[0][0]).toBe('bulk-filament failure')
  return log.mock.calls[0][1]
}

it('identifies malformed service-account JSON without logging its contents', async () => {
  vi.stubEnv('FIT_INVENTORY_SERVICE_ACCOUNT_JSON', '{"private_key":"synthetic-secret-fragment"')
  vi.stubGlobal('fetch', vi.fn())
  expect(await stockDiagnostic()).toEqual({ name: 'SyntaxError', stage: 'inventory-credentials',
    message: 'Inventory credentials unavailable (details redacted)' })
  expect(fetch).not.toHaveBeenCalled()
})

it('identifies invalid signing keys as credential failures before network access', async () => {
  vi.stubEnv('FIT_INVENTORY_SERVICE_ACCOUNT_JSON', JSON.stringify({ client_email: 'synthetic@example.invalid',
    private_key: 'synthetic-private-key', token_uri: 'https://oauth2.googleapis.com/token' }))
  vi.stubGlobal('fetch', vi.fn())
  expect(await stockDiagnostic()).toEqual({ name: 'Error', stage: 'inventory-credentials',
    message: 'Inventory credentials unavailable (details redacted)' })
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['rejected', 'missing-token', 'network', 'invalid-json'])('identifies %s authentication failures without falling back to snapshot', async kind => {
  credentials()
  const fetcher = vi.fn()
  if (kind === 'network') fetcher.mockRejectedValue(new TypeError('Bearer synthetic-secret-token'))
  else fetcher.mockResolvedValue({ ok: kind !== 'rejected', status: 401, json: async () => {
    if (kind === 'invalid-json') throw new SyntaxError('synthetic-secret-fragment')
    return {}
  } })
  vi.stubGlobal('fetch', fetcher)
  const diagnostic = await stockDiagnostic()
  expect(diagnostic.stage).toBe('inventory-authentication')
  expect(diagnostic.message).toBe(`Inventory authentication unavailable${kind === 'rejected' ? ' (HTTP 401)' : ['network', 'invalid-json'].includes(kind) ? ' (details redacted)' : ''}`)
  expect(JSON.stringify(diagnostic)).not.toContain('synthetic')
  expect(fetcher).toHaveBeenCalledOnce()
})

it.each(['rejected', 'missing-values', 'network', 'invalid-json'])('identifies %s Sheet failures without falling back to snapshot', async kind => {
  credentials()
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'synthetic-token' }) })
  if (kind === 'network') fetcher.mockRejectedValueOnce(new TypeError('token=synthetic-secret-token'))
  else fetcher.mockResolvedValueOnce({ ok: kind !== 'rejected', status: 403, json: async () => {
    if (kind === 'invalid-json') throw new SyntaxError('synthetic-secret-fragment')
    return {}
  } })
  vi.stubGlobal('fetch', fetcher)
  const diagnostic = await stockDiagnostic()
  expect(diagnostic.stage).toBe('inventory-sheet')
  expect(diagnostic.message).toBe(`Inventory Sheet unavailable${kind === 'rejected' ? ' (HTTP 403)' : ['network', 'invalid-json'].includes(kind) ? ' (details redacted)' : ''}`)
  expect(JSON.stringify(diagnostic)).not.toContain('synthetic')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('identifies the conflicting Sheet barcode while retaining fail-closed parsing', async () => {
  credentials()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'synthetic-token' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ values: [
      ['Lanbo PLA', 'PLA', 'Lanbo', 'Black', 3, 0, '312'],
      ['Lanbo PLA', 'PLA', 'Lanbo', 'White', 4, 0, '312'],
    ] }) }))
  expect(await stockDiagnostic()).toEqual({ name: 'Error', stage: 'inventory-parse',
    message: 'Conflicting inventory identities: Lanbo:PLA:312' })
})
