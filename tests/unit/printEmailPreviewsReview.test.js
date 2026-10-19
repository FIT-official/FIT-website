// @vitest-environment node
// Follow-up coverage from the independent review: per-file recorded prices, preview-to-model binding, abortable bounded reads, zero-normal geometry and unchanged shared renderer defaults.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { Readable } from 'node:stream'
const m = vi.hoisted(() => ({ send: vi.fn(), privateBucket: vi.fn() }))
vi.mock('@/lib/s3', () => ({ s3: { send: m.send } }))
vi.mock('@/lib/fabrication/serverAssets', () => ({ privateFabricationBucket: m.privateBucket }))
import { buildIdleNudgeEmail } from '@/lib/email/templates/customPrint'
import { prepareNudgePreviews, loadModelBytes, renderModelPng, PREVIEW_LIMITS } from '@/lib/email/printPreviews'
import { drawModel, parseForPreview } from '@/lib/email/printPreviewRender'
import { assetsFor, byteSource, guidedRequest, legacyRequest, OWNER } from '../helpers/emailFixtures'
import { boxStl } from '../helpers/modelFixtures'

const prepare = (request, { assets = assetsFor(), source = byteSource(), ...rest } = {}) => prepareNudgePreviews(request, { loadAssets: async () => assets, loadBytes: source.loadBytes, ...rest })
const cards = html => html.split('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;').slice(1)
afterEach(() => { vi.restoreAllMocks(); m.send.mockReset(); m.privateBucket.mockReset() })
const payment = lineItems => ({ state: 'payment_required', amountCents: lineItems.reduce((n, l) => n + l.unitCents * l.quantity, 0), currency: 'sgd', lineItems })

describe('recorded per-file prices (schema-shaped payment snapshot, matched by asset id)', () => {
  it('two lines with distinct unit prices and quantities stay on their own files, with no payment state in what the email receives', async () => {
    const request = guidedRequest({ guidedPayment: payment([{ assetId: 'asset-cyl', unitCents: 1375, quantity: 3 }, { assetId: 'asset-box', unitCents: 2050, quantity: 2 }]), guidedAssets: [{ assetId: 'asset-box', quantity: 2 }, { assetId: 'asset-cyl', quantity: 3 }] })
    const prepared = await prepare(request)
    const html = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews }).html
    const [first, second] = cards(html)
    expect(first).toContain('box-part.stl'); expect(first).toContain('SGD 20.50 each × 2 = SGD 41.00')
    expect(second).toContain('round-part.stl'); expect(second).toContain('SGD 13.75 each × 3 = SGD 41.25')
    expect(JSON.stringify(prepared.models)).not.toMatch(/payment_required|paymentState|ownerUserId|synthetic/)
  })
  it('flags a recorded quantity that no longer matches the request, an ambiguous (duplicate) line, and a file with no line', async () => {
    const request = guidedRequest({ guidedPayment: payment([{ assetId: 'asset-box', unitCents: 2000, quantity: 4 }, { assetId: 'asset-cyl', unitCents: 100, quantity: 1 }, { assetId: 'asset-cyl', unitCents: 200, quantity: 1 }]) })
    const [box, cyl] = cards(buildIdleNudgeEmail({ request, ...(await (async () => { const p = await prepare(request); return { models: p.models, previews: p.previews } })()) }).html)
    expect(box).toContain('SGD 20.00 each × 4 = SGD 80.00 (priced for 4; your request now lists 2)')
    expect(cyl).toContain('Price not available for this file')
    const none = guidedRequest({ guidedPayment: payment([{ assetId: 'asset-box', unitCents: 2000, quantity: 2 }]) })
    const p2 = await prepare(none)
    const [, noLine] = cards(buildIdleNudgeEmail({ request: none, models: p2.models, previews: p2.previews }).html)
    expect(noLine).toMatch(/Price<\/td>\s*<td[^>]*>Not quoted yet/); expect(noLine).not.toMatch(/\b0\.00/)
  })
})

describe('a preview is bound to its model, request and customer', () => {
  it('a preview swapped between two models of the same order and owner is refused', async () => {
    const request = guidedRequest()
    const p = await prepare(request)
    const swapped = { 'asset-box': p.previews['asset-cyl'], 'asset-cyl': p.previews['asset-box'] }
    const html = buildIdleNudgeEmail({ request, models: p.models, previews: swapped }).html
    expect(html).not.toContain('<img src="cid:'); expect((html.match(/Model preview unavailable/g) || []).length).toBe(2)
    expect(buildIdleNudgeEmail({ request, models: p.models, previews: p.previews }).html).toContain('<img src="cid:')
  })
})

