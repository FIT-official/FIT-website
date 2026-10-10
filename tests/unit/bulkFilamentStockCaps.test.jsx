import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import evidence from '../fixtures/bambuStock-2026-10-09.json'
import { bambuBulkCatalogue } from '@/lib/bulkFilamentBambu'
import { bulkSelectionStock } from '@/lib/bulkFilamentSelection'
import { parseBulkInput, prepareBulkLines } from '@/lib/bulkFilament'
import { fixtureInput } from '../fixtures/bulkFilament'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'

vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })
const catalogue = (rows = evidence.rows, products = evidence.products, issues = []) =>
  bambuBulkCatalogue(products, { rows, source: 'sheet', checkedAt: '2026-10-09' }, undefined, issues)
const product = (c, suffix = '-asa') => c.find(p => p.slug.endsWith(suffix))
const selection = (p, colour = 'Grey (45102)', spool = 'Without Spool') => Object.fromEntries(p.types.map(t =>
  [t.id, t.options.find(o => o.name === (t.id === p.colourTypeId ? colour : spool)).id]))
const line = (p, quantity, colour, spool) => ({ productId: p.id, version: p.version, quantity,
  options: Object.entries(selection(p, colour, spool)).map(([typeId, optionId]) => ({ typeId, optionId })) })
const prepare = (c, lines) => prepareBulkLines(parseBulkInput({ ...fixtureInput(), lines }), c)

it('keeps all shop products and filament identities, without changing any source records', () => {
  const rows = structuredClone(evidence.rows), products = structuredClone(evidence.products)
  const c = catalogue(rows, products)
  expect(products).toHaveLength(13)
  expect(c).toHaveLength(12)
  expect(c.map(p => p.id).sort()).toEqual(products.filter(p => p.slug.includes('filament')).map(p => p._id).sort())
  expect(rows).toEqual(evidence.rows)
  expect(products).toEqual(evidence.products)
  for (const p of c) expect(p.basePrice).toEqual(products.find(r => r._id === p.id).basePrice)
})

it.each(evidence.differences)('caps $product / $colour at $cap', diff => {
  const p = catalogue().find(p => p.name === diff.product)
  const colour = p.types.find(t => t.id === p.colourTypeId).options.find(o => o.name === diff.colour)
  expect(colour).toMatchObject({ stock: diff.cap, shopStock: diff.shopStock, sheetQuantity: diff.sheetQuantity })
})

it('maps the single ASA Grey row to min(45, 25) and keeps White separate', () => {
  const c = catalogue(), p = product(c)
  expect(bulkSelectionStock(p, selection(p))).toBe(25)
  expect(bulkSelectionStock(p, selection(p, 'White (45100)'))).toBe(11)
  expect(prepare(c, [line(p, 45)])[0].quantity).toBe(45)
  expect(() => prepare(c, [line(p, 46)])).toThrow('choose 1 to 45')
  expect(() => prepare(c, [line(p, 23), line(p, 23)])).toThrow('choose 1 to 22')
})

it.each([true, false])('fails closed for duplicate identity rows even with the same barcode: %s', sameBarcode => {
  const rows = structuredClone(evidence.rows), issues = []
  const grey = rows.find(r => r.product === 'ASA Gray 45102')
  rows.push({ ...grey, barcode: sameBarcode ? grey.barcode : 'duplicate-fixture', quantity: 2 })
  const p = product(catalogue(rows, evidence.products, issues))
  expect(bulkSelectionStock(p, selection(p))).toBe(0)
  expect(issues).toContainEqual({ productId: p.id, colourCode: '45102', spool: null, kind: 'duplicate_sheet_identity', rowCount: 2 })
})

it('maps With/Without Spool independently and shares the lower colour cap across both', () => {
  const c = catalogue(), p = product(c, '-pla-basic')
  expect(bulkSelectionStock(p, selection(p, 'Black (10101)', 'With Spool'))).toBe(4)
  expect(bulkSelectionStock(p, selection(p, 'Black (10101)', 'Without Spool'))).toBe(31)
  expect(bulkSelectionStock(p, selection(p, 'Gray (10103)', 'With Spool'))).toBe(3)
  expect(bulkSelectionStock(p, selection(p, 'Gray (10103)', 'Without Spool'))).toBe(6)
  expect(prepare(c, [line(p, 23, 'Gray (10103)', 'With Spool'), line(p, 5, 'Gray (10103)')])).toHaveLength(2)
  expect(() => prepare(c, [line(p, 23, 'Gray (10103)', 'With Spool'), line(p, 6, 'Gray (10103)')])).toThrow(/enquiry allowance/)
  expect(bulkSelectionStock(p, selection(p, 'Gray (10103)'), [line(p, 3, 'Gray (10103)', 'With Spool')])).toBe(5)
  expect(() => prepare(c, [line(p, 24, 'Gray (10103)', 'With Spool')])).toThrow('choose 1 to 23')
})

