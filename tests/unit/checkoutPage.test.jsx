// /checkout gating (design step 3): the Pay button is disabled with an inline
// reason while a shipping line has no delivery address, the address panel is
// editable in place (saved through /api/user/contact/address), and a saved
// address enables payment by recreating the Stripe session. No alert(), no
// "Unable to process checkout." dead end.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({
    address: null,
    sessionOk: true,
    breakdown: [],
    savedAddress: null,
}))

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: 'user_1' }, isLoaded: true }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => Promise.resolve({})) }))
vi.mock('@stripe/react-stripe-js', () => ({
    CheckoutProvider: ({ children }) => <div data-testid="stripe-provider">{children}</div>,
    PaymentElement: () => <div data-testid="payment-element" />,
    useCheckout: () => ({ confirm: vi.fn(async () => ({ type: 'error', error: { message: 'nope' } })) }),
}))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const shippingLine = {
    productId: 'custom-print:req_1',
    name: 'Custom 3D Print',
    quantity: 1,
    price: 18.5,
    priceBeforeDiscount: 18.5,
    basePrice: 0,
    variantInfo: [],
    chosenDeliveryType: 'courier',
    deliveryFee: 4,
    total: 22.5,
    currency: 'SGD',
    needsDeliveryAddress: true,
}

const fullAddress = { street: '1 Test St', unitNumber: '#01-01', city: 'Singapore', state: 'Singapore', postalCode: '123456', country: 'Singapore' }

const calls = (url, method) => global.fetch.mock.calls.filter(([u, init]) => u === url && (!method || init?.method === method))

beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    vi.clearAllMocks()
    state.address = null
    state.sessionOk = true
    state.breakdown = [shippingLine]
    state.savedAddress = null
    global.fetch = vi.fn(async (url, init) => {
        const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
        if (url === '/api/checkout/breakdown') {
            return json({ cartBreakdown: state.breakdown, addressMissing: !state.address, needsDeliveryAddress: true, address: state.address })
        }
        if (url === '/api/checkout/session') {
            if (!state.address) return json({ error: 'Missing delivery address' }, 400)
            if (!state.sessionOk) return json({ error: 'A product is no longer available' }, 409)
            return json({ clientSecret: `cs_${state.address.postalCode}` })
        }
        if (url === '/api/user/contact/address' && init?.method === 'POST') {
            const body = JSON.parse(init.body)
            state.savedAddress = body.address
            state.address = body.address
            return json({ success: true, address: body.address })
        }
        if (url === '/api/user/contact/address') return json({ address: state.address })
        if (url === '/api/user/contact/phone') return json({ phone: { countryCode: '+65', number: '91234567' } })
        throw new Error('Unexpected request ' + url)
    })
})
afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
})

const renderCheckout = async () => {
    const { default: CheckOut } = await import('@/app/checkout/CheckOut')
    render(<CheckOut />)
    await screen.findByText('Order Summary')
}

const fillAddress = (address = fullAddress) => {
    fireEvent.change(screen.getByLabelText(/Street address/), { target: { value: address.street } })
    fireEvent.change(screen.getByLabelText(/Unit \/ apt number/), { target: { value: address.unitNumber } })
    fireEvent.change(screen.getByLabelText(/^City/), { target: { value: address.city } })
    fireEvent.change(screen.getByLabelText(/State \/ province/), { target: { value: address.state } })
    fireEvent.change(screen.getByLabelText(/Postal code/), { target: { value: address.postalCode } })
    fireEvent.change(screen.getByLabelText(/^Country/), { target: { value: address.country } })
}

describe('checkout Pay gating', () => {
    it('shows the order with a quoted custom print, and disables Pay with a reason when no address is saved', async () => {
        await renderCheckout()
        expect(screen.queryByText('Your cart is empty.')).not.toBeInTheDocument()
        expect(screen.getByText('Custom 3D Print')).toBeInTheDocument()
        expect(screen.getByTestId('order-total')).toHaveTextContent('S$22.50')

        const pay = screen.getByRole('button', { name: 'Pay Now' })
        expect(pay).toBeDisabled()
        expect(screen.getByTestId('pay-blocked-reason')).toHaveTextContent('Add a delivery address to pay.')
        expect(screen.queryByText('Unable to process checkout.')).not.toBeInTheDocument()
        // The inline form is shown in place of the read-only inputs.
        expect(screen.getByTestId('delivery-address-form')).toBeInTheDocument()
    })

    it('enables Pay when the account already has an address', async () => {
        state.address = fullAddress
        await renderCheckout()
        expect(await screen.findByTestId('stripe-provider')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled()
        expect(screen.queryByTestId('pay-blocked-reason')).not.toBeInTheDocument()
        expect(screen.getByTestId('saved-address')).toHaveTextContent('1 Test St, #01-01')
        expect(screen.queryByTestId('delivery-address-form')).not.toBeInTheDocument()
    })

    it('saves the address inline, recreates the session and enables Pay', async () => {
        await renderCheckout()
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled()

        fillAddress()
        fireEvent.click(screen.getByRole('button', { name: 'Save delivery address' }))

        await waitFor(() => expect(state.savedAddress).toEqual(fullAddress))
        expect(await screen.findByTestId('stripe-provider')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled())
        expect(screen.queryByTestId('pay-blocked-reason')).not.toBeInTheDocument()
        expect(screen.getByTestId('saved-address')).toHaveTextContent('Singapore Singapore 123456')
        // Session created once on load (refused) and once after the save.
        expect(calls('/api/checkout/session', 'POST')).toHaveLength(2)
    })

    it('rejects an incomplete address inline without calling the API', async () => {
        await renderCheckout()
        fillAddress({ ...fullAddress, postalCode: '' })
        fireEvent.click(screen.getByRole('button', { name: 'Save delivery address' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Postal code')
        expect(calls('/api/user/contact/address', 'POST')).toHaveLength(0)
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled()
    })

    it('lets a saved address be edited in place', async () => {
        state.address = fullAddress
        await renderCheckout()
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
        expect(screen.getByTestId('delivery-address-form')).toBeInTheDocument()
        expect(screen.getByLabelText(/Postal code/)).toHaveValue('123456')
        fireEvent.change(screen.getByLabelText(/Postal code/), { target: { value: '654321' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(state.savedAddress?.postalCode).toBe('654321'))
        expect(await screen.findByTestId('saved-address')).toHaveTextContent('654321')
    })

    it('surfaces a non-address session error inline instead of the old dead end', async () => {
        state.address = fullAddress
        state.sessionOk = false
        await renderCheckout()
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled()
        expect(screen.getByTestId('pay-blocked-reason')).toHaveTextContent('A product is no longer available')
        expect(screen.queryByText('Unable to process checkout.')).not.toBeInTheDocument()
    })

    it('does not require an address when nothing ships', async () => {
        state.address = fullAddress
        state.breakdown = [{ ...shippingLine, chosenDeliveryType: 'pickup', deliveryFee: 0, total: 18.5, needsDeliveryAddress: false }]
        await renderCheckout()
        expect(await screen.findByTestId('stripe-provider')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled()
    })
})
