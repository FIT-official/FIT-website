// authenticate() must make "forgot to check the auth result" structurally
// impossible: it throws UnauthorizedError on a missing/invalid Clerk session
// instead of returning an ambiguous shape (`{ userId } | NextResponse`) that a
// caller could destructure past without noticing the failure.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth }))

import { authenticate, UnauthorizedError, unauthorizedResponse } from '@/lib/authenticate'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('authenticate', () => {
    it('throws UnauthorizedError when there is no Clerk session', async () => {
        auth.mockResolvedValue({ userId: null })

        await expect(authenticate(new Request('https://x/api/test'))).rejects.toThrow(UnauthorizedError)
    })

    it('returns { userId } for a valid session', async () => {
        auth.mockResolvedValue({ userId: 'user_123' })

        const result = await authenticate(new Request('https://x/api/test'))

        expect(result).toEqual({ userId: 'user_123' })
    })
})

describe('unauthorizedResponse', () => {
    it('returns a 401 JSON response', async () => {
        const res = unauthorizedResponse()
        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body).toEqual({ error: 'Unauthorized' })
    })
})
