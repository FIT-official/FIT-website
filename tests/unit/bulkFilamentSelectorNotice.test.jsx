import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import { bambuBulkCatalogue } from '@/lib/bulkFilamentBambu'
import { BAMBU_PRICE_NOTICE, bulkListUnitCents } from '@/lib/bulkFilamentConfig'
import { getDefaultVariantSelections } from '@/lib/seo/product'
import records from '../fixtures/bambuShop.json'
import sheet from '../fixtures/bambuSheet.json'
import { fixtureCatalogue, fixtureRows } from '../fixtures/bulkFilament'

vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })

// Public shop and bulk GETs on 2026-10-09 serve Without Spool first for
// PLA Basic, ABS and PLA Matte. Keep the older fixture and its tests intact.
const currentRecords = structuredClone(records)
for (const product of currentRecords) {
  for (const type of product.variantTypes || []) {
    const refill = type.options.findIndex(option => option.name === 'Without Spool')
    if (refill > 0) type.options.unshift(...type.options.splice(refill, 1))
  }
}
const bambu = () => bambuBulkCatalogue(currentRecords, { rows: sheet.rows, source: 'snapshot' })
const catalogue = () => [...fixtureCatalogue([...fixtureRows(),
  { product: 'FIT PLA', brand: 'FIT', material: 'PLA', colour: 'Marble White', barcode: '909', quantity: 12 },
]), ...bambu()]
const basic = products => products.find(product => product.name.endsWith('PLA Basic'))
const choose = id => fireEvent.change(screen.getByLabelText('Product / material'), { target: { value: id } })
async function mount(products) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ products, stockSource: 'snapshot', checkedAt: '2026-10-09' }) })))
  render(<BulkFilamentForm />)
  await screen.findByText(/Inventory snapshot:/)
}

it('shows the selector notice only for the selected Bambu product and retains Bambu line notices', async () => {
  const products = catalogue()
  await mount(products)
  expect(screen.queryByText(BAMBU_PRICE_NOTICE)).not.toBeInTheDocument()
  choose(basic(products).id)
  expect(screen.getByText(BAMBU_PRICE_NOTICE)).toBeInTheDocument()
  for (const product of products.filter(product => product.brand !== 'Bambu Lab')) {
    choose(product.id)
    expect(screen.queryByText(BAMBU_PRICE_NOTICE)).not.toBeInTheDocument()
  }
  choose('')
  expect(screen.queryByText(BAMBU_PRICE_NOTICE)).not.toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Spool option' })).not.toBeInTheDocument()
  choose(basic(products).id)
  fireEvent.click(screen.getByRole('button', { name: 'Add colour to enquiry' }))
  const line = screen.getByRole('region', { name: 'Request line 1' })
  expect(line).toHaveTextContent(BAMBU_PRICE_NOTICE)
  const selector = within(screen.getByLabelText('Product / material').closest('label').parentElement)
  expect(selector.getByText(BAMBU_PRICE_NOTICE)).toBeInTheDocument()
  for (const id of [...products.filter(product => product.brand !== 'Bambu Lab').map(product => product.id), '']) {
    choose(id)
    expect(selector.queryByText(BAMBU_PRICE_NOTICE)).not.toBeInTheDocument()
    expect(line).toHaveTextContent(BAMBU_PRICE_NOTICE)
  }
})

it('hides the Bambu notice when no inventory is selectable', async () => {
  await mount([])
  expect(screen.queryByText(BAMBU_PRICE_NOTICE)).not.toBeInTheDocument()
})

it.each(bambu().filter(product => product.types.some(type => type.label === 'Spool')))(
  'matches the served shop spool default for $name', async product => {
    const record = currentRecords.find(record => record._id === product.id)
    const type = product.types.find(type => type.label === 'Spool')
    expect(getDefaultVariantSelections(record)[type.name]).toBe('Without Spool')
    await mount(catalogue())
    choose(product.id)
    expect(screen.getByRole('radio', { name: /Refill \(no spool\)/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /With spool/ })).not.toBeChecked()
  },
)

it('estimates PLA Basic at 2190 cents by default and keeps With Spool selectable at 2590 cents', async () => {
  const products = catalogue(), product = basic(products)
  await mount(products)
  choose(product.id)
  expect(screen.getByText('List price: $21.90 per roll')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add colour to enquiry' }))
  expect(screen.getByRole('region', { name: 'Request line 1' })).toHaveTextContent('$21.90 / roll x 1 = $21.90')
  expect(screen.getByText('Indicative total: $21.90')).toBeInTheDocument()
  for (const [name, cents] of [['Without Spool', 2190], ['With Spool', 2590]]) {
    const options = Object.fromEntries(product.types.map(type => [type.id,
      (type.options.find(option => option.name === name) || type.options[0]).id]))
    expect(bulkListUnitCents(product, options)).toBe(cents)
  }
  fireEvent.click(screen.getByRole('radio', { name: /With spool/ }))
  expect(screen.getByRole('radio', { name: /With spool/ })).toBeChecked()
  expect(screen.getByText('List price: $25.90 per roll')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add colour to enquiry' }))
  expect(screen.getByRole('region', { name: 'Request line 2' })).toHaveTextContent('$25.90 / roll x 1 = $25.90')
  expect(screen.getByText('Indicative total: $47.80')).toBeInTheDocument()
  choose(products[0].id)
  choose(product.id)
  expect(screen.getByRole('radio', { name: /Refill \(no spool\)/ })).toBeChecked()
})

it('also uses the first shop option when Bambu is the initial product or Add another colour resets the chooser', async () => {
  await mount([basic(bambu())])
  expect(screen.getByRole('radio', { name: /Refill \(no spool\)/ })).toBeChecked()
  fireEvent.click(screen.getByRole('radio', { name: /With spool/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add colour to enquiry' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add another colour' }))
  expect(screen.getByRole('radio', { name: /Refill \(no spool\)/ })).toBeChecked()
})

it('preserves a shop With Spool default when it is served first', async () => {
  await mount([basic(bambuBulkCatalogue(records, { rows: [] }))])
  expect(screen.getByRole('radio', { name: /With spool/ })).toBeChecked()
  expect(screen.getByText('List price: $25.90 per roll')).toBeInTheDocument()
})
