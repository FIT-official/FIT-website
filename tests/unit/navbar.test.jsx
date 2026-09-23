// RTL smokes for the storefront navbar.
//
// Desktop: primary links (Creators/About) render with hrefs; Shop and Prints
// are mega-panel triggers (aria-expanded) whose panels carry the category ->
// subcategory links with exact query-param hrefs plus the Browse-all and
// Print-your-model icon rows; the right rail shows CMS featured articles
// (falling back to the newest published posts from /api/blog) and the CMS
// Explore page links (falling back to the hardcoded defaults); the whole nav
// is flat and untracked (no gradient or letter-spacing classes anywhere);
// Escape closes the panel and returns focus to its trigger; cart/messages
// icons keep their destinations and entitlement gating; signed-out shows
// Sign in / Sign up instead of the account dropdown.
//
// Mobile: the hamburger opens a dialog that mirrors the desktop nav
// (Home/Shop/Prints/Creators/About), carries the full signed-in account
// inventory (Cart, Messages, Account, Orders, Downloads, Print requests,
// Subscription with plan badge, Sign out), gates Dashboard/Admin/Messages
// rows by entitlement (unentitled rows are not rendered at all), shows only
// auth links when signed out, expands the Shop/Prints category disclosures,
// and closes on Escape returning focus to the hamburger trigger.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'
import Navbar from '@/components/General/Navbar'

let mockUser = null

vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: mockUser, isLoaded: true, isSignedIn: !!mockUser }),
    SignOutButton: ({ children }) => children || <button>Sign out</button>,
}))

// Stable object: a fresh identity per render would re-fire Navbar's
// route-change close effect and shut the menu as soon as it opens.
const stableSearchParams = { get: () => null, toString: () => '' }
vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => stableSearchParams,
}))

vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }) => <img src={typeof src === 'string' ? src : ''} alt={alt} />,
}))

// The desktop account dropdown has its own suite (accountPages.test.jsx);
// stub it so its rows never collide with the mobile sheet's queries.
vi.mock('@/components/General/AccountDropdown', () => ({
    default: () => <div data-testid="account-dropdown" />,
}))

let mockEntitlements
vi.mock('@/utils/useEntitlements', () => ({
    default: () => mockEntitlements,
}))

let mockIsAdmin = false
vi.mock('@/utils/useAccess', () => ({
    default: () => ({ loading: false, canAccess: true, isAdmin: mockIsAdmin }),
}))

const categoriesFixture = [
    {
        type: 'shop',
        isActive: true,
        name: 'figurines',
        displayName: 'Figurines',
        subcategories: [{ name: 'anime', displayName: 'Anime', isActive: true }],
    },
    {
        type: 'print',
        isActive: true,
        name: 'fdm',
        displayName: 'FDM',
        subcategories: [{ name: 'pla', displayName: 'PLA', isActive: true }],
    },
]

const blogPostsFixture = [
    { slug: 'first-post', title: 'First post' },
    { slug: 'second-post', title: 'Second post' },
    { slug: 'third-post', title: 'Third post' },
    { slug: 'fourth-post', title: 'Fourth post' },
]

// Frontmatter served by the public content API for 'navigation/mega-menu';
// null means no CMS block saved (the API 404s and fallbacks kick in).
let mockNavContent = null

const okJson = (body) => Promise.resolve({ ok: true, json: async () => body })

