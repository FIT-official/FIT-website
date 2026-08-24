// RTL smokes for the redesigned customer account area ("Sunlit Paper" +
// Apple-esque inline-edit restyle): the hub rail renders every section +
// service destination, the identity hero carries name/member-since/plan chip,
// ?tab= deep links land on the right section (other pages link ?tab=billing /
// ?tab=downloads), every legacy capability stays reachable through the new
// inline-edit rows (edit morphs the row in place and saves through the same
// endpoints), the completeness ring derives its percentage from existing
// data, the navbar account dropdown opens a keyboard-accessible menu with
// every destination, and no rendered copy contains an em dash or middot
// (blueprint §10.1).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'
import dayjs from 'dayjs'
import Account from '@/app/account/[[...rest]]/Account'
import AccountPrintRequestsPage from '@/app/account/prints/page'
import AccountDropdown from '@/components/General/AccountDropdown'

// jsdom has no ResizeObserver (ViewTabs observes its scroll strip).
global.ResizeObserver =
    global.ResizeObserver ||
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

let mockUser = null
let mockTabParam = null

vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: mockUser, isLoaded: true }),
    useSession: () => ({ session: { id: 'sess_current' } }),
    useClerk: () => ({ signOut: vi.fn() }),
    SignOutButton: ({ children }) => children || <button>Sign out</button>,
}))

vi.mock('next/navigation', () => ({
    usePathname: () => '/account',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => ({ get: (key) => (key === 'tab' ? mockTabParam : null) }),
}))

vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }) => <img src={typeof src === 'string' ? src : ''} alt={alt} />,
}))

vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
    ToastProvider: ({ children }) => children,
}))

let mockSubscription = { subscription: null, loading: false, error: null }
vi.mock('@/utils/UserSubscriptionContext', () => ({
    useUserSubscription: () => mockSubscription,
}))

let mockEntitlements
vi.mock('@/utils/useEntitlements', () => ({
    default: () => mockEntitlements,
}))

let mockIsAdmin = false
vi.mock('@/utils/useAccess', () => ({
    default: () => ({ loading: false, canAccess: true, isAdmin: mockIsAdmin }),
}))

vi.mock('@/utils/useOrderStatuses', () => ({
    useOrderStatuses: () => ({
        orderStatuses: [
            { statusKey: 'pending', displayName: 'Pending' },
            { statusKey: 'delivered', displayName: 'Delivered' },
        ],
        loading: false,
        error: null,
    }),
    getStatusDisplayName: (key, statuses) =>
        statuses.find((s) => s.statusKey === key)?.displayName ||
        key.charAt(0).toUpperCase() + key.slice(1),
    getStatusColor: () => '#6b7280',
}))

const PRODUCT_ID = '507f1f77bcf86cd799439011'
const ORDER_A = 'a1b2c3d4e5f6a7b8c9d0e1f2'
const ORDER_B = 'b1b2c3d4e5f6a7b8c9d0e1f3'
const ORDER_C = 'c1b2c3d4e5f6a7b8c9d0e1f4'
// Relative to now: the time filter is a rolling window, so absolute dates
// silently expire out of it and turn this suite into a time bomb.
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const DAY_A = daysAgo(2)
const DAY_B = daysAgo(3)
const DAY_C = daysAgo(120) // outside the past-30-days window

const hubOrders = [
    {
        _id: ORDER_A,
        createdAt: DAY_A,
        status: 'pending',
        orderType: 'order',
        cartItem: {
            productId: PRODUCT_ID,
            quantity: 2,
            price: 20,
            finalPrice: 20,
            chosenDeliveryType: 'standard',
            currency: 'S',
            orderNote: 'Please pack well',
        },
    },
    {
        _id: ORDER_B,
        createdAt: DAY_B,
        status: 'delivered',
        statusHistory: [
            { status: 'pending', timestamp: DAY_B },
            { status: 'delivered', timestamp: DAY_A },
        ],
        orderType: 'order',
        cartItem: {
            productId: PRODUCT_ID,
            quantity: 1,
            price: 10,
            chosenDeliveryType: 'pickup',
            currency: 'S',
        },
    },
    {
        // Custom print order: no catalogue product, so the thumbnail must be
        // the quiet icon fallback and the row action routes to /account/prints.
        _id: ORDER_C,
        createdAt: DAY_C,
        status: 'processing',
        orderType: 'printOrder',
        printStatus: 'printing',
        cartItem: {
            productId: 'custom-print:REQ-9',
            requestId: 'REQ-9',
            quantity: 1,
            price: 30,
            chosenDeliveryType: 'standard',
            currency: 'S',
        },
    },
]

