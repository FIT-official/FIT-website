import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import records from '../fixtures/bambuShop.json'
import { bambuBulkCatalogue } from '@/lib/bulkFilamentBambu'
import { bulkListUnitCents, BAMBU_PRICE_NOTICE } from '@/lib/bulkFilamentConfig'
import { parseBulkInput, prepareBulkLines, saveBulkRequest } from '@/lib/bulkFilament'
import { bulkOwnerMessage } from '@/lib/bulkFilamentEmail'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import BulkFilamentRequests from '@/components/Admin/BulkFilamentRequests'
import { fixtureCatalogue, fixtureInput, fixtureLine, memoryStore } from '../fixtures/bulkFilament'

vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
const catalogue = () => [...fixtureCatalogue(), ...bambuBulkCatalogue(records, { rows: [], source: 'snapshot' })]
const basic = c => c.find(p => p.slug?.endsWith('1kg-pla-basic'))
const bambuLine = (p, quantity = 5) => ({ productId: p.id, version: p.version, quantity, remarks: '',
  options: p.types.map(t => ({ typeId: t.id, optionId: (t.options.find(o => o.name === 'Without Spool') || t.options[0]).id })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })

it('includes all 12 shop filament identities, prices, stock sources and unavailable options, excluding only the LED from bulk', () => {
  const copy = structuredClone(records), c = bambuBulkCatalogue(copy, { rows: [] })
  expect(c).toHaveLength(12)
  expect(c.map(p => p.id).sort()).toEqual(records.filter(p => p.slug.includes('filament')).map(p => p._id).sort())
  expect(copy).toEqual(records)
  for (const p of c) {
    expect(p).toMatchObject({ brand: 'Bambu Lab', stockSource: 'shop', priceNotice: BAMBU_PRICE_NOTICE })
    const line = bambuLine(p, 1)
    expect(bulkListUnitCents(p, Object.fromEntries(line.options.map(o => [o.typeId, o.optionId])))).toBe(Math.round(p.basePrice.presentmentAmount * 100))
  }
  expect(c.find(p => p.slug.endsWith('pla-matte')).types.find(t => t.label === 'Spool').options.find(o => o.name === 'With Spool').stock).toBe(0)
})

it.each(['PLA', 'PETG'])('Bambu rolls do not enter the Lanbo %s count', material => {
  const c = catalogue(), b = fixtureInput(c)
  b.lines = [fixtureLine(c, 'Lanbo', material, 'Black', 9), bambuLine(basic(c))]
  const lines = prepareBulkLines(parseBulkInput(b), c)
  expect(lines.find(l => l.ladder === material)).toMatchObject({ tierRolls: 9, band: '<10', unitCents: material === 'PLA' ? 1490 : 1390 })
  expect(lines.find(l => l.ladder === 'BAMBU_LIST')).toMatchObject({ unitCents: 2190, lineCents: 10950, tierRolls: 0, priceNotice: BAMBU_PRICE_NOTICE })
})

it('uses selected variant list fees and invalidates old versions when price or stock changes', () => {
  const c = catalogue(), p = basic(c), line = bambuLine(p, 1), spool = p.types.find(t => t.label === 'Spool')
  line.options.find(o => o.typeId === spool.id).optionId = spool.options.find(o => o.name === 'With Spool').id
  const b = { ...fixtureInput(c), lines: [line] }
  expect(prepareBulkLines(parseBulkInput(b), c)[0].unitCents).toBe(2590)
  for (const change of [r => { r.basePrice.presentmentAmount += 1 }, r => { r.variantTypes[0].options[0].stock -= 1 }]) {
    const next = structuredClone(records); change(next.find(r => r._id === p.id))
    expect(() => prepareBulkLines(parseBulkInput(b), bambuBulkCatalogue(next, { rows: [] }))).toThrow('Inventory or prices changed')
  }
})

it('uses exact Sheet colour stock when present and shop stock otherwise', () => {
  const record = records[0], row = { brand: 'Bambu Lab', product: record.name, colour: record.variantTypes[0].options[0].name, quantity: 3 }
  const p = basic(bambuBulkCatalogue(records, { rows: [row], source: 'snapshot' }))
  expect(p.types[0].options[0]).toMatchObject({ stock: 3, stockSource: 'snapshot' })
  expect(p.types[0].options[1].stockSource).toBe('shop')
  expect(p.stockSource).toBe('mixed')
})

it('rejects above-colour stock and cumulative shared spool and product limits', () => {
  for (const limit of ['colour', 'spool', 'product']) {
    const c = catalogue(), p = basic(c), b = fixtureInput(c)
    b.lines = [bambuLine(p, 4), bambuLine(p, 4)]
    if (limit === 'colour') p.types[0].options[0].stock = 7
    if (limit === 'spool') p.types.find(t => t.label === 'Spool').options.find(o => o.name === 'Without Spool').stock = 7
    if (limit === 'product') p.stock = 7
    expect(() => prepareBulkLines(parseBulkInput(b), c)).toThrow(/stock|choose 1 to 7/)
  }
})

it.each(['unitCents', 'listUnitCents', 'price', 'ladder'])('strips forged %s and uses the server list price', key => {
  const c = catalogue(), b = { ...fixtureInput(c), lines: [bambuLine(basic(c))] }
  b.lines[0][key] = 1
  const input = parseBulkInput(b)
  expect(input.lines[0]).not.toHaveProperty(key)
  expect(prepareBulkLines(input, c)[0]).toMatchObject({ unitCents: 2190, lineCents: 10950, ladder: 'BAMBU_LIST' })
})

it('persists mixed pricing and carries the same list price into the owner email and admin view', async () => {
  const c = catalogue(), b = fixtureInput(c), store = memoryStore()
  b.lines = [fixtureLine(c, 'Lanbo', 'PLA', 'Black', 9), bambuLine(basic(c))]
  await saveBulkRequest(store, parseBulkInput(b), async () => c)
  const doc = store.docs.get(b.clientRequestId)
  expect(doc.totalCents).toBe(24360)
  const message = bulkOwnerMessage(doc)
  expect(message.text).toContain(BAMBU_PRICE_NOTICE)
  expect(message.text).toContain('SGD 21.90')
  expect(message.text).toContain('SGD 109.50')
  expect(message.text).not.toContain('0 PLA rolls combined')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ requests: [doc], next: null }) })))
  render(<BulkFilamentRequests />)
  const article = await screen.findByRole('article')
  expect(article).toHaveTextContent(BAMBU_PRICE_NOTICE)
  expect(article).toHaveTextContent('Unit price: SGD 21.90 / roll')
  expect(article).toHaveTextContent('Indicative total: SGD 243.60')
  expect(article).not.toHaveTextContent('0 rolls combined')
})

