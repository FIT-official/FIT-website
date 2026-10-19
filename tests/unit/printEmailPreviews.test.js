// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it, vi, afterEach } from 'vitest'
import sharp from 'sharp'
import nodemailer from 'nodemailer'
import { buildIdleNudgeEmail } from '@/lib/email/templates/customPrint'
import { prepareNudgePreviews, renderModelPng, storageFor, PREVIEW_LIMITS } from '@/lib/email/printPreviews'
import { modelPreviewBlock, usablePreview, PREVIEW_CAPTION, PREVIEW_UNAVAILABLE } from '@/lib/email/modelPreviewBlock'
import { boxStl, byteSource, assetsFor, guidedRequest, legacyRequest, OWNER, OTHER, coneStl } from '../helpers/emailFixtures'
import { boxObj, box3mf, corruptBytes } from '../helpers/modelFixtures'

const sha = buf => createHash('sha256').update(buf).digest('hex')
const cards = html => html.split('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;').slice(1)
const prepare = (request, { assets = assetsFor(), source = byteSource(), ...rest } = {}) => prepareNudgePreviews(request, { loadAssets: async () => assets, loadBytes: source.loadBytes, ...rest })
afterEach(() => vi.restoreAllMocks())

describe('nudge template stays the same', () => {
  it.each([
    ['pending_config', 'Configure my print', 'not configured yet'],
    ['configured', 'Get my quote', "You've configured your print"],
    ['quoted', 'Review &amp; pay', 'Your quote is ready and waiting'],
  ])('%s keeps its exact copy, subject and call to action without previews', (status, cta, line) => {
    const { subject, html } = buildIdleNudgeEmail({ request: { requestId: 'r1', userName: 'Ada', status, modelFile: { originalName: 'm.stl' } } })
    expect(subject).toBe('Your custom print is waiting for you')
    expect(html).toContain('Still interested in your print?')
    expect(html).toContain(cta)
    expect(html).toContain(line.replace("'", "'"))
    expect(html).not.toContain('cid:')
    expect(html).not.toContain(PREVIEW_CAPTION)
  })
  it('a configured email with an empty models list is byte-for-byte the original', () => {
    const request = { requestId: 'r2', userName: 'Ada', status: 'configured', modelFile: { originalName: 'm.stl' } }
    expect(buildIdleNudgeEmail({ request, models: [], previews: {} })).toEqual(buildIdleNudgeEmail({ request }))
    expect(buildIdleNudgeEmail({ request, models: null })).toEqual(buildIdleNudgeEmail({ request }))
  })
})

describe('one model (legacy upload)', () => {
  it('draws the right model from the recorded key, never from modelFile.s3Url, and attaches one inline PNG', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const source = byteSource()
    const request = legacyRequest()
    const prepared = await prepare(request, { source, assets: {} })
    expect(source.calls).toHaveLength(1)
    expect(source.calls[0]).toMatchObject({ kind: 'upload', key: 'synthetic/bracket.stl' })
    expect(JSON.stringify(source.calls)).not.toContain('synthetic.invalid')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(prepared.attachments).toHaveLength(1)
    const [att] = prepared.attachments
    expect(att).toMatchObject({ filename: 'model-preview-1.png', contentType: 'image/png', contentDisposition: 'inline' })
    expect([...att.content.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const meta = await sharp(att.content).metadata()
    expect([meta.width, meta.height]).toEqual([PREVIEW_LIMITS.width, PREVIEW_LIMITS.height])
    const { html, subject } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    expect(subject).toBe('Your custom print is waiting for you')
    expect(html).toContain(`src="cid:${att.cid}"`)
    expect(html).toContain(`width="${meta.width}" height="${meta.height}"`)
    expect(html).toContain(PREVIEW_CAPTION)
    expect(html).toContain('bracket.stl')
    expect(html).toContain('Get my quote')
    expect(html).toContain('Still interested in your print?')
  })
  it('shows the saved facts and "Not provided" / "Not quoted yet" where nothing was saved, and never invents a zero', async () => {
    const request = legacyRequest()
    const prepared = await prepare(request, { assets: {} })
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    const [card] = cards(html)
    expect(card).toMatch(/Quantity<\/td>\s*<td[^>]*>Not provided/)
    expect(card).toMatch(/Material<\/td>\s*<td[^>]*>PETG/)
    expect(card).toMatch(/Colour<\/td>\s*<td[^>]*>Orange/)
    expect(card).toMatch(/Price<\/td>\s*<td[^>]*>Not quoted yet/)
    expect(card).not.toMatch(/0\.00|\bPLA\b/)
  })
  it('shows an instant quote only as the quote for this order', async () => {
    const request = legacyRequest({ status: 'quoted', quoteMode: 'instant', quote: { total: 45.5, currency: 'sgd' } })
    const prepared = await prepare(request, { assets: {} })
    expect(buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews }).html).toContain('SGD 45.50 (quote for this order)')
  })
  it('a product-sourced request without an unsaved configuration does not default a material or colour', async () => {
    const request = legacyRequest({ printConfiguration: { isConfigured: false, printSettings: { filamentType: 'pla', materialType: 'plastic' } } })
    const prepared = await prepare(request, { assets: {} })
    const [card] = cards(buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews }).html)
    expect(card).toMatch(/Material<\/td>\s*<td[^>]*>Not provided/)
    expect(card).toMatch(/Colour<\/td>\s*<td[^>]*>Not provided/)
  })
})