const CREATOR_ID = 'user_creator_9'

const products = [
    {
        _id: PRODUCT_ID,
        name: 'Benchy',
        images: ['products/benchy.png'],
        description: 'A little boat',
        slug: 'benchy',
        // /api/product?ids= returns creatorUserId but NO creator display name
        // (only the ?slug= path enriches), so message-seller falls back to 'Seller'.
        creatorUserId: CREATOR_ID,
    },
]

const printRequests = [
    {
        requestId: 'REQ-123',
        status: 'quoted',
        basePrice: 15,
        printFee: 5,
        currency: 'sgd',
        modelFile: { originalName: 'benchy.stl' },
        statusHistory: [
            { status: 'pending_config', updatedAt: DAY_B },
            { status: 'quoted', updatedAt: DAY_A, note: 'Quoted by the print farm' },
        ],
    },
]

const okJson = (data) => Promise.resolve({ ok: true, json: async () => data })
const failJson = () => Promise.resolve({ ok: false, json: async () => ({}) })

function stubFetch() {
    global.fetch = vi.fn((url) => {
        const u = String(url)
        if (u.startsWith('/api/user/orders')) return okJson({ orders: hubOrders })
        if (u.startsWith('/api/product')) return okJson({ products })
        if (u.startsWith('/api/asset/storage'))
            return okJson({ transactions: [{ _id: 't1', productId: PRODUCT_ID, assets: ['model.stl', 'photo.png'] }] })
        if (u.startsWith('/api/user/contact/phone')) return okJson({ phone: { countryCode: '+65', number: '81234567' } })
        if (u.startsWith('/api/user/contact/address'))
            return okJson({
                address: {
                    street: '1 Maker Way',
                    unitNumber: '01-01',
                    city: 'Singapore',
                    state: '',
                    postalCode: '123456',
                    country: 'Singapore',
                },
            })
        if (u.startsWith('/api/user/sessions')) return okJson({})
        if (u.startsWith('/api/account/custom-print')) return okJson({ requests: printRequests })
        if (u.startsWith('/api/admin/settings'))
            return okJson({
                orderStatuses: [
                    { statusKey: 'pending', displayName: 'Order Placed' },
                    { statusKey: 'shipped', displayName: 'Shipped Out' },
                ],
            })
        return failJson()
    })
}

