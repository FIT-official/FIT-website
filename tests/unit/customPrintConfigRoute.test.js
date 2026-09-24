// PUT /api/custom-print/config: an instant request that already carried a
// verified quote is re-quoted with its new settings (D16) instead of being left
// without a price; a manual save still wipes the quote and notifies the store.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapPurposeToConfiguration } from '@/lib/quoting/genericPresets'

const state = vi.hoisted(() => ({ userId: 'user_buyer', existing: null, updates: [], quoteCalls: [], quoteResult: null, emails: [] }))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async (args) => { state.emails.push(args) }) }))
vi.mock('@/lib/manualQuoteEmail', () => ({ buildManualQuoteAdminEmail: () => ({ subject: 's', html: 'h' }) }))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn(async () => {}) }))
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(() => ({ select: () => ({ lean: async () => null }) })) } }))
vi.mock('@/models/AppSettings', () => ({ default: { findById: vi.fn(() => ({ lean: async () => ({ quotingConfig: {} }) })) } }))
vi.mock('@/lib/appSettingsId', () => ({ getAppSettingsId: () => 'settings' }))
vi.mock('@/lib/quoting/persistInstantQuote', () => ({
    persistInstantQuote: vi.fn(async (args) => { state.quoteCalls.push(args); return state.quoteResult }),
}))
vi.mock('@/models/CustomPrintRequest', () => ({
    default: {
        findOne: vi.fn(async () => state.existing),
        findOneAndUpdate: vi.fn(async (filter, update) => {
            state.updates.push({ filter, update })
            if (!state.existing) return null
            const next = { ...state.existing, ...update.$set, updatedAt: new Date('2026-09-24T02:00:00Z') }
            for (const key of Object.keys(update.$unset || {})) delete next[key]
            next.toObject = () => ({ ...next })
            return next
        }),
    },
}))

const put = async (body) => {
    const { PUT } = await import('@/app/api/custom-print/config/route')
    return PUT(new Request('http://t/api/custom-print/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
}
const settings = (purpose) => mapPurposeToConfiguration({ purpose, colour: 'Jade White' })
const quoted = () => ({ requestId: 'req-1', userId: 'user_buyer', status: 'quoted', quoteMode: 'instant', paidAt: null,
    updatedAt: new Date('2026-09-24T01:00:00Z'), printConfiguration: { ...settings('Normal'), isConfigured: true },
    quote: { total: 18.5, inputs: { options: { postProcessing: true, specialRequest: false, priority: false, expedite: false } } } })

beforeEach(() => {
    process.env.ADMIN_EMAIL = 'admin@x.com'
    state.userId = 'user_buyer'; state.existing = quoted(); state.updates = []; state.quoteCalls = []; state.emails = []
    state.quoteResult = { status: 200, body: { quote: { total: 24.1 }, geometryVerified: true }, request: { requestId: 'req-1', status: 'quoted' } }
    vi.clearAllMocks()
})

describe('PUT /api/custom-print/config', () => {
    it('re-quotes an already quoted instant request with its new settings and returns the fresh quote', async () => {
        const res = await put({ requestId: 'req-1', mode: 'instant', ...settings('Strong'), options: { postProcessing: false, expedite: false } })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toMatchObject({ success: true, quoteRefreshed: true, quote: { total: 24.1 } })
        // The stale price is invalidated before the refresh, so it is never chargeable.
        expect(state.updates[0].update.$unset).toEqual({ quote: 1, quotedAt: 1 })
        expect(state.updates[0].update.$set.status).toBe('configured')
        expect(state.updates[0].update.$set.printConfiguration.printSettings).toMatchObject({ wallLoops: 4, sparseInfillDensity: 40 })
        expect(state.quoteCalls).toHaveLength(1)
        expect(state.quoteCalls[0].request.printConfiguration.printSettings.wallLoops).toBe(4)
        expect(state.quoteCalls[0].body.options).toEqual({ postProcessing: false, specialRequest: false, priority: false, expedite: false })
        expect(state.quoteCalls[0].preview).toBeFalsy()
    })
    it('falls back to the saved quote options when the caller sends none', async () => {
        await put({ requestId: 'req-1', mode: 'instant', ...settings('Strong') })
        expect(state.quoteCalls[0].body.options).toMatchObject({ postProcessing: true })
    })
    it('reports a refresh that could not verify the model while keeping the settings saved', async () => {
        state.quoteResult = { status: 422, body: { error: 'The uploaded model could not be verified for an instant quote.', manualReviewRequired: true } }
        const res = await put({ requestId: 'req-1', mode: 'instant', ...settings('Strong') })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ success: true, quoteRefreshed: false, quoteError: /could not be verified/ })
    })
    it('does not re-quote a first-time instant configuration (the client asks /api/quote)', async () => {
        state.existing = { ...quoted(), status: 'pending_config', quoteMode: null, quote: undefined }
        const res = await put({ requestId: 'req-1', mode: 'instant', ...settings('Normal') })
        expect(res.status).toBe(200)
        expect(await res.json()).not.toHaveProperty('quote')
        expect(state.quoteCalls).toHaveLength(0)
    })
    it('keeps the wipe and notifies the store for a manual quote', async () => {
        const res = await put({ requestId: 'req-1', mode: 'manual', ...settings('Normal') })
        expect(res.status).toBe(200)
        expect(state.updates[0].update.$unset).toEqual({ quote: 1, quotedAt: 1 })
        expect(state.quoteCalls).toHaveLength(0)
        expect(state.emails).toHaveLength(1)
    })
    it('rejects unknown requests, locked requests and unauthenticated callers', async () => {
        state.existing = null
        expect((await put({ requestId: 'req-1', mode: 'instant', ...settings('Normal') })).status).toBe(404)
        state.existing = { ...quoted(), status: 'paid' }
        expect((await put({ requestId: 'req-1', mode: 'instant', ...settings('Normal') })).status).toBe(409)
        state.userId = null
        expect((await put({ requestId: 'req-1', mode: 'instant', ...settings('Normal') })).status).toBe(401)
    })
})
