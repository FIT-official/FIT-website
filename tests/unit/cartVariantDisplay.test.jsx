import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { shippingFixture } from '@/scripts/shipping/fixtures'
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown'
import { applyShopShipping } from '@/lib/shopShipping'

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isLoaded: true }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/components/General/CurrencyContext', () => ({ useCurrency: () => 'SGD' }))
vi.mock('@/components/Cart/CustomPrintUpload', () => ({ default: () => null }))
import Cart from '@/app/cart/Cart'

let data
beforeEach(() => {
  data = shippingFixture('filament')
  Object.assign(data.products[0], {
    _id: '6974d555afadda8ec64083c3', infiniteStock: true,
    variantTypes: [
      { name: 'Spool', options: [{ name: 'Coca Brown (10802)', additionalFee: 0 }] },
      { name: 'Colour', options: [{ name: 'Without Spool', additionalFee: 0 }] },
    ],
  })
  Object.assign(data.cart[0], { productId: data.products[0]._id, selectedVariants: { Spool: 'Coca Brown (10802)', Colour: 'Without Spool' } })
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const json = body => ({ ok: true, status: 200, json: async () => structuredClone(body) })
    if (url === '/api/user/cart') return json({ cart: data.cart, guest: true })
    if (url.startsWith('/api/product?')) return json({ products: data.products })
    if (url === '/api/delivery-types') return json({ deliveryTypes: [] })
    if (url === '/api/checkout/breakdown') {
      const product = data.products[0]
      const lines = [{ product, breakdown: await calculateCartItemBreakdown({ item: data.cart[0], product, address: null }) }]
      applyShopShipping(lines, null)
      return json({ cartBreakdown: lines.map(line => line.breakdown), addressMissing: true, needsDeliveryAddress: true })
    }
    if (url === '/api/user/cart/delivery') {
      data.cart[0].chosenDeliveryType = JSON.parse(init.body).chosenDeliveryType
      return json({ success: true })
    }
    throw new Error('Unexpected request ' + url)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('displays a persisted legacy colour without changing identifiers, price, shipping or mutation payload', async () => {
  const before = JSON.stringify(data)
  render(<Cart />)
  expect(await screen.findByText('Spool: Cocoa Brown (10802)')).toBeVisible()
  expect(screen.getByText('Colour: Without Spool')).toBeVisible()
  const summary = await screen.findByTestId('cart-summary')
  await waitFor(() => expect(summary).toHaveTextContent('SGD 28.10'))
  expect(within(screen.getByTestId('summary-delivery')).getByText('SGD 6.20')).toBeVisible()
  expect(summary).toHaveTextContent('SGD 21.90')
  expect(JSON.stringify(data)).toBe(before)
  fireEvent.change(screen.getByRole('combobox', { name: 'Change delivery type' }), { target: { value: 'pick-up' } })
  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url === '/api/user/cart/delivery')).toBe(true))
  const request = global.fetch.mock.calls.find(([url]) => url === '/api/user/cart/delivery')
  expect(JSON.parse(request[1].body)).toMatchObject({ productId: data.products[0]._id, selectedVariants: { Spool: 'Coca Brown (10802)', Colour: 'Without Spool' }, chosenDeliveryType: 'pick-up' })
})

it('also labels the old variantId display without changing its stored identifier', async () => {
  Object.assign(data.cart[0], { selectedVariants: {}, variantId: 'legacy-brown' })
  Object.assign(data.products[0], { variantTypes: [], variants: [{ _id: 'legacy-brown', name: 'Coca Brown (10802)', price: { presentmentAmount: 21.9, presentmentCurrency: 'SGD' } }] })
  const before = JSON.stringify(data)
  render(<Cart />)
  expect(await screen.findByText('Cocoa Brown (10802)')).toBeVisible()
  expect(JSON.stringify(data)).toBe(before)
})

it('leaves the same option text on an unrelated material unchanged', async () => {
  Object.assign(data.products[0], { slug: 'another-material', _id: 'another-product' })
  data.cart[0].productId = 'another-product'
  render(<Cart />)
  expect(await screen.findByText('Spool: Coca Brown (10802)')).toBeVisible()
  expect(screen.queryByText('Spool: Cocoa Brown (10802)')).not.toBeInTheDocument()
})
