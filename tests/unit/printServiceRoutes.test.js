// Creator print service API: owner GET/PUT /api/user/print-service (creator
// gate, validation, upsert by creatorUserId) and the public
// GET /api/creators/[id]/print-service (userId or displayName slug; disabled
// or missing both read as { enabled: false } with no other fields).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
    userId: 'user_abc',
    isCreator: true,
    serviceDoc: null,
    updatedDoc: null,
    updateArgs: null,
    users: [],
    userQueries: [],
    appSettings: { quotingConfig: { materialRatePerGram: 0.1, baseFee: 2, minimumPrice: 5 }, machineLimits: { maxLengthCm: 25 } },
    recommendedDelivery: [{ type: 'pickup', displayName: 'Collect at Sunview', description: '', price: 0, needsAddress: false }],
}))

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(async () => ({ userId: state.userId })),
}))
vi.mock('@/lib/requireCreator', () => ({
    requireCreator: vi.fn(async () => state.isCreator !== false),
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => { }) }))
vi.mock('@/models/CreatorPrintService', () => ({
    default: {
        findOne: vi.fn(() => ({ lean: async () => state.serviceDoc })),
        findOneAndUpdate: vi.fn((filter, update, opts) => {
            state.updateArgs = { filter, update, opts }
            return { lean: async () => state.updatedDoc }
        }),
    },
}))
vi.mock('@/models/User', () => ({
    default: {
        findOne: vi.fn((filter) => {
            state.userQueries.push(filter)
            return {
                lean: async () => {
                    if (filter.userId) return state.users.find((u) => u.userId === filter.userId) || null
                    const rx = filter['metadata.displayName']?.$regex
                    if (!rx) return null
                    const re = new RegExp(rx, 'i')
                    return state.users.find((u) => re.test(u.metadata?.displayName || '')) || null
                },
            }
        }),
    },
}))

// Fix It Today's recommended pricing comes from AppSettings + the custom-print
// product; stubbed here so the routes resolve profiles with the real resolver.
vi.mock('@/lib/quoting/loadFarmProfile', async () => {
    const { resolveFarmPricing } = await import('@/lib/quoting/farmProfile')
    return {
        loadRecommendedPricing: vi.fn(async () => ({ appSettings: state.appSettings, recommendedDelivery: state.recommendedDelivery })),
        loadFarmProfile: vi.fn(async (_id, { service } = {}) => ({
            service,
            profile: service ? resolveFarmPricing({ recommended: state.appSettings, service, recommendedDelivery: state.recommendedDelivery }) : null,
        })),
    }
})

const putRequest = (body, headers = {}) =>
    new Request('http://t/api/user/print-service', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })

const validService = () => ({
    enabled: true,
    headline: 'PLA prints',
    description: '',
    materials: [{ name: 'PLA', colours: ['Black'], pricePerGram: 0.1, note: '' }],
    minimumCharge: 5,
    leadTimeDays: 3,
    maxBuildMm: { x: 200, y: 200, z: 200 },
    acceptedFormats: ['stl'],
    turnaroundNote: '',
})

beforeEach(() => {
    state.userId = 'user_abc'
    state.isCreator = true
    state.serviceDoc = null
    state.updatedDoc = null
    state.updateArgs = null
    state.users = []
    state.userQueries = []
    vi.clearAllMocks()
})

describe('GET /api/user/print-service', () => {
    it('rejects unauthenticated callers with 401', async () => {
        state.userId = null
        const { GET } = await import('@/app/api/user/print-service/route')
        expect((await GET()).status).toBe(401)
    })

    it('returns defaults when the creator has no service yet', async () => {
        const { GET } = await import('@/app/api/user/print-service/route')
        const body = await (await GET()).json()
        expect(body.service).toMatchObject({ enabled: false, materials: [], leadTimeDays: 7, acceptedFormats: ['stl', '3mf'] })
    })

    it('returns the owner shape of an existing service', async () => {
        state.serviceDoc = { creatorUserId: 'user_abc', enabled: true, headline: 'Hi', materials: [{ name: 'PETG', pricePerGram: 0.2 }] }
        const { GET } = await import('@/app/api/user/print-service/route')
        const body = await (await GET()).json()
        expect(body.service.enabled).toBe(true)
        expect(body.service.headline).toBe('Hi')
        expect(body.service.materials[0]).toEqual({ name: 'PETG', colours: [], pricePerGram: 0.2, note: '' })
    })
})

