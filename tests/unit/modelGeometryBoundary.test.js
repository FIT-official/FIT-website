// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
const m = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@/lib/s3', () => ({ s3: { send: m.send } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: {} }))
vi.mock('@/models/Product', () => ({ default: {} }))
vi.mock('@/lib/filamentInventory', () => ({ getFilamentAvailability: vi.fn(), rushAvailability: vi.fn() }))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn() }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: vi.fn() }))
import { parseStlToPositions, parseBinaryStl } from '@/lib/quoting/stl'
import { recomputeMetricsFromModel } from '@/lib/quoting/serverGeometry'
import { measureStoredModel } from '@/lib/quoting/persistInstantQuote'
import { computeQuoteFromModelBytes } from '@/lib/customPrint/productQuote'

const corners = [[0,0,0],[10,0,0],[0,10,0],[0,0,10]]
const faces = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]]
const ascii = `solid tetra\n${faces.map(face => `facet normal 0 0 0\nouter loop\n${face.map(v => `vertex ${corners[v].join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid tetra`
const bytes = text => Buffer.from(text)
function binary() {
  const out = Buffer.alloc(84 + faces.length * 50)
  out.writeUInt32LE(faces.length, 80)
  faces.forEach((face, i) => face.flatMap(v => corners[v]).forEach((value, j) => out.writeFloatLE(value, 84 + i * 50 + 12 + j * 4)))
  return out
}
async function stored(body) {
  m.send.mockResolvedValueOnce({ ContentLength: body.length, Body: (async function* () { yield body })() })
  return measureStoredModel({ model: { originalName: 'synthetic.stl', s3Key: 'models/synthetic/part.stl' } })
}
const model = `<model unit="millimeter"><resources><object id="1"><mesh><vertices>${corners.map(([x,y,z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('')}</vertices><triangles>${faces.map(([v1,v2,v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
async function archive({ xml = model, modify = () => {}, compression = 'STORE' } = {}) {
  const zip = new JSZip().file('[Content_Types].xml', '<Types><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>').file('3D/3dmodel.model', xml)
  modify(zip)
  return zip.generateAsync({ type: 'nodebuffer', compression })
}
const productQuote = (body, fileName = 'model.3mf') => computeQuoteFromModelBytes({ bytes: body, fileName, quoteSettings: { materialType: 'pla' } })

describe('STL byte integrity before stored-model pricing', () => {
  it.each([NaN, Infinity, -Infinity])('rejects nonfinite binary coordinates and normals: %s', async value => {
    for (const offset of [84, 96, 112, 84 + 3 * 50 + 44]) {
      const body = binary(); body.writeFloatLE(value, offset)
      expect(parseStlToPositions(body)).toBeNull()
      expect((await stored(body)).ok).toBe(false)
    }
  })
  it('refuses incomplete binary triangle records even through the direct parser', () => {
    expect(parseBinaryStl(binary().subarray(0, 100))).toBeNull()
    expect(parseBinaryStl(Buffer.alloc(84))).toBeNull()
    expect(parseStlToPositions(Buffer.concat([binary(), Buffer.from([0])]))).toBeNull()
  })
  it.each([
    ['missing facets and endsolid', `solid invalid\n${faces.flatMap(f => f.map(v => `vertex ${corners[v].join(' ')}`)).join('\n')}`],
    ['missing endsolid', ascii.replace('endsolid tetra', '')],
    ['missing endfacet', ascii.replace('endfacet', '')],
    ['missing outer loop', ascii.replace('outer loop', '')],
    ['missing vertex', ascii.replace('vertex 0 0 0', '')],
    ['extra vertex', ascii.replace('endloop', 'vertex 1 2 3\nendloop')],
    ['numeric suffix', ascii.replace('vertex 0 0 0', 'vertex 0 0 0oops')],
    ['overflowing exponent', ascii.replace('vertex 0 0 0', 'vertex 1e999 0 0')],
    ['nonfinite normal', ascii.replace('normal 0 0 0', 'normal NaN 0 0')],
    ['trailing corruption', ascii + '\ngarbage'],
    ['null byte', ascii + '\0'],
  ])('rejects %s without quoting a valid prefix', async (_name, text) => {
    expect(parseStlToPositions(bytes(text))).toBeNull()
    expect((await stored(bytes(text))).ok).toBe(false)
  })
  it.each([
    ['binary', binary()], ['ASCII', bytes(ascii)],
    ['CRLF uppercase signed exponent', bytes(ascii.toUpperCase().replace(/10/g, '+1.0E1').replace(/\n/g, '\r\n'))],
  ])('preserves valid %s geometry and expected physical volume', async (_name, body) => {
    const out = await stored(body)
    expect(out.ok).toBe(true); expect(out.metrics.confidence).toBe('high')
    expect(out.metrics.volumeCm3).toBeCloseTo(1 / 6, 8)
  })
  it('consumes complete multi-solid ASCII and rejects a broken second solid', async () => {
    const parsed = parseStlToPositions(bytes(ascii + '\n' + ascii))
    expect(parsed).toHaveLength(72)
    expect(parseStlToPositions(bytes(ascii + '\nsolid broken\nvertex 0 0 0'))).toBeNull()
  })
})

describe('fixed-product 3MF archive policy', () => {
  it('retains a valid archive quote', async () => {
    const quote = await productQuote(await archive())
    // Quote inputs retain the engine's existing two-decimal rounding.
    expect(quote?.inputs.volumeCm3).toBe(0.17)
  })
  it('rejects suspicious compression before the mesh can be measured', async () => {
    const body = await archive({ xml: model.replace('</model>', `<!--${'x'.repeat(1_100_000)}--></model>`), compression: 'DEFLATE' })
    // Safely bounded reproducer: the geometry itself is valid, the ZIP is not.
    expect((await recomputeMetricsFromModel(body, 'model.3mf')).volumeCm3).toBeCloseTo(1 / 6, 8)
    expect(await productQuote(body)).toBeNull()
    expect(await productQuote(body, 'MODEL.3MF?download=1')).toBeNull()
  })
  it('rejects traversal, excessive entries, encryption and invalid size metadata', async () => {
    const traversal = await archive({ modify: zip => zip.file('../outside.txt', 'synthetic') })
    const entries = await archive({ modify: zip => { for (let i = 0; i < 260; i++) zip.file(`entry-${i}`, 'x') } })
    const encrypted = await archive(); const a = encrypted.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); encrypted.writeUInt16LE(1, a + 8)
    const oversize = await archive(); const b = oversize.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); oversize.writeUInt32LE(17 * 1024 * 1024, b + 24)
    for (const body of [traversal, entries, encrypted, oversize, Buffer.from('invalid ZIP')]) expect(await productQuote(body)).toBeNull()
  })
})
