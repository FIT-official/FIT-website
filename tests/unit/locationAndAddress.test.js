// Location rules: Singapore planning areas + offline postal sector table (approximate), and the
// "address required in exactly two cases" rule: (a) checkout delivery, (b) repair home visit. Optional elsewhere.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { PLANNING_AREAS, POSTAL_SECTOR_AREA, areaFromPostalCode, isPlanningArea, isSgPostalCode } from '@/lib/location/sgAreas'
import { REPAIR_HANDOVERS, validateRepairBrief } from '@/lib/printerRepair/validate'
import { cartNeedsDeliveryAddress, isAddressComplete, missingAddressFields } from '@/lib/checkoutAddressGate'
import { parseBulkInput } from '@/lib/bulkFilament'
import { repairFixture } from '../fixtures/printerRepair'

const state = vi.hoisted(() => ({ userId: 'user_1', doc: null, updates: [] }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.userId })), clerkClient: vi.fn(async () => ({ users: { getUser: vi.fn(async () => ({ firstName: 'Demo', lastName: 'User', primaryEmailAddress: { emailAddress: 'demo@example.invalid' } })) } })) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn(async () => {}) }))
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn(() => ({ lean: async () => state.doc })), updateOne: vi.fn(async (f, u, o) => { state.updates.push({ f, u, o }); return {} }) } }))
beforeEach(() => { state.userId = 'user_1'; state.doc = null; state.updates = [] })

describe('Singapore areas and postal sectors', () => {
  it('lists the 55 URA planning areas once each', () => { expect(PLANNING_AREAS).toHaveLength(55); expect(new Set(PLANNING_AREAS).size).toBe(55) })
  it('every postal sector maps to a planning area', () => { for (const area of Object.values(POSTAL_SECTOR_AREA)) expect(isPlanningArea(area)).toBe(true) })
  it('fills the area from a postal code (approximate)', () => {
    expect(areaFromPostalCode('560123')).toBe('Ang Mo Kio'); expect(areaFromPostalCode('52 0123')).toBe('Tampines'); expect(areaFromPostalCode('120456')).toBe('Clementi')
    expect(areaFromPostalCode('12345')).toBe(''); expect(isSgPostalCode('999999')).toBe(false)
  })
})

describe('repair requests: address required only for a home visit (client and server share validateRepairBrief)', () => {
  const brief = patch => ({ ...repairFixture.brief, ...patch })
  it('offers drop-off, home visit and discuss with FIT', () => expect(REPAIR_HANDOVERS.map(([k]) => k)).toEqual(['drop_off', 'home_visit', 'discuss_with_fit']))
  it('home visit without street and postal code is rejected', () => {
    const r = validateRepairBrief(brief({ handover: 'home_visit' }))
    expect(r.ok).toBe(false); expect(r.errors.street).toBeTruthy(); expect(r.errors.postalCode).toBeTruthy()
    expect(validateRepairBrief(brief({ handover: 'home_visit', street: '10 Example Road', postalCode: '12' })).ok).toBe(false)
  })
  it('home visit with street and a Singapore postal code is accepted', () => expect(validateRepairBrief(brief({ handover: 'home_visit', street: '10 Example Road', unitNumber: '#05-12', postalCode: '560123', area: 'Ang Mo Kio' })).ok).toBe(true))
  it.each(['drop_off', 'discuss_with_fit'])('%s accepts no area and no address', handover => expect(validateRepairBrief(brief({ handover, area: '', street: '', unitNumber: '', postalCode: '' })).ok).toBe(true))
  it('older saved requests without location fields still validate', () => { const { area, street, unitNumber, postalCode, ...old } = repairFixture.brief; expect(validateRepairBrief(old).ok).toBe(true) })
  it('area must come from the list', () => expect(validateRepairBrief(brief({ area: 'Atlantis' })).ok).toBe(false))
})

describe('checkout: a delivery address is required (server gate shared by breakdown and session routes)', () => {
  it('a shipped line needs a complete address; an empty one is missing fields', () => {
    expect(cartNeedsDeliveryAddress([{ chosenDeliveryType: 'standard' }])).toBe(true)
    expect(isAddressComplete({})).toBe(false)
    expect(missingAddressFields({})).toEqual(['street', 'city', 'postalCode', 'country'])
  })
  it('digital-only carts need no address', () => expect(cartNeedsDeliveryAddress([{ chosenDeliveryType: 'digital' }])).toBe(false))
  it('the checkout session and breakdown routes use the gate', () => {
    for (const p of ['app/api/checkout/session/route.js', 'app/api/checkout/breakdown/route.js']) expect(readFileSync(p, 'utf8')).toMatch(/checkoutAddressGate/)
  })
})

describe('other flows accept no address', () => {
  const bulk = extra => ({ clientRequestId: '4f1c2b3a-1d2e-4f3a-8b9c-0123456789ab', confirmReview: true, consent: true, fulfilment: 'collection', address: '', notes: '',
    customer: { name: 'Demo', email: 'demo@example.invalid', phone: '', organisation: '', ...extra },
    lines: [{ productId: '0123456789abcdef01234567', version: 'a'.repeat(64), options: [{ typeId: '0123456789abcdef01234568', optionId: '0123456789abcdef01234569' }], quantity: 1, remarks: '' }] })
  it('bulk filament enquiry: no area, no address (collection)', () => expect(parseBulkInput(bulk()).customer.area).toBe(''))
  it('bulk filament enquiry: optional area from the list', () => {
    expect(parseBulkInput(bulk({ area: 'Bedok' })).customer.area).toBe('Bedok')
    expect(() => parseBulkInput(bulk({ area: 'Atlantis' }))).toThrow()
  })
  it('account area is optional: blank clears it, unknown is rejected, signed-out is 401', async () => {
    const { POST, GET } = await import('@/app/api/user/profile/route')
    const post = body => POST(new Request('http://t', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
    expect((await post({ area: '' })).status).toBe(200)
    expect(state.updates.at(-1).u).toEqual({ $unset: { 'profile.area': '' } })
    expect((await post({ area: 'Atlantis' })).status).toBe(400)
    expect((await post({ area: 'Bedok' })).status).toBe(200)
    expect(state.updates.at(-1).u).toEqual({ $set: { 'profile.area': 'Bedok' } })
    state.doc = { profile: { area: 'Bedok' } }
    expect((await (await GET()).json()).profile).toMatchObject({ name: 'Demo User', email: 'demo@example.invalid', area: 'Bedok', address: null })
    state.userId = null
    expect((await GET()).status).toBe(401); expect((await post({ area: 'Bedok' })).status).toBe(401)
  })
})

describe('privacy and visibility', () => {
  it('privacy page says how area and address are used', () => expect(readFileSync('app/privacy/PrivacyPage.jsx', 'utf8')).toContain('We use your area and address to process orders and assess repair service coverage.'))
  it('area is stored in the Mongo profile, not Clerk publicMetadata', () => {
    expect(readFileSync('models/User.js', 'utf8')).toMatch(/profile: \{ type: new mongoose\.Schema\(\{ area:/)
    for (const p of ['app/api/user/profile/route.js', 'app/api/user/contact/address/route.js']) expect(readFileSync(p, 'utf8')).not.toMatch(/publicMetadata[^\n]*area/)
  })
})