describe('several models', () => {
  const withPrices = () => guidedRequest({
    guidedPayment: { state: 'payment_required', amountCents: 10500, currency: 'sgd', lineItems: [{ assetId: 'asset-box', unitCents: 2000, quantity: 2 }, { assetId: 'asset-cyl', unitCents: 1300, quantity: 5 }] },
  })
  it('gives each model its own picture, quantity and recorded price (matched by asset id)', async () => {
    const request = withPrices()
    const prepared = await prepare(request)
    expect(prepared.attachments).toHaveLength(2)
    expect(new Set(prepared.attachments.map(a => sha(a.content))).size).toBe(2)
    expect(new Set(prepared.attachments.map(a => a.cid)).size).toBe(2)
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    const [first, second] = cards(html)
    expect(first).toContain('box-part.stl'); expect(first).toContain(`cid:${prepared.previews['asset-box'].cid}`)
    expect(second).toContain('round-part.stl'); expect(second).toContain(`cid:${prepared.previews['asset-cyl'].cid}`)
    expect(first).toMatch(/Quantity<\/td>\s*<td[^>]*>2</); expect(second).toMatch(/Quantity<\/td>\s*<td[^>]*>5</)
    expect(first).toContain('SGD 20.00 each × 2 = SGD 40.00'); expect(second).toContain('SGD 13.00 each × 5 = SGD 65.00')
    expect(html).toContain('Your 2 models')
    expect(html).toContain('Material and colour apply to every model in this request.')
    expect(html).toContain('custom print for <b>your 2 models</b>')
  })
  it('never divides an order total across models', async () => {
    const request = guidedRequest()
    const prepared = await prepare(request)
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    expect(cards(html).every(card => /Price<\/td>\s*<td[^>]*>Not split per model/.test(card))).toBe(true)
    expect(html).not.toMatch(/SGD \d/)
  })
  it('two models with different bytes under different asset ids draw different pictures, a swapped asset draws a different picture', async () => {
    const table = { 'synthetic/private/box.stl': () => boxStl(20), 'synthetic/private/cyl.stl': () => coneStl() }
    const a = await prepare(guidedRequest(), { source: byteSource(table) })
    const b = await prepare(guidedRequest({ guidedAssets: [{ assetId: 'asset-cyl', quantity: 5 }, { assetId: 'asset-box', quantity: 2 }] }), { source: byteSource(table) })
    expect(sha(a.attachments[0].content)).toBe(sha(b.attachments[1].content))
    expect(sha(a.attachments[1].content)).toBe(sha(b.attachments[0].content))
    expect(sha(a.attachments[0].content)).not.toBe(sha(a.attachments[1].content))
  })
  it('previews every file of a full six-file batch with six distinct pictures, and lists any extra model without one', async () => {
    const assets = {}, listed = [], table = {}
    for (let i = 1; i <= 7; i++) {
      assets[`a${i}`] = { assetId: `a${i}`, ownerUserId: OWNER, originalName: `part-${i}.stl`, key: `synthetic/private/p${i}.stl`, bucket: 'b' }
      listed.push({ assetId: `a${i}`, quantity: i })
      table[`synthetic/private/p${i}.stl`] = () => boxStl(10 + i * 3, [1, i / 3, 1 / i])
    }
    const request = guidedRequest({ guidedAssets: listed })
    const prepared = await prepare(request, { assets, source: byteSource(table) })
    expect(prepared.attachments).toHaveLength(6)
    expect(new Set(prepared.attachments.map(a => sha(a.content))).size).toBe(6)
    expect(prepared.attachments.reduce((n, a) => n + a.content.length, 0)).toBeLessThan(6 * PREVIEW_LIMITS.maxPngBytes)
    expect(prepared.previews.a7).toEqual({ status: 'unavailable', reason: 'not_included' })
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    expect(html).toContain('part-7.stl'); expect(cards(html)[6]).toContain(PREVIEW_UNAVAILABLE)
    expect((html.match(/<img src="cid:/g) || []).length).toBe(6)
  })
})

describe('files that cannot be previewed never break the email', () => {
  it('missing record, unsupported type, corrupt bytes, fetch error and an oversized file are each marked unavailable, with no broken image', async () => {
    const assets = {
      ok: { assetId: 'ok', ownerUserId: OWNER, originalName: 'good.stl', key: 'synthetic/private/box.stl', bucket: 'b' },
      step: { assetId: 'step', ownerUserId: OWNER, originalName: 'part.step', key: 'synthetic/private/step', bucket: 'b' },
      bad: { assetId: 'bad', ownerUserId: OWNER, originalName: 'bad.stl', key: 'synthetic/private/bad', bucket: 'b' },
      gone: { assetId: 'gone', ownerUserId: OWNER, originalName: 'gone.stl', key: 'synthetic/private/gone', bucket: 'b' },
      huge: { assetId: 'huge', ownerUserId: OWNER, originalName: 'huge.stl', key: 'synthetic/private/huge', bucket: 'b' },
    }
    const table = { 'synthetic/private/box.stl': () => boxStl(20), 'synthetic/private/bad': () => corruptBytes(), 'synthetic/private/huge': () => new Uint8Array(PREVIEW_LIMITS.maxFileBytes + 1) }
    const request = guidedRequest({ guidedAssets: ['ok', 'step', 'bad', 'gone', 'huge', 'norecord'].map((assetId, i) => ({ assetId, quantity: i + 1 })) })
    const prepared = await prepare(request, { assets, source: byteSource(table) })
    expect(prepared.attachments).toHaveLength(1)
    expect(prepared.previews.step.reason).toBe('unsupported')
    expect(prepared.previews.bad.reason).toBe('unreadable')
    expect(prepared.previews.gone.reason).toBe('unreadable')
    expect(prepared.previews.huge.reason).toBe('too_large')
    expect(prepared.previews.norecord.reason).toBe('missing')
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    expect((html.match(/<img src="cid:/g) || []).length).toBe(1)
    expect((html.match(new RegExp(PREVIEW_UNAVAILABLE, 'g')) || []).length).toBe(5)
    expect(html).toContain('This file type cannot be previewed.')
    expect(html).not.toMatch(/src=""|src="undefined"/)
  })
  it('a source error for the whole request falls back to the original email', async () => {
    const prepared = await prepareNudgePreviews(guidedRequest(), { loadAssets: async () => { throw new Error('db down') } })
    expect(prepared).toEqual({ models: null, previews: {}, attachments: [] })
    const request = guidedRequest()
    expect(buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })).toEqual(buildIdleNudgeEmail({ request }))
  })
  it('respects the time budget', async () => {
    const loadBytes = () => new Promise(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const started = Date.now()
    const prepared = await prepareNudgePreviews(legacyRequest(), { loadAssets: async () => ({}), loadBytes, limits: { ...PREVIEW_LIMITS, budgetMs: 40 } })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(prepared.previews.legacy).toEqual({ status: 'unavailable', reason: 'timeout' })
    expect(prepared.attachments).toEqual([])
  })
  it('drops a model with too many triangles or a picture larger than the byte limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = await prepare(legacyRequest(), { assets: {}, limits: { ...PREVIEW_LIMITS, maxTriangles: 5 } })
    expect(a.previews.legacy.reason).toBe('too_large')
    const b = await prepare(legacyRequest(), { assets: {}, limits: { ...PREVIEW_LIMITS, maxPngBytes: 100 } })
    expect(b.previews.legacy.reason).toBe('too_large'); expect(b.attachments).toEqual([])
  })
  it('reads STL, OBJ and 3MF with the existing parsers and draws the real geometry', async () => {
    for (const [name, bytes] of [['a.stl', boxStl(20)], ['a.obj', boxObj(20)], ['a.3mf', await box3mf(20)]]) {
      const result = await renderModelPng(Buffer.from(bytes), name)
      expect(result.triangles).toBe(12)
      expect(result.bbox.size.map(v => Math.round(v))).toEqual([20, 20, 20])
      expect((await sharp(result.png).metadata()).format).toBe('png')
    }
  })
})

describe('ownership and security', () => {
  it('a file owned by someone else is never read', async () => {
    const source = byteSource()
    const request = guidedRequest()
    const prepared = await prepare(request, { assets: assetsFor(OTHER), source })
    expect(source.calls).toHaveLength(0)
    expect(prepared.attachments).toEqual([])
    expect(prepared.previews['asset-box'].reason).toBe('missing')
    expect(buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews }).html).not.toContain('cid:')
  })
  it('an asset that is not listed on the request is never resolved, and legacy storage is refused for guided requests', () => {
    const request = guidedRequest()
    expect(storageFor(request, { id: 'asset-other', fileName: 'x.stl' }, { ...assetsFor(), 'asset-other': { ...assetsFor()['asset-box'], assetId: 'asset-other' } })).toBeNull()
    expect(storageFor({ ...request, modelFile: { s3Key: 'k.stl' } }, { id: 'legacy' }, {})).toBeNull()
    expect(storageFor(request, { id: '../../etc/passwd' }, assetsFor())).toBeNull()
  })
  it('only a preview prepared for this request and this customer is rendered', async () => {
    const request = legacyRequest()
    const prepared = await prepare(request, { assets: {} })
    const preview = prepared.previews.legacy
    expect(usablePreview(preview, request, { id: 'legacy' })).toBeTruthy()
    for (const other of [{ ...request, requestId: 'FIT-SYN-9999' }, { ...request, userId: OTHER }]) {
      expect(usablePreview(preview, other, { id: 'legacy' })).toBeNull()
      const html = buildIdleNudgeEmail({ request: other, models: prepared.models, previews: prepared.previews }).html
      expect(html).not.toContain('<img src="cid:'); expect(html).toContain(PREVIEW_UNAVAILABLE)
    }
  })
  it('content ids are unique per email, so nothing is reused across customers', async () => {
    const a = await prepare(legacyRequest(), { assets: {} }), b = await prepare(legacyRequest(), { assets: {} })
    expect(a.attachments[0].cid).not.toBe(b.attachments[0].cid)
  })
  it('hostile file names, customer names and content ids are escaped or refused', async () => {
    const evil = '<img src=x onerror=alert(1)>"&\'.stl'
    const request = legacyRequest({ userName: '<script>alert(1)</script>', modelFile: { originalName: evil, s3Key: 'synthetic/bracket.stl' } })
    const prepared = await prepare(request, { assets: {} })
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    expect(html).not.toContain('<img src=x'); expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    for (const alt of html.match(/alt="[^"]*"/g)) expect(alt.slice(5, -1)).not.toMatch(/[<>"]/)
    const forged = { ...prepared.previews.legacy, cid: 'x"><script>alert(1)</script>@a' }
    expect(modelPreviewBlock({ request, models: prepared.models, previews: { legacy: forged } })).not.toContain('<script>')
  })
  it('the sent HTML carries only cid images: no storage key, bucket, signed or public URL, data URL, or network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const request = guidedRequest({ modelFile: { originalName: 'x.stl', s3Key: 'synthetic/leak.stl', s3Url: 'https://bucket.s3.amazonaws.com/leak.stl' } })
    const prepared = await prepare(request)
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    const sources = [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map(m => m[1])
    expect(sources.filter(s => s.startsWith('cid:'))).toHaveLength(2)
    expect(sources.filter(s => !s.startsWith('cid:'))).toEqual(['https://www.fixitoday.com/logo-mark.svg'])
    for (const banned of ['data:', 'amazonaws', 'synthetic/private', 'synthetic-private', 'synthetic/leak', 'X-Amz', 'blob:']) expect(html).not.toContain(banned)
    expect(JSON.stringify(prepared.models)).not.toMatch(/synthetic\/|synthetic-private|amazonaws/)
    const cids = new Set(prepared.attachments.map(a => a.cid))
    expect(sources.filter(s => s.startsWith('cid:')).every(s => cids.has(s.slice(4)))).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('the customer-audience view reveals no payment state and the call to action stays the private account cart link', async () => {
    const request = guidedRequest({ guidedPayment: { state: 'paid_pending_review', amountCents: 100, currency: 'sgd', lineItems: [] } })
    const prepared = await prepare(request)
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    expect(html).not.toMatch(/paid_pending_review|charged/)
    expect(html).toContain('href="https://www.fixitoday.com/cart"')
  })
})

describe('the message as nodemailer would build it (stream transport, no SMTP)', () => {
  it('is multipart/related with each image inline under its Content-ID, referenced by the HTML', async () => {
    const request = guidedRequest()
    const prepared = await prepare(request)
    const { subject, html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
    const info = await transport.sendMail({ from: 'FixItToday <noreply@example.test>', to: request.userEmail, subject, html, attachments: prepared.attachments })
    const eml = info.message.toString()
    expect(eml).toMatch(/Content-Type: multipart\/related/)
    for (const att of prepared.attachments) {
      expect(eml).toContain(`Content-Id: <${att.cid}>`.replace('Id', eml.includes('Content-ID') ? 'ID' : 'Id'))
      expect(html).toContain(`cid:${att.cid}`)
    }
    expect((eml.match(/Content-Disposition: inline/g) || []).length).toBe(2)
    expect(eml).toContain('image/png')
    expect(eml).not.toMatch(/Content-Disposition: attachment/)
  })
})
