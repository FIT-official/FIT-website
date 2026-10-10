// @vitest-environment node
import { expect, it } from 'vitest'
import { bulkSelectionLimit, bulkSelectionStock, bulkCombinationKey } from '@/lib/bulkFilamentSelection'
import { parseBulkInput, prepareBulkLines, saveBulkRequest } from '@/lib/bulkFilament'
import { bulkOwnerMessage } from '@/lib/bulkFilamentEmail'
import { bambuBulkCatalogue } from '@/lib/bulkFilamentBambu'
import evidence from '../fixtures/bambuStock-2026-10-09.json'
import { fixtureCatalogue, fixtureRows, fixtureInput, fixtureLine, memoryStore } from '../fixtures/bulkFilament'

const selected = line => Object.fromEntries(line.options.map(o => [o.typeId, o.optionId]))
const prepare = (catalogue, lines) => prepareBulkLines(parseBulkInput({ ...fixtureInput(), lines }), catalogue)
const bambu = (rows = evidence.rows, products = evidence.products) => bambuBulkCatalogue(products, { rows, source: 'sheet' })
const bambuLine = (p, quantity = 1, colour = 'Gray (10103)', spool = 'With Spool') => ({ productId: p.id, version: p.version, quantity,
  options: p.types.map(t => ({ typeId: t.id, optionId: t.options.find(o => o.name === (t.id === p.colourTypeId ? colour : spool)).id })) })

it.each([0, 1, 14, 100])('allows exactly recorded stock %i plus 20, leaving recorded values intact', stock => {
  const rows = fixtureRows(); rows[0].quantity = stock
  const catalogue = fixtureCatalogue(rows), p = catalogue[0], line = fixtureLine(catalogue, 'Lanbo', 'PLA', 'Black', stock + 20)
  expect(bulkSelectionStock(p, selected(line))).toBe(stock)
  expect(bulkSelectionLimit(p, selected(line))).toBe(stock + 20)
  expect(prepare(catalogue, [line])[0]).toMatchObject({ quantity: stock + 20, options: [expect.objectContaining({ availableStock: stock })] })
  expect(() => prepare(catalogue, [{ ...line, quantity: stock + 21 }])).toThrow('enquiry allowance')
  expect(rows[0].quantity).toBe(stock)
})

it('shares the allowance across duplicate lines and product totals', () => {
  const catalogue = fixtureCatalogue(), p = catalogue[0], line = quantity => fixtureLine(catalogue, 'Lanbo', 'PLA', 'Black', quantity)
  expect(prepare(catalogue, [line(17), line(17)])).toHaveLength(2)
  expect(bulkSelectionLimit(p, selected(line(1)), [line(17)])).toBe(17)
  expect(() => prepare(catalogue, [line(17), line(18)])).toThrow('enquiry allowance')
  p.stock = 20
  const white = fixtureLine(catalogue, 'Lanbo', 'PLA', 'White', 20)
  expect(prepare(catalogue, [line(20), white])).toHaveLength(2)
  expect(() => prepare(catalogue, [line(21), white])).toThrow('enquiry allowance')
})

it.each([undefined, null, -1, '14', 1.5, NaN])('blocks malformed Sheet stock (%s) instead of granting 20 rolls', quantity => {
  const rows = fixtureRows(); rows[0].quantity = quantity
  const catalogue = fixtureCatalogue(rows), line = fixtureLine(catalogue, 'Lanbo', 'PLA', 'Black', 1)
  expect(bulkSelectionLimit(catalogue[0], selected(line))).toBe(0)
  expect(() => prepare(catalogue, [line])).toThrow('choose 1 to 0')
})

it.each(['missing', 'duplicate', 'invalid'])('blocks %s Bambu combination identity while preserving a verified refill', kind => {
  let rows = structuredClone(evidence.rows)
  const row = rows.find(r => r.colour === 'Gray (10103) (With Spool)')
  if (kind === 'missing') rows = rows.filter(r => r !== row)
  if (kind === 'duplicate') rows.push({ ...row })
  if (kind === 'invalid') row.quantity = '3'
  const catalogue = bambu(rows), p = catalogue.find(p => p.slug.endsWith('-pla-basic'))
  const bad = bambuLine(p), good = bambuLine(p, 1, undefined, 'Without Spool')
  expect(bulkSelectionLimit(p, selected(bad))).toBe(0)
  expect(() => prepare(catalogue, [bad])).toThrow('choose 1 to 0')
  expect(bulkSelectionLimit(p, selected(good))).toBe(26)
  expect(prepare(catalogue, [good])).toHaveLength(1)
})

it('shares the colour allowance across spool/refill choices and rejects unknown combination keys', () => {
  const catalogue = bambu(), p = catalogue.find(p => p.slug.endsWith('-pla-basic'))
  const withSpool = bambuLine(p, 23), refill = bambuLine(p, 5, undefined, 'Without Spool')
  expect(bulkSelectionLimit(p, selected(withSpool))).toBe(23)
  expect(bulkSelectionLimit(p, selected(refill), [withSpool])).toBe(5)
  expect(prepare(catalogue, [withSpool, refill]).map(l => l.ladder)).toEqual(['BAMBU_LIST', 'BAMBU_LIST'])
  expect(() => prepare(catalogue, [withSpool, { ...refill, quantity: 6 }])).toThrow('enquiry allowance')
  delete p.combinationStock[bulkCombinationKey(selected(withSpool))]
  expect(bulkSelectionStock(p, selected(withSpool))).toBe(0)
  expect(bulkSelectionLimit(p, selected(withSpool))).toBe(0)
})

it('distinguishes valid zero from malformed standalone PVA product stock', () => {
  for (const stock of [0, undefined]) {
    const products = structuredClone(evidence.products)
    products.find(p => p.slug.endsWith('pva-support')).stock = stock
    const p = bambu(evidence.rows, products).find(p => p.slug.endsWith('pva-support'))
    const options = Object.fromEntries(p.types.map(t => [t.id, t.options[0].id]))
    expect(bulkSelectionLimit(p, options)).toBe(stock === 0 ? 20 : 0)
  }
})

it('saves the full enquiry quantity once and keeps actual stock and nonpayment wording in its owner preparation list', async () => {
  const catalogue = fixtureCatalogue(), store = memoryStore(), input = parseBulkInput({ ...fixtureInput(catalogue), lines: [fixtureLine(catalogue, 'Lanbo', 'PLA', 'Black', 34)] })
  const first = await saveBulkRequest(store, input, async () => catalogue)
  const repeat = await saveBulkRequest(store, input, async () => { throw Error('idempotent replay must use saved record') })
  expect(repeat.created).toBe(false); expect(repeat.receipt).toEqual(first.receipt)
  const doc = store.docs.get(input.clientRequestId)
  expect(doc.lines[0]).toMatchObject({ quantity: 34, unitCents: 1330, lineCents: 45220, options: [expect.objectContaining({ availableStock: 14 })] })
  expect(bulkOwnerMessage(doc).text).toContain('34')
  expect(bulkOwnerMessage(doc).text).toContain('Payment / Stripe: no payment taken; no Stripe transaction.')
  expect(store.docs.size).toBe(1)
})
