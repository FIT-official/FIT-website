import { describe, expect, it } from 'vitest'
import { COLOURS, normalizeHex } from '@/lib/makerTools/colours'
import { PALETTE, findSwatch, formatRgb, hexToRgb, parseChannelInput, parseHexInput, parseRgbInput, rgbToHex } from '@/lib/makerTools/colourInputs'

describe('HEX entry', () => {
  it.each([['#abc', '#AABBCC'], ['abc', '#AABBCC'], [' #00ae42 ', '#00AE42'], ['00AE42', '#00AE42'], ['#0A4', '#00AA44']])('normalizes %s', (input, hex) => {
    expect(parseHexInput(input)).toMatchObject({ status: 'valid', hex })
  })
  it.each(['', '   ', '#'])('treats blank %j as empty, not black', input => {
    expect(parseHexInput(input)).toEqual({ status: 'empty', hex: null, message: '' })
  })
  it.each(['#1', '#12', '#1234', '#12345', 'abcde'])('treats %s as incomplete without a colour', input => {
    const result = parseHexInput(input)
    expect(result).toMatchObject({ status: 'incomplete', hex: null }); expect(result.message).toMatch(/3- or 6-digit/)
  })
  it.each(['#12345G', 'red', '#1234567', '##123', 'rgb(0,0,0)', '#12 34'])('rejects %s', input => {
    const result = parseHexInput(input)
    expect(result.status).toBe('invalid'); expect(result.hex).toBeNull(); expect(result.message).not.toBe('')
  })
  it('does not throw on non-strings', () => {
    for (const v of [null, undefined, 12, {}]) expect(parseHexInput(v).status).toBe('empty')
  })
  it('agrees with the shared HEX normalizer when valid', () => {
    for (const t of ['#fff', 'AbCdEf', '#123']) expect(parseHexInput(t).hex).toBe(normalizeHex(t))
  })
})

describe('RGB channel entry', () => {
  it.each([['0', 0], ['255', 255], ['7', 7], [' 128 ', 128], ['007', 7]])('accepts %j', (input, value) => {
    expect(parseChannelInput(input)).toEqual({ status: 'valid', value, message: '' })
  })
  it.each(['256', '999', '-1', '1.5', '1e2', 'abc', '12a', '+5', '0x10', '1,5', '1000', '٣'])('rejects %j without coercion', input => {
    const result = parseChannelInput(input)
    expect(result.status).toBe('invalid'); expect(result.value).toBeNull()
  })
  it('keeps blank as empty rather than zero', () => {
    expect(parseChannelInput('')).toMatchObject({ status: 'empty', value: null })
    expect(parseChannelInput(undefined)).toMatchObject({ status: 'empty', value: null })
  })
})

describe('RGB triplet', () => {
  it('converts a full valid entry', () => {
    expect(parseRgbInput({ r: '0', g: '174', b: '66' })).toMatchObject({ status: 'valid', hex: '#00AE42', rgb: { r: 0, g: 174, b: 66 }, errors: {} })
  })
  it('is empty when nothing is typed and incomplete when some channels are blank', () => {
    expect(parseRgbInput({ r: '', g: '', b: '' })).toMatchObject({ status: 'empty', hex: null })
    expect(parseRgbInput()).toMatchObject({ status: 'empty' })
    expect(parseRgbInput({ r: '12', g: '', b: '' })).toMatchObject({ status: 'incomplete', hex: null, rgb: null })
  })
  it('reports each invalid channel and never produces a colour', () => {
    const result = parseRgbInput({ r: '300', g: '10', b: 'x' })
    expect(result).toMatchObject({ status: 'invalid', hex: null, rgb: null }); expect(Object.keys(result.errors)).toEqual(['r', 'b'])
    expect(result.errors.r).toMatch(/^Red:/)
  })
  it('lets an invalid channel win over an incomplete one', () => {
    expect(parseRgbInput({ r: '', g: '256', b: '' }).status).toBe('invalid')
  })
})

describe('conversion', () => {
  it('round-trips every reference colour and swatch', () => {
    for (const { hex } of [...COLOURS, ...PALETTE]) expect(rgbToHex(hexToRgb(hex))).toBe(hex)
  })
  it('matches known values and zero pads', () => {
    expect(hexToRgb('#00AE42')).toEqual({ r: 0, g: 174, b: 66 })
    expect(hexToRgb('#fa0')).toEqual({ r: 255, g: 170, b: 0 })
    expect(rgbToHex({ r: 0, g: 5, b: 255 })).toBe('#0005FF')
    expect(formatRgb({ r: 1, g: 2, b: 3 })).toBe('1, 2, 3'); expect(formatRgb(null)).toBe('')
  })
  it.each([null, 'nope', '#12'])('hexToRgb rejects %s', v => expect(hexToRgb(v)).toBeNull())
  it.each([{ r: 256, g: 0, b: 0 }, { r: -1, g: 0, b: 0 }, { r: 1.5, g: 0, b: 0 }, { r: '1', g: 0, b: 0 }, { r: 0, g: 0 }, undefined])('rgbToHex rejects %j', v => expect(rgbToHex(v)).toBeNull())
})

describe('named palette', () => {
  it('has unique names, ids and valid normalized HEX values', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(12)
    for (const key of ['id', 'name', 'hex']) expect(new Set(PALETTE.map(s => s[key])).size).toBe(PALETTE.length)
    for (const s of PALETTE) expect(normalizeHex(s.hex)).toBe(s.hex)
  })
  it('finds a swatch by any equivalent HEX and returns null otherwise', () => {
    expect(findSwatch('#fff')).toMatchObject({ name: 'White' })
    expect(findSwatch('e53935')).toMatchObject({ name: 'Red' })
    expect(findSwatch('#010101')).toBeNull(); expect(findSwatch(null)).toBeNull()
  })
})
