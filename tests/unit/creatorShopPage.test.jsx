// RTL smokes for the public creator page (app/creators/[id]/Creator.jsx),
// now rendered from shop.blocks through components/CreatorPage/BlockRenderer:
// default blocks keep the old look (banner fallback vs image, logo initial,
// verified chip, stat strip, featured-then-all grid, link chips, Message
// button); custom blocks render in order; theme frame; owner Edit pill;
// unpublished notice.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import Creator from '@/app/creators/[id]/Creator'

let mockUser = null
vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: mockUser, isLoaded: true }),
}))
vi.mock('@/components/ProductCard', () => ({
    default: ({ product }) => <div data-testid="product-card">{product.name}</div>,
}))
// The Markdown renderer pulls CSS through next/dynamic; a plain stand-in is
// enough to assert the body reaches the block.
vi.mock('@/components/General/MarkdownRenderer', () => ({
    default: ({ source }) => <div data-testid="markdown">{source}</div>,
}))

const products = [
    { _id: 'p1', name: 'Vase', likes: ['u1', 'u2'], reviews: [{ rating: 4 }, { rating: 5 }] },
    { _id: 'p2', name: 'Lamp', likes: ['u3'], reviews: [{ rating: 3 }] },
    { _id: 'p3', name: 'Hook', likes: [], reviews: [] },
]

const baseCreator = {
    id: 'user_creator',
    displayName: 'Ada Prints',
    imageUrl: null,
    role: 'Creator',
    joinedYear: 2024,
    shop: {
        bannerImage: '',
        logoImage: '',
        description: 'Practical prints, made to order.',
        links: [
            { label: 'Website', url: 'https://ada.example.com' },
            { label: 'Instagram', url: 'https://instagram.com/ada' },
        ],
        featuredProductIds: ['p3', 'p1'],
        accentColor: '',
        theme: { mode: 'light', font: 'sans' },
        blocks: [],
        published: true,
    },
}

const withShop = (patch) => ({ ...baseCreator, shop: { ...baseCreator.shop, ...patch } })

