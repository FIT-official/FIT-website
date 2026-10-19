// @vitest-environment node
// The reminder picture is a SOLID, crease-aware shaded rendering: smooth on curved walls, crisp on real edges, no wireframe, and the uploaded bytes are never changed.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { renderModelPng, PREVIEW_LIMITS } from '@/lib/email/printPreviews'
import { parseForPreview, shadeModel, CREASE_DEGREES } from '@/lib/email/printPreviewRender'
import { boxStl, cylinderStl, coneStl } from '../helpers/emailFixtures'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const shade = async (bytes, name, options = {}) => shadeModel(await parseForPreview(Buffer.from(bytes), name), 480, 320, options)
const px = (img, x, y) => { const o = (y * img.width + x) * 3; return [img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]] }
const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
const BG = 244
const rowSpan = (img, y) => { let a = -1, b = -1; for (let x = 0; x < img.width; x++) if (Math.abs(img.pixels[(y * img.width + x) * 3] - BG) > 6) { if (a < 0) a = x; b = x } return [a, b] }
const maxJump = (img, y, from, to) => { let worst = 0; for (let x = from + 1; x < to; x++) worst = Math.max(worst, Math.abs(lum(px(img, x, y)) - lum(px(img, x - 1, y)))); return worst }
const distinct = (img, y, from, to) => new Set(Array.from({ length: to - from }, (_, i) => Math.round(lum(px(img, from + i, y))))).size

describe('solid shading, no wireframe', () => {
  it('a cube is flat inside each face with crisp steps between faces and no dark outline along the edges', async () => {
    const img = await shade(boxStl(20), 'cube.stl')
    const y = 170
    const [a, b] = rowSpan(img, y)
    const row = Array.from({ length: b - a + 1 }, (_, i) => Math.round(lum(px(img, a + i, y))))
    const runs = []; let start = 0
    for (let i = 1; i <= row.length; i++) if (i === row.length || Math.abs(row[i] - row[i - 1]) > 1) { runs.push([start, i - 1, row[start]]); start = i }
    const plateaus = runs.filter(r => r[1] - r[0] >= 20)
    expect(plateaus.length).toBeGreaterThanOrEqual(2)
    expect(Math.abs(plateaus[0][2] - plateaus.at(-1)[2])).toBeGreaterThan(12)
    const lowest = Math.min(...plateaus.map(r => r[2]))
    expect(Math.min(...row.slice(1, -1))).toBeGreaterThanOrEqual(lowest - 3)
  })
  it('a cylinder wall shades smoothly while its cap rim stays a crisp step', async () => {
    const wall = await shade(cylinderStl(10, 30, 24), 'cyl.stl')
    const flat = await shade(cylinderStl(10, 30, 24), 'cyl.stl', { creaseDegrees: 0 })
    const y = 215
    const [a, b] = rowSpan(wall, y)
    const jumpSmooth = maxJump(wall, y, a + 3, b - 3), jumpFlat = maxJump(flat, y, a + 3, b - 3)
    expect(jumpSmooth).toBeLessThan(jumpFlat / 2)
    expect(distinct(wall, y, a + 3, b - 3)).toBeGreaterThan(distinct(flat, y, a + 3, b - 3) * 2)
    const col = Math.round((a + b) / 2)
    let topY = -1; for (let yy = 0; yy < wall.height; yy++) if (Math.abs(px(wall, col, yy)[0] - BG) > 6) { topY = yy; break }
    const cap = lum(px(wall, col, topY + 25)), side = lum(px(wall, col, topY + 140))
    expect(Math.abs(cap - side)).toBeGreaterThan(12)
    let darkest = 255; for (let yy = topY + 25; yy <= topY + 140; yy++) darkest = Math.min(darkest, lum(px(wall, col, yy)))
    expect(darkest).toBeGreaterThanOrEqual(Math.min(cap, side) - 6)
  })
  it('the crease threshold sits between 15 degree facets (smoothed) and 45 degree edges (kept sharp)', () => {
    expect(CREASE_DEGREES).toBeGreaterThan(15); expect(CREASE_DEGREES).toBeLessThan(45)
  })
  it('a cone (curved side, flat base) renders smooth side shading', async () => {
    const img = await shade(coneStl(), 'cone.stl')
    const y = 200, [a, b] = rowSpan(img, y)
    expect(distinct(img, y, a + 2, b - 2)).toBeGreaterThan(15)
  })
  it('no pixel is much darker than the darkest lit surface (no wireframe colour)', async () => {
    const img = await shade(cylinderStl(10, 30, 48), 'cyl.stl')
    let min = 255; for (let i = 0; i < img.pixels.length; i += 3) min = Math.min(min, img.pixels[i])
    expect(min).toBeGreaterThan(40)
  })
})

