// @vitest-environment node
import { expect, it } from 'vitest'
import { bulkTier, priceBulkLines } from '@/lib/bulkFilamentConfig'
import { parseBulkInput, prepareBulkLines } from '@/lib/bulkFilament'
import { fixtureCatalogue, fixtureInput, fixtureLine } from '../fixtures/bulkFilament'
const boundaries = [9,10,19,20,49,50,99,100]
for (const [ladder, expected] of Object.entries({
  PLA: [1490,1390,1390,1330,1330,1290,1290,1250],
  PETG: [1390,1340,1340,1280,1280,1240,1240,1200],
  SPECIALTY_PLA: [1990,1890,1890,1830,1830,1790,1790,1750],
})) it.each(boundaries.map((q,i) => [q,expected[i]]))(`${ladder} at %i rolls costs %i cents`, (q,cents) => {
  expect(bulkTier(ladder,q).unitCents).toBe(cents)
  expect(priceBulkLines([{ladder,quantity:q}])[0].lineCents).toBe(q*cents)
})
it('prices six plain PLA and four Marble at the combined ten-roll band; PETG stays separate', () => {
  const c=fixtureCatalogue(), input=fixtureInput(c)
  input.lines=[fixtureLine(c,'Lanbo','PLA','Black',6),fixtureLine(c,'Lanbo','PLA','Marble',4),fixtureLine(c,'Lanbo','PETG','Black',9)]
  const rows=prepareBulkLines(parseBulkInput(input),c)
  expect(rows.find(l=>l.ladder==='PLA')).toMatchObject({band:'10–19',tierRolls:10,unitCents:1390,lineCents:8340})
  expect(rows.find(l=>l.ladder==='SPECIALTY_PLA')).toMatchObject({band:'10–19',unitCents:1890,lineCents:7560})
  expect(rows.find(l=>l.ladder==='PETG')).toMatchObject({band:'<10',tierRolls:9,unitCents:1390,lineCents:12510})
})
it('includes Wood and keeps Technology Grey on the plain ladder',()=>{
  const c=fixtureCatalogue(), b=fixtureInput(c)
  b.lines=[fixtureLine(c,'Lanbo','PLA','Technology Grey',9),fixtureLine(c,'Lanbo','PLA','Wood Colour',1)]
  const lines=prepareBulkLines(parseBulkInput(b),c)
  expect(lines.find(l=>l.colour==='Technology Grey').unitCents).toBe(1390)
  expect(lines.find(l=>l.colour==='Wood Colour').unitCents).toBe(1890)
})
it.each([['PLA','Marble',7,8],['PETG','Black',12,13]])('caps %s %s at %i', (material,colour,cap,over)=>{
  const c=fixtureCatalogue(), b=fixtureInput(c)
  b.lines=[fixtureLine(c,'Lanbo',material,colour,cap)]
  expect(prepareBulkLines(parseBulkInput(b),c)[0].quantity).toBe(cap)
  b.lines[0].quantity=over; expect(()=>prepareBulkLines(parseBulkInput(b),c)).toThrow(`1 to ${cap}`)
})
it('aggregates duplicate colours to prevent bypassing a cap',()=>{
  const c=fixtureCatalogue(),b=fixtureInput(c); b.lines=[fixtureLine(c,'Lanbo','PLA','Marble',4),fixtureLine(c,'Lanbo','PLA','Marble',4)]
  expect(()=>prepareBulkLines(parseBulkInput(b),c)).toThrow('1 to 7')
})
it.each([0,-1,1.5,'4',null,Infinity,1000001])('rejects invalid quantities %s',quantity=>{
  const b=fixtureInput(); b.lines[0].quantity=quantity; expect(()=>parseBulkInput(b)).toThrow()
})
it.each([0,1,20])('rejects extraQuantity even when it is %i',extraQuantity=>{
  const b=fixtureInput();b.lines[0].extraQuantity=extraQuantity;expect(()=>parseBulkInput(b)).toThrow('only quantity')
})
it('rejects legacy recordedQuantity',()=>{const b=fixtureInput();b.lines[0].recordedQuantity=1;expect(()=>parseBulkInput(b)).toThrow('only quantity')})
it('rejects a top-level extraQuantity field',()=>{const b=fixtureInput();b.extraQuantity=0;expect(()=>parseBulkInput(b)).toThrow('only quantity')})