beforeEach(() => {
    mockUser = null
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('public creator page (default blocks)', () => {
    it('renders the quiet fallback band when no banner is set, and the image when set', () => {
        const { rerender } = render(<Creator creator={baseCreator} products={products} />)
        expect(screen.getByTestId('banner-fallback')).toBeInTheDocument()

        rerender(<Creator creator={withShop({ bannerImage: 'shops/user_creator/banner.jpg' })} products={products} />)
        expect(screen.queryByTestId('banner-fallback')).not.toBeInTheDocument()
        expect(screen.getByAltText('Ada Prints banner')).toHaveAttribute(
            'src',
            '/api/proxy?key=shops%2Fuser_creator%2Fbanner.jpg',
        )
    })

    it('shows the logo initial fallback, name, verified chip and description', () => {
        render(<Creator creator={baseCreator} products={products} />)
        expect(screen.getByTestId('shop-logo')).toHaveTextContent('A')
        expect(screen.getByRole('heading', { level: 1, name: 'Ada Prints' })).toBeInTheDocument()
        expect(screen.getByText('Verified creator')).toBeInTheDocument()
        expect(screen.getByText('Practical prints, made to order.')).toBeInTheDocument()
    })

    it('hides the verified chip for non-creator roles', () => {
        render(<Creator creator={{ ...baseCreator, role: 'Customer' }} products={products} />)
        expect(screen.queryByText('Verified creator')).not.toBeInTheDocument()
    })

    it('renders link chips as external noopener anchors', () => {
        render(<Creator creator={baseCreator} products={products} />)
        const link = screen.getByRole('link', { name: /website/i })
        expect(link).toHaveAttribute('href', 'https://ada.example.com')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
        expect(screen.getByRole('link', { name: /instagram/i })).toBeInTheDocument()
    })

    it('shows the stat strip: products, likes, avg rating, joined year', () => {
        render(<Creator creator={baseCreator} products={products} />)
        const strip = within(screen.getByTestId('stat-strip'))
        expect(strip.getByText('Products').previousSibling).toHaveTextContent('3')
        expect(strip.getByText('Likes').previousSibling).toHaveTextContent('3')
        expect(strip.getByText('Avg rating').previousSibling).toHaveTextContent('4.0')
        expect(strip.getByText('Joined').previousSibling).toHaveTextContent('2024')
    })

    it('renders the Featured picks in pick order above the full grid', () => {
        render(<Creator creator={baseCreator} products={products} />)
        expect(screen.getByRole('heading', { name: 'Featured' })).toBeInTheDocument()
        const cards = screen.getAllByTestId('product-card').map((c) => c.textContent)
        expect(cards).toEqual(['Hook', 'Vase', 'Vase', 'Lamp', 'Hook'])
    })

    it('skips the Featured section when no ids resolve', () => {
        render(<Creator creator={withShop({ featuredProductIds: ['gone'] })} products={products} />)
        expect(screen.queryByRole('heading', { name: 'Featured' })).not.toBeInTheDocument()
    })

    it('shows Edit page only for the owner (or an admin via canEdit)', () => {
        mockUser = { id: 'user_creator' }
        const { rerender } = render(<Creator creator={baseCreator} products={products} />)
        expect(screen.getByRole('link', { name: /edit page/i })).toHaveAttribute('href', '/dashboard/shop')
        expect(screen.queryByRole('button', { name: /message creator/i })).not.toBeInTheDocument()

        mockUser = { id: 'user_visitor' }
        rerender(<Creator creator={baseCreator} products={products} />)
        expect(screen.queryByRole('link', { name: /edit page/i })).not.toBeInTheDocument()

        rerender(<Creator creator={baseCreator} products={products} canEdit />)
        expect(screen.getByRole('link', { name: /edit page/i })).toBeInTheDocument()
    })

    it('keeps the Message-creator capability for signed-in visitors', () => {
        mockUser = { id: 'user_visitor' }
        render(<Creator creator={baseCreator} products={products} />)
        const events = []
        const listener = (e) => events.push(e.detail)
        window.addEventListener('fit:openCreatorChat', listener)
        fireEvent.click(screen.getByRole('button', { name: /message creator/i }))
        window.removeEventListener('fit:openCreatorChat', listener)
        expect(events).toEqual([
            { targetUserId: 'user_creator', displayName: 'Ada Prints', imageUrl: null },
        ])
    })

    it('keeps the empty state when the creator has no products', () => {
        render(<Creator creator={baseCreator} products={[]} />)
        expect(screen.getByText('No products found.')).toBeInTheDocument()
    })
})

describe('public creator page (custom blocks + theme)', () => {
    const custom = [
        { id: 'blockhero', type: 'hero', settings: { headline: 'Ada makes things', subheadline: 'Since 2024', showBanner: false, showLogo: false } },
        { id: 'blocktext', type: 'text', settings: { heading: 'About the studio', body: 'We **print** daily.' } },
        { id: 'blockgal', type: 'gallery', settings: { heading: 'Recent work', images: ['shops/user_creator/gallery-1.jpg', 'shops/user_creator/gallery-2.jpg'] } },
        { id: 'blockprod', type: 'products', settings: { heading: 'Best sellers', mode: 'featured', limit: 4 } },
        { id: 'blockcontact', type: 'contact', settings: { heading: 'Say hi', blurb: 'DMs open.', showMessageButton: false } },
    ]

    it('renders blocks in order with their settings', () => {
        mockUser = { id: 'user_visitor' }
        render(<Creator creator={withShop({ blocks: custom })} products={products} />)
        const sections = Array.from(document.querySelectorAll('[data-block-type]')).map((s) => s.dataset.blockType)
        expect(sections).toEqual(['hero', 'text', 'gallery', 'products', 'contact'])

        expect(screen.getByRole('heading', { level: 1, name: 'Ada makes things' })).toBeInTheDocument()
        expect(screen.getByText('Since 2024')).toBeInTheDocument()
        expect(screen.queryByTestId('banner-fallback')).not.toBeInTheDocument()
        expect(screen.queryByTestId('shop-logo')).not.toBeInTheDocument()

        expect(screen.getByRole('heading', { name: 'About the studio' })).toBeInTheDocument()
        expect(screen.getByTestId('markdown')).toHaveTextContent('We **print** daily.')

        expect(screen.getByRole('heading', { name: 'Recent work' })).toBeInTheDocument()
        expect(screen.getByAltText('Recent work 2')).toHaveAttribute('src', '/api/proxy?key=shops%2Fuser_creator%2Fgallery-2.jpg')

        // featured-only products block: just the picks, in pick order
        expect(screen.getByRole('heading', { name: 'Best sellers' })).toBeInTheDocument()
        expect(screen.getAllByTestId('product-card').map((c) => c.textContent)).toEqual(['Hook', 'Vase'])

        // contact without the button; no links block at all
        expect(screen.getByRole('heading', { name: 'Say hi' })).toBeInTheDocument()
        expect(screen.getByText('DMs open.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /message creator/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /website/i })).not.toBeInTheDocument()
    })

    it('wraps the page in the theme frame with mode, font and accent', () => {
        const { container } = render(
            <Creator creator={withShop({ theme: { mode: 'dark', font: 'mono' }, accentColor: '#3b82f6' })} products={products} />,
        )
        const frame = container.querySelector('[data-theme]')
        expect(frame).toHaveAttribute('data-theme', 'dark')
        expect(frame).toHaveAttribute('data-font', 'mono')
        expect(frame.className).toContain('font-mono')
        expect(frame.style.getPropertyValue('--creator-accent')).toBe('#3b82f6')
        expect(frame.style.getPropertyValue('--background')).toBe('#111111')
    })

    it('shows the not-published notice to the owner', () => {
        mockUser = { id: 'user_creator' }
        render(<Creator creator={withShop({ published: false })} products={products} />)
        expect(screen.getByText(/not published/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /edit page/i })).toBeInTheDocument()
    })
})