it('rejects duplicate spool identities without disabling the distinct refill identity', () => {
  const rows = structuredClone(evidence.rows), issues = []
  rows.push({ ...rows.find(r => r.colour === 'Gray (10103) (With Spool)') })
  const p = product(catalogue(rows, evidence.products, issues), '-pla-basic')
  expect(bulkSelectionStock(p, selection(p, 'Gray (10103)', 'With Spool'))).toBe(0)
  expect(bulkSelectionStock(p, selection(p, 'Gray (10103)'))).toBe(6)
  expect(issues).toContainEqual(expect.objectContaining({ colourCode: '10103', spool: 'with spool', kind: 'duplicate_sheet_identity' }))
})

it('keeps code mismatches and conflicting row identities unavailable', () => {
  const issues = [], c = catalogue(evidence.rows, evidence.products, issues), p = product(c, '-pla-basic-gradient')
  expect(bulkSelectionStock(p, selection(p, 'Cotton Candy Cloud (10905)'))).toBe(0)
  expect(issues).toContainEqual(expect.objectContaining({ colourCode: '10905', kind: 'missing_sheet_identity' }))
  const rows = structuredClone(evidence.rows)
  rows.find(r => r.product === 'ASA Gray 45102').colour = 'White (45100)'
  expect(bulkSelectionStock(product(catalogue(rows)), selection(product(c)))).toBe(0)
})

it('fails closed for missing Sheet rows in live and snapshot data while retaining PVA shop stock', () => {
  for (const source of ['sheet', 'snapshot']) {
    const c = bambuBulkCatalogue(evidence.products, { rows: [], source })
    for (const p of c.filter(p => !p.slug.endsWith('pva-support'))) expect(p.stock).toBe(0)
    const pva = product(c, 'pva-support'), original = evidence.products.find(p => p._id === pva.id)
    expect(pva).toMatchObject({ stock: original.stock, stockSource: 'shop' })
    expect(pva.types[0].options[0].stock).toBe(original.variantTypes[0].options[0].stock)
  }
})

it.each([undefined, null, -1, '25', NaN])('fails closed for absent or invalid shop colour stock (%s)', stock => {
  const products = structuredClone(evidence.products)
  products.find(p => p.slug.endsWith('-asa')).variantTypes[0].options.find(o => o.name === 'Grey (45102)').stock = stock
  const p = product(catalogue(evidence.rows, products))
  expect(bulkSelectionStock(p, selection(p))).toBe(0)
})

it('enforces both source caps in client and server even if the displayed stock field is too high', () => {
  const c = catalogue(), p = product(c), colour = p.types[0].options.find(o => o.name === 'Grey (45102)')
  colour.stock = 100
  expect(bulkSelectionStock(p, selection(p))).toBe(25)
  expect(() => prepare(c, [line(p, 46)])).toThrow('choose 1 to 45')
  delete colour.shopStock
  expect(bulkSelectionStock(p, selection(p))).toBe(0)
  expect(() => prepare(c, [line(p, 1)])).toThrow('choose 1 to 0')
})

it('invalidates an existing request when the shop colour stock drops', () => {
  const c = catalogue(), p = product(c), request = parseBulkInput({ ...fixtureInput(), lines: [line(p, 25)] })
  const products = structuredClone(evidence.products)
  products.find(r => r._id === p.id).variantTypes[0].options.find(o => o.name === 'Grey (45102)').stock = 20
  expect(() => prepareBulkLines(request, catalogue(evidence.rows, products))).toThrow('Inventory or prices changed')
})

it('renders ASA Grey at 25 and blocks an over-limit client selection', async () => {
  const c = catalogue(), p = product(c)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ products: c, stockSource: 'sheet' }) })))
  render(<BulkFilamentForm />)
  await screen.findByRole('button', { name: 'Add colour to enquiry' })
  fireEvent.change(screen.getByLabelText('Product / material'), { target: { value: p.id } })
  fireEvent.change(screen.getByLabelText('Colour'), { target: { value: selection(p)[p.colourTypeId] } })
  expect(screen.getByText('25 recorded stock limit for this selection')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add colour to enquiry' }))
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max', '45')
  fireEvent.change(screen.getByLabelText('Quantity line 1'), { target: { value: '46' } })
  expect(screen.getByRole('button', { name: 'Send request to FIT' })).toBeDisabled()
  expect(screen.getByText(/Estimate unavailable/)).toBeInTheDocument()
})
