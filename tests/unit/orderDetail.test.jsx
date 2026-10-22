// RTL smokes for the rebuilt customer order detail page (references:
// docs/account-ui-reference-images/order-details.png + order-progress.png):
// facts strip (order date / delivered date when derivable / order ID with
// copy / Stripe payment method), icon-step progress timeline mapped from the
// real status set + statusHistory timestamps (with the honest fallbacks for
// exception statuses and missing history), thumbnail item rows through the
// image proxy, cost summary derived from existing cartItem fields, address
// blocks (order/user contact for shipping, Stripe billing), a print-friendly
// summary button, and the §10.1 punctuation law.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import OrderPage from '@/app/account/orders/[orderId]/OrderPage'

// jsdom has no ResizeObserver (ViewTabs in the AccountShell observes its strip).
global.ResizeObserver =
    global.ResizeObserver ||
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

vi.mock('next/navigation', () => ({
    usePathname: () => '/account/orders/x',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => ({ get: () => null }),
}))

// The page compares the Clerk viewer id to the product's creatorUserId to
// decide whether the message-seller CTA may show.
let mockViewerId = 'user_buyer_1'
vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: mockViewerId ? { id: mockViewerId } : null, isLoaded: true }),
}))

vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }) => <img src={typeof src === 'string' ? src : ''} alt={alt} />,
}))

vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
    ToastProvider: ({ children }) => children,
}))

const PRODUCT_ID = '507f1f77bcf86cd799439011'
const ORDER_ID = '665f1f77bcf86cd799439099'
const PLACED_AT = '2026-07-01T09:00:00Z'
const SHIPPED_AT = '2026-07-02T10:00:00Z'
const DELIVERED_AT = '2026-07-05T03:00:00Z'

const CREATOR_ID = 'user_creator_9'

const product = {
    _id: PRODUCT_ID,
    name: 'Benchy',
    images: ['products/benchy.png'],
    description: 'A little boat',
    slug: 'benchy',
    // /api/product?ids= returns creatorUserId but NO creator display name
    // (only the ?slug= path enriches), so message-seller falls back to 'Seller'.
    creatorUserId: CREATOR_ID,
}

const baseOrder = {
    _id: ORDER_ID,
    createdAt: PLACED_AT,
    status: 'shipped',
    trackingId: 'SPX123456789',
    stripeSessionId: 'cs_test_123',
    statusHistory: [
        { status: 'pending', timestamp: PLACED_AT },
        { status: 'shipped', timestamp: SHIPPED_AT },
    ],
    cartItem: {
        productId: PRODUCT_ID,
        quantity: 2,
        price: 25,
        basePrice: 25,
        priceBeforeDiscount: 25,
        finalPrice: 22.5,
        deliveryFee: 5,
        chosenDeliveryType: 'standard',
        currency: 'S',
        orderNote: 'Leave at the door',
    },
}

const userDetails = {
    name: 'Saba M',
    email: 'saba@example.com',
    phone: '+65 81234567',
    contact: {
        phone: { countryCode: '+65', number: '81234567' },
        address: {
            street: '1 Maker Way',
            unitNumber: '01-01',
            city: 'Singapore',
            state: '',
            postalCode: '123456',
            country: 'Singapore',
        },
    },
}

const paymentPayload = {
    paymentMethod: { type: 'card', card: { brand: 'visa', last4: '4242' } },
    customerDetails: {
        name: 'Saba M',
        email: 'saba@example.com',
        address: { line1: '2 Bill Street', city: 'Singapore', postal_code: '654321', country: 'SG' },
    },
}

const okJson = (data) => Promise.resolve({ ok: true, json: async () => data })
const failJson = () => Promise.resolve({ ok: false, json: async () => ({}) })

function stubFetch(order) {
    global.fetch = vi.fn((url) => {
        const u = String(url)
        if (u.startsWith('/api/user/orders?orderId=')) return okJson({ order, userDetails })
        if (u.startsWith('/api/product')) {
            // Mirror the real ids endpoint: pseudo ids (custom-print:...) never
            // resolve to a product document.
            if (u.includes('custom-print')) return okJson({ products: [] })
            return okJson({ products: [product] })
        }
        if (u.startsWith('/api/checkout/payment-method')) return okJson(paymentPayload)
        if (u.startsWith('/api/admin/settings'))
            return okJson({
                orderStatuses: [
                    { statusKey: 'pending', displayName: 'Order Placed' },
                    { statusKey: 'shipped', displayName: 'Shipped Out' },
                    { statusKey: 'delivered', displayName: 'Delivered' },
                    { statusKey: 'cancelled', displayName: 'Cancelled' },
                ],
            })
        return failJson()
    })
}

