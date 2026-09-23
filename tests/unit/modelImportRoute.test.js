// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ importModel: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/modelImport', () => ({ importPublicModel: mocks.importModel }))
vi.mock('@/lib/modelImport/rateLimit', () => ({ limitModelImport: mocks.limit }))
import { POST } from '@/app/api/models/import/route'
import { importError } from '@/lib/modelImport/errors'
const url = 'https://www.printables.com/model/123-bracket'
const request = (value = { url }) => new Request('https://fixitoday.com/api/models/import', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.limit.mockResolvedValue({ allowed: true, headers: {} })
})

describe('anonymous model import endpoint', () => {
  it('returns actual binary bytes and safe source headers without requiring sign-in', async () => {
    const body = Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')
    mocks.importModel.mockResolvedValue({ status: 'imported', source: { url, attribution: 'Alex — Bracket' }, file: { body, format: 'obj', name: 'bracket.obj', contentType: 'text/plain' } })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).equals(body)).toBe(true)
    expect(decodeURIComponent(response.headers.get('X-Model-Source-Url'))).toBe(url)
    expect(decodeURIComponent(response.headers.get('X-Model-Attribution'))).toBe('Alex — Bracket')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.importModel).toHaveBeenCalledWith({ url, selectionUrl: undefined })
  })
  it('returns selectable files as JSON', async () => {
    const choices = { status: 'select_file', source: { url }, files: [{ url: 'https://files.example.org/a.stl', name: 'a.stl', format: 'stl' }] }
    mocks.importModel.mockResolvedValue(choices)
    const response = await POST(request())
    expect(await response.json()).toEqual(choices)
  })
  it('keeps the known source URL when the source requires manual upload', async () => {
    mocks.importModel.mockRejectedValue(importError('source_restricted', 'The source requires browser verification.'))
    const response = await POST(request())
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ status: 'upload_required', code: 'source_restricted', source: { url, provider: 'Printables' } })
  })
  it('stops before fetching when limits deny requests or production enforcement is unavailable', async () => {
    mocks.limit.mockResolvedValueOnce({ allowed: false, headers: { 'Retry-After': '60' } })
    expect((await POST(request())).status).toBe(429)
    mocks.limit.mockRejectedValueOnce(importError('import_unavailable', 'Unavailable.', 503))
    expect((await POST(request())).status).toBe(503)
    expect(mocks.importModel).not.toHaveBeenCalled()
  })
  it('rejects oversized actual bodies without trusting content-length', async () => {
    const response = await POST(request({ url: 'https://example.org/' + 'x'.repeat(9000) }))
    expect(response.status).toBe(400)
    expect(mocks.importModel).not.toHaveBeenCalled()
  })
  it('does not leak internal error details', async () => {
    mocks.importModel.mockRejectedValue(new Error('internal token value'))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('internal token')
  })
})
