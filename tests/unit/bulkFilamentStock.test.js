// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { loadBulkStock } from '@/lib/bulkFilamentStock'
import { bulkCatalogue } from '@/lib/bulkFilament'
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
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