beforeEach(() => {
    mockViewerId = 'user_buyer_1'
    stubFetch(baseOrder)
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('Order detail facts strip', () => {
    it('corrects the display of a persisted colour on an archived product without changing order values', async () => {
        const order = { ...baseOrder, productSummary: { _id: '6974d555afadda8ec64083c3', name: 'Archived PLA Basic', images: [] },
            cartItem: { ...baseOrder.cartItem, productId: '6974d555afadda8ec64083c3', selectedVariants: { Spool: 'Coca Brown (10802)', Colour: 'Without Spool' } } }
        const before = JSON.stringify(order)
        stubFetch(order)
        const originalFetch = global.fetch
        global.fetch = vi.fn(url => String(url).startsWith('/api/product') ? okJson({ products: [] }) : originalFetch(url))
        render(<OrderPage orderId={ORDER_ID} />)
        expect(await screen.findByText('Cocoa Brown (10802), Without Spool, Qty 2')).toBeVisible()
        expect(JSON.stringify(order)).toBe(before)
    })
    it('shows order date, order ID with copy, and the Stripe payment method', async () => {
        render(<OrderPage orderId={ORDER_ID} />)
        // 'Order placed' is both the facts-strip label and a step description.
        expect((await screen.findAllByText('Order placed')).length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('1 Jul 2026')).toBeInTheDocument()
        // Facts strip + the support footer both carry the short id.
        expect(screen.getAllByText(`#${ORDER_ID.slice(-8).toUpperCase()}`).length).toBeGreaterThanOrEqual(1)
        expect(screen.getByRole('button', { name: 'Copy order ID' })).toBeInTheDocument()
        // Payment method comes from the existing Stripe payment-method fetch.
        expect(await screen.findByText('visa')).toBeInTheDocument()
        expect(screen.getByText('•••• 4242')).toBeInTheDocument()
        // No delivered date is invented while the order is still in transit.
        expect(screen.queryByText('5 Jul 2026')).toBeNull()
    })

    it('shows the delivered date only when statusHistory really carries it', async () => {
        stubFetch({
            ...baseOrder,
            status: 'delivered',
            statusHistory: [...baseOrder.statusHistory, { status: 'delivered', timestamp: DELIVERED_AT }],
        })
        render(<OrderPage orderId={ORDER_ID} />)
        expect(await screen.findByText('5 Jul 2026')).toBeInTheDocument()
        // Delivered shop orders also nudge back to the product's reviews.
        expect(screen.getByRole('link', { name: 'Rate it' })).toHaveAttribute(
            'href',
            '/products/benchy#reviews',
        )
    })

    it('renders no dotted leaders and keeps mono to the order number only', async () => {
        render(<OrderPage orderId={ORDER_ID} />)
        await screen.findByText('Order progress')
        await screen.findByText('visa')
        expect(document.querySelector('.dash-leader')).toBeNull()
        expect(document.querySelector('.dash-leader-dots')).toBeNull()
        const monos = Array.from(document.querySelectorAll('.font-mono'))
        expect(monos.length).toBe(1)
        expect(monos[0].textContent).toBe(`#${ORDER_ID.slice(-8).toUpperCase()}`)
    })
})

describe('Order progress', () => {
    it('renders icon steps from the real flow with statusHistory timestamps and the status chip', async () => {
        render(<OrderPage orderId={ORDER_ID} />)
        expect(await screen.findByText('Order progress')).toBeInTheDocument()
        // Canonical steps, each with a short (<= 5 words) description.
        ;['Order confirmed', 'Processing', 'Shipped', 'Delivered'].forEach((step) => {
            expect(screen.getByText(step)).toBeInTheDocument()
        })
        ;['Order placed', 'Being prepared', 'On its way'].forEach((desc) => {
            expect(desc.split(' ').length).toBeLessThanOrEqual(5)
            // 'Order placed' also labels the facts strip, so allow >= 1.
            expect(screen.getAllByText(desc).length).toBeGreaterThanOrEqual(1)
        })
        // No sentence-length step copy survives.
        expect(screen.queryByText(/payment received/)).toBeNull()
        expect(screen.queryByText(/courier/)).toBeNull()
        // Timestamps come from statusHistory (shipped entry), not invented.
        expect(document.body.textContent).toContain('2 Jul')
        // The chip carries the admin display name for the current status.
        expect(screen.getByText('Shipped Out')).toBeInTheDocument()
        // Tracking stays copyable.
        expect(screen.getByText('SPX123456789')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy tracking ID' })).toBeInTheDocument()
    })

    it('falls back to the raw history timeline for exception statuses', async () => {
        stubFetch({
            ...baseOrder,
            status: 'cancelled',
            statusHistory: [
                { status: 'pending', timestamp: PLACED_AT },
                { status: 'cancelled', timestamp: SHIPPED_AT },
            ],
        })
        render(<OrderPage orderId={ORDER_ID} />)
        expect(await screen.findByText('Order progress')).toBeInTheDocument()
        // No fabricated fulfilment steps for a cancelled order.
        expect(screen.queryByText('On its way')).toBeNull()
        // The raw history renders with admin display names.
        expect(screen.getAllByText('Cancelled').length).toBeGreaterThanOrEqual(2)
        expect(screen.getByText('Order Placed')).toBeInTheDocument()
    })

    it('keeps the honest single-status fallback: icon, pill and the exact copy', async () => {
        stubFetch({ ...baseOrder, statusHistory: [] })
        render(<OrderPage orderId={ORDER_ID} />)
        expect(await screen.findByText('Order progress')).toBeInTheDocument()
        // EXACTLY this copy, nothing more.
        expect(
            screen.getByText(
                'This is the current status of your order. A step-by-step history will appear here as it progresses.',
            ),
        ).toBeInTheDocument()
        // The status pill sits beside the copy (single occurrence, no duplicate
        // header chip).
        expect(screen.getAllByText('Shipped Out').length).toBe(1)
        expect(screen.queryByText('Order confirmed')).toBeNull()
    })
})

describe('Order items, cost summary and addresses', () => {
    it('shows the thumbnail item row and derives the cost summary from existing fields', async () => {
        render(<OrderPage orderId={ORDER_ID} />)
        expect(await screen.findByText('Items')).toBeInTheDocument()
        // Thumbnail resolves the S3 key through the image proxy.
        expect(await screen.findByAltText('Benchy')).toHaveAttribute(
            'src',
            `/api/proxy?key=${encodeURIComponent('products/benchy.png')}`,
        )
        expect(screen.getByText('Qty 2')).toBeInTheDocument()
        // Subtotal = finalPrice x qty, shipping = deliveryFee, discount derived,
        // total = price x qty. No invented taxes row.
        expect(screen.getByText('Subtotal')).toBeInTheDocument()
        expect(document.body.textContent).toContain('S$45.00')
        expect(screen.getByText('Shipping (standard)')).toBeInTheDocument()
        expect(document.body.textContent).toContain('S$5.00')
        expect(screen.getByText('Discount')).toBeInTheDocument()
        expect(screen.getByText('Total')).toBeInTheDocument()
        expect(document.body.textContent).toContain('S$50.00')
        expect(document.body.textContent).not.toContain('Taxes')
        // The customer's note survives.
        expect(screen.getByText('Leave at the door')).toBeInTheDocument()
        // Buy again routes back to the live product.
        expect(screen.getByRole('link', { name: 'Buy again' })).toHaveAttribute(
            'href',
            '/products/benchy',
        )
    })

    it('shows the shipping address from the saved contact and billing from Stripe', async () => {
        render(<OrderPage orderId={ORDER_ID} />)
        expect(await screen.findByText('Shipping address')).toBeInTheDocument()
        expect(screen.getByText('1 Maker Way')).toBeInTheDocument()
        expect(await screen.findByText('Billing address')).toBeInTheDocument()
        expect(screen.getByText('2 Bill Street')).toBeInTheDocument()
        expect(screen.getByText('Shipping method')).toBeInTheDocument()
    })
})

describe('Print-friendly summary', () => {
    it('offers a print button that calls window.print', async () => {
        window.print = vi.fn()
        render(<OrderPage orderId={ORDER_ID} />)
        const button = await screen.findByRole('button', { name: /Print summary/ })
        fireEvent.click(button)
        expect(window.print).toHaveBeenCalled()
    })
})

describe('Message seller', () => {
    it('dispatches fit:openCreatorChat with the creator user id (next to Print summary)', async () => {
        const events = []
        const handler = (e) => events.push(e.detail)
        window.addEventListener('fit:openCreatorChat', handler)
        try {
            render(<OrderPage orderId={ORDER_ID} />)
            const button = await screen.findByRole('button', { name: 'Message seller' })
            fireEvent.click(button)
            expect(events).toEqual([
                { targetUserId: CREATOR_ID, displayName: 'Seller', imageUrl: null },
            ])
        } finally {
            window.removeEventListener('fit:openCreatorChat', handler)
        }
    })

    it('hides the CTA when the buyer IS the creator', async () => {
        mockViewerId = CREATOR_ID
        render(<OrderPage orderId={ORDER_ID} />)
        await screen.findByText('Order progress')
        await screen.findByText('visa')
        expect(screen.queryByRole('button', { name: 'Message seller' })).toBeNull()
    })

    it('resolves custom prints to the canonical print product for the CTA and image', async () => {
        stubFetch({
            ...baseOrder,
            cartItem: { ...baseOrder.cartItem, productId: 'custom-print:REQ-9', requestId: 'REQ-9' },
        })
        render(<OrderPage orderId={ORDER_ID} />)
        await screen.findByText('Order progress')
        // Pseudo ids fall back to /api/product?productType=print, whose
        // creator becomes the seller and whose first photo the row shows.
        expect(await screen.findByRole('button', { name: 'Message seller' })).toBeInTheDocument()
        // The custom print capability stays reachable.
        expect(screen.getByRole('link', { name: 'Track print' })).toHaveAttribute(
            'href',
            '/account/prints',
        )
    })
})

describe('Punctuation law (§10.1)', () => {
    it('order detail renders no em dash or middot', async () => {
        render(<OrderPage orderId={ORDER_ID} />)
        await screen.findByText('Order progress')
        await screen.findByText('visa')
        expect(document.body.textContent).not.toMatch(/[—·]/)
    })
})
