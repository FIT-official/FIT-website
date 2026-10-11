// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { bulkOwnerMessage, BULK_OWNER_EMAIL } from '@/lib/bulkFilamentEmail'
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(() => { throw Error('Provider forbidden') }) }))
const fixture = () => ({
  _id: 'synthetic-preview-only', customer: { name: 'Synthetic QA', phone: '+65 8000 0000', email: 'qa@example.invalid', organisation: 'Synthetic lab' },
  fulfilment: 'delivery', address: 'SYNTHETIC ADDRESS\nDo not deliver', notes: 'Do not fulfil this preview.', totalCents: 13900,
  lines: [
    { productName: 'Lanbo PLA — 1kg', options: [{ type: 'Colour', name: 'Black' }], quantity: 4, remarks: 'Label bag A', ladder: 'PLA', material: 'PLA', band: '10-19', tierRolls: 10, unitCents: 1390, lineCents: 5560 },
    { productName: 'Lanbo PLA — 1kg', options: [{ type: 'Colour', name: 'White' }], quantity: 6, remarks: 'Label bag B', ladder: 'PLA', material: 'PLA', band: '10-19', tierRolls: 10, unitCents: 1390, lineCents: 8340 },
  ],
})
const parse = html => new DOMParser().parseFromString(html, 'text/html')
it('keeps distinct variants in separate rows above contact, delivery, remarks, prices and status', () => {
  const doc=fixture(), original=structuredClone(doc), message=bulkOwnerMessage(doc), dom=parse(message.html)
  const table=dom.querySelector('table[aria-label="Items to prepare"]')
  expect([...table.querySelectorAll(':scope > tbody > tr')].map(row=>[...row.cells].map(cell=>cell.textContent.replace(/\s+/g,' ').trim()))).toEqual([
    ['1. Lanbo PLA — 1kg Colour: Black', '4rolls'], ['2. Lanbo PLA — 1kg Colour: White', '6rolls'],
  ])
  expect(dom.querySelector('h1').textContent).toBe('Items to prepare / check')
  expect([...dom.querySelectorAll('h2')].map(x=>x.textContent)).toEqual(['Customer contact','Delivery / collection','Item remarks','Indicative pricing','Customer notes','Payment / status'])
  expect(dom.body.textContent).toContain('Total quantity: 10 rolls')
  for (const str of ['Label bag A','Label bag B','SYNTHETIC ADDRESS','SGD 55.60','SGD 83.40','SGD 139.00','no Stripe transaction','No stock reserved']) expect(dom.body.textContent).toContain(str)
  expect(message.to).toBe(BULK_OWNER_EMAIL);expect(message.messageId).toBe('<bulk-synthetic-preview-only@fixitoday.com>')
  expect(message).not.toHaveProperty('cc');expect(message).not.toHaveProperty('bcc');expect(doc).toEqual(original)
  expect(message.text).toMatch(/^ITEMS TO PREPARE \/ CHECK\n\n1\./)
  expect(message.text).toContain('Quantity: 4 rolls\n\n2.')
  expect(message.text.indexOf('Quantity: 6 rolls')).toBeLessThan(message.text.indexOf('CUSTOMER CONTACT'))
})
it('escapes all HTML data while retaining the original readable plain text', () => {
  const attack='<img src=x onerror="alert(1)"> & \' <script>bad()</script>',doc=fixture()
  doc.customer={name:attack,phone:attack,email:attack,organisation:attack};doc.address=attack;doc.notes=attack;doc._id=attack;doc.priceNotice=attack
  doc.lines=[{productName:attack,options:[{type:attack,name:attack}],quantity:1,remarks:attack,band:attack,tierRolls:1,material:attack}]
  const message=bulkOwnerMessage(doc),dom=parse(message.html)
  expect(dom.querySelectorAll('img,script,iframe,style')).toHaveLength(0)
  expect(dom.querySelectorAll('[onerror],[onclick]')).toHaveLength(0)
  expect(dom.body.textContent).toContain(attack);expect(message.html).toContain('&lt;img');expect(message.text).toContain(attack)
})
it('preserves all 50 long item lines and notices without calculating new prices', () => {
  const doc=fixture();doc.lines=Array.from({length:50},(_,i)=>({...doc.lines[i%2], productName:'Product '+i+' '+ 'LongVariant'.repeat(30), quantity:i+1, remarks:'Item '+i+'\n'+'note '.repeat(100),lineCents:null}))
  doc.totalCents=null
  const message=bulkOwnerMessage(doc),dom=parse(message.html)
  expect(dom.querySelectorAll('table[aria-label="Items to prepare"] tbody tr')).toHaveLength(50)
  expect(message.text).toContain('Total quantity: 1275 rolls')
  expect(message.text.match(/Indicative line total: Quotation required/g)).toHaveLength(50)
  expect(message.text).toContain('Indicative filament total: Quotation required')
  expect(message.text).toContain('Item 49\nnote')
})
it('marks missing fields and quantity without inventing stock, price or totals', () => {
  const message=bulkOwnerMessage({_id:'legacy',lines:[{}]})
  expect(message.text).toContain('Customer: Not provided');expect(message.text).toContain('Options: Not recorded')
  expect(message.text).toContain('Quantity: Not recorded rolls');expect(message.text).not.toContain('Total quantity:')
  expect(message.text).toContain('Fulfilment: Not recorded');expect(message.text).not.toContain('undefined')
  expect(bulkOwnerMessage({}).text).toContain('No item lines recorded.')
})
it('does not sum explicitly incompatible units or unsafe totals', () => {
  const doc=fixture();doc.lines[1].unit='metres'
  const message=bulkOwnerMessage(doc)
  expect(message.text).toContain('Quantity: 6 metres');expect(message.text).not.toContain('Total quantity:')
  doc.lines[1].unit='rolls';doc.lines.forEach(l=>l.quantity=Number.MAX_SAFE_INTEGER)
  expect(bulkOwnerMessage(doc).text).not.toContain('Total quantity:')
})

