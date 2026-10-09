// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLOURS } from '@/lib/makerTools/colours'
const state = vi.hoisted(() => ({ userId: 'alice', records: new Map(), connect: vi.fn(), writes: vi.fn(), reads: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: state.userId }) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: state.connect }))
import { GET, PUT } from '@/app/api/maker-tools/inventory/route'
const ref = COLOURS[0]
const body = (label = 'Private white', revision = 0) => ({ revision, spools: [{ id: 's1', label, brand: ref.brand, material: ref.material, hex: ref.hex, referenceId: ref.id, remainingGrams: 10, diameter: 1.75, format: 'spool' }] })
const request = (data, origin = 'https://fit.test') => new Request('https://fit.test/api/maker-tools/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) })
beforeEach(() => {
  state.userId = 'alice'; state.records.clear(); vi.clearAllMocks()
  state.reads.mockImplementation(async filter => structuredClone(state.records.get(filter._id) || null))
  state.writes.mockImplementation(async (filter, update, options) => {
    const current = state.records.get(filter._id)
    if (current && current.revision !== filter.revision) { if (options.upsert) throw Object.assign(Error('duplicate _id'), { code: 11000 }); return null }
    if (!current && !options.upsert) return null
    const next = { _id: filter._id, ...update.$set, revision: (current?.revision || 0) + update.$inc.revision }
    state.records.set(filter._id, next); return structuredClone(next)
  })
  state.connect.mockResolvedValue({ connection: { db: { collection: name => { expect(name).toBe('makerInventories'); return { findOne: state.reads, findOneAndUpdate: state.writes } } } } })
})
describe('private inventory route', () => {
  it('rejects anonymous reads and writes before connecting', async () => {
    state.userId = null
    expect((await GET(new Request('https://fit.test/api/maker-tools/inventory'))).status).toBe(401)
    expect((await PUT(request(body()))).status).toBe(401)
    expect(state.connect).not.toHaveBeenCalled()
  })
  it('reads and overwrites only the session owner, ignoring query impersonation', async () => {
    expect((await PUT(request(body('Alice secret')))).status).toBe(200)
    state.userId = 'bob'
    let result = await GET(new Request('https://fit.test/api/maker-tools/inventory?userId=alice'))
    expect(await result.json()).toEqual({ revision: 0, spools: [] })
    expect((await PUT(request(body('Bob secret')))).status).toBe(200)
    state.userId = 'alice'
    result = await GET(new Request('https://fit.test/api/maker-tools/inventory?owner=bob'))
    const data = await result.json(); expect(data.spools[0].label).toBe('Alice secret')
    expect(data).not.toHaveProperty('_id'); expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(result.headers.get('vary')).toContain('Cookie')
  })
  it('rejects ownership injection and unknown fields', async () => {
    expect((await PUT(request({ ...body(), userId: 'bob' }))).status).toBe(400)
    expect(state.connect).not.toHaveBeenCalled()
  })
  it.each(['https://attacker.test', 'null', ''])('rejects missing/foreign Origin %s', async origin => {
    expect((await PUT(request(body(), origin))).status).toBe(403); expect(state.connect).not.toHaveBeenCalled()
  })
  it('prevents lost updates from stale and concurrent tabs', async () => {
    // Load Vitest's asynchronous db mock before simultaneous route imports.
    await GET(new Request('https://fit.test/api/maker-tools/inventory'))
    const results = await Promise.all([PUT(request(body('First'))), PUT(request(body('Second')))])
    expect(results.map(r => r.status).sort(), JSON.stringify(await Promise.all(results.map(r => r.clone().json()))) + ' writes=' + state.writes.mock.calls.length).toEqual([200, 409])
    expect((await PUT(request(body('Saved edit', 1)))).status).toBe(200)
    expect((await PUT(request(body('Stale edit', 1)))).status).toBe(409)
    expect(state.records.get('alice').spools[0].label).toBe('Saved edit')
  })
  it('supports saving zero remaining grams and clearing all entries', async () => {
    const b = body(); b.spools[0].remainingGrams = 0
    expect((await PUT(request(b))).status).toBe(200)
    expect((await PUT(request({ revision: 1, spools: [] }))).status).toBe(200)
    expect(state.records.get('alice').spools).toEqual([])
  })
  it('bounds streamed JSON and rejects malformed content before persistence', async () => {
    expect((await PUT(request({ revision: 0, spools: [], padding: 'x'.repeat(65536) }))).status).toBe(413)
    const invalid = new Request('https://fit.test/api/maker-tools/inventory', { method: 'PUT', headers: { Origin: 'https://fit.test', 'Content-Type': 'application/json' }, body: '{' })
    expect((await PUT(invalid)).status).toBe(400); expect(state.writes).not.toHaveBeenCalled()
  })
  it('fails closed with generic errors and no leaked infrastructure details', async () => {
    state.connect.mockRejectedValue(Error('mongodb://private-credential'))
    const result = await GET(new Request('https://fit.test/api/maker-tools/inventory'))
    expect(result.status).toBe(503); expect(JSON.stringify(await result.json())).not.toContain('credential')
  })
})
