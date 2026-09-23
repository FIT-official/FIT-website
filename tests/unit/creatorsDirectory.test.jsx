// /creators directory page: cards from GET /api/creators (logo, name,
// description, product count, link to /creators/<name>), search box,
// pagination and the empty state.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import CreatorsDirectory from '@/app/creators/CreatorsDirectory'

let calls
const creators = [
    { userId: 'user_a', displayName: 'Ada Prints', slug: 'Ada Prints', logoImage: 'shops/user_a/logo.jpg', bannerImage: '', description: 'Practical prints.', accentColor: '', productCount: 3 },
    { userId: 'user_b', displayName: 'Bob Builds', slug: 'Bob Builds', logoImage: '', bannerImage: '', description: '', accentColor: '#f59e0b', productCount: 1 },
]

function stubFetch(handler) {
    calls = []
    global.fetch = vi.fn(async (url) => {
        calls.push(String(url))
        return handler(String(url))
    })
}

beforeEach(() => {
    stubFetch(() => ({ ok: true, json: async () => ({ creators, page: 1, pageSize: 20, total: 2, hasMore: false }) }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('creators directory', () => {
    it('renders a card per creator with logo/initial, description, count and page link', async () => {
        render(<CreatorsDirectory />)
        expect(await screen.findByText('Ada Prints')).toBeInTheDocument()
        expect(screen.getByAltText('Ada Prints logo')).toHaveAttribute('src', '/api/proxy?key=shops%2Fuser_a%2Flogo.jpg')
        expect(screen.getByText('Practical prints.')).toBeInTheDocument()
        expect(screen.getByText('3 products')).toBeInTheDocument()
        expect(screen.getByText('1 product')).toBeInTheDocument()
        expect(screen.getByText('Creator on Fix It Today®')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /ada prints/i })).toHaveAttribute('href', '/creators/Ada%20Prints')
        expect(screen.getByRole('link', { name: /become a creator/i })).toHaveAttribute('href', '/creators/join')
        expect(calls[0]).toBe('/api/creators?page=1')
    })

    it('searches by name (debounced) and shows the empty state', async () => {
        stubFetch((url) => {
            if (url.includes('q=')) return { ok: true, json: async () => ({ creators: [], total: 0, hasMore: false }) }
            return { ok: true, json: async () => ({ creators, total: 2, hasMore: false }) }
        })
        render(<CreatorsDirectory />)
        await screen.findByText('Ada Prints')
        fireEvent.change(screen.getByLabelText('Search creators'), { target: { value: 'zed' } })
        expect(await screen.findByText('No creators match "zed".')).toBeInTheDocument()
        expect(calls.at(-1)).toBe('/api/creators?page=1&q=zed')
    })

    it('shows the no-pages empty state and pages forward', async () => {
        stubFetch((url) => {
            if (url.includes('page=2')) return { ok: true, json: async () => ({ creators: [creators[1]], total: 21, hasMore: false }) }
            return { ok: true, json: async () => ({ creators: [creators[0]], total: 21, hasMore: true }) }
        })
        render(<CreatorsDirectory />)
        await screen.findByText('Ada Prints')
        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(await screen.findByText('Bob Builds')).toBeInTheDocument()
        expect(screen.getByText('Page 2')).toBeInTheDocument()

        stubFetch(() => ({ ok: true, json: async () => ({ creators: [], total: 0, hasMore: false }) }))
        cleanup()
        render(<CreatorsDirectory />)
        expect(await screen.findByText('No creator pages yet.')).toBeInTheDocument()
    })

    it('surfaces an API failure', async () => {
        stubFetch(() => ({ ok: false, json: async () => ({ error: 'Failed to list creators' }) }))
        render(<CreatorsDirectory />)
        await waitFor(() => expect(screen.getByText('Failed to list creators')).toBeInTheDocument())
    })
})
