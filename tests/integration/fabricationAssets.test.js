// @vitest-environment node
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ actor: 'customer', asset: null, recent: 0, participating: false, published: false, plan: 'pro', publicAccessBlocked: true }))
const mocks = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn(), create: vi.fn(), exists: vi.fn(), serviceFind: vi.fn(), offerExists: vi.fn(), assetFind: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: state.actor })) }))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/fabrication/serverRateLimit', () => ({ enforceFabricationRate: vi.fn() }))
vi.mock('@/lib/creatorEntitlements', () => ({ getCreatorEntitlements: vi.fn(async () => ({ planId: state.plan, status: 'active' })) }))
vi.mock('@/models/FabricationAsset', () => ({ default: { findOne: mocks.assetFind, create: mocks.create, countDocuments: vi.fn(async () => state.recent) } }))
vi.mock('@/models/FabricationRequest', () => ({ default: { exists: mocks.exists } }))
vi.mock('@/models/CreatorFabricationService', () => ({ default: { findOne: mocks.serviceFind } }))
vi.mock('@/models/CreatorFabricationOffer', () => ({ default: { exists: mocks.offerExists } }))
vi.mock('@/lib/fabrication/serverAssetQuota', async () => {
  const { FabricationError } = await import('@/lib/fabrication/serverHttp')
  return { reserveDailyFabricationAsset: vi.fn(async () => {
    if (state.recent >= 50) throw new FabricationError('Daily attachment limit reached.', 429)
    return { release: vi.fn() }
  }) }
})
vi.mock('@/lib/s3', () => ({ s3: { send: mocks.send } }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.sign }))
import { POST, GET } from '@/app/api/fabrication/assets/route'

function upload(bytes, filename, type = 'application/octet-stream') {
  const form = new FormData()
  form.set('file', new File([bytes], filename, { type }))
  return new Request('https://fit.example.org/api/fabrication/assets', { method: 'POST', body: form })
}
const read = () => GET(new Request('https://fit.example.org/api/fabrication/assets?assetId=asset-1'))
const validImage = () => sharp({ create: { width: 32, height: 24, channels: 3, background: '#f34f20' } }).png().withMetadata().toBuffer()
let bucketNumber = 0
beforeEach(() => {
  vi.clearAllMocks()
  process.env.FABRICATION_S3_BUCKET_NAME = `private-test-${++bucketNumber}`
  Object.assign(state, { actor: 'customer', asset: null, recent: 0, participating: false, published: false, plan: 'pro', publicAccessBlocked: true })
  mocks.send.mockImplementation(async command => command.constructor.name === 'GetPublicAccessBlockCommand' ? {
    PublicAccessBlockConfiguration: { BlockPublicAcls: state.publicAccessBlocked, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
  } : {})
  mocks.sign.mockImplementation(async (_client, command) => `https://private.example.org/${command.input.Key}?signature=test`)
  mocks.create.mockImplementation(async value => { state.asset = value; return value })
  mocks.assetFind.mockImplementation(() => ({ lean: async () => state.asset }))
  mocks.exists.mockImplementation(async () => state.participating)
  mocks.serviceFind.mockImplementation(() => ({ lean: async () => state.published ? { creatorUserId: 'provider', enabled: true } : null }))
  mocks.offerExists.mockImplementation(async () => state.published)
})

describe('fabrication attachment upload', () => {
  it('requires authentication before decoding or storage', async () => {
    state.actor = null
    expect((await POST(upload('bad', 'a.png'))).status).toBe(401)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('decodes, strips metadata, scopes private image keys and signs the normalized result', async () => {
    const response = await POST(upload(await validImage(), 'my-image.png', 'image/png'))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ kind: 'image', width: 32, height: 24, originalName: 'my-image.png' })
    expect(state.asset.key).toMatch(/^fabrication\/customer\/[a-f0-9-]+\.webp$/)
    const put = mocks.send.mock.calls.find(([command]) => command.constructor.name === 'PutObjectCommand')[0].input
    const metadata = await sharp(put.Body).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(put.ACL).toBeUndefined()
    expect(put.CacheControl).toBe('private, no-store')
    expect(mocks.sign.mock.calls[0][2].expiresIn).toBe(300)
  })
  it('refuses storage without a dedicated verified-private bucket', async () => {
    state.publicAccessBlocked = false
    expect((await POST(upload(await validImage(), 'a.png'))).status).toBe(503)
    expect(mocks.send.mock.calls.some(([command]) => command.constructor.name === 'PutObjectCommand')).toBe(false)
    delete process.env.FABRICATION_S3_BUCKET_NAME
    expect((await POST(upload(await validImage(), 'a.png'))).status).toBe(503)
  })
  it('rejects image spoofing, SVG/HTML, oversize files and oversized dimensions', async () => {
    for (const [bytes, name] of [['<svg><script>bad()</script></svg>', 'a.png'], ['<html>bad</html>', 'a.svg'], ['hello', 'a.webp']]) {
      expect((await POST(upload(bytes, name))).status).toBe(400)
    }
    expect((await POST(upload(Buffer.alloc(3 * 1024 * 1024 + 1), 'a.png'))).status).toBe(413)
    const tooWide = await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'white' } }).png().toBuffer()
    expect((await POST(upload(tooWide, 'a.png'))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('keeps PDFs and model references private and forces attachment downloads', async () => {
    const pdf = Buffer.from('%PDF-1.7\nReference drawing\n%%EOF')
    let response = await POST(upload(pdf, 'drawing.pdf', 'application/pdf'))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ kind: 'reference', originalName: 'drawing.pdf' })
    expect(mocks.sign.mock.calls[0][1].input).toMatchObject({ ResponseContentType: 'application/octet-stream', ResponseContentDisposition: 'attachment; filename="drawing.pdf"' })
    const obj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
    response = await POST(upload(obj, 'part.obj'))
    expect(response.status).toBe(201)
    expect((await response.json()).kind).toBe('reference')
    expect((await POST(upload('<html>login</html>', 'part.stl'))).status).toBe(400)
    expect((await POST(upload('%PDF-1.7 no end', 'incomplete.pdf'))).status).toBe(400)
  })
  it('limits authenticated attachment storage attempts', async () => {
    state.recent = 50
    expect((await POST(upload(await validImage(), 'a.png'))).status).toBe(429)
    expect(mocks.send.mock.calls.some(([command]) => command.constructor.name === 'PutObjectCommand')).toBe(false)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('enforces actual multipart bytes even without content-length', async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024)); controller.close() } })
    const request = new Request('https://fit.example.org/api/fabrication/assets', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body, duplex: 'half' })
    expect((await POST(request)).status).toBe(413)
    expect(mocks.send).not.toHaveBeenCalled()
  })
})