describe('bounded, abortable reads and time budget', () => {
  it('the asset lookup counts against the budget, and a stalled read is signalled to stop (no work continues after the fallback)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = await prepareNudgePreviews(legacyRequest(), { loadAssets: () => new Promise(() => {}), loadBytes: async () => Buffer.alloc(1), limits: { ...PREVIEW_LIMITS, budgetMs: 30 } })
    expect(a).toEqual({ models: null, previews: {}, attachments: [] })
    let seen
    const b = await prepareNudgePreviews(legacyRequest(), { loadAssets: async () => ({}), loadBytes: (_s, { signal }) => { seen = signal; return new Promise(() => {}) }, limits: { ...PREVIEW_LIMITS, budgetMs: 30 } })
    expect(b.previews.legacy.reason).toBe('timeout'); expect(seen.aborted).toBe(true)
  })
  it('starts no further read or render once the budget is spent, and stops at the total byte cap', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const source = byteSource()
    const request = guidedRequest()
    const out = await prepare(request, { source, limits: { ...PREVIEW_LIMITS, maxTotalBytes: 684 } })
    expect(source.calls.length).toBe(1)
    expect(out.previews['asset-cyl'].reason).toBe('too_large')
    let t = 0
    const late = await prepare(request, { source: byteSource(), now: () => (t += 5000), limits: { ...PREVIEW_LIMITS, budgetMs: 8000 } })
    expect(late.attachments.length).toBeLessThan(2)
  })
  it('loadModelBytes passes an abort signal to the storage read, destroys the body on abort and on oversize, and keeps the private-bucket check for guided files', async () => {
    const guided = { kind: 'guided', bucket: 'synthetic-private', key: 'k.stl' }
    m.privateBucket.mockResolvedValue('synthetic-private')
    const body = Readable.from([Buffer.alloc(10), Buffer.alloc(10)])
    m.send.mockResolvedValue({ Body: body, ContentLength: 20 })
    const ctl = new AbortController()
    const bytes = await loadModelBytes(guided, { maxBytes: 100, signal: ctl.signal })
    expect(bytes.length).toBe(20); expect(m.privateBucket).toHaveBeenCalledWith('synthetic-private')
    expect(m.send.mock.calls[0][1]).toEqual({ abortSignal: ctl.signal })
    const big = Readable.from([Buffer.alloc(60), Buffer.alloc(60)])
    m.send.mockResolvedValue({ Body: big })
    await expect(loadModelBytes({ kind: 'upload', bucket: 'b', key: 'k' }, { maxBytes: 100 })).rejects.toMatchObject({ kind: 'too_large' })
    expect(big.destroyed).toBe(true); expect(m.privateBucket).toHaveBeenCalledTimes(1)
    const pending = new Readable({ read() {} })
    m.send.mockResolvedValue({ Body: pending, ContentLength: 5 })
    const c2 = new AbortController(); const run = loadModelBytes({ kind: 'upload', bucket: 'b', key: 'k' }, { maxBytes: 100, signal: c2.signal })
    setTimeout(() => c2.abort(), 10)
    await expect(run).rejects.toBeTruthy(); expect(pending.destroyed).toBe(true)
  })
})

describe('geometry and the shared renderer', () => {
  const ascii = `solid z\n${[[[0, 0, 0], [10, 0, 0], [0, 10, 0]], [[0, 0, 0], [0, 0, 10], [10, 0, 0]], [[0, 0, 0], [0, 10, 0], [0, 0, 10]], [[10, 0, 0], [0, 0, 10], [0, 10, 0]]].map(t => `facet normal 0 0 0\n outer loop\n${t.map(v => `  vertex ${v.join(' ')}`).join('\n')}\n endloop\nendfacet`).join('\n')}\nendsolid z\n`
  it('a zero-normal STL (binary and ASCII) parses to real triangles and draws a non-blank picture', async () => {
    const binary = boxStl(20)
    expect([...binary.subarray(84, 96)].every(v => v === 0)).toBe(true)   // the fixture really carries zero normals
    for (const [name, bytes] of [['zero.stl', Buffer.from(binary)], ['ascii.stl', Buffer.from(ascii)]]) {
      const out = await renderModelPng(bytes, name)
      expect(out.triangles).toBeGreaterThanOrEqual(4)
      const sharp = (await import('sharp')).default
      const { data } = await sharp(out.png).raw().toBuffer({ resolveWithObject: true })
      let dark = 0; for (let i = 0; i < data.length; i += 3) if (data[i] < 200) dark++
      expect(dark).toBeGreaterThan(1500)
    }
  })
  it('drawModel keeps its defaults for the order model viewer (no options: every triangle up to 30000) and only samples when asked', async () => {
    const calls = { fills: 0 }
    const ctx = { save() {}, restore() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() { calls.fills++ }, stroke() {} }
    const positions = await parseForPreview(Buffer.from(boxStl(20)), 'a.stl')
    expect(drawModel(ctx, positions, 200, 200)).toMatchObject({ triangles: 12, drawn: 12 })
    expect(calls.fills).toBe(12)
    expect(drawModel(ctx, positions, 200, 200, { maxTriangles: 4 })).toMatchObject({ triangles: 12, drawn: 4 })
  })
})
