// RTL smokes for the /dashboard/shop page builder: hydrates from GET
// /api/user/shop (default blocks when none saved), Save PUTs one bounded
// payload (settings + theme + blocks + published), block add/move/remove
// with per-block settings, live preview through BlockRenderer, and the Page
// settings tab keeps the old editor (links cap, featured picker cap).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import ShopEditor from '@/app/dashboard/shop/page'

// Entitlements: creator by default (gating cases override entitlementsState).
const entitlementsState = { loading: false, canAccessDashboard: true, canUseMessaging: true }
vi.mock('@/utils/useEntitlements', () => ({ default: () => entitlementsState }))

const showToast = vi.fn()

vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: { id: 'user_1', firstName: 'Ada' }, isLoaded: true }),
}))
vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast }),
}))
vi.mock('@/components/DashboardComponents/CreatorShell', () => ({
    useShopIdentity: () => ({ displayName: 'Ada Prints', displayNameAvailable: true }),
    CreatorGate: ({ children }) => children,
}))
// react-image-crop pulls CSS; the crop flow is exercised manually, not here.
vi.mock('@/components/DashboardComponents/ShopImageCropModal', () => ({
    default: () => <div data-testid="crop-modal" />,
}))
vi.mock('@/components/ProductCard', () => ({
    default: ({ product }) => <div data-testid="product-card">{product.name}</div>,
}))
vi.mock('@/components/General/MarkdownRenderer', () => ({
    default: ({ source }) => <div data-testid="markdown">{source}</div>,
}))

const shopFixture = {
    bannerImage: '',
    logoImage: '',
    description: 'Handmade 3D prints',
    links: [{ label: 'Site', url: 'https://example.com' }],
    featuredProductIds: [],
    accentColor: '',
    theme: { mode: 'light', font: 'sans' },
    blocks: [],
    published: true,
}

const makeProducts = (n) =>
    Array.from({ length: n }, (_, i) => ({ _id: `p${i}`, name: `Product ${i}`, images: [] }))

let putBodies

function stubFetch({ shop = shopFixture, products = [] } = {}) {
    putBodies = []
    global.fetch = vi.fn((url, opts = {}) => {
        const u = String(url)
        if (u.startsWith('/api/user/shop/upload')) {
            return Promise.resolve({ ok: true, json: async () => ({ key: `shops/user_1/gallery-${putBodies.length}.jpg` }) })
        }
        if (u.startsWith('/api/user/shop') && opts.method === 'PUT') {
            const body = JSON.parse(opts.body)
            putBodies.push(body)
            return Promise.resolve({ ok: true, json: async () => ({ success: true, shop: { ...shop, ...body } }) })
        }
        if (u.startsWith('/api/user/shop')) {
            return Promise.resolve({ ok: true, json: async () => ({ shop }) })
        }
        if (u.startsWith('/api/product')) {
            return Promise.resolve({ ok: true, json: async () => ({ products }) })
        }
        return Promise.resolve({ ok: false, json: async () => ({}) })
    })
}

const openSettings = async () => {
    fireEvent.click(await screen.findByRole('tab', { name: /page settings/i }))
    return screen.findByLabelText('Shop description')
}

const blockList = () => within(screen.getByRole('list', { name: 'Page blocks' }))
const blockRows = () => blockList().getAllByRole('listitem')

