// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { bulkCatalogue, parseBulkInput, prepareBulkLines, saveBulkRequest } from '@/lib/bulkFilament'
import { fixtureProduct, fixtureInput } from '../fixtures/bulkFilament'
const setup = () => { const product = fixtureProduct(), catalogue = bulkCatalogue([product]); return { product, catalogue, input: fixtureInput(catalogue) } }
describe('bulk filament authoritative inventory', () => {
  it('preserves canonical identities and stock without adding the allowance', () => {
    const { product,catalogue,input } = setup()
    const before = structuredClone(product), lines = prepareBulkLines(parseBulkInput(input), catalogue)
    expect(lines[0]).toMatchObject({ recordedQuantity: 2, extraQuantity: 20, recordedProductStock: 12, publicUnitPrice: { amount: 10, currency: 'SGD' } })
    expect(product).toEqual(before)
  })
  it.each(['hidden','flaggedForModeration'])('excludes %s products', field => { const p=fixtureProduct(); p[field]=true; expect(bulkCatalogue([p])).toEqual([]) })
  it.each([{listing:'creator'},{productType:'print'},{categoryId:'Electronics'},{slug:'creator-product'}])('excludes non-FIT/non-filament records %j', fields => expect(bulkCatalogue([{...fixtureProduct(),...fields}])).toEqual([]))
  it('repairs verified legacy labels without changing IDs', () => {
    const p=fixtureProduct(); p.slug='bambu-lab-3d-printing-filament-1kg-pla-basic'; p.variantTypes[0].name='Spool'
    p.variantTypes[0].options.forEach((o,i)=>o.name='Colour ('+(10100+i)+')'); p.variantTypes[1].name='Colour'
    const c=bulkCatalogue([p]); expect(c[0].types.map(t=>t.label)).toEqual(['Colour','Spool']); expect(c[0].colourTypeId).toBe(p.variantTypes[0]._id)
  })
  it('does not manufacture a colour dimension',()=>{const p=fixtureProduct();p.variantTypes[0].name='Size';expect(bulkCatalogue([p])).toEqual([])})
  it('keeps missing stock unknown and allows only the manual extra request',()=>{
    const p=fixtureProduct();delete p.variantTypes[0].options[0].stock;const c=bulkCatalogue([p]), b=fixtureInput(c)
    expect(()=>prepareBulkLines(parseBulkInput(b),c)).toThrow('Recorded stock')
    b.lines[0].recordedQuantity=0;expect(prepareBulkLines(parseBulkInput(b),c)[0].extraQuantity).toBe(20)
  })
  it.each([NaN,Infinity,-1,0.5,'2',null])('rejects noninteger or invalid requested quantity %s', value=>{
    const {input}=setup();input.lines[0].recordedQuantity=value;expect(()=>parseBulkInput(input)).toThrow()
  })
  it.each([21,-1,0.1,'20',Infinity])('rejects invalid extras %s',value=>{const {input}=setup();input.lines[0].extraQuantity=value;expect(()=>parseBulkInput(input)).toThrow()})
  it('rejects an empty line and duplicate lines',()=>{const {input}=setup();input.lines[0].recordedQuantity=0;input.lines[0].extraQuantity=0;expect(()=>parseBulkInput(input)).toThrow();input.lines[0].extraQuantity=1;input.lines.push(structuredClone(input.lines[0]));expect(()=>parseBulkInput(input)).toThrow('duplicate')})
  it('caps extras across spool choices for the same colour',()=>{
    const {input,catalogue}=setup();const other=structuredClone(input.lines[0]);other.options[1].optionId='777777777777777777777777';other.extraQuantity=1;input.lines.push(other)
    expect(()=>prepareBulkLines(parseBulkInput(input),catalogue)).toThrow('shared across spool')
  })
  it('aggregates the shared colour stock across spool choices',()=>{
    const {input,catalogue}=setup();input.lines[0].recordedQuantity=3;input.lines[0].extraQuantity=0
    const other=structuredClone(input.lines[0]);other.options[1].optionId='777777777777777777777777';input.lines.push(other)
    expect(()=>prepareBulkLines(parseBulkInput(input),catalogue)).toThrow('shared stock')
  })
  it('aggregates the shared spool stock across colours',()=>{
    const {input,catalogue}=setup();input.lines[0].recordedQuantity=4;input.lines[0].extraQuantity=0
    const other=structuredClone(input.lines[0]);other.options[0].optionId='444444444444444444444444';input.lines.push(other)
    expect(()=>prepareBulkLines(parseBulkInput(input),catalogue)).toThrow('shared stock')
  })
  it('allows 20 extras separately for distinct colours',()=>{
    const {input,catalogue}=setup();const other=structuredClone(input.lines[0]);other.options[0].optionId='444444444444444444444444';input.lines.push(other)
    expect(prepareBulkLines(parseBulkInput(input),catalogue).reduce((n,l)=>n+l.extraQuantity,0)).toBe(40)
  })
  it('uses public base price and option fees, never client totals or discounts',()=>{
    const {input,catalogue}=setup();input.lines[0].price=0.01;input.lines[0].options[1].optionId='777777777777777777777777'
    expect(prepareBulkLines(parseBulkInput(input),catalogue)[0].publicUnitPrice.amount).toBe(14)
  })
  it('does not invent a price for quote-only products',()=>{const p=fixtureProduct();p.quoteOnly=true;const c=bulkCatalogue([p]);expect(prepareBulkLines(parseBulkInput(fixtureInput(c)),c)[0].publicUnitPrice).toBe(null)})
  it.each(['stock','price','name','option'])('rejects stale %s snapshots',what=>{
    const {input,product}=setup()
    if(what==='stock')product.stock--;if(what==='price')product.basePrice.presentmentAmount++;if(what==='name')product.name+=' changed';if(what==='option')product.variantTypes[0].options[0]._id='888888888888888888888888'
    expect(()=>prepareBulkLines(parseBulkInput(input),bulkCatalogue([product]))).toThrow('changed')
  })
  it('rejects forged, duplicate, missing and cross-product option identities',()=>{
    for(const change of [b=>b.lines[0].options[0].optionId='999999999999999999999999',b=>b.lines[0].options.push(b.lines[0].options[0]),b=>b.lines[0].options.pop()]){
      const {input,catalogue}=setup();change(input);expect(()=>prepareBulkLines(parseBulkInput(input),catalogue)).toThrow()
    }
  })
  it('requires contact, one fulfilment, delivery address and review acknowledgement',()=>{
    for(const change of [b=>b.customer.email='wrong',b=>b.customer.phone='bad',b=>b.customer.name='',b=>b.fulfilment=['collection','delivery'],b=>b.fulfilment='delivery',b=>b.confirmReview=false]){
      const {input}=setup();change(input);expect(()=>parseBulkInput(input)).toThrow()
    }
  })
})
describe('bulk request durable idempotency',()=>{
  function memory(){const docs=new Map();return {docs,async findOne(q){return docs.get(q._id)||null},async insertOne(d){if(docs.has(d._id))throw Object.assign(Error('duplicate'),{code:11000});docs.set(d._id,structuredClone(d))}}}
  it('collapses concurrent retries to one persisted request, without stock writes',async()=>{
    const {input,catalogue}=setup(),store=memory(),body=parseBulkInput(input)
    const results=await Promise.all(Array.from({length:12},()=>saveBulkRequest(store,body,async()=>catalogue)))
    expect(store.docs.size).toBe(1);expect(results.filter(r=>r.created)).toHaveLength(1)
    expect(results[0].receipt).not.toHaveProperty('customer');expect(results[0].receipt.notificationCoverage).toBe('owner_dashboard_only')
  })
  it('recovers the same receipt even if stock later changes or becomes unavailable',async()=>{
    const {input,catalogue}=setup(),store=memory(),body=parseBulkInput(input)
    const first=await saveBulkRequest(store,body,async()=>catalogue)
    const second=await saveBulkRequest(store,body,async()=>{throw Error('must not read stock')})
    expect(second.receipt).toEqual(first.receipt);expect(second.created).toBe(false)
  })
  it('recovers an insert whose acknowledgement was lost',async()=>{
    const {input,catalogue}=setup(),store=memory(),original=store.insertOne
    store.insertOne=async d=>{await original(d);throw Error('lost ack')}
    expect((await saveBulkRequest(store,parseBulkInput(input),async()=>catalogue)).created).toBe(false);expect(store.docs.size).toBe(1)
  })
  it('rejects payload changes on an existing reference without altering the original',async()=>{
    const {input,catalogue}=setup(),store=memory()
    await saveBulkRequest(store,parseBulkInput(input),async()=>catalogue);input.notes='changed'
    await expect(saveBulkRequest(store,parseBulkInput(input),async()=>catalogue)).rejects.toMatchObject({status:409,code:'idempotency_conflict'})
    expect([...store.docs.values()][0].notes).toBe('SYNTHETIC TEST ONLY')
  })
  it('keeps independent concurrent enquiries unreserved, requiring owner review',async()=>{
    const {input,catalogue}=setup(),store=memory(),other=structuredClone(input);other.clientRequestId='22345678-1234-4234-8234-123456789abc'
    await Promise.all([input,other].map(b=>saveBulkRequest(store,parseBulkInput(b),async()=>catalogue)))
    expect(store.docs.size).toBe(2);expect([...store.docs.values()].every(d=>d.status==='new')).toBe(true)
  })
})
