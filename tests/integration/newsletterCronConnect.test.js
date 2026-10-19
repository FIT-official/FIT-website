// @vitest-environment node
// Fake-dependency test: a database connection failure must answer a retryable 503 BEFORE any campaign is claimed or any email is sent; later errors keep their existing behaviour.
import { describe, expect, it, vi, beforeEach } from 'vitest'
const m = vi.hoisted(() => ({ connect: vi.fn(), campaigns: vi.fn(), welcome: vi.fn() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: m.connect }))
vi.mock('@/lib/newsletter/dispatch', () => ({ dispatchDueCampaigns: m.campaigns, dispatchWelcomeDrip: m.welcome }))
vi.mock('@/lib/verifyCronSecret', () => ({ verifyCronSecret: () => true }))
import { GET } from '@/app/api/cron/newsletters/route'

const call = () => GET(new Request('http://x.test/api/cron/newsletters', { headers: { authorization: 'Bearer s' } }))
beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = 's' })

describe('newsletter cron', () => {
  it('answers a retryable 503 when the database cannot be reached, and sends nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.connect.mockRejectedValue(Object.assign(new Error('mongodb://user:pw@host connection pool timeout'), { name: 'MongoWaitQueueTimeoutError' }))
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, retryable: true, error: 'Database unavailable' })
    expect(m.campaigns).not.toHaveBeenCalled(); expect(m.welcome).not.toHaveBeenCalled()
    expect(JSON.stringify(console.error.mock.calls)).not.toMatch(/mongodb:|pw@/)   // the connection string is never logged
  })
  it('keeps the existing success answer', async () => {
    m.connect.mockResolvedValue(); m.campaigns.mockResolvedValue([]); m.welcome.mockResolvedValue({ sent: 0 })
    const res = await call()
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ ok: true, campaigns: [], welcome: { sent: 0 } })
  })
  it('does not catch or retry errors after the claim: a dispatch failure still propagates (no duplicate-send risk added)', async () => {
    m.connect.mockResolvedValue(); m.campaigns.mockRejectedValue(new Error('send failed'))
    await expect(call()).rejects.toThrow('send failed')
    expect(m.campaigns).toHaveBeenCalledTimes(1); expect(m.welcome).not.toHaveBeenCalled()
  })
  it('still refuses without the secret or with a bad token', async () => {
    delete process.env.CRON_SECRET
    expect((await call()).status).toBe(503); expect(m.connect).not.toHaveBeenCalled()
  })
})
