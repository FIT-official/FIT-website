// @vitest-environment node
import { expect, it } from 'vitest'
import { businessEvent, eventMessage, eventsCsv, csvCell, aggregateBusiness, summaryMessage } from '@/lib/business/events'
import { reportPeriod } from '@/lib/business/periods'
const period=reportPeriod('daily',new Date('2026-10-11T00:00:00Z'))
const event=(overrides={})=>businessEvent({key:'paid:1',kind:'order.paid',source:'order',reference:'ORD_synthetic',occurredAt:new Date('2026-10-10T03:00:00Z'),status:'paid',amountMinor:4020,currency:'SGD',itemCount:3,...overrides})
it('excludes arbitrary payload, card, credential, chat and contact fields from the ledger',()=>{
  const r=event({customerEmail:'secret@example.invalid',phone:'private',paymentMethod:{last4:'4242'},token:'SECRET',message:'private chat',ip:'192.0.2.1'})
  const text=JSON.stringify(r);for(const secret of ['secret@example.invalid','private','4242','SECRET','192.0.2.1'])expect(text).not.toContain(secret)
})
it.each([-1,1.5,NaN,Infinity])('rejects invalid paid minor units %s',amountMinor=>expect(()=>event({amountMinor})).toThrow())
it('keeps half-open boundaries and currencies separate, without inventing refund amounts',()=>{
  const report=aggregateBusiness([event(),event({key:'paid:2',currency:'USD',amountMinor:100}),event({key:'outside',occurredAt:period.until}),businessEvent({key:'refund',kind:'order.status',source:'order',reference:'ORD_synthetic',occurredAt:new Date('2026-10-10T06:00:00Z'),status:'refunded'})],period,{startedAt:new Date('2026-10-01')})
  expect(report.kinds['order.paid']).toBe(2);expect(report.currencies.SGD.grossPaidMinor).toBe(4020);expect(report.currencies.USD.grossPaidMinor).toBe(100)
  expect(report.statusChanges.refunded).toBe(1);expect(summaryMessage(report).text).toContain('Refund amounts are not inferred')
})
it('marks incomplete tracking and unavailable visitors rather than claiming zero traffic',()=>{
  const r=aggregateBusiness([],period,{startedAt:new Date('2026-10-11')})
  expect(r.coverage.partial).toBe(true);expect(r.visitors.available).toBe(false);expect(summaryMessage(r).text).toContain('Unavailable:')
})
it.each(['=HYPERLINK("bad")',' +cmd','@SUM(A1)','-1','\tformula','\n=cell'])('escapes spreadsheet formulas %s',v=>expect(csvCell(v)).toMatch(/^"'/))
it('escapes CSV quotes, keeps UTF-8/BOM and includes only the export whitelist',()=>{
  expect(csvCell('a,"b"')).toBe('"a,""b"""')
  const csv=eventsCsv([{...event(),customerName:'PRIVATE',message:'PRIVATE'}]);expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).not.toContain('PRIVATE')
})
it('chat alerts contain a private website link without copying message text',()=>{
  const r=businessEvent({key:'chat1',kind:'chat.message.new',source:'website-chat',reference:'synthetic-message',occurredAt:new Date(),status:'support',text:'card secret'})
  expect(eventMessage(r).text).not.toContain('card secret');expect(eventMessage(r).text).toContain('https://www.fixitoday.com/admin')
})