describe('source bytes, zero normals, bounds', () => {
  it('rendering never changes the uploaded bytes (hash before = hash after) and is deterministic', async () => {
    for (const [name, bytes] of [['a.stl', Buffer.from(cylinderStl(10, 30, 24))], ['b.stl', Buffer.from(boxStl(20))]]) {
      const before = sha(bytes)
      const one = await renderModelPng(bytes, name), two = await renderModelPng(bytes, name)
      expect(sha(bytes)).toBe(before)
      expect(sha(one.png)).toBe(sha(two.png))
    }
  })
  it('a zero-normal STL is shaded from its geometry, not its stored normals', async () => {
    const bytes = Buffer.from(boxStl(20))
    expect([...bytes.subarray(84, 96)].every(v => v === 0)).toBe(true)
    const img = await shade(bytes, 'z.stl')
    const lums = new Set(); for (let y = 100; y < 220; y += 10) for (let x = 100; x < 380; x += 10) lums.add(Math.round(lum(px(img, x, y))))
    expect(lums.size).toBeGreaterThan(2)
  })
  it('stored normals that point the wrong way make no difference (shading uses the geometry)', async () => {
    const good = Buffer.from(boxStl(20)), bad = Buffer.from(boxStl(20))
    for (let t = 0; t < 12; t++) { const o = 84 + t * 50; bad.writeFloatLE(-1, o); bad.writeFloatLE(-1, o + 4); bad.writeFloatLE(-1, o + 8) }
    expect(sha((await renderModelPng(good, 'g.stl')).png)).toBe(sha((await renderModelPng(bad, 'b.stl')).png))
  })
  it('a degenerate (zero-area) triangle is skipped without NaN', async () => {
    const bytes = Buffer.alloc(84 + 13 * 50); Buffer.from(boxStl(20)).copy(bytes, 0, 0, 84 + 12 * 50); bytes.writeUInt32LE(13, 80)
    const img = await shade(bytes, 'd.stl')
    expect(img.drawn).toBe(12)
    expect(img.pixels.every(v => Number.isFinite(v))).toBe(true)
  })
  it('a dense curved model renders within the time and picture-size limits', async () => {
    const started = Date.now()
    const out = await renderModelPng(Buffer.from(cylinderStl(10, 30, 5000)), 'dense.stl')
    expect(Date.now() - started).toBeLessThan(PREVIEW_LIMITS.renderMs + 3000)
    expect(out.png.length).toBeLessThan(PREVIEW_LIMITS.maxPngBytes)
    expect((await sharp(out.png).metadata()).width).toBe(480)
  })
  it('an exhausted shading budget fails that model only, with a plain error kind', async () => {
    await expect(shade(cylinderStl(10, 30, 2000), 'c.stl', { maxMillis: -1 })).rejects.toMatchObject({ kind: 'too_large' })
  })
  it('the typical picture stays well under the per-picture byte limit', async () => {
    const out = await renderModelPng(Buffer.from(cylinderStl(10, 30, 24)), 'c.stl')
    expect(out.png.length).toBeLessThan(PREVIEW_LIMITS.maxPngBytes)
  })
})

describe('caption and alt text', () => {
  it('the caption is exactly "Model preview" and the HTML carries no explanatory wording', async () => {
    const { prepareNudgePreviews } = await import('@/lib/email/printPreviews')
    const { buildIdleNudgeEmail } = await import('@/lib/email/templates/customPrint')
    const { PREVIEW_CAPTION } = await import('@/lib/email/modelPreviewBlock')
    const { legacyRequest } = await import('../helpers/emailFixtures')
    const request = legacyRequest()
    const prepared = await prepareNudgePreviews(request, { loadAssets: async () => ({}), loadBytes: async () => Buffer.from(cylinderStl(10, 30, 24)) })
    const { html } = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews })
    expect(PREVIEW_CAPTION).toBe('Model preview')
    expect(html).toMatch(/>Model preview<\/div>/)
    expect(html).toMatch(/alt="Model preview of bracket\.stl"/)
    expect(html).not.toMatch(/photograph|can look different|finished print|drawn from/i)
  })
})