describe('fabrication attachment read authorization', () => {
  const attached = () => ({ assetId: 'asset-1', ownerUserId: 'provider', kind: 'image', bucket: process.env.FABRICATION_S3_BUCKET_NAME,
    key: 'fabrication/provider/image.webp', originalName: 'template.png', width: 32, height: 24 })
  it('denies an unrelated customer and anonymous access to unpublished images', async () => {
    state.asset = attached()
    expect((await read()).status).toBe(404)
    state.actor = null
    expect((await read()).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('allows the owner and participating request users after subscription downgrade', async () => {
    state.asset = attached(); state.plan = 'free'; state.actor = 'provider'
    expect((await read()).status).toBe(200)
    state.actor = 'customer'; state.participating = true
    expect((await read()).status).toBe(200)
    expect(mocks.exists).toHaveBeenLastCalledWith({ $and: [
      { $or: [{ customerUserId: 'customer' }, { creatorUserId: 'customer' }] },
      { $or: [{ imageAssetId: 'asset-1' }, { referenceAssetId: 'asset-1' }] },
    ] })
  })
  it('exposes only published enabled templates of currently verified Pro creators', async () => {
    state.asset = attached(); state.actor = null; state.published = true
    expect((await read()).status).toBe(200)
    expect(mocks.offerExists).toHaveBeenLastCalledWith({ creatorUserId: 'provider', enabled: true, 'offer.template.assetId': 'asset-1' })
    state.plan = 'standard'
    expect((await read()).status).toBe(404)
    state.plan = 'pro'; state.asset.kind = 'reference'
    expect((await read()).status).toBe(404)
  })
  it('does not expose a removed legacy template once offers use the separate collection', async () => {
    state.asset = attached(); state.actor = null
    mocks.serviceFind.mockImplementation(() => ({ lean: async () => ({ creatorUserId: 'provider', catalog: {
      enabled: true, offers: [{ enabled: true, template: { assetId: 'asset-1' } }],
    } }) }))
    mocks.offerExists.mockImplementation(async query => !query['offer.template.assetId'])
    expect((await read()).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})
