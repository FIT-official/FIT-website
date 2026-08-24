// GET /api/admin/settings must require admin privileges like its sibling
// POST/PUT/DELETE handlers — regression test for the previously-unguarded GET.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: vi.fn() }))

const appSettingsDoc = {
    additionalDeliveryTypes: [],
    additionalCategories: [],
    printColours: [],
}

vi.mock('@/models/AppSettings', () => ({
    default: { findById: vi.fn(() => Promise.resolve(appSettingsDoc)) },
}))

import { GET } from '@/app/api/admin/settings/route'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

const req = () => new Request('https://x/api/admin/settings')

beforeEach(() => {
    vi.clearAllMocks()
})

describe('GET /api/admin/settings', () => {
    it('rejects an unauthenticated caller', async () => {
        auth.mockResolvedValue({ userId: null })

        const res = await GET(req())

        expect(res.status).toBe(401)
        expect(checkAdminPrivileges).not.toHaveBeenCalled()
    })

    it('rejects an authenticated non-admin caller', async () => {
        auth.mockResolvedValue({ userId: 'user_1' })
        checkAdminPrivileges.mockResolvedValue(false)

        const res = await GET(req())

        expect(res.status).toBe(403)
    })

    it('returns settings for an admin caller', async () => {
        auth.mockResolvedValue({ userId: 'user_admin' })
        checkAdminPrivileges.mockResolvedValue(true)

        const res = await GET(req())

        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toHaveProperty('deliveryTypes')
    })
})
