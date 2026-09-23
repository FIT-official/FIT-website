import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ userId: 'user_free', allowed: true, duplicate: null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }))
vi.mock('@/lib/requireCreator', () => ({ requireCreator: vi.fn(async () => state.allowed) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/User', () => ({ default: {
  findOne: vi.fn(() => ({ lean: async () => state.duplicate })),
  findOneAndUpdate: vi.fn(() => ({ lean: async () => ({ metadata: { displayName: 'Small Prints' } }) })),
} }))
import { PUT } from '@/app/api/user/display-name/route'
import User from '@/models/User'

const save = () => PUT(new Request('http://localhost/api/user/display-name', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Small Prints' }) }))
beforeEach(() => { state.userId = 'user_free'; state.allowed = true; state.duplicate = null; vi.clearAllMocks() })

describe('Free store naming', () => {
  it('lets a valid Free account configure its storefront without a subscription', async () => {
    expect((await save()).status).toBe(200)
    expect(User.findOneAndUpdate).toHaveBeenCalledWith({ userId: 'user_free' }, expect.objectContaining({ $set: { 'metadata.displayName': 'Small Prints', 'metadata.role': 'Creator' } }), expect.anything())
  })
  it('rejects signed-out users and duplicate store names', async () => {
    state.userId = null
    expect((await save()).status).toBe(401)
    state.userId = 'user_free'; state.duplicate = { userId: 'other' }
    expect((await save()).status).toBe(409)
    expect(User.findOneAndUpdate).not.toHaveBeenCalled()
  })
})
