// Creator access to buyer location data, enforced server-side in GET /api/user/print-jobs.
// A creator sees the buyer's shipping address ONLY for a job routed to them AND in a fulfilment state
// (paid -> printing -> printed -> shipped). Before that, after delivery, and for other creators' jobs: nothing.
// The buyer's area (account profile) is never shared with creators.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CREATOR_FULFILMENT_STATUSES, creatorMayShip, creatorShippingFields } from '@/lib/privacy/creatorShipping'

const state = vi.hoisted(() => ({ userId: 'user_creator', jobs: [], buyers: [], userFind: null, saved: [] }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }))
vi.mock('@/lib/requireCreator', () => ({ requireCreator: vi.fn(async () => true) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/creatorPrint', () => ({ notifyCustomerCreatorQuote: vi.fn(async () => {}) }))
vi.mock('@/models/User', () => ({
  default: { find: vi.fn((filter, projection) => { state.userFind = { filter, projection }; return { lean: async () => state.buyers.filter(b => filter.userId.$in.includes(b.userId)) } }) },
}))
const makeDoc = raw => { const doc = { ...raw, statusHistory: [...(raw.statusHistory || [])] }; doc.save = vi.fn(async () => { state.saved.push({ ...doc }) }); doc.toObject = () => { const { save, toObject, ...rest } = doc; return rest }; return doc }
vi.mock('@/models/CustomPrintRequest', () => ({
  default: {
    find: vi.fn(filter => ({ sort: () => ({ lean: async () => state.jobs.filter(j => j.creatorUserId === filter.creatorUserId).map(j => ({ ...j })) }) })),
    findOne: vi.fn(async filter => { const hit = state.jobs.find(j => j.requestId === filter.requestId && j.creatorUserId === filter.creatorUserId); return hit ? makeDoc(hit) : null }),
  },
}))

const ADDRESS = { street: '10 Example Road', unitNumber: '#05-12', city: 'Singapore', state: '', postalCode: '560123', country: 'Singapore' }
const BUYER = { userId: 'user_buyer', contact: { address: ADDRESS, phone: { countryCode: '+65', number: '91234567' } }, profile: { area: 'Ang Mo Kio' } }
const list = async () => { const { GET } = await import('@/app/api/user/print-jobs/route'); const res = await GET(); expect(res.status).toBe(200); return (await res.json()).jobs }
const patch = async (requestId, body) => { const { PATCH } = await import('@/app/api/user/print-jobs/[requestId]/route'); return PATCH(new Request('http://t', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ requestId }) }) }

beforeEach(() => {
  vi.clearAllMocks()
  state.userId = 'user_creator'; state.userFind = null; state.saved = []; state.buyers = [BUYER]
  state.jobs = [
    { requestId: 'req-quoted', creatorUserId: 'user_creator', userId: 'user_buyer', userName: 'Buyer One', status: 'quoted', printFee: 20, currency: 'sgd', statusHistory: [] },
    { requestId: 'req-paid', creatorUserId: 'user_creator', userId: 'user_buyer', userName: 'Buyer One', status: 'paid', statusHistory: [] },
    { requestId: 'req-delivered', creatorUserId: 'user_creator', userId: 'user_buyer', userName: 'Buyer One', status: 'delivered', statusHistory: [] },
    { requestId: 'req-other', creatorUserId: 'user_other_creator', userId: 'user_buyer', userName: 'Buyer One', status: 'paid', statusHistory: [] },
  ]
})

describe('creator shipping helper', () => {
  it('fulfilment states are paid, printing, printed, shipped', () => expect(CREATOR_FULFILMENT_STATUSES).toEqual(['paid', 'printing', 'printed', 'shipped']))
  it.each(['pending_upload', 'pending_config', 'configured', 'quoted', 'payment_pending', 'delivered', 'cancelled'])('no shipping before/after fulfilment (%s)', status =>
    expect(creatorShippingFields({ creatorUserId: 'c', status }, 'c', BUYER)).toBeNull())
  it.each(CREATOR_FULFILMENT_STATUSES)('own job in %s: shipping fields only, never area', status => {
    const out = creatorShippingFields({ creatorUserId: 'c', status, userName: 'Buyer One' }, 'c', BUYER)
    expect(out).toEqual({ name: 'Buyer One', phone: '+65 91234567', address: ADDRESS })
    expect(JSON.stringify(out)).not.toContain('Ang Mo Kio')
  })
  it("another creator's job in a fulfilment state: nothing", () => {
    expect(creatorMayShip({ creatorUserId: 'a', status: 'paid' }, 'b')).toBe(false)
    expect(creatorShippingFields({ creatorUserId: 'a', status: 'paid' }, 'b', BUYER)).toBeNull()
  })
})

describe('GET /api/user/print-jobs: server-side creator restriction', () => {
  it('returns the shipping address only on my job in a fulfilment state, and never the area', async () => {
    const jobs = await list()
    const byId = Object.fromEntries(jobs.map(j => [j.requestId, j]))
    expect(Object.keys(byId)).toEqual(['req-quoted', 'req-paid', 'req-delivered'])
    expect(byId['req-paid'].shipping).toEqual({ name: 'Buyer One', phone: '+65 91234567', address: ADDRESS })
    expect(byId['req-quoted']).not.toHaveProperty('shipping')
    expect(byId['req-delivered']).not.toHaveProperty('shipping')
    expect(JSON.stringify(jobs)).not.toContain('Ang Mo Kio')
    expect(jobs.every(j => !('creatorUserId' in j))).toBe(true)
    expect(state.userFind.projection).not.toHaveProperty('profile')
  })
  it("another creator sees none of this buyer's details for jobs that are not theirs", async () => {
    state.userId = 'user_other_creator'
    state.jobs = state.jobs.map(j => (j.requestId === 'req-other' ? { ...j, status: 'configured' } : j))
    const jobs = await list()
    expect(jobs.map(j => j.requestId)).toEqual(['req-other'])
    expect(JSON.stringify(jobs)).not.toContain('Example Road')
    expect(state.userFind).toBeNull()
  })
  it('status transition: quoted shows nothing; after the creator accepts (quoted -> paid) the address appears', async () => {
    expect((await list()).find(j => j.requestId === 'req-quoted')).not.toHaveProperty('shipping')
    const res = await patch('req-quoted', { action: 'accept' })
    expect(res.status).toBe(200)
    expect(state.saved.at(-1).status).toBe('paid')
    state.jobs = state.jobs.map(j => (j.requestId === 'req-quoted' ? { ...j, status: state.saved.at(-1).status } : j))
    const after = (await list()).find(j => j.requestId === 'req-quoted')
    expect(after.shipping.address).toEqual(ADDRESS)
    expect(JSON.stringify(after)).not.toContain('Ang Mo Kio')
  })
})