// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { bulkCatalogue, parseBulkInput, prepareBulkLines, saveBulkRequest } from '@/lib/bulkFilament'
import { bulkDiscountEligible, bulkPricingQuantities, bulkSelection, bulkEstimateSummary } from '@/lib/bulkFilamentPricing'
import { fixtureInput, fixtureProduct } from '../fixtures/bulkFilament'
const lanbo = (slug = '1kg-pla-3d-printing-filament-lanbo', amount=14.9) => ({ ...fixtureProduct(), name: slug, slug, basePrice:{presentmentAmount:amount,presentmentCurrency:'SGD'} })
const selection = p => Object.fromEntries(p.types.map(t => [t.id,t.options[0].id]))
const estimate = (raw, quantity, categoryQuantity=quantity) => { const p=bulkCatalogue([raw])[0];return bulkSelection(p,selection(p),quantity,categoryQuantity).estimate }
const totalLine = (p,quantity,colour=0) => ({productId:p.id,version:p.version,options:p.types.map(t=>({typeId:t.id,optionId:t.options[t.id===p.colourTypeId?colour:0].id})),quantity,remarks:''})
describe('approved equivalent bulk pricing',()=>{
  it.each([[9,14.9],[10,13.9],[19,13.9],[20,13.3],[49,13.3],[50,12.9],[99,12.9],[100,12.5]])('prices %s PLA rolls at %s per roll', (quantity,price)=>{
    const e=estimate(lanbo(),quantity)
    expect(e.estimatedUnitPrice.amount).toBe(price)
    expect(e.estimatedLineTotal.amount).toBe(Math.round(price*100)*quantity/100)
    expect(e.publicUnitPrice.amount).toBe(14.9)
  })
  it.each([[10,12.97],[20,12.41],[50,12.03],[100,11.66]])('uses the equivalent rational discount for %s PETG rolls', (quantity,price)=>{
    expect(estimate(lanbo('1kg-petg-3d-printing-filament-lanbo',13.9),quantity).estimatedUnitPrice.amount).toBe(price)
  })
  it('supports Lanbo silk at its own canonical price',()=>{
    const e=estimate(lanbo('synthetic-lanbo-pla-silk-filament',23),10)
    expect(e.estimatedUnitPrice.amount).toBe(21.46)
    expect(e.appliedTier.category).toBe('Lanbo silk')
  })
  it.each(['bambu-lab-3d-printing-filament-1kg-pla-silk','bambu-lab-3d-printing-filament-1kg-pla-basic','1kg-wood-pla-3d-printing-filament-lanbo','1kg-marble-pla-3d-printing-filament-lanbo','fit-pla-filament'])('never discounts %s, even with stored discounts and large quantities',slug=>{
    const raw={...fixtureProduct(),name:slug,slug,discount:{percentage:99}}
    expect(bulkDiscountEligible(raw)).toBe(false)
    expect(estimate(raw,100).estimatedLineTotal.amount).toBe(1000)
  })
  it('does not infer eligibility from descriptions or a conflicting Bambu label',()=>{
    const raw=lanbo();raw.name='Bambu Lab PLA';raw.description='Lanbo silk compatible'
    expect(estimate(raw,100).estimatedUnitPrice.amount).toBe(14.9)
  })
  it('ignores all stored percentage discounts and never stacks them',()=>{
    const raw=lanbo();raw.discount={percentage:99};raw.discounts=[{percentage:70}]
    expect(estimate(raw,10).estimatedUnitPrice.amount).toBe(13.9)
    expect(estimate(raw,9).estimatedUnitPrice.amount).toBe(14.9)
  })
  it('includes canonical option fees before exact rational rounding once per unit',()=>{
    const raw=lanbo();raw.variantTypes[1].options[0].additionalFee=4
    expect(estimate(raw,10)).toMatchObject({publicUnitPrice:{amount:18.9},estimatedUnitPrice:{amount:17.63},estimatedLineTotal:{amount:176.3},discountAmount:{amount:12.7}})
    expect(estimate(lanbo(undefined,7.45),10).estimatedUnitPrice.amount).toBe(6.95)
  })
  it('pools colours only within separate eligible categories and excludes Bambu',()=>{
    const pla=lanbo(),petg=lanbo('1kg-petg-3d-printing-filament-lanbo',13.9),bambu=lanbo('bambu-lab-3d-printing-filament-1kg-pla-silk',29)
    petg._id='888888888888888888888888';bambu._id='999999999999999999999999'
    const c=bulkCatalogue([pla,petg,bambu]),p=c.find(x=>x.id===pla._id),g=c.find(x=>x.id===petg._id),b=c.find(x=>x.id===bambu._id)
    const body=fixtureInput(c);body.lines=[totalLine(p,4),totalLine(p,6,1),totalLine(g,9),totalLine(b,20)]
    const quantities=bulkPricingQuantities(body.lines,c)
    expect([...quantities]).toEqual([['Lanbo PLA',10],['Lanbo PETG',9]])
    const rows=prepareBulkLines(parseBulkInput(body),c)
    expect(rows.filter(r=>r.productId===p.id).map(r=>r.estimatedUnitPrice.amount)).toEqual([13.9,13.9])
    expect(rows.find(r=>r.productId===g.id).estimatedUnitPrice.amount).toBe(13.9)
    expect(rows.find(r=>r.productId===b.id).estimatedUnitPrice.amount).toBe(29)
    body.lines.find(r=>r.productId===g.id).quantity=10
    expect(prepareBulkLines(parseBulkInput(body),c).find(r=>r.productId===g.id).estimatedUnitPrice.amount).toBe(12.97)
  })
  it('counts split lines once each while retaining stock limits',()=>{
    const c=bulkCatalogue([lanbo()]),body=fixtureInput(c);body.lines=[totalLine(c[0],5),totalLine(c[0],5)]
    expect(prepareBulkLines(parseBulkInput(body),c).map(r=>r.estimatedLineTotal.amount)).toEqual([69.5,69.5])
    body.lines[1].quantity=21
    expect(()=>prepareBulkLines(parseBulkInput(body),c)).toThrow('availability')
  })
  it('keeps invalid quantities, unknown prices and money overflow unquoted',()=>{
    const p=bulkCatalogue([lanbo()])[0]
    for(const q of ['',0,-1,1.5,Infinity])expect(bulkSelection(p,selection(p),q).estimate).toBeNull()
    p.price=null;expect(bulkSelection(p,selection(p),3).estimate).toBeNull()
    p.price={amount:Number.MAX_SAFE_INTEGER/100,currency:'SGD'};expect(bulkSelection(p,selection(p),100).estimate).toBeNull()
  })
  it('does not combine currencies or hide unquoted lines',()=>{
    const a=estimate(lanbo(),10),raw=lanbo();raw.basePrice.presentmentCurrency='USD';const b=estimate(raw,2)
    expect(bulkEstimateSummary([a,b,null])).toEqual({totals:[{currency:'SGD',subtotal:149,discount:10,total:139},{currency:'USD',subtotal:29.8,discount:0,total:29.8}],unpricedLines:1})
  })
  it('rejects changed canonical prices and strips forged discounts/category quantities',()=>{
    const raw=lanbo(),c=bulkCatalogue([raw]),body=fixtureInput(c);body.lines=[{...totalLine(c[0],10),discountPercentage:100,categoryQuantity:1000,estimatedLineTotal:{amount:0,currency:'SGD'}}]
    expect(prepareBulkLines(parseBulkInput(body),c)[0].estimatedLineTotal.amount).toBe(139)
    raw.basePrice.presentmentAmount=15.9
    expect(()=>prepareBulkLines(parseBulkInput(body),bulkCatalogue([raw]))).toThrow('changed')
  })
  it('versions the approved schedule and persists the original receipt after price changes',async()=>{
    const raw=lanbo(),c=bulkCatalogue([raw]),input=fixtureInput(c);input.lines=[totalLine(c[0],4),totalLine(c[0],6,1)]
    expect(c[0].pricingSchedule.tiers.map(t=>t.numerator)).toEqual([1390,1330,1290,1250])
    let saved;const store={findOne:async()=>saved,insertOne:async doc=>{saved=structuredClone(doc)}}
    const body=parseBulkInput(input),first=await saveBulkRequest(store,body,async()=>c)
    expect(saved.lines.map(l=>l.appliedTier.categoryQuantity)).toEqual([10,10])
    expect(first.receipt.estimatedTotals.totals[0]).toEqual({currency:'SGD',subtotal:149,discount:10,total:139})
    raw.basePrice.presentmentAmount=25;const replay=await saveBulkRequest(store,body,async()=>bulkCatalogue([raw]));expect(replay.receipt).toEqual(first.receipt)
  })
})
