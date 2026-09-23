import { describe, expect, it } from 'vitest'
import { clampRegion, regionFromPoints, suggestTextRegion } from '@/lib/fabrication/regionSuggestion'
import { fitTextToRegion, suggestRegionFromImage } from '@/lib/fabrication/imagePreview'

function image(width = 160, height = 120, background = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(background, i * 4)
  return { data, width, height }
}
function fillRect(pixels, x, y, width, height, colour) {
  for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) pixels.data.set(colour, (yy * pixels.width + xx) * 4)
}
function assertInside(result, bounds) {
  expect(result.region).not.toBeNull()
  expect(result.region.x).toBeGreaterThan(bounds.x)
  expect(result.region.y).toBeGreaterThan(bounds.y)
  expect(result.region.x + result.region.width).toBeLessThan(bounds.x + bounds.width)
  expect(result.region.y + result.region.height).toBeLessThan(bounds.y + bounds.height)
  expect(result.confidence).toBeGreaterThanOrEqual(0.6)
}

describe('text area suggestion', () => {
  it('places text within a transparent tag and avoids the transparent hanging hole', () => {
    const pixels = image(160, 120, [0, 0, 0, 0])
    fillRect(pixels, 20, 25, 120, 70, [210, 165, 92, 255])
    fillRect(pixels, 26, 51, 12, 18, [0, 0, 0, 0])
    const result = suggestTextRegion(pixels)
    assertInside(result, { x: 20 / 160, y: 25 / 120, width: 120 / 160, height: 70 / 120 })
    expect(result.reason).toBe('transparent-foreground')
    const r = result.region
    expect(r.x >= 38 / 160 || r.y + r.height <= 51 / 120 || r.y >= 69 / 120).toBe(true)
  })

  it('uses a contrasting object on white rather than the large blank background', () => {
    const pixels = image()
    fillRect(pixels, 42, 32, 80, 55, [90, 120, 140, 255])
    const result = suggestTextRegion(pixels)
    assertInside(result, { x: 42 / 160, y: 32 / 120, width: 80 / 160, height: 55 / 120 })
    expect(result.reason).toBe('uniform-background')
  })

  it('declines a busy foreground even when the object boundary is clear', () => {
    const pixels = image(160, 120, [0, 0, 0, 0])
    for (let y = 20; y < 100; y++) for (let x = 20; x < 140; x++) {
      const channel = (x + y) % 2 ? 15 : 240
      pixels.data.set([channel, channel, channel, 255], (y * pixels.width + x) * 4)
    }
    expect(suggestTextRegion(pixels).region).toBeNull()
  })

  it('declines a blank image, an uncertain photo background and oversized analysis', () => {
    expect(suggestTextRegion(image()).region).toBeNull()
    const busy = image()
    for (let i = 0; i < busy.data.length; i += 4) {
      busy.data[i] = i % 251; busy.data[i + 1] = (i * 17) % 255; busy.data[i + 2] = (i * 29) % 253
    }
    expect(suggestTextRegion(busy).region).toBeNull()
    expect(suggestTextRegion(image(1000, 1000)).reason).toBe('image-size')
  })

  it('bounds invalid/manual coordinates and supports reverse-direction drawing', () => {
    expect(clampRegion({ x: -1, y: 0.95, width: 2, height: Infinity })).toEqual({ x: 0, y: 0.95, width: 1, height: expect.closeTo(0.05) })
    const region = regionFromPoints({ x: 0.9, y: 0.8 }, { x: 0.1, y: 0.2 })
    expect(region).toEqual({ x: 0.1, y: 0.2, width: 0.8, height: expect.closeTo(0.6) })
    expect(clampRegion({ x: NaN, y: null, width: -100, height: 0 }).width).toBe(0.02)
    expect(clampRegion({ x: 0.99, y: 0.1, width: 0.001, height: 0.1 })).toEqual({ x: 0.99, y: 0.1, width: 0.001, height: 0.1 })
  })

  it('downsamples large images before pixel inspection', () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => image(256, 128) }) }
    suggestRegionFromImage({ naturalWidth: 8000, naturalHeight: 4000 }, () => canvas)
    expect([canvas.width, canvas.height]).toEqual([256, 128])
  })
})

describe('text layout fitting', () => {
  const measureText = (text, size) => [...text].length * size * 0.6
  it('fits long text and explicit multiple lines inside both dimensions', () => {
    const result = fitTextToRegion({ text: 'A long personalized message\nA second line', width: 120, height: 35, measureText })
    expect(result.lines.length).toBeGreaterThan(1)
    expect(result.lines.length * result.lineHeight).toBeLessThanOrEqual(35)
    expect(result.lines.every(line => measureText(line, result.fontSize) <= 120)).toBe(true)
  })
  it('handles unbroken names, Unicode and empty text without overflow', () => {
    const result = fitTextToRegion({ text: '長い名前😀ABCDEFGHIJKLMNOPQRSTUVWXYZ', width: 40, height: 30, measureText })
    expect(result.lines.join('')).toBe('長い名前😀ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(result.lines.every(line => measureText(line, result.fontSize) <= 40)).toBe(true)
    expect(fitTextToRegion({ text: '', width: 100, height: 30 }).lines).toEqual([])
  })
})
