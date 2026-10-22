import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { shippingFixture } from '@/scripts/shipping/fixtures'
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown'
import { applyShopShipping } from '@/lib/shopShipping'

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: null, isLoaded: true }) }))
vi.mock('next/navigation', () => { const params = new URLSearchParams(); return { useSearchParams: () => params } })
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/components/General/CurrencyContext', () => ({ useCurrency: () => 'SGD' }))
vi.mock('@/components/Cart/CustomPrintUpload', () => ({ default: () => null }))
import Cart from '@/app/cart/Cart'

let data, pending, mutationCalls
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(body) })
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
beforeEach(() => {
  data = shippingFixture('filament')
  Object.assign(data.products[0], { _id: '6974d555afadda8ec64083c3', infiniteStock: true, variantTypes: [{ name: 'Colour', options: [{ name: 'Coca Brown (10802)', additionalFee: 0 }] }] })
  Object.assign(data.cart[0], { productId: data.products[0]._id, selectedVariants: { Colour: 'Coca Brown (10802)' } })
  mutationCalls = []
  pending = defer()
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (init?.method && init.method !== 'GET') { mutationCalls.push({ url, ...init }); return pending.promise }
    if (url === '/api/user/cart') return json({ cart: data.cart, guest: true })
    if (url.startsWith('/api/product?')) return json({ products: data.products })
    if (url === '/api/delivery-types') return json({ deliveryTypes: [] })
    if (url === '/api/checkout/breakdown') {
      const product = data.products[0]
      const lines = [{ product, breakdown: await calculateCartItemBreakdown({ item: data.cart[0], product, address: null }) }]
      applyShopShipping(lines, null)
      return json({ cartBreakdown: lines.map(line => line.breakdown), addressMissing: true, needsDeliveryAddress: true })
    }
    throw Error('Unexpected read ' + url)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function ready() {
  render(<Cart />)
  await waitFor(() => expect(screen.getByTestId('cart-summary')).toHaveTextContent('SGD 28.10'))
  expect(screen.getByText('Colour: Cocoa Brown (10802)')).toBeVisible()
}
it('coalesces repeated quantity activation while saving and preserves the legacy payload', async () => {
  await ready()
  const plus = screen.getByRole('button', { name: 'Increase quantity' })
  act(() => { fireEvent.click(plus); fireEvent.click(plus) })
  expect(mutationCalls).toHaveLength(1)
  expect(JSON.parse(mutationCalls[0].body)).toEqual({ cartItem: { productId: data.cart[0].productId, quantity: 1, variantId: null, selectedVariants: { Colour: 'Coca Brown (10802)' }, chosenDeliveryType: 'standard-shipping' } })
  data.cart[0].quantity = 2
  await act(async () => pending.resolve(json({ success: true })))
  await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Cart quantity' })).toHaveValue(2))
  expect(screen.getByTestId('cart-summary')).toHaveTextContent('SGD 50.00')
  expect(mutationCalls).toHaveLength(1)
})
it('coalesces delivery changes while the first save is pending', async () => {
  await ready()
  const select = screen.getByRole('combobox', { name: 'Change delivery type' })
  act(() => { fireEvent.change(select, { target: { value: 'pick-up' } }); fireEvent.change(select, { target: { value: 'express-courier' } }) })
  expect(mutationCalls).toHaveLength(1)
  expect(JSON.parse(mutationCalls[0].body)).toMatchObject({ chosenDeliveryType: 'pick-up', selectedVariants: { Colour: 'Coca Brown (10802)' } })
  data.cart[0].chosenDeliveryType = 'pick-up'
  await act(async () => pending.resolve(json({ success: true })))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Change delivery type' })).toHaveValue('pick-up'))
  await waitFor(() => expect(screen.getByTestId('cart-summary')).toHaveTextContent('SGD 21.90'))
})
it('does not replay an interrupted quantity request and reloads authoritative cart state', async () => {
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
  // Server accepted the mutation but its response was lost.
  data.cart[0].quantity = 2
  await act(async () => pending.reject(Error('Connection interrupted')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect')
  expect(screen.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute('aria-disabled', 'true')
  expect(mutationCalls).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Cart quantity' })).toHaveValue(2))
  expect(mutationCalls).toHaveLength(1)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('does not replay an interrupted delivery request and recovers the saved delivery choice', async () => {
  await ready()
  fireEvent.change(screen.getByRole('combobox', { name: 'Change delivery type' }), { target: { value: 'pick-up' } })
  data.cart[0].chosenDeliveryType = 'pick-up'
  await act(async () => pending.reject(Error('Connection interrupted')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Change delivery type' })).toHaveValue('pick-up'))
  expect(mutationCalls).toHaveLength(1)
})
it('guards repeated checkout activation and stays on the cart when saving is interrupted', async () => {
  await ready()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this note' } })
  const checkout = screen.getByRole('link', { name: 'Proceed to Checkout' })
  act(() => { fireEvent.click(checkout); fireEvent.click(checkout) })
  expect(mutationCalls).toHaveLength(1)
  expect(mutationCalls[0].url).toBe('/api/user/cart/note')
  expect(checkout).toHaveAttribute('aria-disabled', 'true')
  await act(async () => pending.reject(Error('Connection interrupted')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect')
  expect(screen.getByRole('textbox')).toHaveValue('Keep this note')
  expect(screen.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute('aria-disabled', 'true')
  expect(mutationCalls).toHaveLength(1)
})