beforeEach(() => {
    showToast.mockClear()
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('/dashboard/shop page builder', () => {
    it('hydrates: default blocks when none are saved, preview renders them, View page link', async () => {
        stubFetch({ products: makeProducts(2) })
        render(<ShopEditor />)

        await screen.findByRole('list', { name: 'Page blocks' })
        expect(blockRows().map((r) => r.textContent)).toEqual([
            expect.stringContaining('Hero'),
            expect.stringContaining('Products'),
            expect.stringContaining('Links'),
            expect.stringContaining('Contact'),
        ])
        expect(screen.getByRole('link', { name: /view page/i })).toHaveAttribute('href', '/creators/Ada%20Prints')

        const preview = within(screen.getByTestId('page-preview'))
        expect(preview.getByRole('heading', { level: 1, name: 'Ada Prints' })).toBeInTheDocument()
        expect(preview.getByText('Handmade 3D prints')).toBeInTheDocument()
        expect(await preview.findAllByTestId('product-card')).toHaveLength(2)
        expect(preview.getByRole('link', { name: /site/i })).toHaveAttribute('href', 'https://example.com')
        // Owner sees the inert Message button in preview
        expect(preview.getByRole('button', { name: /message creator/i })).toBeDisabled()
    })

    it('page settings tab hydrates the old fields', async () => {
        stubFetch({ products: makeProducts(2) })
        render(<ShopEditor />)
        const description = await openSettings()
        expect(description).toHaveValue('Handmade 3D prints')
        expect(screen.getByText('18/600')).toBeInTheDocument()
        expect(screen.getByLabelText('Link 1 label')).toHaveValue('Site')
        expect(screen.getByLabelText('Link 1 URL')).toHaveValue('https://example.com')
        expect(screen.getByRole('button', { name: /upload banner/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload logo/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByRole('button', { name: 'Sans' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('saves everything in one PUT: cleaned links, theme, blocks and published', async () => {
        stubFetch({ products: makeProducts(2) })
        render(<ShopEditor />)

        // Blocks tab: unpublish, add a text block and fill it in.
        await screen.findByRole('list', { name: 'Page blocks' })
        fireEvent.click(screen.getByRole('switch', { name: 'Published' }))
        fireEvent.click(screen.getByRole('button', { name: /add block/i }))
        fireEvent.click(screen.getByRole('menuitem', { name: /^Text/ }))
        expect(blockRows()).toHaveLength(5)
        fireEvent.change(screen.getByLabelText('Block 5 heading'), { target: { value: 'About' } })
        fireEvent.change(screen.getByLabelText('Block 5 body'), { target: { value: 'We print daily.' } })
        expect(within(screen.getByTestId('page-preview')).getByTestId('markdown')).toHaveTextContent('We print daily.')

        // Settings tab: description, links, featured, theme.
        const description = await openSettings()
        fireEvent.change(description, { target: { value: 'New words' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
        fireEvent.change(screen.getByLabelText('Link 2 label'), { target: { value: 'Insta' } })
        fireEvent.change(screen.getByLabelText('Link 2 URL'), { target: { value: 'instagram.com/ada' } })
        fireEvent.click(await screen.findByRole('button', { name: /product 1/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
        fireEvent.click(screen.getByRole('button', { name: 'Serif' }))

        expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(putBodies).toHaveLength(1))
        const body = putBodies[0]
        expect(body).toMatchObject({
            description: 'New words',
            links: [
                { label: 'Site', url: 'https://example.com' },
                { label: 'Insta', url: 'https://instagram.com/ada' }, // scheme added
            ],
            featuredProductIds: ['p1'],
            accentColor: '',
            theme: { mode: 'dark', font: 'serif' },
            published: false,
        })
        expect(body.blocks.map((b) => b.type)).toEqual(['hero', 'products', 'links', 'contact', 'text'])
        expect(body.blocks[4].settings).toEqual({ heading: 'About', body: 'We print daily.' })
        expect(body.blocks[4].id).toMatch(/^[a-z0-9]{12}$/)
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Page saved', 'success'))
        await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument())
    })

    it('moves and removes blocks, and the preview follows', async () => {
        stubFetch({ products: [] })
        render(<ShopEditor />)
        await screen.findByRole('list', { name: 'Page blocks' })

        expect(screen.getByRole('button', { name: 'Move block 1 up' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Move block 1 down' }))
        expect(blockRows()[0]).toHaveTextContent('Products')
        expect(blockRows()[1]).toHaveTextContent('Hero')
        const order = Array.from(screen.getByTestId('page-preview').querySelectorAll('[data-block-type]')).map((s) => s.dataset.blockType)
        expect(order).toEqual(['products', 'hero', 'links', 'contact'])

        fireEvent.click(screen.getByRole('button', { name: 'Remove block 4' }))
        expect(blockRows()).toHaveLength(3)
        expect(screen.getByText('3/12 blocks')).toBeInTheDocument()
    })

    it('caps blocks at 12 and hides the add button', async () => {
        stubFetch({ products: [] })
        render(<ShopEditor />)
        await screen.findByRole('list', { name: 'Page blocks' })
        for (let i = 0; i < 8; i++) {
            fireEvent.click(screen.getByRole('button', { name: /add block/i }))
            fireEvent.click(screen.getByRole('menuitem', { name: /^Gallery/ }))
        }
        expect(blockRows()).toHaveLength(12)
        expect(screen.queryByRole('button', { name: /add block/i })).not.toBeInTheDocument()
    })

    it('hydrates saved blocks and edits hero/products/contact settings', async () => {
        stubFetch({
            shop: {
                ...shopFixture,
                blocks: [
                    { id: 'savedhero1', type: 'hero', settings: { headline: 'Ada', subheadline: '', showBanner: true, showLogo: true } },
                    { id: 'savedprod1', type: 'products', settings: { heading: '', mode: 'all', limit: 24 } },
                    { id: 'savedcont1', type: 'contact', settings: { heading: '', blurb: '', showMessageButton: true } },
                ],
            },
            products: makeProducts(1),
        })
        render(<ShopEditor />)
        await screen.findByRole('list', { name: 'Page blocks' })
        expect(blockRows()).toHaveLength(3)

        fireEvent.click(within(blockRows()[0]).getByRole('button', { name: /hero/i }))
        fireEvent.click(screen.getByLabelText('Show banner'))
        expect(within(screen.getByTestId('page-preview')).queryByTestId('banner-fallback')).not.toBeInTheDocument()

        fireEvent.click(within(blockRows()[1]).getByRole('button', { name: /products/i }))
        fireEvent.change(screen.getByLabelText('Block 2 mode'), { target: { value: 'featured' } })
        fireEvent.change(screen.getByLabelText('Block 2 limit'), { target: { value: '99' } })
        expect(screen.getByLabelText('Block 2 limit')).toHaveValue(24)

        fireEvent.click(within(blockRows()[2]).getByRole('button', { name: /contact/i }))
        fireEvent.click(screen.getByLabelText('Show Message button'))
        expect(within(screen.getByTestId('page-preview')).queryByRole('button', { name: /message creator/i })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(putBodies).toHaveLength(1))
        expect(putBodies[0].blocks).toEqual([
            { id: 'savedhero1', type: 'hero', settings: { headline: 'Ada', subheadline: '', showBanner: false, showLogo: true } },
            { id: 'savedprod1', type: 'products', settings: { heading: '', mode: 'featured', limit: 24 } },
            { id: 'savedcont1', type: 'contact', settings: { heading: '', blurb: '', showMessageButton: false } },
        ])
    })

    it('caps the featured picker at 8 selections in click order', async () => {
        stubFetch({ products: makeProducts(9) })
        render(<ShopEditor />)
        await openSettings()

        for (let i = 0; i < 9; i++) {
            fireEvent.click(await screen.findByRole('button', { name: new RegExp(`product ${i}$`, 'i') }))
        }

        const pressed = screen.getAllByRole('button', { pressed: true })
            .filter((b) => /product/i.test(b.textContent))
        expect(pressed).toHaveLength(8)
        expect(screen.getByText('8/8')).toBeInTheDocument()
        expect(showToast).toHaveBeenCalledWith('You can feature up to 8 products', 'error')

        // Re-click removes and frees a slot
        fireEvent.click(screen.getByRole('button', { name: /product 0/i }))
        expect(screen.getByText('7/8')).toBeInTheDocument()
    })

    it('never allows more than 6 links', async () => {
        stubFetch({ products: [] })
        render(<ShopEditor />)
        await openSettings()

        // 1 existing + 5 more = 6; the add button then disappears
        for (let i = 0; i < 5; i++) {
            fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
        }
        expect(screen.queryByRole('button', { name: 'Add link' })).not.toBeInTheDocument()
        expect(screen.getByText('Links (6/6)')).toBeInTheDocument()
    })
})
