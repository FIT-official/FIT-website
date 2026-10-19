// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
const m = vi.hoisted(() => ({ find: vi.fn(), updateOne: vi.fn(), sendEmail: vi.fn(), prepare: vi.fn() }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { find: m.find, updateOne: m.updateOne } }))
vi.mock('@/lib/email', () => ({ sendEmail: m.sendEmail }))
vi.mock('@/lib/email/printPreviews', () => ({ prepareNudgePreviews: m.prepare, PREVIEW_LIMITS: { budgetMs: 8000 } }))
vi.mock('@/lib/verifyCronSecret', () => ({ verifyCronSecret: () => true }))
import { GET } from '@/app/api/cron/custom-print-nudges/route'
import { legacyRequest } from '../helpers/emailFixtures'

const old = new Date(Date.now() - 20 * 86400000)
const candidate = (extra = {}) => legacyRequest({ updatedAt: old, ...extra })
const call = () => GET(new Request('http://x.test/api/cron/custom-print-nudges', { headers: { authorization: 'Bearer s' } }))
beforeEach(() => {
  vi.clearAllMocks(); process.env.CRON_SECRET = 's'
  m.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [candidate(), candidate({ requestId: 'FIT-SYN-0003', status: 'paid' })] }) }) })
  m.sendEmail.mockResolvedValue({}); m.updateOne.mockResolvedValue({})
})

describe('custom-print nudge cron with model previews', () => {
  it('attaches the prepared previews to the nudge, sends it once, and still stamps the request', async () => {
    const png = Buffer.from([1, 2, 3])
    m.prepare.mockResolvedValue({ models: [{ id: 'legacy', label: 'bracket.stl', fileName: 'bracket.stl', quantity: null, material: { state: 'not_specified' }, colour: { state: 'not_specified' }, price: { state: 'not_quoted' } }], previews: { legacy: { status: 'ready', cid: 'model-preview-n-1@fixitoday.local', modelId: 'legacy', width: 480, height: 320, requestId: 'FIT-SYN-0001', ownerUserId: 'user_syn_owner' } }, attachments: [{ filename: 'model-preview-1.png', content: png, contentType: 'image/png', contentDisposition: 'inline', cid: 'model-preview-n-1@fixitoday.local' }] })
    const body = await (await call()).json()
    expect(body).toMatchObject({ due: 1, sent: 1, failed: 0 })
    expect(m.prepare).toHaveBeenCalledTimes(1)
    const sent = m.sendEmail.mock.calls[0][0]
    expect(sent.to).toBe('maker@example.test'); expect(sent.subject).toBe('Your custom print is waiting for you')
    expect(sent.attachments).toHaveLength(1); expect(sent.html).toContain('cid:model-preview-n-1@fixitoday.local')
    expect(m.updateOne).toHaveBeenCalledTimes(1)
  })
  it('a preview failure sends the original email without attachments (never skips or fails the nudge)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.prepare.mockRejectedValue(new Error('boom'))
    const body = await (await call()).json()
    expect(body).toMatchObject({ due: 1, sent: 1, failed: 0 })
    const sent = m.sendEmail.mock.calls[0][0]
    expect(sent).not.toHaveProperty('attachments'); expect(sent.html).not.toContain('cid:'); expect(sent.html).toContain('Get my quote')
    expect(m.updateOne).toHaveBeenCalledTimes(1)
  })
  it('eligibility is unchanged: only the idle pre-payment request is emailed; a failed send is not stamped', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.prepare.mockResolvedValue({ models: null, previews: {}, attachments: [] })
    m.sendEmail.mockRejectedValue(new Error('smtp'))
    const body = await (await call()).json()
    expect(body).toMatchObject({ scanned: 2, due: 1, sent: 0, failed: 1 })
    expect(m.updateOne).not.toHaveBeenCalled()
  })
})

describe('custom-print nudge cron: several recipients in one run', () => {
  const ready = (cid, id, owner) => ({ models: [{ id: 'legacy', label: 'bracket.stl', fileName: 'bracket.stl', quantity: null, material: { state: 'not_specified' }, colour: { state: 'not_specified' }, price: { state: 'not_quoted' } }], previews: { legacy: { status: 'ready', cid, modelId: 'legacy', width: 480, height: 320, requestId: id, ownerUserId: owner } }, attachments: [{ filename: 'model-preview-1.png', content: Buffer.from([9]), contentType: 'image/png', contentDisposition: 'inline', cid }] })
  it('each email gets only its own attachments and content ids; a failed or empty second request never reuses the first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [candidate(), candidate({ requestId: 'FIT-SYN-0201', userId: 'user_syn_two', userEmail: 'two@example.test' }), candidate({ requestId: 'FIT-SYN-0202', userId: 'user_syn_three', userEmail: 'three@example.test' })] }) }) })
    m.prepare.mockResolvedValueOnce(ready('cid-one@fixitoday.local', 'FIT-SYN-0001', 'user_syn_owner')).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ models: null, previews: {}, attachments: [] })
    const body = await (await call()).json()
    expect(body).toMatchObject({ due: 3, sent: 3, failed: 0 })
    const [one, two, three] = m.sendEmail.mock.calls.map(c => c[0])
    expect([one.to, two.to, three.to]).toEqual(['maker@example.test', 'two@example.test', 'three@example.test'])
    expect(one.attachments).toHaveLength(1); expect(one.html).toContain('cid:cid-one@fixitoday.local')
    for (const other of [two, three]) { expect(other).not.toHaveProperty('attachments'); expect(other.html).not.toContain('cid:') }
  })
  it('hands the preparer a bounded budget that never exceeds one email limit or the run budget', async () => {
    m.prepare.mockResolvedValue({ models: null, previews: {}, attachments: [] })
    await call()
    const { limits } = m.prepare.mock.calls[0][1]
    expect(limits.budgetMs).toBeLessThanOrEqual(8000); expect(limits.budgetMs).toBeGreaterThan(0)
  })
})
