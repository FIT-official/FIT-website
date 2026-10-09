// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), send: vi.fn(), db: vi.fn(), summary: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), claims: new Map() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }))
vi.mock('@/lib/streamChat', () => ({ getStreamServerClient: () => ({ queryChannels: m.query }) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: m.db }))
vi.mock('@/models/User', () => ({ default: { findOne: m.find } }))
vi.mock('@/models/ChannelSummary', () => ({ default: { findOneAndUpdate: m.summary } }))
vi.mock('@/models/ChatAutoReply', () => ({ default: { create: m.create, updateOne: m.update } }))
import { POST } from '@/app/api/chat/auto-reply/route'
import { welcomeId } from '@/lib/chat/welcome'
const request = (body = { channelId: 'synthetic-channel' }) => new Request('https://audit.invalid/api/chat/auto-reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
function channel(memberIds = ['buyer', 'creator'], kind = 'creator') {
  return { id: 'synthetic-channel', data: { kind }, state: { members: Object.fromEntries(memberIds.map(id => [id, { user_id: id }])), messages: [] }, sendMessage: m.send }
}
beforeEach(() => {
  vi.resetAllMocks(); m.claims.clear()
  m.auth.mockResolvedValue({ userId: 'buyer' }); m.query.mockResolvedValue([channel()])
  m.find.mockReturnValue({ lean: async () => ({ metadata: { autoReplyMessage: 'Synthetic welcome' } }) })
  m.create.mockImplementation(async row => { if (m.claims.has(row._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); m.claims.set(row._id, { ...row }); return row })
  m.update.mockImplementation(async (filter, update) => { const row = m.claims.get(filter._id); if (row) Object.assign(row, update.$set); return { acknowledged: true, matchedCount: row ? 1 : 0 } })
})
describe('creator welcome authorization and durable deduplication', () => {
  it('rejects anonymous actors before provider or database access', async () => {
    m.auth.mockResolvedValue({ userId: null }); expect((await POST(request())).status).toBe(401)
    expect(m.query).not.toHaveBeenCalled(); expect(m.db).not.toHaveBeenCalled()
  })
  it.each([null, {}, [], '', ' ', 'x'.repeat(129)])('rejects invalid channel identity %j', async channelId => {
    expect((await POST(request({ channelId }))).status).toBe(400); expect(m.query).not.toHaveBeenCalled()
  })
  it('rejects invalid JSON', async () => { expect((await POST(request('{'))).status).toBe(400); expect(m.query).not.toHaveBeenCalled() })
  it('rejects a returned channel without the caller before reads, summary writes or messages', async () => {
    m.auth.mockResolvedValue({ userId: 'outsider' })
    expect((await POST(request())).status).toBe(403)
    expect(m.query.mock.calls[0][0]).toMatchObject({ members: { $in: ['outsider'] } })
    for (const fn of [m.db, m.find, m.summary, m.create, m.send]) expect(fn).not.toHaveBeenCalled()
  })
  it('does not reveal channels filtered out by provider membership', async () => { m.query.mockResolvedValue([]); expect((await POST(request())).status).toBe(404); expect(m.db).not.toHaveBeenCalled() })
  it.each([channel(['buyer', 'creator', 'third']), channel(['buyer']), channel(undefined, 'support'), { ...channel(), id: 'wrong-channel' }])('rejects unsupported channel shapes', async value => {
    m.query.mockResolvedValue([value]); expect((await POST(request())).status).toBe(400); expect(m.db).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled()
  })
  it('sends the configured counterpart reply once for sequential retries', async () => {
    expect((await POST(request())).status).toBe(200); expect((await POST(request())).status).toBe(200)
    expect(m.send).toHaveBeenCalledExactlyOnceWith({ text: 'Synthetic welcome', user_id: 'creator' })
    expect(m.create.mock.invocationCallOrder[0]).toBeLessThan(m.send.mock.invocationCallOrder[0])
    expect(m.claims.get(welcomeId('synthetic-channel', 'creator')).status).toBe('sent')
  })
  it('concurrent retries share the unique durable claim', async () => {
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => POST(request())))
    expect(outcomes.every(result => result.status === 200)).toBe(true); expect(m.send).toHaveBeenCalledTimes(1); expect(m.claims.size).toBe(1)
  })
  it('accepts the provider array membership shape without weakening authorization', async () => {
    const value = channel(); value.state.members = Object.values(value.state.members); m.query.mockResolvedValue([value])
    expect((await POST(request())).status).toBe(200); expect(m.send).toHaveBeenCalledTimes(1)
  })
  it.each(['', ' ', 123, null])('does not claim or send an invalid saved reply %j', async autoReplyMessage => {
    m.find.mockReturnValue({ lean: async () => ({ metadata: { autoReplyMessage } }) })
    expect((await POST(request())).status).toBe(200); expect(m.create).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled()
  })
  it('fails closed on database/claim failure', async () => {
    m.create.mockRejectedValueOnce(new Error('synthetic outage'))
    expect((await POST(request())).status).toBe(500); expect(m.send).not.toHaveBeenCalled()
  })
  it('does not resend after an ambiguous provider acceptance', async () => {
    m.send.mockRejectedValueOnce(new Error('synthetic acknowledgement timeout'))
    expect((await POST(request())).status).toBe(500); expect((await POST(request())).status).toBe(200)
    expect(m.send).toHaveBeenCalledTimes(1); expect([...m.claims.values()][0].status).toBe('uncertain')
  })
  it('does not resend after the sent-status database acknowledgement fails', async () => {
    m.update.mockRejectedValueOnce(new Error('synthetic write acknowledgement failure'))
    expect((await POST(request())).status).toBe(500); expect((await POST(request())).status).toBe(200)
    expect(m.send).toHaveBeenCalledTimes(1)
  })
  it('keeps an uncertain claim even when its insert acknowledgement is lost', async () => {
    const create = m.create.getMockImplementation()
    m.create.mockImplementationOnce(async row => { await create(row); throw new Error('synthetic lost insert acknowledgement') })
    expect((await POST(request())).status).toBe(500); expect((await POST(request())).status).toBe(200)
    expect(m.send).not.toHaveBeenCalled()
  })
})