describe('PUT /api/user/print-service', () => {
    it('rejects unauthenticated callers with 401', async () => {
        state.userId = null
        const { PUT } = await import('@/app/api/user/print-service/route')
        expect((await PUT(putRequest(validService()))).status).toBe(401)
    })

    it('returns 403 without the creator entitlement', async () => {
        state.isCreator = false
        const { PUT } = await import('@/app/api/user/print-service/route')
        expect((await PUT(putRequest(validService()))).status).toBe(403)
    })

    it('rejects oversized payloads and invalid JSON', async () => {
        const { PUT } = await import('@/app/api/user/print-service/route')
        expect((await PUT(putRequest(validService(), { 'content-length': String(100_000) }))).status).toBe(413)
        expect((await PUT(putRequest('{nope'))).status).toBe(400)
    })

    it('returns 400 with issues for invalid input (unknown key, bad lead time, enabled without materials)', async () => {
        const { PUT } = await import('@/app/api/user/print-service/route')
        const unknown = await PUT(putRequest({ ...validService(), creatorUserId: 'user_OTHER' }))
        expect(unknown.status).toBe(400)
        expect((await unknown.json()).issues).toBeTruthy()
        expect((await PUT(putRequest({ ...validService(), leadTimeDays: 99 }))).status).toBe(400)
        const noMaterials = await PUT(putRequest({ ...validService(), materials: [] }))
        expect(noMaterials.status).toBe(400)
        expect((await noMaterials.json()).error).toMatch(/material/i)
        expect(state.updateArgs).toBeNull()
    })

    it('happy path: upserts by the caller userId with the validated document', async () => {
        state.updatedDoc = { creatorUserId: 'user_abc', ...validService(), updatedAt: new Date('2026-09-15T00:00:00Z') }
        const { PUT } = await import('@/app/api/user/print-service/route')
        const res = await PUT(putRequest({ ...validService(), headline: 'PLA <prints>' }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.service.enabled).toBe(true)
        expect(state.updateArgs.filter).toEqual({ creatorUserId: 'user_abc' })
        expect(state.updateArgs.update.$set.headline).toBe('PLA prints')
        expect(state.updateArgs.update.$set.materials).toEqual([{ name: 'PLA', colours: ['Black'], pricePerGram: 0.1, note: '' }])
        expect(state.updateArgs.update.$set).not.toHaveProperty('creatorUserId')
        expect(state.updateArgs.update.$setOnInsert).toEqual({ creatorUserId: 'user_abc' })
        expect(state.updateArgs.opts).toMatchObject({ upsert: true, new: true, runValidators: true })
    })
})

describe('GET /api/creators/[id]/print-service', () => {
    const call = async (id) => {
        const { GET } = await import('@/app/api/creators/[id]/print-service/route')
        return GET(new Request(`http://t/api/creators/${id}/print-service`), { params: Promise.resolve({ id }) })
    }

    it('answers { enabled: false } for an unknown creator', async () => {
        const res = await call('nobody')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ enabled: false })
    })

    it('answers { enabled: false } when the service is missing or disabled', async () => {
        state.users = [{ userId: 'user_abc', metadata: { displayName: 'Atelier' } }]
        expect(await (await call('user_abc')).json()).toEqual({ enabled: false })
        state.serviceDoc = { creatorUserId: 'user_abc', enabled: false, materials: [{ name: 'PLA', pricePerGram: 0.1 }] }
        expect(await (await call('user_abc')).json()).toEqual({ enabled: false })
    })

    it('resolves a display-name slug (case-insensitive, URL-encoded) and returns the public allowlist', async () => {
        state.users = [{ userId: 'user_abc', metadata: { displayName: 'Maker Lab' } }]
        state.serviceDoc = {
            creatorUserId: 'user_abc', enabled: true, _id: 'secret', headline: 'Hi',
            materials: [{ name: 'PLA', colours: ['Red'], pricePerGram: 0.1, note: '' }],
            minimumCharge: 5, leadTimeDays: 3, maxBuildMm: { x: 200, y: 200, z: 200 }, acceptedFormats: ['stl'],
        }
        const body = await (await call('maker%20lab')).json()
        expect(body.enabled).toBe(true)
        expect(body.creator).toEqual({ userId: 'user_abc', displayName: 'Maker Lab' })
        expect(body.service).toEqual({
            headline: 'Hi', description: '', materials: [{ name: 'PLA', colours: ['Red'], pricePerGram: 0.1, note: '' }],
            minimumCharge: 5, leadTimeDays: 3, maxBuildMm: { x: 200, y: 200, z: 200 }, acceptedFormats: ['stl'], turnaroundNote: '',
        })
        expect(body.service).not.toHaveProperty('_id')
        // Regex special characters in the slug are escaped, not interpreted.
        expect(await (await call('maker.lab')).json()).toEqual({ enabled: false })
    })
})

