// RTL smokes for the redesigned creator products list (blueprint §5.4):
// rows render (custom-print base product filtered out), the search WORKS,
// name/numberSold sorts toggle order, and the derived view tabs filter.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import MyProducts from '@/app/dashboard/products/page'

// Entitlements: creator by default (gating cases override entitlementsState).
const entitlementsState = { loading: false, canAccessDashboard: true, canUseMessaging: true }
vi.mock('@/utils/useAccess', () => ({ default: () => ({ isAdmin: false, canAccess: true, loading: false }) }))
vi.mock('@/utils/useEntitlements', () => ({ default: () => entitlementsState }))

const session = vi.hoisted(() => ({ id: 'user_1' }))
const push = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}))
vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: { id: session.id }, isLoaded: true }),
}))

const PRODUCTS = [
    {
        _id: 'p1',
        name: 'Alpha Widget',
        slug: 'alpha-widget',
        numberSold: 5,
        stock: 3,
        createdAt: '2026-01-02T00:00:00Z',
        basePrice: { presentmentAmount: 10, presentmentCurrency: 'SGD' },
    },
    {
        _id: 'p2',
        name: 'Beta Gadget',
        slug: 'beta-gadget',
        numberSold: 2,
        stock: 4,
        hidden: true,
        createdAt: '2026-01-03T00:00:00Z',
        basePrice: { presentmentAmount: 25.5, presentmentCurrency: 'SGD' },
    },
    {
        _id: 'p3',
        name: 'Zed Kit',
        slug: 'zed-kit',
        numberSold: 9,
        stock: 0,
        infiniteStock: false,
        createdAt: '2026-01-01T00:00:00Z',
        basePrice: { presentmentAmount: 5, presentmentCurrency: 'SGD' },
    },
    // The custom-print base product must never show on this list.
    { _id: 'CP1_CUSTOM_PRINT_CONFIG', name: 'Custom 3D Print', numberSold: 0 },
]

function rowNames(container) {
    return Array.from(container.querySelectorAll('[role="link"]')).map(
        (row) => row.querySelector('span.truncate')?.textContent,
    )
}

beforeEach(() => {
    session.id = 'user_1'
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }))
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    push.mockReset()
})

describe('Creator products list', () => {
    it('renders product rows with status pills and filters out the custom-print base product', async () => {
        const { container } = render(<MyProducts />)
        expect(await screen.findByText('Alpha Widget')).toBeInTheDocument()
        expect(screen.getByText('Beta Gadget')).toBeInTheDocument()
        expect(screen.getByText('Zed Kit')).toBeInTheDocument()
        expect(screen.queryByText('Custom 3D Print')).toBeNull()

        // Status vocabulary: Live (ok), Hidden (hatch), Out of stock (bad).
        expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Out of stock').length).toBeGreaterThan(0)
        expect(rowNames(container)).toHaveLength(3)
    })

    it('search filters rows by name', async () => {
        render(<MyProducts />)
        await screen.findByText('Alpha Widget')
        fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'beta' } })
        expect(screen.queryByText('Alpha Widget')).toBeNull()
        expect(screen.getByText('Beta Gadget')).toBeInTheDocument()
    })

    it('sorting by name and sold toggles the row order', async () => {
        const { container } = render(<MyProducts />)
        await screen.findByText('Alpha Widget')

        fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
        expect(rowNames(container)).toEqual(['Alpha Widget', 'Beta Gadget', 'Zed Kit'])

        fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
        expect(rowNames(container)).toEqual(['Zed Kit', 'Beta Gadget', 'Alpha Widget'])

        fireEvent.click(screen.getByRole('button', { name: 'Sort by Sold' }))
        expect(rowNames(container)).toEqual(['Beta Gadget', 'Alpha Widget', 'Zed Kit'])
    })

    it('view tabs filter to hidden and out-of-stock products', async () => {
        const { container } = render(<MyProducts />)
        await screen.findByText('Alpha Widget')

        fireEvent.click(screen.getByRole('tab', { name: /Hidden/ }))
        expect(rowNames(container)).toEqual(['Beta Gadget'])

        fireEvent.click(screen.getByRole('tab', { name: /Out of stock/ }))
        expect(rowNames(container)).toEqual(['Zed Kit'])

        fireEvent.click(screen.getByRole('tab', { name: /All/ }))
        expect(rowNames(container)).toHaveLength(3)
    })

    it('row click navigates to the edit page', async () => {
        const { container } = render(<MyProducts />)
        await screen.findByText('Alpha Widget')
        fireEvent.click(screen.getByText('Alpha Widget'))
        expect(push).toHaveBeenCalledWith('/dashboard/products/edit/p1')
        // Quiet hover action links to the storefront page.
        expect(container.querySelector('a[href="/products/alpha-widget"]')).toBeTruthy()
    })

    it('row actions are fixed-size labelled ActionIcons, never raw-text buttons', async () => {
        const { container } = render(<MyProducts />)
        await screen.findByText('Alpha Widget')

        // One icon per action per row (3 rows), labelled for a11y.
        expect(screen.getAllByRole('button', { name: 'Performance' })).toHaveLength(3)
        expect(screen.getAllByRole('link', { name: 'View in store' })).toHaveLength(3)
        expect(screen.getAllByRole('button', { name: 'Duplicate' })).toHaveLength(3)

        const perf = screen.getAllByRole('button', { name: 'Performance' })[0]
        expect(perf.className).toContain('h-7')
        expect(perf.className).toContain('w-7')
        expect(perf.textContent.trim()).toBe('')
        expect(perf.querySelector('svg')).toBeTruthy()

        // No raw-text action buttons/links remain in rows.
        const rawText = Array.from(container.querySelectorAll('button, a')).filter((el) =>
            ['Performance', 'Duplicate', 'View in store', 'Edit', 'Delete'].includes(el.textContent.trim()))
        expect(rawText).toHaveLength(0)

        // The Performance icon still opens the analytics peek, not the edit page.
        fireEvent.click(perf)
        expect(await screen.findByText('Product Performance Coming Soon')).toBeInTheDocument()
        expect(push).not.toHaveBeenCalled()
    })

    it('shows the guide empty state with the sun CTA when there are no products', async () => {
        global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: [] }) }))
        render(<MyProducts />)
        expect(await screen.findByText('Stock Your Shelf')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'New Product' })).toBeInTheDocument()
    })
})


