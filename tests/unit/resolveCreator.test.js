// lib/creatorPage/resolveCreator.js — shared userId-or-displayName lookup
// used by the public creator page and the public creator APIs.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ calls: [], byUserId: null, byName: null }))

vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => null) }))

vi.mock('@/models/User', () => ({
    default: {
        findOne: vi.fn((filter, projection) => {
            state.calls.push({ filter, projection })
            const doc = filter.userId ? state.byUserId : state.byName
            return { lean: async () => doc }
        }),
    },
}))

beforeEach(() => {
    state.calls = []
    state.byUserId = null
    state.byName = null
})

describe('resolveCreatorByIdOrName', () => {
    it('returns null for an empty slug without touching the database', async () => {
        const { resolveCreatorByIdOrName } = await import('@/lib/creatorPage/resolveCreator')
        expect(await resolveCreatorByIdOrName('')).toBeNull()
        expect(await resolveCreatorByIdOrName('%20')).toBeNull()
        expect(state.calls).toHaveLength(0)
    })

    it('resolves by userId first with a public-only projection', async () => {
        state.byUserId = { userId: 'user_1', metadata: { displayName: 'Ada Prints', role: 'Creator' }, shop: { description: 'hi' } }
        const { resolveCreatorByIdOrName } = await import('@/lib/creatorPage/resolveCreator')
        const out = await resolveCreatorByIdOrName('user_1')
        expect(out).toEqual({ userId: 'user_1', displayName: 'Ada Prints', role: 'Creator', shop: { description: 'hi' } })
        expect(state.calls).toHaveLength(1)
        expect(state.calls[0].projection).toEqual({ 'metadata.displayName': 1, 'metadata.role': 1, userId: 1, shop: 1, _id: 0 })
    })

    it('falls back to a case-insensitive, escaped display-name match (decoding the slug)', async () => {
        state.byName = { userId: 'user_2', metadata: { displayName: 'A.B (Prints)' } }
        const { resolveCreatorByIdOrName } = await import('@/lib/creatorPage/resolveCreator')
        const out = await resolveCreatorByIdOrName('a.b%20%20(prints)')
        expect(out).toMatchObject({ userId: 'user_2', displayName: 'A.B (Prints)', role: 'Customer', shop: {} })
        expect(state.calls[1].filter).toEqual({
            'metadata.displayName': { $regex: '^a\\.b \\(prints\\)$', $options: 'i' },
        })
    })

    it('returns null when nothing matches and masks id-like display names', async () => {
        const { resolveCreatorByIdOrName } = await import('@/lib/creatorPage/resolveCreator')
        expect(await resolveCreatorByIdOrName('nobody')).toBeNull()
        state.byUserId = { userId: 'user_3', metadata: { displayName: 'user_3' } }
        expect((await resolveCreatorByIdOrName('user_3')).displayName).toBe('Unnamed Store')
    })
})
