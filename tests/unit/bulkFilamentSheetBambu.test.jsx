import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import records from '../fixtures/bambuShop.json'
import evidence from '../fixtures/bambuSheet.json'
import { bambuBulkCatalogue } from '@/lib/bulkFilamentBambu'
import { bulkCombinationKey, bulkSelectionStock } from '@/lib/bulkFilamentSelection'
import { parseBulkInput, prepareBulkLines } from '@/lib/bulkFilament'
import { fixtureCatalogue, fixtureInput, fixtureLine } from '../fixtures/bulkFilament'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })
const stock = rows => ({ rows: rows || structuredClone(evidence.rows), source: 'sheet', checkedAt: '2026-10-09' })
const catalogue = rows => [...fixtureCatalogue(), ...bambuBulkCatalogue(records, stock(rows))]
const basic = c => c.find(p => p.slug?.endsWith('-1kg-pla-basic'))
const selected = (p, colour = 'Jade White (10100)', spool = 'With Spool') => Object.fromEntries(p.types.map(t => [t.id, t.options.find(o => o.name === (t.id === p.colourTypeId ? colour : spool)).id]))
const line = (p, quantity, colour, spool) => ({ productId: p.id, version: p.version, quantity, remarks: 'SYNTHETIC LOCAL ONLY', options: Object.entries(selected(p, colour, spool)).map(([typeId, optionId]) => ({ typeId, optionId })) })
const prepare = (c, lines) => prepareBulkLines(parseBulkInput({ ...fixtureInput(c), lines }), c)

it('matches the observed Sheet naming schema using synthetic stock and BambuLab branding while separating spool and refill quantities', () => {
  const c = catalogue(), p = basic(c)
  expect(c.filter(p => p.brand === 'Bambu Lab')).toHaveLength(12)
  expect(p.stockSource).toBe('sheet')
  for (const [colour, withSpool, refill] of [['Jade White (10100)',17,6],['Silver (10102)',3,8],['Black (10101)',2,12]]) {
    expect(bulkSelectionStock(p, selected(p, colour, 'With Spool'))).toBe(withSpool)
    expect(bulkSelectionStock(p, selected(p, colour, 'Without Spool'))).toBe(refill)
  }
  expect(bulkSelectionStock(p, selected(p, 'Magenta (10202)'))).toBe(0)
  const gradient = c.find(p => p.slug?.endsWith('pla-basic-gradient'))
  expect(gradient.types[0].options.find(o => o.name === 'Cotton Candy Cloud (10905)').stock).toBe(0)
  expect(c.find(p => p.slug?.endsWith('-asa')).types[0].options.find(o => o.name === 'Grey (45102)').stock).toBe(9)
})
it('does not let separate colour and spool totals invent a stocked combination', () => {
  const c = catalogue(), p = basic(c)
  const valid = prepare(c, [line(p, 17), line(p, 6, undefined, 'Without Spool')])
  expect(valid.map(l => l.unitCents)).toEqual([2590,2190])
  expect(valid.map(l => l.lineCents)).toEqual([44030,13140])
  expect(() => prepare(c, [line(p, 18)])).toThrow('selected spool option has 17 rolls')
  expect(() => prepare(c, [line(p, 7, undefined, 'Without Spool')])).toThrow('selected spool option has 6 rolls')
  expect(() => prepare(c, [line(p, 10), line(p, 8)])).toThrow('selected spool option has 17 rolls')
  expect(bulkSelectionStock(p, selected(p), [line(p,10),line(p,8)], 1)).toBe(7)
})
it('rechecks changed Sheet stock and fails closed for deleted, invalid and duplicate stock rows', () => {
  const c = catalogue(), p = basic(c), input = parseBulkInput({ ...fixtureInput(c), lines: [line(p,1)] })
  const rows = structuredClone(evidence.rows), row = rows.find(r => r.barcode === 'SYNTHETIC-10100-With-Spool')
  row.quantity = 2
  const changed = catalogue(rows)
  expect(bulkSelectionStock(basic(changed), selected(p))).toBe(2)
  expect(() => prepareBulkLines(input, changed)).toThrow('Inventory or prices changed')
  rows.push({ ...row, quantity: 1 })
  expect(bulkSelectionStock(basic(catalogue(rows)), selected(p))).toBe(1)
  row.quantity = '99'
  expect(bulkSelectionStock(basic(catalogue(rows)), selected(p))).toBe(0)
  expect(basic(catalogue([])).stock).toBe(0)
  expect(bulkSelectionStock(p, { ...selected(p), [p.colourTypeId]: 'f'.repeat(24) })).toBe(0)
})
it('preserves Lanbo discount ladders and excludes Bambu quantities from every tier', () => {
  const c = catalogue(), p = basic(c)
  const prices = prepare(c, [fixtureLine(c,'Lanbo','PLA','Black',9),line(p,10)])
  expect(prices.find(l => l.ladder === 'PLA')).toMatchObject({ tierRolls:9,unitCents:1490 })
  expect(prices.find(l => l.ladder === 'BAMBU_LIST')).toMatchObject({ tierRolls:0,unitCents:2590,lineCents:25900 })
})
it('keeps PVA at its approved 0.5kg display size and existing public price/stock/identity', () => {
  const p = catalogue().find(p => p.slug?.endsWith('pva-support')), original = records.find(r => r._id === p.id)
  expect(p).toMatchObject({ name:'Bambu Lab 3D Printing Filament 0.5kg PVA Support',stock:10,stockSource:'shop',slug:original.slug,basePrice:original.basePrice })
  expect(p.types[0].options[0]).toMatchObject({id:'6aa8eae9a1ca543d895a4923',name:'White (66400)',stock:10})
  expect(original.name).toContain('1kg')
})
it('shows exact combination limits, official local photos and readable quantity controls', async () => {
  const c = catalogue(), p = basic(c)
  vi.stubGlobal('fetch',vi.fn(async () => ({ok:true,json:async () => ({products:c,checkedAt:'2026-10-09',stockSource:'sheet'})})))
  render(<BulkFilamentForm />)
  await screen.findByRole('button',{name:'Add colour to enquiry'})
  fireEvent.change(screen.getByLabelText('Product / material'),{target:{value:p.id}})
  expect(screen.getByText('17 recorded stock limit for this selection')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max','17')
  expect(screen.getByLabelText('Quantity line 1').closest('label')).toHaveTextContent('Qty')
  expect(screen.getByRole('region',{name:'Request line 1'}).querySelector('img').getAttribute('src')).toContain('/images/filament/bambu/')
  fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'18'}})
  expect(screen.getByText(/Estimate unavailable/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Send request to FIT'})).toBeDisabled()
  expect(bulkCombinationKey(selected(p))).toBe(Object.entries(selected(p)).sort(([a],[b])=>a.localeCompare(b)).map(([t,o])=>`${t}:${o}`).join('|'))
})