beforeEach(() => {
    mockTabParam = null
    mockIsAdmin = false
    mockSubscription = { subscription: null, loading: false, error: null }
    mockEntitlements = {
        loading: false,
        canAccessDashboard: true,
        canUseMessaging: true,
        isPaidTier: false,
        isAdmin: false,
        tier: 'free',
        subscription: null,
    }
    mockUser = {
        id: 'user_1',
        firstName: 'Saba',
        lastName: 'M',
        fullName: 'Saba M',
        hasImage: true,
        passwordEnabled: true,
        imageUrl: '',
        createdAt: '2025-01-15T00:00:00Z',
        primaryEmailAddress: { emailAddress: 'saba@example.com' },
        externalAccounts: [{ provider: 'google', emailAddress: 'saba@gmail.com' }],
        update: vi.fn(async () => {}),
        reload: vi.fn(async () => {}),
        createEmailAddress: vi.fn(async () => {}),
        updatePassword: vi.fn(async () => {}),
        setProfileImage: vi.fn(async () => {}),
        getSessions: async () => [
            {
                id: 'sess_current',
                lastActiveAt: DAY_A,
                latestActivity: {
                    deviceType: 'Macintosh',
                    browserName: 'Chrome',
                    browserVersion: '126',
                    city: 'Singapore',
                    country: 'SG',
                    ipAddress: '1.2.3.4',
                },
            },
        ],
    }
    stubFetch()
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

const NO_EM_DASH_OR_MIDDOT = /[—·]/

describe('Account hub', () => {
    it('renders every section tab and service destination in the rail, under the identity hero', () => {
        render(<Account />)
        const nav = screen.getByRole('navigation', { name: 'Account' })
        ;['Overview', 'Profile', 'Security', 'Orders', 'Billing', 'Downloads'].forEach((label) => {
            expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument()
        })
        expect(within(nav).getByRole('link', { name: 'Print requests' })).toHaveAttribute(
            'href',
            '/account/prints',
        )
        expect(within(nav).getByRole('link', { name: 'Subscription' })).toHaveAttribute(
            'href',
            '/account/subscription',
        )
        // Identity hero: name, member-since, plan chip, photo-change affordance.
        expect(screen.getByText('Saba M')).toBeInTheDocument()
        expect(screen.getByText(/Member since January 2025/)).toBeInTheDocument()
        expect(screen.getByText('Free plan')).toBeInTheDocument()
        expect(screen.getByLabelText('Change profile photo')).toBeInTheDocument()
    })

    it('lands on the overview by default with latest order, subscription and completeness ring', async () => {
        render(<Account />)
        expect(await screen.findByText(`#${ORDER_A.slice(-8).toUpperCase()}`)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute(
            'href',
            `/account/orders/${ORDER_A}`,
        )
        expect(screen.getByText(/free tier/i)).toBeInTheDocument()
        expect(screen.getByText('Profile completeness')).toBeInTheDocument()
        expect(await screen.findByText('Digital purchases')).toBeInTheDocument()
        await waitFor(() =>
            expect(document.body.textContent).toContain('1 purchase with downloadable files'),
        )
    })

    it('completeness ring derives its percentage from existing data and jump-links to sections', async () => {
        mockUser.passwordEnabled = false // 5 of 6 items done
        render(<Account />)
        expect(await screen.findByText('83%')).toBeInTheDocument()
        expect(screen.getByRole('img', { name: 'Profile 83% complete' })).toBeInTheDocument()
        // Missing item is a jump link to its section.
        fireEvent.click(screen.getByRole('button', { name: 'Password' }))
        expect(await screen.findByRole('button', { name: 'Delete account' })).toBeInTheDocument()
    })

    it('?tab=downloads deep link lands on the downloads section (product pages link here)', async () => {
        mockTabParam = 'downloads'
        render(<Account />)
        expect(await screen.findByText('Your digital purchases')).toBeInTheDocument()
        // Every purchased asset is downloadable, and the product name links to its page.
        expect(await screen.findByRole('button', { name: /stl/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /png/ })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Benchy' })).toHaveAttribute('href', '/products/benchy')
    })

    it('?tab=billing deep link lands on the contact rows with view values + per-row edit (the cart links here)', async () => {
        mockTabParam = 'billing'
        render(<Account />)
        expect(await screen.findByText('Billing & contact')).toBeInTheDocument()
        expect(await screen.findByText('+65 81234567')).toBeInTheDocument()
        expect(screen.getByText(/1 Maker Way/)).toBeInTheDocument()
        // The address shows as a formatted block with a copy affordance.
        expect(screen.getByRole('button', { name: 'Copy address' })).toBeInTheDocument()
        // The phone row morphs in place into its inputs.
        fireEvent.click(screen.getByRole('button', { name: 'Edit phone' }))
        ;['Code', 'Number'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument())
        // The address row exposes every address field.
        fireEvent.click(screen.getByRole('button', { name: 'Edit billing address' }))
        ;['Street', 'Unit number', 'City', 'State', 'Postal code', 'Country'].forEach((label) =>
            expect(screen.getByText(label)).toBeInTheDocument(),
        )
    })

    it('profile section keeps name/email editing (inline rows) and connected accounts', async () => {
        mockTabParam = 'profile'
        render(<Account />)
        // Name appears in the hero and as the Name row value.
        expect((await screen.findAllByText('Saba M')).length).toBeGreaterThanOrEqual(2)
        expect(screen.getByText('saba@example.com')).toBeInTheDocument()
        expect(await screen.findByText('saba@gmail.com')).toBeInTheDocument()
        expect(screen.getByText('Connected accounts')).toBeInTheDocument()
        expect(screen.getByText('Upload new photo')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
        expect(screen.getByLabelText('First name')).toHaveValue('Saba')
        fireEvent.click(screen.getByRole('button', { name: 'Edit email' }))
        expect(screen.getByLabelText('Email address')).toHaveValue('saba@example.com')
    })

    it('inline name edit morphs the row and saves through the same Clerk call', async () => {
        mockTabParam = 'profile'
        render(<Account />)
        fireEvent.click(await screen.findByRole('button', { name: 'Edit name' }))
        const first = screen.getByLabelText('First name')
        fireEvent.change(first, { target: { value: 'Sara' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(mockUser.update).toHaveBeenCalledWith({ firstName: 'Sara', lastName: 'M' }),
        )
        // The row settles back into view mode.
        await waitFor(() =>
            expect(screen.queryByLabelText('First name')).not.toBeInTheDocument(),
        )
    })

    it('inline phone edit saves through the same contact endpoint', async () => {
        mockTabParam = 'billing'
        render(<Account />)
        fireEvent.click(await screen.findByRole('button', { name: 'Edit phone' }))
        fireEvent.change(screen.getByLabelText('Number'), { target: { value: '99998888' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => {
            const call = global.fetch.mock.calls.find(
                ([url, opts]) => String(url) === '/api/user/contact/phone' && opts?.method === 'POST',
            )
            expect(call).toBeTruthy()
            expect(JSON.parse(call[1].body).phone.number).toBe('99998888')
        })
    })

    it('security section keeps password edit, device sign-out and delete via ConfirmDialog', async () => {
        mockTabParam = 'security'
        render(<Account />)
        expect(await screen.findByText('Password')).toBeInTheDocument()
        expect(await screen.findByText('Macintosh')).toBeInTheDocument()
        expect(screen.getByText('This device')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sign out of device' })).toBeInTheDocument()
        // The password row morphs in place into its inputs.
        fireEvent.click(screen.getByRole('button', { name: 'Edit password' }))
        expect(screen.getByPlaceholderText('New password')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument()
        // Delete goes through a ConfirmDialog, never window.confirm.
        fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
        expect(await screen.findByText('Delete your account?')).toBeInTheDocument()
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('sign out other devices loops the existing per-device revoke', async () => {
        mockTabParam = 'security'
        mockUser.getSessions = async () => [
            {
                id: 'sess_current',
                lastActiveAt: DAY_A,
                latestActivity: { deviceType: 'Macintosh', ipAddress: '1.2.3.4' },
            },
            {
                id: 'sess_other',
                lastActiveAt: DAY_B,
                latestActivity: { deviceType: 'iPhone', ipAddress: '5.6.7.8' },
            },
        ]
        render(<Account />)
        expect(await screen.findByText('iPhone')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Sign out other devices' }))
        await waitFor(() => {
            const call = global.fetch.mock.calls.find(
                ([url, opts]) => String(url) === '/api/user/sessions' && opts?.method === 'DELETE',
            )
            expect(call).toBeTruthy()
            expect(JSON.parse(call[1].body).sessionId).toBe('sess_other')
        })
    })

    it('orders section renders card-per-order with facts header, thumbnails and detail links', async () => {
        mockTabParam = 'orders'
        render(<Account />)
        // One card per order, newest first, each with a facts header.
        expect(await screen.findByText(`#${ORDER_A.slice(-8).toUpperCase()}`)).toBeInTheDocument()
        expect(screen.getByText(`#${ORDER_B.slice(-8).toUpperCase()}`)).toBeInTheDocument()
        expect(screen.getAllByText('Order placed').length).toBe(3)
        expect(screen.getByText(dayjs(DAY_A).format('D MMM YYYY'))).toBeInTheDocument()
        // Header strip carries total item count + spend across the history.
        expect(screen.getByText('4')).toBeInTheDocument()
        expect(screen.getByText('S$80.00')).toBeInTheDocument()
        // Catalogue product rows show the S3 thumbnail through the proxy.
        const thumbs = screen.getAllByAltText('Benchy')
        expect(thumbs.length).toBe(2)
        thumbs.forEach((img) =>
            expect(img).toHaveAttribute('src', `/api/proxy?key=${encodeURIComponent('products/benchy.png')}`),
        )
        // The custom print order borrows the canonical print product's photo
        // and shows no request id (admin-facing only).
        expect(screen.getByAltText('Custom 3D Print')).toBeInTheDocument()
        expect(screen.queryByText(/REQ-9/)).toBeNull()
        expect(screen.getByRole('link', { name: 'Track print' })).toHaveAttribute(
            'href',
            '/account/prints',
        )
        // Every card links to its full order page.
        expect(screen.getAllByRole('link', { name: 'View order' })[0]).toHaveAttribute(
            'href',
            `/account/orders/${ORDER_A}`,
        )
    })

    it('status tabs and the time filter narrow the order cards client-side', async () => {
        mockTabParam = 'orders'
        render(<Account />)
        await screen.findByText(`#${ORDER_A.slice(-8).toUpperCase()}`)
        // Delivered tab keeps only the delivered order.
        fireEvent.click(screen.getByRole('tab', { name: /Delivered/ }))
        expect(screen.queryByText(`#${ORDER_A.slice(-8).toUpperCase()}`)).toBeNull()
        expect(screen.getByText(`#${ORDER_B.slice(-8).toUpperCase()}`)).toBeInTheDocument()
        // Cancelled tab matches nothing here.
        fireEvent.click(screen.getByRole('tab', { name: /Cancelled/ }))
        expect(screen.getByText('No orders match this view.')).toBeInTheDocument()
        // Back to all, then the time filter drops the old April order.
        fireEvent.click(screen.getByRole('tab', { name: /All/ }))
        expect(screen.getByText(`#${ORDER_C.slice(-8).toUpperCase()}`)).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Filter orders by time'), { target: { value: '30d' } })
        expect(screen.queryByText(`#${ORDER_C.slice(-8).toUpperCase()}`)).toBeNull()
        expect(screen.getByText(`#${ORDER_A.slice(-8).toUpperCase()}`)).toBeInTheDocument()
    })

    it('delivered orders carry buy-again, delivered date and the one-line rate nudge', async () => {
        mockTabParam = 'orders'
        render(<Account />)
        await screen.findByText(`#${ORDER_B.slice(-8).toUpperCase()}`)
        // Buy again + View product link to the product page (product still exists).
        screen.getAllByRole('link', { name: 'Buy again' }).forEach((link) => {
            expect(link).toHaveAttribute('href', '/products/benchy')
        })
        expect(screen.getAllByRole('link', { name: 'View product' })[0]).toHaveAttribute(
            'href',
            '/products/benchy',
        )
        // The status line shows the real delivered date from statusHistory.
        expect(screen.getByText(`on ${dayjs(DAY_A).format('D MMM YYYY')}`)).toBeInTheDocument()
        // Rate strip: one short line + one action into the reviews section.
        expect(screen.getByText('How was it?')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Rate it' })).toHaveAttribute(
            'href',
            '/products/benchy#reviews',
        )
    })

    it('renders no dotted leaders and keeps mono to order numbers only', async () => {
        mockTabParam = 'orders'
        render(<Account />)
        await screen.findByText(`#${ORDER_A.slice(-8).toUpperCase()}`)
        // Open the peek too: its rows are plain label/value, not leader dots.
        fireEvent.click(screen.getAllByRole('button', { name: 'Quick view' })[0])
        await screen.findByRole('link', { name: 'View full order' })
        expect(document.querySelector('.dash-leader')).toBeNull()
        expect(document.querySelector('.dash-leader-dots')).toBeNull()
        // font-mono only on the facts-strip order numbers (one per card).
        const monos = Array.from(document.querySelectorAll('.font-mono'))
        expect(monos.length).toBe(hubOrders.length)
        monos.forEach((el) => expect(el.textContent).toMatch(/^#[0-9A-Z]{8}$/))
    })

    it('message seller dispatches fit:openCreatorChat with the creator user id', async () => {
        mockTabParam = 'orders'
        const events = []
        const handler = (e) => events.push(e.detail)
        window.addEventListener('fit:openCreatorChat', handler)
        try {
            render(<Account />)
            await screen.findByText(`#${ORDER_A.slice(-8).toUpperCase()}`)
            // All three orders get the CTA: catalogue products directly, the
            // custom print via the canonical print product's creator.
            const buttons = screen.getAllByRole('button', { name: 'Message seller' })
            expect(buttons.length).toBe(3)
            fireEvent.click(buttons[0])
            expect(events).toEqual([
                { targetUserId: CREATOR_ID, displayName: 'Seller', imageUrl: null },
            ])
        } finally {
            window.removeEventListener('fit:openCreatorChat', handler)
        }
    })

    it('hides message seller when the buyer IS the creator', async () => {
        mockTabParam = 'orders'
        mockUser.id = CREATOR_ID
        render(<Account />)
        await screen.findByText(`#${ORDER_A.slice(-8).toUpperCase()}`)
        expect(screen.queryByRole('button', { name: 'Message seller' })).toBeNull()
    })

    it('quick view opens the peek with the full detail, note, copy id and order-again', async () => {
        mockTabParam = 'orders'
        render(<Account />)
        await screen.findByText(`#${ORDER_A.slice(-8).toUpperCase()}`)
        // Newest card first: ORDER_A's quick view carries its note + detail link.
        fireEvent.click(screen.getAllByRole('button', { name: 'Quick view' })[0])
        expect(await screen.findByRole('link', { name: 'View full order' })).toHaveAttribute(
            'href',
            `/account/orders/${ORDER_A}`,
        )
        expect(screen.getByText('Please pack well')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy order ID' })).toBeInTheDocument()
    })

    it('the delivered order peek offers an order-again link back to the product page', async () => {
        mockTabParam = 'orders'
        render(<Account />)
        await screen.findByText(`#${ORDER_B.slice(-8).toUpperCase()}`)
        // Second card is the delivered ORDER_B.
        fireEvent.click(screen.getAllByRole('button', { name: 'Quick view' })[1])
        expect(await screen.findByRole('link', { name: 'Order again' })).toHaveAttribute(
            'href',
            '/products/benchy',
        )
    })
})

describe('Navbar account dropdown', () => {
    it('opens a floating menu with every destination and a plan badge', async () => {
        render(<AccountDropdown />)
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))
        const menu = await screen.findByRole('menu')
        ;[
            ['Account', '/account'],
            ['Orders', '/account?tab=orders'],
            ['Downloads', '/account?tab=downloads'],
            ['Print requests', '/account/prints'],
            ['Dashboard', '/dashboard'],
        ].forEach(([name, href]) => {
            expect(within(menu).getByRole('menuitem', { name })).toHaveAttribute('href', href)
        })
        // Subscription row carries the plan badge (free tier here).
        expect(within(menu).getByRole('menuitem', { name: /Subscription/ })).toHaveAttribute(
            'href',
            '/account/subscription',
        )
        expect(within(menu).getByText('Free')).toBeInTheDocument()
        expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
        // No admin row for non-admins.
        expect(within(menu).queryByRole('menuitem', { name: 'Admin' })).toBeNull()
    })

    it('hides Dashboard when not entitled and closes on Escape, returning focus', async () => {
        mockEntitlements = { ...mockEntitlements, canAccessDashboard: false }
        render(<AccountDropdown />)
        const trigger = screen.getByRole('button', { name: 'Account menu' })
        fireEvent.click(trigger)
        const menu = await screen.findByRole('menu')
        expect(within(menu).queryByRole('menuitem', { name: 'Dashboard' })).toBeNull()
        fireEvent.keyDown(document, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
        expect(document.activeElement).toBe(trigger)
    })
})

// The order detail page (facts strip, progress steps, cost summary, print
// button) is covered in tests/unit/orderDetail.test.jsx.

describe('Prints page', () => {
    it('shows each request with status, quote breakdown, progress and actions', async () => {
        render(<AccountPrintRequestsPage />)
        expect(await screen.findByText('benchy.stl')).toBeInTheDocument()
        // Status pill + timeline entry both carry the label.
        expect(screen.getAllByText('Quote received').length).toBeGreaterThanOrEqual(2)
        // Request ids are admin-facing only and never render for customers.
        expect(screen.queryByText('REQ-123')).toBeNull()
        expect(screen.getByText('Base price')).toBeInTheDocument()
        expect(screen.getByText('Print fee')).toBeInTheDocument()
        expect(document.body.textContent).toContain('SGD 15.00')
        expect(document.body.textContent).toContain('SGD 20.00')
        expect(screen.getByText('Quoted by the print farm')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Open in editor' })).toHaveAttribute(
            'href',
            '/editor?requestId=REQ-123',
        )
        expect(screen.getByRole('link', { name: 'Add quoted print to cart' })).toHaveAttribute(
            'href',
            '/cart?addCustomRequest=REQ-123',
        )
        expect(screen.getByRole('link', { name: 'New request' })).toHaveAttribute('href', '/prints/request')
    })
})

describe('Punctuation law (§10.1)', () => {
    const tabs = ['overview', 'profile', 'security', 'orders', 'billing', 'downloads']

    tabs.forEach((tab) => {
        it(`hub ${tab} section renders no em dash or middot`, async () => {
            mockTabParam = tab
            render(<Account />)
            // Let fetched content settle before scanning the copy.
            await screen.findByRole('navigation', { name: 'Account' })
            await new Promise((r) => setTimeout(r, 0))
            expect(document.body.textContent).not.toMatch(NO_EM_DASH_OR_MIDDOT)
        })
    })

    it('prints page renders no em dash or middot', async () => {
        render(<AccountPrintRequestsPage />)
        await screen.findByText('benchy.stl')
        expect(document.body.textContent).not.toMatch(NO_EM_DASH_OR_MIDDOT)
    })
})
