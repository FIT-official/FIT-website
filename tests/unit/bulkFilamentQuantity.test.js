// @vitest-environment node
import { expect, it } from 'vitest'
import { bulkTier, priceBulkLines } from '@/lib/bulkFilamentConfig'
import { parseBulkInput, prepareBulkLines } from '@/lib/bulkFilament'
import { fixtureCatalogue, fixtureInput, fixtureLine } from '../fixtures/bulkFilament'
import { BULK_STOCK_SNAPSHOT } from '@/lib/bulkFilamentStockSnapshot'

it.each([[1,1990],[10,1890],[20,1830],[50,1790],[100,1750]])('prices FIT Marble at the Marble ladder for %i combined PLA rolls', (total, cents) => {
  const c = fixtureCatalogue(BULK_STOCK_SNAPSHOT.rows.map(row => row.barcode === '312' ? { ...row, quantity: 100 } : row))
  const input = fixtureInput(c)
  input.lines = [fixtureLine(c, 'FIT', 'PLA', 'Grey Marble', 1)]
  if (total > 1) input.lines.push(fixtureLine(c, 'Lanbo', 'PLA', 'Black', total - 1))
  expect(prepareBulkLines(parseBulkInput(input), c).find(l => l.colour === 'Grey Marble')).toMatchObject({ ladder: 'SPECIALTY_PLA', tierRolls: total, unitCents: cents })
})

it('shares one PLA tier across plain PLA, FIT Marble and Lanbo Marble while PETG stays separate', () => {
  const c = fixtureCatalogue(BULK_STOCK_SNAPSHOT.rows), input = fixtureInput(c)
  input.lines = [fixtureLine(c,'Lanbo','PLA','Black',6), fixtureLine(c,'FIT','PLA','Grey Marble',8), fixtureLine(c,'Lanbo','PLA','Marble',6), fixtureLine(c,'Lanbo','PETG','Black',9)]
  const rows = prepareBulkLines(parseBulkInput(input), c)
  expect(rows.filter(l => l.material === 'PLA')).toHaveLength(3)
  for (const row of rows.filter(l => l.material === 'PLA')) {
    expect(row.tierRolls).toBe(20)
    expect(row.unitCents).toBe(row.ladder === 'PLA' ? 1330 : 1830)
  }
  expect(rows.find(l => l.material === 'PETG')).toMatchObject({ tierRolls: 9, unitCents: 1390 })
})

it.each([['Grey Marble',20],['Marble',15],['Beige Marble',10]])('allows eight through Sheet stock for FIT %s, capped only at %i', (colour, stock) => {
  const c = fixtureCatalogue(BULK_STOCK_SNAPSHOT.rows), input = fixtureInput(c)
  for (let quantity = 8; quantity <= stock; quantity++) {
    input.lines = [fixtureLine(c,'FIT','PLA',colour,quantity)]
    expect(prepareBulkLines(parseBulkInput(input),c)[0]).toMatchObject({ quantity, ladder: 'SPECIALTY_PLA' })
  }
  input.lines[0].quantity = stock + 1
  expect(() => prepareBulkLines(parseBulkInput(input),c)).toThrow(`1 to ${stock}`)
  input.lines = [fixtureLine(c,'FIT','PLA',colour,stock), fixtureLine(c,'FIT','PLA',colour,1)]
  expect(() => prepareBulkLines(parseBulkInput(input),c)).toThrow(`1 to ${stock}`)
})
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
