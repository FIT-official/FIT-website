// /cart?addCustomRequest=<id>: when /api/cart/custom-print refuses the
// request (a creator print-farm job is paid directly to the creator), the
// cart shows why instead of failing silently.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({ showToast: null, addResponse: null }))

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: 'user_1' }, isLoaded: true }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ addCustomRequest: 'req_farm' }) }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }) => <img src={typeof src === 'string' ? src : ''} alt={alt} />,
}))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: state.showToast }) }))
vi.mock('@/components/General/CurrencyContext', () => ({ useCurrency: () => 'SGD' }))
vi.mock('@/utils/convertCurrency', () => ({ convertToGlobalCurrency: vi.fn(async (amount) => amount) }))
vi.mock('@/components/Cart/CustomPrintUpload', () => ({ default: () => <div data-testid="custom-print-upload" /> }))

import Cart from '@/app/cart/Cart'

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
const FARM_MESSAGE = 'This request is with Kai Prints; payment is arranged directly with them.'

beforeEach(() => {
    state.showToast = vi.fn()
    state.addResponse = json({ error: FARM_MESSAGE }, 409)
    global.fetch = vi.fn(async (url) => {
        if (url === '/api/cart/custom-print') return state.addResponse
        if (url === '/api/admin/settings') return json({ settings: { additionalDeliveryTypes: [] } })
        if (url === '/api/user/cart') return json({ cart: [] })
        if (url === '/api/checkout/breakdown') return json({ cartBreakdown: [], addressMissing: false, needsDeliveryAddress: false, address: null })
        return json({})
    })
})
afterEach(cleanup)

describe('cart ?addCustomRequest=', () => {
    it('shows the refusal for a creator print-farm job on the page and as a toast', async () => {
        render(<Cart />)
        expect(await screen.findByRole('alert')).toHaveTextContent(FARM_MESSAGE)
        expect(screen.getByRole('link', { name: 'View your print requests' })).toHaveAttribute('href', '/account/prints')
        expect(state.showToast).toHaveBeenCalledWith(FARM_MESSAGE, 'error')
        const add = global.fetch.mock.calls.find(([url]) => url === '/api/cart/custom-print')
        expect(JSON.parse(add[1].body)).toEqual({ requestId: 'req_farm' })
    })

    it('still explains a refusal that carries no message', async () => {
        state.addResponse = { ok: false, status: 500, json: async () => { throw new Error('not json') } }
        render(<Cart />)
        expect(await screen.findByRole('alert')).toHaveTextContent('incomplete response')
    })

    it('shows nothing when the request is added', async () => {
        state.addResponse = json({ cart: [] })
        render(<Cart />)
        await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url === '/api/user/cart')).toBe(true))
        expect(screen.queryByRole('alert')).toBeNull()
        expect(state.showToast).not.toHaveBeenCalled()
    })
})
