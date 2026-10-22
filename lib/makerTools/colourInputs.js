// Pure parsing and conversion for the colour matcher inputs (HEX, RGB channels,
// named swatches). Nothing here guesses: blank, partial or out-of-range entries
// are reported as such and never coerced into a colour.
import { normalizeHex } from './colours'

export const HEX_HELP = 'Enter a 3- or 6-digit HEX, such as #00AE42 or #0A4.'
export const CHANNEL_HELP = 'Use a whole number from 0 to 255.'
export const CHANNELS = Object.freeze([['r', 'Red'], ['g', 'Green'], ['b', 'Blue']])

// General starting colours for the matcher. These are not manufacturer colours.
export const PALETTE = Object.freeze([
  ['Red', '#E53935'], ['Orange', '#FB8C00'], ['Yellow', '#FDD835'], ['Lime', '#9CCC24'],
  ['Green', '#2E9E4F'], ['Teal', '#00897B'], ['Sky blue', '#29B6F6'], ['Blue', '#1E4FD8'],
  ['Purple', '#7B3FC4'], ['Magenta', '#D81B8C'], ['Pink', '#F48FB1'], ['Brown', '#7A4B2A'],
  ['White', '#FFFFFF'], ['Light grey', '#BDBDBD'], ['Dark grey', '#4A4A4A'], ['Black', '#000000'],
].map(([name, hex]) => Object.freeze({ id: name.toLowerCase().replaceAll(' ', '-'), name, hex })))

export function findSwatch(hex) {
  const target = normalizeHex(hex)
  return target ? PALETTE.find(s => s.hex === target) || null : null
}

export function hexToRgb(value) {
  const hex = normalizeHex(value)
  if (!hex) return null
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }
}

export function rgbToHex({ r, g, b } = {}) {
  const channels = [r, g, b]
  if (!channels.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return null
  return '#' + channels.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function formatRgb(rgb) { return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '' }

// status: 'empty' (nothing typed), 'incomplete' (a valid prefix, keep typing),
// 'invalid' (cannot become a HEX) or 'valid'.
export function parseHexInput(text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  const digits = raw.startsWith('#') ? raw.slice(1) : raw
  if (!digits) return { status: 'empty', hex: null, message: '' }
  if (!/^[a-f0-9]*$/i.test(digits)) return { status: 'invalid', hex: null, message: `HEX uses only 0–9 and A–F. ${HEX_HELP}` }
  if (digits.length > 6) return { status: 'invalid', hex: null, message: `That HEX is too long. ${HEX_HELP}` }
  const hex = normalizeHex(raw)
  if (hex) return { status: 'valid', hex, message: '' }
  return { status: 'incomplete', hex: null, message: `HEX is not complete yet. ${HEX_HELP}` }
}

export function parseChannelInput(text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (!raw) return { status: 'empty', value: null, message: '' }
  if (!/^\d{1,3}$/.test(raw) || Number(raw) > 255) return { status: 'invalid', value: null, message: CHANNEL_HELP }
  return { status: 'valid', value: Number(raw), message: '' }
}

// channels: { r, g, b } as typed strings. Any invalid channel makes the whole
// entry invalid; otherwise any blank channel makes it incomplete.
export function parseRgbInput(channels = {}) {
  const parsed = Object.fromEntries(CHANNELS.map(([key]) => [key, parseChannelInput(channels[key])]))
  const list = Object.values(parsed)
  const errors = Object.fromEntries(CHANNELS.filter(([key]) => parsed[key].status === 'invalid').map(([key, label]) => [key, `${label}: ${CHANNEL_HELP}`]))
  if (list.every(p => p.status === 'empty')) return { status: 'empty', hex: null, rgb: null, errors }
  if (list.some(p => p.status === 'invalid')) return { status: 'invalid', hex: null, rgb: null, errors }
  if (list.some(p => p.status === 'empty')) return { status: 'incomplete', hex: null, rgb: null, errors }
  const rgb = { r: parsed.r.value, g: parsed.g.value, b: parsed.b.value }
  return { status: 'valid', hex: rgbToHex(rgb), rgb, errors }
}
