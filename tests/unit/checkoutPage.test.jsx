import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { useEffect } from 'react'

const state = vi.hoisted(() => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_fixture'
    return { address: null, sessionOk: true, expireOk: true, breakdown: [], savedAddress: null, sessionCalls: 0 }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => Promise.resolve({})) }))
vi.mock('@stripe/react-stripe-js', () => ({
    CheckoutProvider: ({ children }) => <div data-testid="stripe-provider">{children}</div>,
    PaymentElement: ({ onReady }) => { useEffect(() => { onReady() }, []); return <div data-testid="payment-element" /> },
    useCheckout: () => ({ confirm: vi.fn() }),
}))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
const intent = '00000000-0000-4000-8000-000000000001'
const nextIntent = '00000000-0000-4000-8000-000000000002'
const fullAddress = { street: '1 Test St', unitNumber: '', city: 'Singapore', state: '', postalCode: '123456', country: 'SG' }
const shippingLine = { productId: 'custom-print:req_1', name: 'Custom 3D Print', quantity: 1, price: 18.5,
    priceBeforeDiscount: 18.5, basePrice: 0, variantInfo: [], chosenDeliveryType: 'courier', deliveryFee: 4, total: 22.5, currency: 'SGD' }
const calls = (url, method) => global.fetch.mock.calls.filter(([u, init]) => u === url && (!method || init?.method === method))
beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear()
    state.address = null; state.sessionOk = true; state.expireOk = true
    state.breakdown = [shippingLine]; state.savedAddress = null; state.sessionCalls = 0
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    global.fetch = vi.fn(async (url, init) => {
        const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
        if (url === '/api/user/cart') return json({ guest: false, cart: [{}], checkoutAttemptId: intent })
        if (url === '/api/checkout/breakdown') return json({ cartBreakdown: state.breakdown, address: state.address })
        if (url === '/api/checkout/session' && init?.method === 'DELETE') return state.expireOk ? json({ attemptId: nextIntent }) : json({ error: 'Payment may already be processing.' }, 409)
        if (url === '/api/checkout/session') {
            state.sessionCalls++
            if (state.breakdown.some(line => line.deliveryTypeMismatch)) return json({ error: 'Pick a delivery option for Custom 3D Print in the cart.' }, 409)
            if (state.breakdown.some(line => line.chosenDeliveryType === 'courier') && !state.address?.postalCode) return json({ error: 'Add a complete delivery address to pay.', code: 'checkout_address_required' }, 400)
            if (!state.sessionOk) return json({ error: 'A product is no longer available' }, 409)
            return json({ attemptId: intent, sessionId: 'cs_order', clientSecret: 'secret', cartBreakdown: state.breakdown, userContact: state.address })
        }
        if (url === '/api/user/contact/address' && init?.method === 'POST') {
            state.address = state.savedAddress = JSON.parse(init.body).address
            return json({ success: true, address: state.address })
        }
        throw new Error('Unexpected request ' + url)
    })
})
afterEach(cleanup)
async function renderCheckout() {
    const { default: CheckOut } = await import('@/app/checkout/CheckOut')
    render(<CheckOut />); await screen.findByText('Order Summary')
}
function fillAddress(address = fullAddress) {
    for (const [label,key] of [[/Street address/,'street'], [/Unit/,'unitNumber'], [/^City/,'city'], [/State/,'state'], [/Postal code/,'postalCode'], [/^Country/,'country']]) {
        fireEvent.change(screen.getByLabelText(label), { target: { value: address[key] } })
    }
}
describe('checkout address and payment contract', () => {
    it('keeps the quoted summary visible while asking for a complete address', async () => {
        await renderCheckout()
        expect(screen.getByTestId('order-total')).toHaveTextContent('S$22.50')
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled()
        expect(screen.getByTestId('pay-blocked-reason')).toHaveTextContent('Add a delivery address to pay.')
        expect(screen.queryByTestId('stripe-provider')).not.toBeInTheDocument()
    })
    it('saves an address without inventing a unit number or state, then enables payment', async () => {
        await renderCheckout(); fillAddress()
        fireEvent.click(screen.getByRole('button', { name: 'Save delivery address' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled())
        expect(state.savedAddress).toEqual(fullAddress)
        expect(screen.getByTestId('saved-address')).toHaveTextContent('1 Test St')
        expect(calls('/api/checkout/session', 'POST')).toHaveLength(2)
    })
    it('rejects incomplete input before saving', async () => {
        await renderCheckout(); fillAddress({ ...fullAddress, postalCode: '' })
        fireEvent.click(screen.getByRole('button', { name: 'Save delivery address' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Postal code')
        expect(calls('/api/user/contact/address', 'POST')).toHaveLength(0)
    })
    it('prefills a partial address', async () => {
        state.address = { ...fullAddress, postalCode: '' }
        await renderCheckout()
        expect(screen.getByLabelText(/Street address/)).toHaveValue('1 Test St')
    })
    it('does not require an address for pickup', async () => {
        state.breakdown = [{ ...shippingLine, chosenDeliveryType: 'pickup', deliveryFee: 0 }]
        await renderCheckout()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled())
        expect(screen.getByText('Nothing in this order ships, so an address is optional.')).toBeInTheDocument()
    })
    it('expires the old session before allowing an address edit and sends the replacement intent', async () => {
        state.address = fullAddress; await renderCheckout()
        fireEvent.click(screen.getByRole('button', { name: 'Edit order details' }))
        await screen.findByTestId('delivery-address-form')
        expect(calls('/api/checkout/session', 'DELETE')[0][1].headers['X-Checkout-Attempt']).toBe(intent)
        expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument()
        fillAddress({ ...fullAddress, postalCode: '654321' })
        fireEvent.click(screen.getByRole('button', { name: 'Save delivery address' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled())
        expect(calls('/api/checkout/session', 'POST').at(-1)[1].headers['X-Checkout-Attempt']).toBe(nextIntent)
        expect(screen.getByTestId('saved-address')).toHaveTextContent('654321')
    })
    it('does not expose editing or another payment when cancellation is uncertain', async () => {
        state.address = fullAddress; state.expireOk = false; await renderCheckout()
        fireEvent.click(screen.getByRole('button', { name: 'Edit order details' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Payment may already be processing')
        expect(screen.queryByTestId('delivery-address-form')).not.toBeInTheDocument()
        expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument()
        expect(calls('/api/checkout/session', 'POST')).toHaveLength(1)
    })
    it('shows a retryable provider error without hiding the order', async () => {
        state.address = fullAddress; state.sessionOk = false; await renderCheckout()
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled()
        expect(screen.getByTestId('pay-blocked-reason')).toHaveTextContent('no longer available')
        state.sessionOk = true
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled())
    })
    it('does not offer payment for a stale delivery option', async () => {
        state.address = fullAddress; state.breakdown = [{ ...shippingLine, deliveryTypeMismatch: true }]
        await renderCheckout()
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled()
        expect(screen.getByTestId('pay-blocked-reason')).toHaveTextContent('Pick a delivery option')
        expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument()
    })
})
