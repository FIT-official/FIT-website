// Factual colour values transcribed from Bambu Lab's official PLA Basic HEX table.
// No manufacturer code is guessed from the name; catalogue joins use reviewed identities.
export const COLOUR_SOURCE = {
  title: 'Bambu Lab PLA Basic HEX table',
  url: 'https://store.bblcdn.eu/s8/default/903b60b06ac142e9b1b49ad53cfa4c82/Bambu_PLA_Basic_Hex_Code.pdf',
  checkedAt: '2026-10-09',
  material: 'PLA Basic',
}
export const COLOURS = [
  ['Jade White', '#FFFFFF'], ['Magenta', '#EC008C'], ['Gold', '#E4BD68'],
  ['Mistletoe Green', '#3F8E43'], ['Red', '#C12E1F'], ['Purple', '#5E43B7'],
  ['Beige', '#F7E6DE'], ['Pink', '#F55A74'], ['Sunflower Yellow', '#FEC600'],
  ['Bronze', '#847D48'], ['Turquoise', '#00B1B7'], ['Indigo Purple', '#482960'],
  ['Light Gray', '#D1D3D5'], ['Hot Pink', '#F5547C'], ['Yellow', '#F4EE2A'],
  ['Cocoa Brown', '#6F5034'], ['Cyan', '#0086D6'], ['Blue Grey', '#5B6579'],
  ['Silver', '#A6A9AA'], ['Orange', '#FF6A13'], ['Bright Green', '#BECF00'],
  ['Brown', '#9D432C'], ['Blue', '#0A2989'], ['Dark Gray', '#545454'],
  ['Gray', '#8E9089'], ['Pumpkin Orange', '#FF9016'], ['Bambu Green', '#00AE42'],
  ['Maroon Red', '#9D2235'], ['Cobalt Blue', '#0056B8'], ['Black', '#000000'],
].map(([name, hex]) => Object.freeze({ id: 'bambu-pla-basic-' + name.toLowerCase().replaceAll(' ', '-'), name, hex, brand: 'Bambu Lab', material: 'PLA Basic' }))

export function normalizeHex(value) {
  if (typeof value !== 'string' || !/^#?(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value.trim())) return null
  const hex = value.trim().replace('#', '')
  return '#' + (hex.length === 3 ? [...hex].map(c => c + c).join('') : hex).toUpperCase()
}

// sRGB -> linear RGB -> XYZ (D65) -> CIELAB. Delta E 1976 is Euclidean Lab
// distance, not a percentage, physical measurement or colour acceptance tolerance.
export function hexToLab(value) {
  const hex = normalizeHex(value)
  if (!hex) throw new Error('Enter a valid 3- or 6-digit HEX colour.')
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const f = t => t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047)
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.0721750)
  const z = f((r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
export function colourDistance(a, b) {
  const left = hexToLab(a), right = hexToLab(b)
  return Math.hypot(...left.map((v, i) => v - right[i]))
}
export function rankColours(hex, colours = COLOURS) {
  const target = normalizeHex(hex)
  if (!target) return []
  return colours.map(c => ({ ...c, distance: colourDistance(target, c.hex),
    confidence: target === normalizeHex(c.hex) ? 'Same reference HEX' : 'Approximate screen match' }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
}
