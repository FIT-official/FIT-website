// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BULK_BANDS, BULK_LADDERS, bulkPricingContext, priceBulkLines } from '@/lib/bulkFilamentConfig'
import { parseBulkInput, prepareBulkLines, saveBulkRequest } from '@/lib/bulkFilament'
import { fixtureCatalogue, fixtureInput, fixtureLine, fixtureRows, memoryStore } from '../fixtures/bulkFilament'
const rows = () => [...fixtureRows().map(row=>({...row,quantity:400})),{product:'FIT PLA',brand:'FIT',material:'PLA',colour:'Marble',barcode:'836',quantity:400}]
const line=(ladder,quantity,extra={})=>({ladder,quantity,brand:'Lanbo',material:BULK_LADDERS[ladder].material,unit:'roll',rollWeightGrams:1000,...extra})
describe('mixed Lanbo 1kg bulk tier eligibility',()=>{
  it.each([9,10,11,19,20,21,49,50,51,99,100,101])('uses the real tier for %i mixed rolls with independent PLA/PETG prices', total=>{
    const idx=BULK_BANDS.findLastIndex(b=>total>=b.min)
    const result=priceBulkLines([line('PLA',1),line('SPECIALTY_PLA',1),line('PETG',total-2)])
    for(const l of result){
      expect(l.tierRolls).toBe(total);expect(l.tierGroupLabel).toBe('Lanbo PLA + PETG')
      expect(l.band).toBe(BULK_BANDS[idx].label);expect(l.unitCents).toBe(BULK_LADDERS[l.ladder].cents[idx])
      expect(l.lineCents).toBe(l.unitCents*l.quantity)
    }
  })
  it('excludes FIT and Bambu quantities from the Lanbo band and keeps their prices distinct',()=>{
    const result=priceBulkLines([line('PLA',4),line('PETG',5),line('SPECIALTY_PLA',100,{brand:'FIT'}),
      {ladder:'BAMBU_LIST',quantity:1000,listUnitCents:2560,brand:'Bambu Lab',unit:'roll',rollWeightGrams:500}])
    expect(result.map(l=>l.tierRolls)).toEqual([9,9,100,0])
    expect(result.map(l=>l.unitCents)).toEqual([1490,1390,1750,2560])
  })
  it.each([{unit:'pack'},{rollWeightGrams:500},{rollWeightGrams:2000},{material:'ABS'},{brand:'Other'}])('rejects a nonqualifying identity instead of awarding a tier: %j', extra=>{
    expect(()=>priceBulkLines([line('PLA',1),line('PETG',9,extra)])).toThrow()
  })
  it('does not trust forged client pricing identity or combined quantities',()=>{
    const catalogue=fixtureCatalogue(rows()),body=fixtureInput(catalogue)
    body.lines=[fixtureLine(catalogue,'Lanbo','PLA','White',4),fixtureLine(catalogue,'Lanbo','PETG','Black',6)]
    body.lines.forEach(l=>Object.assign(l,{brand:'Other',tierRolls:1000000,unitCents:1,rollWeightGrams:500}))
    const result=prepareBulkLines(parseBulkInput(body),catalogue)
    expect(result.find(l=>l.material==='PLA')).toMatchObject({unitCents:1390,lineCents:5560,tierRolls:10,brand:'Lanbo',rollWeightGrams:1000})
    expect(result.find(l=>l.material==='PETG')).toMatchObject({unitCents:1340,lineCents:8040,tierRolls:10})
  })
  it.each([9,10,11,19,20,21,49,50,51,99,100,101])('matches browser calculation and canonical server quote at %i rolls', total=>{
    const catalogue=fixtureCatalogue(rows()),body=fixtureInput(catalogue)
    body.lines=[fixtureLine(catalogue,'Lanbo','PLA','White',total-1),fixtureLine(catalogue,'Lanbo','PETG','Black',1)]
    const frontend=priceBulkLines(body.lines.map(l=>{const p=catalogue.find(p=>p.id===l.productId);const option=p.types[0].options.find(o=>o.id===l.options[0].optionId);return {...l,...bulkPricingContext(p),ladder:option.ladder}}))
    const server=prepareBulkLines(parseBulkInput(body),catalogue)
    for(const l of server)expect(frontend.find(f=>f.productId===l.productId)).toMatchObject({unitCents:l.unitCents,lineCents:l.lineCents,tierRolls:l.tierRolls,band:l.band})
  })
  it('reprices edits/removals while keeping colours as separate lines',()=>{
    const lines=[line('PLA',4,{colour:'Black'}),line('PLA',1,{colour:'White'}),line('PETG',5,{colour:'Red'})]
    expect(priceBulkLines(lines).map(l=>l.unitCents)).toEqual([1390,1390,1340])
    expect(priceBulkLines(lines.slice(0,2)).map(l=>l.unitCents)).toEqual([1490,1490])
    expect(priceBulkLines(lines.map(l=>({...l,quantity:l.quantity+10}))).map(l=>l.band)).toEqual([BULK_BANDS[2].label,BULK_BANDS[2].label,BULK_BANDS[2].label])
    expect(priceBulkLines(lines).map(l=>l.colour)).toEqual(['Black','White','Red'])
  })
  it('keeps previously saved prices and policy when a request is replayed',async()=>{
    const catalogue=fixtureCatalogue(rows()),input=parseBulkInput(fixtureInput(catalogue)),store=memoryStore()
    await saveBulkRequest(store,input,async()=>catalogue)
    const old=store.docs.get(input.clientRequestId);old.lines[0].tierGroupLabel='PLA';old.lines[0].unitCents=1490
    const before=structuredClone(old)
    await saveBulkRequest(store,input,async()=>{throw Error('Must not reprice existing enquiries')})
    expect(store.docs.get(input.clientRequestId)).toEqual(before)
  })
  it('rejects explicit different pack sizes and units in the source rows',()=>{
    expect(fixtureCatalogue(rows().map(r=>({...r,rollWeightGrams:500})))).toEqual([])
    expect(fixtureCatalogue(rows().map(r=>({...r,unit:'box'})))).toEqual([])
  })
})