describe('per-farm pricing on the print-service API', () => {
    const pricing = () => ({
        overrides: { materialRatePerGram: 0.12, baseFee: null, priorityFee: 3 },
        materials: [{ filament: 'pla', enabled: true, priceMultiplier: 1.5, coloursOff: ['Black'] }],
        delivery: [{ type: 'pickup', label: 'Collect in Jurong', price: 0, needsAddress: false }],
    })

    it('GET returns the recommended values beside the service', async () => {
        const { GET } = await import('@/app/api/user/print-service/route')
        const body = await (await GET()).json()
        expect(body.service.pricing).toBeNull()
        expect(body.recommended.quotingConfig).toMatchObject({ materialRatePerGram: 0.1, baseFee: 2, minimumPrice: 5 })
        expect(body.recommended.machineLimits).toMatchObject({ maxLengthCm: 25, maxWidthCm: null })
        expect(body.recommended.materials.map((m) => m.filament)).toEqual(['pla', 'pla_matte', 'petg', 'asa', 'abs', 'tpu'])
        expect(body.recommended.materials[0].ratePerGram).toBe(0.1)
        expect(body.recommended.deliveryOptions).toEqual(state.recommendedDelivery)
    })

    it('PUT validates pricing, writes it field by field and bumps its version', async () => {
        state.updatedDoc = { creatorUserId: 'user_abc', ...validService(), pricing: { ...pricing(), overrides: { materialRatePerGram: 0.12, priorityFee: 3 }, version: 4 } }
        const { PUT } = await import('@/app/api/user/print-service/route')
        const res = await PUT(putRequest({ ...validService(), materials: [], pricing: { ...pricing(), version: 1000 } }))
        expect(res.status).toBe(200)
        const { $set, $inc } = state.updateArgs.update
        expect($set['pricing.overrides']).toEqual({ materialRatePerGram: 0.12, priorityFee: 3 })
        expect($set['pricing.materials']).toEqual([{ filament: 'pla', enabled: true, priceMultiplier: 1.5, coloursOff: ['Black'] }])
        expect($set['pricing.delivery']).toEqual([{ type: 'pickup', label: 'Collect in Jurong', price: 0, description: '', needsAddress: false }])
        expect($set).not.toHaveProperty('pricing')
        expect(Object.keys($set)).not.toContain('pricing.version')
        expect($inc).toEqual({ 'pricing.version': 1 })
        const body = await res.json()
        expect(body.service.pricing.version).toBe(4)
        expect(body.recommended.quotingConfig.materialRatePerGram).toBe(0.1)
    })

    it('PUT without pricing leaves a stored profile untouched and counts its materials', async () => {
        state.serviceDoc = { creatorUserId: 'user_abc', pricing: pricing() }
        state.updatedDoc = { creatorUserId: 'user_abc', ...validService() }
        const { PUT } = await import('@/app/api/user/print-service/route')
        const res = await PUT(putRequest({ ...validService(), materials: [] }))
        expect(res.status).toBe(200)
        expect(Object.keys(state.updateArgs.update.$set).some((key) => key.startsWith('pricing'))).toBe(false)
        expect(state.updateArgs.update.$inc).toBeUndefined()
    })

    it.each([
        ['a rate outside the admin bounds', { overrides: { baseFee: -1 } }],
        ['a multiplier above 10', { materials: [{ filament: 'pla', priceMultiplier: 12 }] }],
        ['an unknown filament', { materials: [{ filament: 'resin' }] }],
        ['client-sent unknown pricing fields', { overrides: {}, rates: { materialRatePerGram: 0 } }],
    ])('PUT rejects %s with 400 and writes nothing', async (_label, bad) => {
        const { PUT } = await import('@/app/api/user/print-service/route')
        const res = await PUT(putRequest({ ...validService(), pricing: bad }))
        expect(res.status).toBe(400)
        expect(state.updateArgs).toBeNull()
    })

    it('PUT refuses to enable a service whose pricing offers no material', async () => {
        const { PUT } = await import('@/app/api/user/print-service/route')
        const res = await PUT(putRequest({ ...validService(), materials: [], pricing: { materials: [{ filament: 'pla', enabled: false }] } }))
        expect(res.status).toBe(400)
    })

    it('public GET adds the resolved public profile next to the legacy service shape', async () => {
        state.users = [{ userId: 'user_abc', metadata: { displayName: 'Maker Lab' } }]
        state.serviceDoc = { creatorUserId: 'user_abc', enabled: true, headline: 'Hi', leadTimeDays: 3, materials: [], pricing: pricing() }
        const { GET } = await import('@/app/api/creators/[id]/print-service/route')
        const body = await (await GET(new Request('http://t/x'), { params: Promise.resolve({ id: 'user_abc' }) })).json()
        expect(body.profile.materials).toEqual([expect.objectContaining({ filament: 'pla', label: 'PLA', ratePerGram: 0.18 })])
        expect(body.profile.materials[0].colours.map((c) => c.name)).not.toContain('Black')
        expect(body.profile.deliveryOptions).toEqual([{ type: 'pickup', displayName: 'Collect in Jurong', description: '', price: 0, needsAddress: false }])
        expect(body.profile).toMatchObject({ leadTimeDays: 3, machineLimits: { maxLengthCm: 25 }, offers: { priority: true, expedite: false } })
        expect(JSON.stringify(body.profile)).not.toMatch(/overrides|priceMultiplier|version|printTimeRatePerHour/)
    })

    it('public GET derives a profile for a legacy service', async () => {
        state.users = [{ userId: 'user_abc', metadata: { displayName: 'Maker Lab' } }]
        state.serviceDoc = { creatorUserId: 'user_abc', enabled: true, leadTimeDays: 3, minimumCharge: 5,
            materials: [{ name: 'PLA', colours: ['Red'], pricePerGram: 0.2 }], maxBuildMm: { x: 200, y: 200, z: 200 } }
        const { GET } = await import('@/app/api/creators/[id]/print-service/route')
        const body = await (await GET(new Request('http://t/x'), { params: Promise.resolve({ id: 'user_abc' }) })).json()
        expect(body.profile.materials).toEqual([expect.objectContaining({ filament: 'pla', ratePerGram: 0.2, colours: [expect.objectContaining({ name: 'Red' })] })])
        expect(body.profile.machineLimits).toMatchObject({ maxLengthCm: 20, maxWidthCm: 20, maxHeightCm: 20 })
    })
})