it('shows the separate group, list-price line, stock maximum and unavailable colour without hiding its product', async () => {
  const c = catalogue(), p = basic(c)
  p.types[0].options[1].stock = 0
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ products: c, stockSource: 'snapshot', checkedAt: '2026-10-09' }) })))
  render(<BulkFilamentForm />)
  await screen.findByRole('button', { name: 'Add colour to enquiry' })
  expect(within(screen.getByRole('group', { name: 'Bambu Lab' })).getAllByRole('option')).toHaveLength(12)
  fireEvent.change(screen.getByLabelText('Product / material'), { target: { value: p.id } })
  expect(screen.getByRole('option', { name: /Silver.*Unavailable/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add colour to enquiry' }))
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max', '67')
  const line = screen.getByRole('region', { name: 'Request line 1' })
  expect(line).toHaveTextContent(BAMBU_PRICE_NOTICE)
  expect(line).toHaveTextContent('$25.90 / roll x 1 = $25.90')
  fireEvent.change(screen.getByLabelText('Quantity line 1'), { target: { value: '5' } })
  const lanbo = c.find(p => p.brand === 'Lanbo' && p.material === 'PLA')
  fireEvent.change(screen.getByLabelText('Product / material'), { target: { value: lanbo.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Add colour to enquiry' }))
  fireEvent.change(screen.getByLabelText('Quantity line 2'), { target: { value: '9' } })
  expect(screen.getByRole('region', { name: 'Request line 2' })).toHaveTextContent('PLA band <10 (9 rolls combined)')
  expect(screen.getByRole('region', { name: 'Request line 2' })).toHaveTextContent('$14.90 / roll x 9 = $134.10')
  expect(line).toHaveTextContent('$25.90 / roll x 5 = $129.50')
  fireEvent.change(screen.getByLabelText('Quantity line 1'), { target: { value: '68' } })
  expect(screen.getByText(/Estimate unavailable/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send request to FIT' })).toBeDisabled()
})
