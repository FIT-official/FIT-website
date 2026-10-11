import { describe, it, expect, vi } from 'vitest'
import { emailPlainText, ctaButton, emailLayout } from '@/lib/email/template'
import { printDetailRows, printSummary } from '@/lib/email/printDetails'
import { buildIdleNudgeEmail, buildQuoteReadyEmail } from '@/lib/email/templates/customPrint'
import { buildOrderConfirmationEmail } from '@/lib/email/templates/transactional'
import { selectIdleRequests } from '@/lib/notifications/idleRequests'
const request={requestId:'request-private-123',userName:'Fix It Today',status:'quoted',modelFile:{originalName:'Keychain Draft (6).3mf'}}
describe('useful, truthful email presentation',()=>{
  it('preserves the actual customer name and moves the full selectable reference to the footer',()=>{
    const message=buildIdleNudgeEmail({request})
    expect(message.html).toContain('Hi Fix It Today,');expect(message.text).toContain('Hi Fix It Today,')
    expect(message.subject).not.toContain(request.requestId)
    expect(message.html.indexOf('Reference<br>')).toBeGreaterThan(message.html.indexOf('Review &amp; pay'))
    expect(message.html).toContain('user-select:text');expect(message.html).not.toMatch(/onclick=|<script|navigator\.clipboard/)
    expect(message.text).toContain('Printing has not started');expect(message.text).not.toContain('still in progress')
    expect(message.html).toContain('/cart?addCustomRequest=request-private-123')
  })
  it('does not invent default PLA, quantity, price or a chosen shipping method',()=>{
    const rows=printDetailRows({...request,printConfiguration:{printSettings:{materialType:'PLA'}},delivery:{deliveryTypes:[{type:'pick-up',pickupLocation:'Counter'}]}})
    expect(rows.find(([k])=>k==='Material')[1]).toBeUndefined()
    expect(rows.find(([k])=>k==='Quantity')[1]).toBeNull()
    expect(rows.find(([k])=>k==='Available options')[1]).toBe('Collection')
    const message=buildQuoteReadyEmail({request})
    expect(message.text).not.toMatch(/SGD 0\.00|Review & pay/)
  })
  it('uses selected fulfilment and omits full street address from print summaries',()=>{
    const rows=printDetailRows({...request,shippingAddress:{street:'Secret street',city:'Singapore',postalCode:'123456'},quantity:2},{chosenDeliveryType:'standard-shipping'})
    expect(JSON.stringify(rows)).toContain('123456');expect(JSON.stringify(rows)).not.toContain('Secret street')
  })
  it('keeps known details and helpful alt text when an image is unavailable',()=>{
    const html=printSummary(request,{preview:{cid:'fit-model-'+ 'a'.repeat(64)+'@fixitoday.com'}})
    expect(html).toContain('Keychain Draft');expect(html).toContain('alt="Generated model preview')
    expect(printSummary(request,{preview:{cid:'https://attacker.invalid'}})).not.toContain('<img')
  })
  it('does not nudge paid or provider-action requests',()=>{
    const base={...request,userEmail:'synthetic@example.invalid',updatedAt:'2020-01-01'}
    for(const patch of[{paidAt:'2026-01-01'},{status:'configured',quoteMode:'manual'},{status:'configured',creatorUserId:'creator'},{status:'configured',guidedBrief:{version:1}}])expect(selectIdleRequests([{...base,...patch}])).toEqual([])
    for(const status of['paid','payment_pending','printing','cancelled','unknown'])expect(buildIdleNudgeEmail({request:{...request,status}})).toBeNull()
    expect(buildIdleNudgeEmail({request:{...request,creatorUserId:'creator'}}).html).not.toContain('/cart')
  })
  it('shows the recorded collection/digital order without promising shipping',()=>{
    const message=buildOrderConfirmationEmail({customerName:'Fix It Today',checkout:{currency:'sgd',totalAmount:1200,items:[{productName:'Example',quantity:2,totalAmount:1200,chosenDeliveryType:'pick-up',orderNote:'Keep together'}]}})
    expect(message.text).toContain('Collection');expect(message.text).toContain('SGD 12.00');expect(message.text).toContain('Keep together')
    expect(message.text).not.toMatch(/Ships to|provided address|tax/i)
  })
  it('plaintext retains links and escaped customer characters without email CSS',()=>{
    const text=emailPlainText(emailLayout({preheader:'hidden',bodyHtml:'<p>A &amp; B &lt;x&gt;</p>'+ctaButton({href:'https://example.invalid/details',label:'Details'})}))
    expect(text).toContain('A & B <x>');expect(text).toContain('https://example.invalid/details')
    expect(text).not.toMatch(/hidden|@media|font-family/)
    expect(ctaButton({href:'javascript:alert(1)',label:'Bad'})).toBe('')
  })
})
const sendMail=vi.hoisted(()=>vi.fn(async value=>value))
vi.mock('nodemailer',()=>({default:{createTransport:()=>({sendMail})}}))
it('SMTP includes explicit plaintext or generated fallback and keeps CID attachments',async()=>{
  const {sendEmail}=await import('@/lib/email')
  await sendEmail({to:'synthetic@example.invalid',subject:'Test',html:'<p>Known details</p>',attachments:[{cid:'safe'}]})
  expect(sendMail.mock.calls.at(-1)[0]).toMatchObject({text:'Known details',attachments:[{cid:'safe'}]})
  await sendEmail({to:'synthetic@example.invalid',html:'<p>Layout</p>',text:'Authoritative preparation'})
  expect(sendMail.mock.calls.at(-1)[0].text).toBe('Authoritative preparation')
})