beforeEach(() => {
    mockIsAdmin = false
    mockNavContent = null
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
        fullName: 'Saba M',
        imageUrl: '',
        primaryEmailAddress: { emailAddress: 'saba@example.com' },
        emailAddresses: [{ emailAddress: 'saba@example.com' }],
    }
    global.fetch = vi.fn((url) => {
        const u = String(url)
        if (u.startsWith('/api/categories')) return okJson({ categories: categoriesFixture })
        if (u.startsWith('/api/chat/inbox')) return okJson({ channels: [] })
        if (u.startsWith('/api/content')) {
            if (mockNavContent) return okJson({ frontmatter: mockNavContent, content: '' })
            return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
        }
        if (u.startsWith('/api/blog')) return okJson({ ok: true, posts: blogPostsFixture })
        if (u.startsWith('/api/subscription/info')) return okJson({ productName: 'Pro' })
        return okJson({})
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

async function openMobileMenu() {
    render(<Navbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    return screen.findByRole('dialog', { name: 'Menu' })
}

describe('Navbar desktop bar', () => {
    it('renders the primary links, cart, messages and the account dropdown', async () => {
        render(<Navbar />)
        expect(screen.getByRole('link', { name: 'Creators' })).toHaveAttribute('href', '/creators')
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
        // Shop and Prints are mega panel triggers, closed by default.
        ;['Shop', 'Prints'].forEach((name) => {
            expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false')
        })
        // Cart keeps its redirect-back href; messages keeps its destination.
        expect(screen.getByRole('link', { name: 'Cart' })).toHaveAttribute(
            'href',
            '/cart?redirect=%2F',
        )
        expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
            'href',
            '/dashboard/messages',
        )
        expect(screen.getByTestId('account-dropdown')).toBeInTheDocument()
    })

    it('opens the Shop mega panel on click with category columns and flat icon rows', async () => {
        render(<Navbar />)
        const trigger = screen.getByRole('button', { name: 'Shop' })
        fireEvent.click(trigger)
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        const panel = await screen.findByRole('region', { name: 'Shop menu' })
        expect(within(panel).getByText('Figurines')).toBeInTheDocument()
        expect(await within(panel).findByRole('link', { name: 'Anime' })).toHaveAttribute(
            'href',
            '/shop?productType=shop&productCategory=Figurines&productSubCategory=Anime',
        )
        // The old featured tile is now a plain icon row; hrefs are unchanged.
        expect(within(panel).getByRole('link', { name: /Print your model/ })).toHaveAttribute(
            'href',
            '/products/custom-print-request',
        )
        expect(within(panel).getByRole('link', { name: /Browse all shop/ })).toHaveAttribute(
            'href',
            '/shop',
        )
    })

    it('fills the right rail with the newest published posts and default page links when no CMS block exists', async () => {
        render(<Navbar />)
        fireEvent.click(screen.getByRole('button', { name: 'Shop' }))
        const panel = await screen.findByRole('region', { name: 'Shop menu' })

        // Fallback articles: 3 newest published posts, linked to /blog/{slug}.
        expect(await within(panel).findByRole('link', { name: /First post/ })).toHaveAttribute(
            'href',
            '/blog/first-post',
        )
        expect(within(panel).getByRole('link', { name: /Third post/ })).toHaveAttribute(
            'href',
            '/blog/third-post',
        )
        expect(within(panel).queryByRole('link', { name: /Fourth post/ })).toBeNull()

        // Fallback Explore rows: the hardcoded default page links.
        ;[
            ['Blog', '/blog'],
            ['Creators', '/creators'],
            ['Become a creator', '/creators/join'],
            ['About', '/about'],
            ['Custom 3D print', '/products/custom-print-request'],
            ['Print requests', '/account/prints'],
        ].forEach(([name, href]) => {
            expect(within(panel).getByRole('link', { name })).toHaveAttribute('href', href)
        })
    })

    it('renders CMS-configured featured articles and page links instead of the fallbacks', async () => {
        mockNavContent = {
            menuPages: [
                { icon: 'mail', label: 'Contact', description: 'Say hello.', href: '/contact' },
            ],
            featuredPosts: [{ slug: 'cms-pick', title: 'CMS pick' }],
        }
        render(<Navbar />)
        fireEvent.click(screen.getByRole('button', { name: 'Shop' }))
        const panel = await screen.findByRole('region', { name: 'Shop menu' })

        expect(await within(panel).findByRole('link', { name: /CMS pick/ })).toHaveAttribute(
            'href',
            '/blog/cms-pick',
        )
        expect(within(panel).getByRole('link', { name: 'Contact' })).toHaveAttribute(
            'href',
            '/contact',
        )
        // CMS content replaces both fallbacks entirely.
        expect(within(panel).queryByRole('link', { name: /First post/ })).toBeNull()
        expect(within(panel).queryByRole('link', { name: 'Blog' })).toBeNull()
    })

    it('carries no gradient or letter-spacing classes anywhere in the nav', async () => {
        render(<Navbar />)
        fireEvent.click(screen.getByRole('button', { name: 'Shop' }))
        await screen.findByRole('region', { name: 'Shop menu' })
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
        await screen.findByRole('dialog', { name: 'Menu' })
        expect(document.querySelector('[class*="gradient"]')).toBeNull()
        expect(document.querySelector('[class*="tracking-"]')).toBeNull()
    })

    it('opens the Prints mega panel with print category links', async () => {
        render(<Navbar />)
        fireEvent.click(screen.getByRole('button', { name: 'Prints' }))
        const panel = await screen.findByRole('region', { name: 'Prints menu' })
        expect(within(panel).getByText('FDM')).toBeInTheDocument()
        expect(await within(panel).findByRole('link', { name: 'PLA' })).toHaveAttribute(
            'href',
            '/prints?productType=prints&productCategory=FDM&productSubCategory=PLA',
        )
    })

    it('closes the mega panel on Escape and returns focus to its trigger', async () => {
        render(<Navbar />)
        const trigger = screen.getByRole('button', { name: 'Shop' })
        fireEvent.click(trigger)
        await screen.findByRole('region', { name: 'Shop menu' })
        fireEvent.keyDown(document, { key: 'Escape' })
        await waitFor(() =>
            expect(screen.queryByRole('region', { name: 'Shop menu' })).toBeNull(),
        )
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(document.activeElement).toBe(trigger)
    })

    it('hides the messages icon when messaging is not entitled', async () => {
        mockEntitlements = { ...mockEntitlements, canUseMessaging: false }
        render(<Navbar />)
        expect(screen.queryByRole('link', { name: 'Messages' })).toBeNull()
        expect(screen.getByRole('link', { name: 'Cart' })).toBeInTheDocument()
    })

    it('shows Sign in and Sign up instead of cart and account when signed out', async () => {
        mockUser = null
        render(<Navbar />)
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
        expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/sign-up')
        expect(screen.queryByRole('link', { name: 'Cart' })).toBeNull()
        expect(screen.queryByTestId('account-dropdown')).toBeNull()
    })
})

describe('Navbar mobile menu', () => {
    it('opens from the hamburger with the full signed-in row inventory', async () => {
        const sheet = await openMobileMenu()

        // Primary storefront nav mirrors desktop.
        ;[
            ['Home', '/'],
            ['Creators', '/creators'],
            ['About', '/about'],
        ].forEach(([name, href]) => {
            expect(within(sheet).getByRole('link', { name })).toHaveAttribute('href', href)
        })
        expect(within(sheet).getByRole('button', { name: 'Shop' })).toHaveAttribute(
            'aria-expanded',
            'false',
        )
        expect(within(sheet).getByRole('button', { name: 'Prints' })).toHaveAttribute(
            'aria-expanded',
            'false',
        )

        // Signed-in account destinations.
        ;[
            ['Cart', '/cart'],
            ['Messages', '/dashboard/messages'],
            ['Account', '/account'],
            ['Orders', '/account?tab=orders'],
            ['Downloads', '/account?tab=downloads'],
            ['Print requests', '/account/prints'],
            ['Dashboard', '/dashboard'],
        ].forEach(([name, href]) => {
            expect(within(sheet).getByRole('link', { name })).toHaveAttribute('href', href)
        })
        // Subscription row carries the plan badge (free tier here).
        expect(within(sheet).getByRole('link', { name: /Subscription/ })).toHaveAttribute(
            'href',
            '/account/subscription',
        )
        expect(within(sheet).getByText('Free')).toBeInTheDocument()
        expect(within(sheet).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()

        // Not an admin: no admin row, and no auth links while signed in.
        expect(within(sheet).queryByRole('link', { name: 'Admin dashboard' })).toBeNull()
        expect(within(sheet).queryByRole('link', { name: 'Sign in' })).toBeNull()
        expect(within(sheet).queryByRole('link', { name: 'Sign up' })).toBeNull()
    })

    it('expands the Shop disclosure to category and subcategory links', async () => {
        const sheet = await openMobileMenu()
        const shopToggle = within(sheet).getByRole('button', { name: 'Shop' })
        fireEvent.click(shopToggle)
        expect(shopToggle).toHaveAttribute('aria-expanded', 'true')
        expect(await within(sheet).findByRole('link', { name: 'Browse all shop' })).toHaveAttribute(
            'href',
            '/shop',
        )
        expect(within(sheet).getByText('Figurines')).toBeInTheDocument()
        expect(within(sheet).getByRole('link', { name: 'Anime' })).toHaveAttribute(
            'href',
            '/shop?productType=shop&productCategory=Figurines&productSubCategory=Anime',
        )
    })

    it('shows the paid plan as a flat amber chip with ink text', async () => {
        mockEntitlements = {
            ...mockEntitlements,
            isPaidTier: true,
            subscription: { priceId: 'price_pro' },
        }
        const sheet = await openMobileMenu()
        const badge = await within(sheet).findByText('Pro')
        expect(badge.className).toContain('bg-amber-300')
        expect(badge.className).toContain('text-textColor')
        expect(badge.className).not.toContain('gradient')
    })

    it('does not render Dashboard or Messages rows when not entitled', async () => {
        mockEntitlements = {
            ...mockEntitlements,
            canAccessDashboard: false,
            canUseMessaging: false,
        }
        const sheet = await openMobileMenu()
        expect(within(sheet).queryByRole('link', { name: 'Dashboard' })).toBeNull()
        expect(within(sheet).queryByRole('link', { name: 'Messages' })).toBeNull()
        // Ungated rows are still there.
        expect(within(sheet).getByRole('link', { name: 'Account' })).toBeInTheDocument()
    })

    it('renders the Admin dashboard row for admins only', async () => {
        mockIsAdmin = true
        const sheet = await openMobileMenu()
        expect(within(sheet).getByRole('link', { name: 'Admin dashboard' })).toHaveAttribute(
            'href',
            '/admin',
        )
    })

    it('shows only nav plus auth links when signed out', async () => {
        mockUser = null
        const sheet = await openMobileMenu()
        expect(within(sheet).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/sign-in',
        )
        expect(within(sheet).getByRole('link', { name: 'Sign up' })).toHaveAttribute(
            'href',
            '/sign-up',
        )
        ;[
            'Cart',
            'Messages',
            'Account',
            'Orders',
            'Downloads',
            'Print requests',
            'Dashboard',
            'Admin dashboard',
        ].forEach((name) => {
            expect(within(sheet).queryByRole('link', { name })).toBeNull()
        })
        expect(within(sheet).queryByRole('button', { name: 'Sign out' })).toBeNull()
        // Storefront nav is still available to guests.
        expect(within(sheet).getByRole('link', { name: 'Home' })).toBeInTheDocument()
    })

    it('closes on Escape and returns focus to the hamburger trigger', async () => {
        await openMobileMenu()
        const trigger = screen.getByRole('button', { name: 'Open menu' })
        fireEvent.keyDown(document, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull())
        expect(document.activeElement).toBe(trigger)
    })

    it('locks body scroll while open and closes from the backdrop close button', async () => {
        const sheet = await openMobileMenu()
        expect(document.body.style.overflow).toBe('hidden')
        fireEvent.click(within(sheet).getByRole('button', { name: 'Close menu' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull())
        expect(document.body.style.overflow).toBe('')
    })
})
