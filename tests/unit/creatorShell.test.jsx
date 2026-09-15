// RTL smokes for the shared creator shell (blueprint §5.1, client feedback
// 2026-07-05): the rail renders on every /dashboard/* subpage via
// app/dashboard/layout.jsx, highlights the active route (nested routes
// included), shares the shop identity block, and keeps the quiet admin
// shortcut for admins only.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import CreatorShell, { CreatorGate } from '@/components/DashboardComponents/CreatorShell'
import DashboardLayout from '@/app/dashboard/layout'
import MyProducts from '@/app/dashboard/products/page'

// Entitlements: creator by default (gating cases override entitlementsState).
const entitlementsState = { loading: false, canAccessDashboard: true, canUseMessaging: true }
vi.mock('@/utils/useEntitlements', () => ({ default: () => entitlementsState }))

let mockPathname = '/dashboard'
vi.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

let mockIsAdmin = false
vi.mock('@/utils/useAccess', () => ({
    default: () => ({ loading: false, canAccess: true, isAdmin: mockIsAdmin }),
}))

vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: { id: 'user_1', firstName: 'Saba' }, isLoaded: true }),
}))

const okJson = (data) => Promise.resolve({ ok: true, json: async () => data })

beforeEach(() => {
    mockPathname = '/dashboard'
    mockIsAdmin = false
    global.fetch = vi.fn((url) => {
        const u = String(url)
        if (u.startsWith('/api/user/display-name')) return okJson({ displayName: 'Atelier' })
        if (u.startsWith('/api/product')) return okJson({ products: [] })
        return Promise.resolve({ ok: false, json: async () => ({}) })
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

const NAV_EXPECTATIONS = [
    ['Home', '/dashboard'],
    ['My products', '/dashboard/products'],
    ['Print jobs', '/dashboard/print-jobs'],
    ['Print service', '/dashboard/print-service'],
    ['Messages', '/dashboard/messages'],
    ['Payouts', '/dashboard/payouts'],
    ['Discounts', '/dashboard/discounts'],
    ['Account settings', '/account'],
]

describe('CreatorShell', () => {
    it('renders the page content inside the rail layout with every nav link', () => {
        render(
            <CreatorShell>
                <p>Page content</p>
            </CreatorShell>,
        )
        expect(screen.getByText('Page content')).toBeInTheDocument()
        const nav = screen.getByRole('navigation', { name: 'Creator dashboard' })
        NAV_EXPECTATIONS.forEach(([label, href]) => {
            expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href)
        })
    })

    it('marks only the current route as the active ink pill (exact match on Home)', () => {
        mockPathname = '/dashboard'
        render(<CreatorShell>x</CreatorShell>)
        expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('link', { name: 'My products' })).not.toHaveAttribute('aria-current')
    })

    it('keeps the section link active on nested routes (products create/edit)', () => {
        mockPathname = '/dashboard/products/create'
        render(<CreatorShell>x</CreatorShell>)
        expect(screen.getByRole('link', { name: 'My products' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    })

    it('shows the fetched shop display name in the rail identity block', async () => {
        render(<CreatorShell>x</CreatorShell>)
        expect(await screen.findByText('Atelier')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Edit shop display name' })).toBeInTheDocument()
    })

    it('shows the admin shortcut only for admins', () => {
        const first = render(<CreatorShell>x</CreatorShell>)
        expect(screen.queryByRole('link', { name: /Admin dashboard/ })).toBeNull()
        first.unmount()

        mockIsAdmin = true
        render(<CreatorShell>x</CreatorShell>)
        expect(screen.getByRole('link', { name: /Admin dashboard/ })).toHaveAttribute('href', '/admin')
    })

    it('the dashboard layout wraps subpages in the shell: products page gets the rail with its link active', async () => {
        mockPathname = '/dashboard/products'
        render(
            <DashboardLayout>
                <MyProducts />
            </DashboardLayout>,
        )
        // The products page renders inside the shell...
        expect(await screen.findByText('Stock Your Shelf')).toBeInTheDocument()
        // ...with the rail present and its own route highlighted.
        const nav = screen.getByRole('navigation', { name: 'Creator dashboard' })
        expect(within(nav).getByRole('link', { name: 'My products' })).toHaveAttribute('aria-current', 'page')
        expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    })
})

describe('creator entitlement gating', () => {
    it('hides creator-only rail links without the entitlement', () => {
        entitlementsState.canAccessDashboard = false
        render(<CreatorShell>x</CreatorShell>)
        expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Account settings' })).toBeInTheDocument()
        for (const label of ['My products', 'My shop', 'Messages', 'Payouts', 'Discounts']) {
            expect(screen.queryByRole('link', { name: label })).toBeNull()
        }
        entitlementsState.canAccessDashboard = true
    })

    it('CreatorGate swaps gated pages for the upgrade fallback', () => {
        entitlementsState.canAccessDashboard = false
        render(<CreatorGate>secret creator page</CreatorGate>)
        expect(screen.queryByText('secret creator page')).toBeNull()
        expect(screen.getAllByText(/subscription/i).length).toBeGreaterThan(0)
        entitlementsState.canAccessDashboard = true
    })

    it('CreatorGate renders children for entitled creators', () => {
        render(<CreatorGate>secret creator page</CreatorGate>)
        expect(screen.getByText('secret creator page')).toBeInTheDocument()
    })
})
