// /cart with a quoted custom-print line and no saved address (LIVE-A UI side):
// the summary keeps its totals (no "No items in cart"), the inline delivery
// address form replaces the old "Add Delivery Address" link box, and Proceed
// to Checkout is disabled with a reason until the address is saved.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const state = vi.hoisted(() => ({ address: null, savedAddress: null, requestStatus: 'quoted' }))

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: 'user_1' }, isLoaded: true }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }) => <img src={typeof src === 'string' ? src : ''} alt={alt} />,
}))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/components/General/CurrencyContext', () => ({ useCurrency: () => 'SGD' }))
vi.mock('@/utils/convertCurrency', () => ({ convertToGlobalCurrency: vi.fn(async (amount) => amount) }))
vi.mock('@/components/Cart/CustomPrintUpload', () => ({ default: () => <div data-testid="custom-print-upload" /> }))

import Cart from '@/app/cart/Cart'

const request = () => ({
    requestId: 'req_1',
    status: state.requestStatus,
    quoteMode: 'instant',
    quote: { total: 18.5 },
    modelFile: { s3Key: 'models/part.stl', originalName: 'part.stl' },
    printConfiguration: { isConfigured: true },
    delivery: { deliveryTypes: [{ type: 'courier', price: 4 }] },
})

const breakdownLine = () => ({
    productId: 'custom-print:req_1',
    name: 'Custom 3D Print',
    quantity: 1,
    price: state.requestStatus === 'quoted' ? 18.5 : 0,
    priceBeforeDiscount: state.requestStatus === 'quoted' ? 18.5 : 0,
    basePrice: 0,
    variantInfo: [],
    chosenDeliveryType: 'courier',
    deliveryFee: state.requestStatus === 'quoted' ? 4 : 0,
    total: state.requestStatus === 'quoted' ? 22.5 : 0,
    currency: 'SGD',
    customPrintRequestId: 'req_1',
    customPrintStatus: state.requestStatus,
    needsDeliveryAddress: true,
})

const fullAddress = { street: '1 Test St', unitNumber: '#01-01', city: 'Singapore', state: 'Singapore', postalCode: '123456', country: 'Singapore' }

beforeEach(() => {
    vi.clearAllMocks()
    state.address = null
    state.savedAddress = null
    state.requestStatus = 'quoted'
    global.fetch = vi.fn(async (url, init) => {
        const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
        if (url === '/api/admin/settings') return json({ settings: { additionalDeliveryTypes: [] } })
        if (url === '/api/user/cart') {
            return json({ cart: [{ productId: 'custom-print:req_1', requestId: 'req_1', quantity: 1, chosenDeliveryType: 'courier', price: 18.5 }] })
        }
        if (url === '/api/product/custom-print-config') {
            return json({ product: { _id: 'prod_cp', name: 'Custom 3D Print', images: [], delivery: { deliveryTypes: [{ type: 'courier', price: 4 }] } } })
        }
        if (url === '/api/checkout/breakdown') {
            return json({ cartBreakdown: [breakdownLine()], addressMissing: !state.address, needsDeliveryAddress: true, address: state.address })
        }
        if (url === '/api/custom-print?requestId=req_1') return json({ request: request() })
        if (url === '/api/user/contact/address' && init?.method === 'POST') {
            state.savedAddress = JSON.parse(init.body).address
            state.address = state.savedAddress
            return json({ success: true, address: state.savedAddress })
        }
        throw new Error('Unexpected request ' + url)
    })
})
afterEach(cleanup)

const proceed = () => screen.getByRole('link', { name: 'Proceed to Checkout' })

describe('cart address gate', () => {
    it('keeps the summary totals for a quoted custom print and shows the inline address form', async () => {
        render(<Cart />)
        expect(await screen.findByText('Grand Total')).toBeInTheDocument()
        expect(screen.getByText('SGD 22.50')).toBeInTheDocument()
        expect(screen.queryByText('No items in cart.')).not.toBeInTheDocument()
        expect(screen.queryByText('Add Delivery Address')).not.toBeInTheDocument()
        expect(screen.getByTestId('delivery-address-form')).toBeInTheDocument()
        expect(proceed()).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByTestId('checkout-blocked-reason')).toHaveTextContent('Add a delivery address to check out.')
    })

    it('enables Proceed to Checkout once the address is saved inline', async () => {
        render(<Cart />)
        const form = await screen.findByTestId('delivery-address-form')
        const type = (label, value) => fireEvent.change(within(form).getByLabelText(label), { target: { value } })
        type(/Street address/, fullAddress.street)
        type(/Unit \/ apt number/, fullAddress.unitNumber)
        type(/^City/, fullAddress.city)
        type(/State \/ province/, fullAddress.state)
        type(/Postal code/, fullAddress.postalCode)
        type(/^Country/, fullAddress.country)
        fireEvent.click(within(form).getByRole('button', { name: 'Save delivery address' }))

        await waitFor(() => expect(state.savedAddress).toEqual(fullAddress))
        await waitFor(() => expect(proceed()).toHaveAttribute('aria-disabled', 'false'))
        expect(screen.queryByTestId('delivery-address-form')).not.toBeInTheDocument()
        expect(screen.queryByTestId('checkout-blocked-reason')).not.toBeInTheDocument()
        expect(screen.getByText('SGD 22.50')).toBeInTheDocument()
    })

    it('is ready to check out when an address already exists', async () => {
        state.address = fullAddress
        render(<Cart />)
        await screen.findByText('Grand Total')
        expect(screen.queryByTestId('delivery-address-form')).not.toBeInTheDocument()
        expect(proceed()).toHaveAttribute('aria-disabled', 'false')
    })

    it('blocks checkout for an unquoted custom print even with an address', async () => {
        state.address = fullAddress
        state.requestStatus = 'pending_config'
        render(<Cart />)
        await screen.findByText('Grand Total')
        await waitFor(() => expect(proceed()).toHaveAttribute('aria-disabled', 'true'))
        expect(screen.getByTestId('checkout-blocked-reason')).toHaveTextContent('Finish your custom print request')
    })
})
