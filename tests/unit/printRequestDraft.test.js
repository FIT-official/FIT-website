import { describe, expect, it } from 'vitest'
import { validatePrintFile, normalizeDesignSource, exceedsBuild } from '@/lib/printRequestDraft'

describe('print request model input', () => {
  it('rejects empty, oversized and unsupported files, including creator restrictions', () => {
    expect(validatePrintFile({ name: 'part.STL', size: 100 })).toBeNull()
    expect(validatePrintFile({ name: 'part.stl', size: 0 })).toMatch(/empty/)
    expect(validatePrintFile({ name: 'part.stl', size: 26 * 1024 * 1024 })).toMatch(/25 MB/)
    expect(validatePrintFile({ name: 'part.html', size: 100 })).toMatch(/STL/)
    expect(validatePrintFile({ name: 'part.3mf', size: 100 }, ['stl'])).toBe('Use a STL file.')
  })
  it('retains a bounded source description without treating it as a licence', () => {
    expect(normalizeDesignSource({ url: 'https://makerworld.com/en/models/123', attribution: '<Creator>\nname' })).toEqual({ url: 'https://makerworld.com/en/models/123', attribution: 'Creatorname' })
    for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com', 'bad']) expect(normalizeDesignSource({ url })).toBeNull()
    expect(normalizeDesignSource({ url: 'https://example.com', attribution: 'a'.repeat(500) }).attribution).toHaveLength(300)
  })
  it('compares all build axes while allowing a rotated part', () => {
    expect(exceedsBuild({ length: 3, width: 4, height: 5 }, { x: 50, y: 30, z: 40 })).toBe(false)
    expect(exceedsBuild({ length: 3, width: 4, height: 6 }, { x: 50, y: 30, z: 40 })).toBe(true)
  })
})
