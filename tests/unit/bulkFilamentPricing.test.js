// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseBulkInput, prepareBulkLines, saveBulkRequest } from '@/lib/bulkFilament'
import { bulkTier, priceBulkLines } from '@/lib/bulkFilamentConfig'
import { fixtureRows, fixtureCatalogue, fixtureInput, fixtureLine, memoryStore } from '../fixtures/bulkFilament'
const priced = (lines, rows = fixtureRows()) => {
  const c = fixtureCatalogue(rows), body = fixtureInput(c)
  body.lines = lines.map(([material, colour, quantity]) => fixtureLine(c, 'Lanbo', material, colour, quantity))
  return prepareBulkLines(parseBulkInput(body), c)
}
describe('bulk filament pricing', () => {
  it.each([[9,1490],[10,1390],[19,1390],[20,1330],[49,1330],[50,1290],[99,1290],[100,1250]])('prices %s PLA rolls at %s cents per roll', (quantity, unitCents) => {
    expect(priceBulkLines([{ ladder: 'PLA', quantity }])[0]).toMatchObject({ unitCents, lineCents: unitCents * quantity })
  })
  it.each([[10,1340],[20,1280],[50,1240],[100,1200]])('uses the PETG ladder for %s rolls', (quantity, unitCents) => {
    expect(bulkTier('PETG', quantity).unitCents).toBe(unitCents)
  })
  it('does not admit Lanbo silk without an approved Sheet material', () => {
    expect(fixtureCatalogue([{product:'Lanbo Silk',brand:'Lanbo',material:'Silk',colour:'Black',barcode:'1',quantity:10}])).toEqual([])
  })
  it.each(['Bambu', 'Other'])('excludes unsupported brand %s regardless of discounts or quantity', brand => {
    expect(fixtureCatalogue(fixtureRows().map(row => ({...row,brand,discount:{percentage:99},quantity:100})))).toEqual([])
  })
  it('prices Marble and Wood on their own ladder instead of excluding them from tiers', () => {
    const lines=priced([['PLA','Marble',4],['PLA','Wood Colour',6]])
    expect(lines.map(l=>l.unitCents)).toEqual([1890,1890])
  })
  it('does not infer eligibility from descriptions or a conflicting product identity', () => {
    expect(fixtureCatalogue(fixtureRows().map(row=>({...row,product:'Bambu PLA',description:'Lanbo compatible'})))).toEqual([])
  })
  it('ignores stored percentage discounts and never stacks them', () => {
    const rows=fixtureRows().map(row=>({...row,discount:{percentage:99},discounts:[{percentage:70}]}))
    expect(priced([['PLA','Black',10]],rows)[0].unitCents).toBe(1390)
    expect(priced([['PLA','Black',9]],rows)[0].unitCents).toBe(1490)
  })
  it('uses exact ladder cents without catalogue prices or option fees', () => {
    const rows=fixtureRows().map(row=>({...row,price:7.45,additionalFee:4}))
    expect(priced([['PLA','Black',10]],rows)[0]).toMatchObject({unitCents:1390,lineCents:13900})
  })
  it('pools PLA colours and specialties, keeps PETG separate and excludes unsupported brands', () => {
    const lines=priced([['PLA','Black',4],['PLA','White',6],['PETG','Black',9]])
    expect(lines.filter(l=>l.material==='PLA').map(l=>l.unitCents)).toEqual([1390,1390])
    expect(lines.find(l=>l.material==='PETG').unitCents).toBe(1390)
    expect(priced([['PETG','Black',10]])[0].unitCents).toBe(1340)
  })
  it('counts split lines once each while retaining the shared enquiry limit', () => {
    expect(priced([['PLA','Black',5],['PLA','Black',5]]).map(l=>l.lineCents)).toEqual([6950,6950])
    expect(()=>priced([['PLA','Black',5],['PLA','Black',30]])).toThrow('1 to 4')
  })
  it('rejects invalid and excessive quantities instead of creating unquoted lines', () => {
    for(const q of ['',0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER]) expect(()=>priced([['PLA','Black',q]])).toThrow()
  })
  it('uses SGD only and rejects an unknown material instead of mixing unquoted currencies', () => {
    expect(priced([['PLA','Black',2]])[0].currency).toBe('SGD')
    expect(()=>bulkTier('UNKNOWN',10)).toThrow('Invalid tier')
  })
  it('rejects changed Sheet stock and strips forged discounts and category quantities', () => {
    const c=fixtureCatalogue(),body=fixtureInput(c)
    body.lines[0]={...body.lines[0],quantity:10,discountPercentage:100,categoryQuantity:1000,lineCents:0}
    expect(prepareBulkLines(parseBulkInput(body),c)[0].lineCents).toBe(13900)
    const rows=fixtureRows();rows[0].quantity=13
    expect(()=>prepareBulkLines(parseBulkInput(body),fixtureCatalogue(rows))).toThrow('changed')
  })
  it('versions the approved catalogue and preserves saved prices when stock changes', async () => {
    const c=fixtureCatalogue(),body=fixtureInput(c),store=memoryStore()
    body.lines=[fixtureLine(c,'Lanbo','PLA','Black',4),fixtureLine(c,'Lanbo','PLA','White',6)]
    const input=parseBulkInput(body),first=await saveBulkRequest(store,input,async()=>c)
    expect(store.docs.get(input.clientRequestId)).toMatchObject({totalCents:13900})
    expect(store.docs.get(input.clientRequestId).lines.map(l=>l.tierRolls)).toEqual([10,10])
    const rows=fixtureRows();rows[0].quantity=0
    expect(fixtureCatalogue(rows)[0].version).not.toBe(c[0].version)
    expect((await saveBulkRequest(store,input,async()=>fixtureCatalogue(rows))).receipt).toEqual(first.receipt)
  })
})