describe('Creator product load recovery', () => {
    it('does not misrepresent a failed API response as an empty catalogue and offers retry', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'Unavailable' }) })
            .mockResolvedValue({ ok: true, json: async () => ({ products: PRODUCTS }) })
        render(<MyProducts />)
        expect(await screen.findByRole('alert')).toHaveTextContent('Your products could not be loaded')
        expect(screen.queryByText('Stock Your Shelf')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Alpha Widget')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).toBeNull()
    })

    it('keeps nested row action keyboard activation from opening the product editor', async () => {
        render(<MyProducts />)
        await screen.findByText('Alpha Widget')
        const action=screen.getAllByRole('button', { name: 'Performance' })[0]
        fireEvent.keyDown(action,{key:'Enter'})
        fireEvent.click(action)
        expect(await screen.findByText('Product Performance Coming Soon')).toBeInTheDocument()
        expect(push).not.toHaveBeenCalled()
    })
})

it.each(['network','invalid-json','invalid-shape'])('creator recovers from %s without losing the retry path',async kind=>{
 global.fetch=vi.fn().mockImplementationOnce(async()=>{
  if(kind==='network')throw Error('Network disconnected')
  return {ok:true,json:async()=>{if(kind==='invalid-json')throw Error('HTML instead of JSON');return {products:null}}}
 }).mockResolvedValue({ok:true,json:async()=>({products:PRODUCTS})})
 render(<MyProducts/>);expect(await screen.findByRole('alert')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
})
it('does not reload the catalogue when only the Clerk object identity changes',async()=>{
 const view=render(<MyProducts/>);await screen.findByText('Alpha Widget');view.rerender(<MyProducts/>);
 expect(global.fetch).toHaveBeenCalledTimes(1);
})
it('ignores the previous creator response after the current account changes',async()=>{
 let finishFirst;global.fetch=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finishFirst=resolve})).mockResolvedValue({ok:true,json:async()=>({products:[]})});
 const view=render(<MyProducts/>);await waitFor(()=>expect(global.fetch).toHaveBeenCalledTimes(1));
 session.id='user_2';view.rerender(<MyProducts/>);expect(await screen.findByText('Stock Your Shelf')).toBeInTheDocument();
 await act(async()=>{finishFirst({ok:true,json:async()=>({products:PRODUCTS})});});
 expect(screen.queryByText('Alpha Widget')).toBeNull();
 expect(global.fetch.mock.calls[1][0]).toContain('creatorUserId=user_2');
})
