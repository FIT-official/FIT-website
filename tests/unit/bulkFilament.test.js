// @vitest-environment node
import { expect, it } from 'vitest'
import { parseBulkInput, prepareBulkLines, saveBulkRequest } from '@/lib/bulkFilament'
import { parseBulkStock } from '@/lib/bulkFilamentStock'
import { fixtureRows, fixtureCatalogue, fixtureInput, memoryStore } from '../fixtures/bulkFilament'
it('shows FIT Marble only when the Sheet contains it, using Sheet quantities',()=>{
  expect(fixtureCatalogue().some(p=>p.brand==='FIT')).toBe(false)
  const c=fixtureCatalogue([...fixtureRows(),{product:'FIT PLA ',brand:'FIT',material:'PLA',colour:'Marble',barcode:'836',quantity:15}])
  expect(c.find(p=>p.brand==='FIT').types[0].options[0]).toMatchObject({name:'Marble',stock:15,ladder:'SPECIALTY_PLA'})
})
it('does not accept unrelated Sheet products and uses the smaller duplicate quantity',()=>{
  const rows=fixtureRows(); rows.push({...rows[2],quantity:5}); rows.push({...rows[0],brand:'Other'})
  expect(parseBulkStock(rows).find(r=>r.barcode==='838').available).toBe(5)
  expect(parseBulkStock(rows)).toHaveLength(6)
})
it.each([null,-1,'9',1.5])('invalid Sheet quantity %s is unavailable',quantity=>{
  const rows=fixtureRows();rows[0].quantity=quantity
  expect(fixtureCatalogue(rows)[0].types[0].options[0].stock).toBe(0)
})
it.each([undefined,'','+65 8000 0000'])('phone is optional (%s)',phone=>{
  const b=fixtureInput();b.customer.phone=phone;expect(parseBulkInput(b).customer.phone).toBe(phone||'')
})
it.each([false,undefined,'true',1])('requires explicit consent (%s)',consent=>{
  const b=fixtureInput();b.consent=consent;expect(()=>parseBulkInput(b)).toThrow('Consent')
})
it('validates contact, fulfilment, review and identities',()=>{
  for(const change of [b=>b.customer.email='bad',b=>b.customer.phone='bad',b=>b.customer.name='',b=>b.fulfilment='delivery',b=>b.confirmReview=false,b=>b.lines[0].options[0].optionId='0'.repeat(24),b=>b.lines[0].options.push(b.lines[0].options[0]),b=>b.lines[0].options=[]]){
    const b=fixtureInput();change(b);expect(()=>prepareBulkLines(parseBulkInput(b),fixtureCatalogue())).toThrow()
  }
})
it('rejects stale stock but ignores the read timestamp when quantities are unchanged',()=>{
  const c=fixtureCatalogue(),b=fixtureInput(c),rows=fixtureRows();rows[0].quantity--
  expect(()=>prepareBulkLines(parseBulkInput(b),fixtureCatalogue(rows))).toThrow('changed')
  expect(c[0].version).toBe(fixtureCatalogue()[0].version)
})
it('never trusts client price or discount fields',()=>{
  const c=fixtureCatalogue(),b=fixtureInput(c);b.lines[0].unitCents=1;b.discount=100
  expect(prepareBulkLines(parseBulkInput(b),c)[0]).toMatchObject({unitCents:1490,lineCents:2980})
})
it('persists exact pricing, stock evidence and dated consent, with a private receipt',async()=>{
  const store=memoryStore(),c=fixtureCatalogue(),b=parseBulkInput(fixtureInput(c))
  const result=await saveBulkRequest(store,b,async()=>c,new Date('2026-10-09T01:00:00Z'))
  const doc=store.docs.get(b.clientRequestId)
  expect(doc).toMatchObject({totalCents:2980,consent:{accepted:true},notifications:{email:{status:'pending',attempts:0}}})
  expect(doc.lines[0]).toMatchObject({band:'<10',unitCents:1490,lineCents:2980,inventorySource:'snapshot'})
  expect(result.receipt).not.toHaveProperty('customer')
})
it('collapses concurrent retries to one stored request',async()=>{
  const store=memoryStore(),c=fixtureCatalogue(),b=parseBulkInput(fixtureInput(c))
  const results=await Promise.all(Array.from({length:12},()=>saveBulkRequest(store,b,async()=>c)))
  expect(store.docs.size).toBe(1);expect(results.filter(r=>r.created)).toHaveLength(1)
})
it('replays without reloading stock and rejects changed payloads',async()=>{
  const store=memoryStore(),c=fixtureCatalogue(),b=parseBulkInput(fixtureInput(c))
  const first=await saveBulkRequest(store,b,async()=>c)
  expect((await saveBulkRequest(store,b,async()=>{throw Error('no read')})).receipt).toEqual(first.receipt)
  await expect(saveBulkRequest(store,{...b,notes:'changed'},async()=>c)).rejects.toMatchObject({status:409,code:'idempotency_conflict'})
})
it('recovers a stored insert whose acknowledgement was lost',async()=>{
  const store=memoryStore(),insert=store.insertOne,c=fixtureCatalogue(),b=parseBulkInput(fixtureInput(c))
  store.insertOne=async doc=>{await insert(doc);throw Error('lost acknowledgement')}
  expect((await saveBulkRequest(store,b,async()=>c)).created).toBe(false);expect(store.docs.size).toBe(1)
})
