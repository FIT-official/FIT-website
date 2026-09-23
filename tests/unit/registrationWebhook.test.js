// The real webhook handler/Svix verifier runs with a local dummy signing secret.
// Clerk and analytics are mocked; no external requests are made.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Webhook } from 'svix'

const mock = vi.hoisted(() => ({ getUser: vi.fn(), updateUserMetadata: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({ users: mock }) }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => ({ capture: vi.fn() }) }))
const secret = `whsec_${Buffer.from('local-webhook-test-secret').toString('base64')}`
let POST
beforeAll(async () => {
    vi.stubEnv('CLERK_WEBHOOK_SECRET', secret)
    ;({ POST } = await import('@/app/api/newUser/route'))
})
afterAll(() => vi.unstubAllEnvs())
beforeEach(() => {
    vi.clearAllMocks()
    mock.getUser.mockResolvedValue({ publicMetadata: { onboardingComplete: true }, unsafeMetadata: {} })
    mock.updateUserMetadata.mockResolvedValue({})
})
function event(type = 'user.created', valid = true) {
    const body = JSON.stringify({ type, data: { id: 'user_free' } })
    const timestamp = new Date()
    return new Request('https://fit.example/api/newUser', {
        method: 'POST', body,
        headers: {
            'content-type': 'application/json', 'svix-id': 'msg_local_1',
            'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
            'svix-signature': valid ? new Webhook(secret).sign('msg_local_1', timestamp, body) : 'v1,invalid',
        },
    })
}

describe('registration webhook delivery', () => {
    it('returns a retryable failure when account metadata update fails, then accepts redelivery', async () => {
        mock.updateUserMetadata.mockRejectedValueOnce(new Error('Clerk unavailable'))
        expect((await POST(event())).status).toBe(503)
        expect((await POST(event())).status).toBe(200)
        expect(mock.updateUserMetadata).toHaveBeenCalledTimes(2)
    })
    it('merges only registration metadata without replacing onboarding/billing fields', async () => {
        expect((await POST(event())).status).toBe(200)
        expect(mock.updateUserMetadata).toHaveBeenCalledWith('user_free', {
            publicMetadata: { role: 'user' }, unsafeMetadata: { cardToken: null, priceId: null },
        })
    })
    it('acknowledges unsupported signed events but rejects a bad signature', async () => {
        expect((await POST(event('session.created'))).status).toBe(200)
        expect((await POST(event('user.created', false))).status).toBe(400)
        expect(mock.getUser).not.toHaveBeenCalled()
    })
})
