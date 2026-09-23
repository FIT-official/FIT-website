import { MAX_ANALYSIS_SIDE, suggestTextRegion } from './regionSuggestion'

export const PREVIEW_FONTS = Object.freeze({
  sans: 'Arial, Helvetica, sans-serif', serif: 'Georgia, Times New Roman, serif', mono: 'Courier New, monospace',
})
export const MAX_PERSONALIZATION_TEXT = 120

export function suggestRegionFromImage(image, createCanvas = () => document.createElement('canvas')) {
  const width = image.naturalWidth, height = image.naturalHeight
  if (!(width > 0 && height > 0)) throw new Error('The image is not ready.')
  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(width, height))
  const canvas = createCanvas()
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Image inspection is unavailable in this browser.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return suggestTextRegion(context.getImageData(0, 0, canvas.width, canvas.height))
}

/** Fits plain text within image-space pixels; no HTML, remote fonts or CSS input. */
export function fitTextToRegion({ text = '', width, height, measureText = (line, size) => [...line].length * size * 0.62 }) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) || !String(text).trim()) return { fontSize: 0, lineHeight: 0, lines: [], overflow: false }
  const content = String(text).slice(0, MAX_PERSONALIZATION_TEXT)
  const wrap = size => {
    const lines = []
    for (const paragraph of content.split('\n')) {
      if (!paragraph) { lines.push(''); continue }
      let line = ''
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? line + ' ' + word : word
        if (measureText(candidate, size) <= width) { line = candidate; continue }
        if (line) { lines.push(line); line = '' }
        for (const character of word) {
          if (line && measureText(line + character, size) > width) { lines.push(line); line = '' }
          line += character
        }
      }
      lines.push(line)
    }
    return lines
  }
  let lower = 0, upper = height
  for (let i = 0; i < 18; i++) {
    const size = (lower + upper) / 2, lines = wrap(size)
    if (lines.length * size * 1.2 <= height && lines.every(line => measureText(line, size) <= width)) lower = size
    else upper = size
  }
  const fontSize = lower, lines = wrap(fontSize)
  return { fontSize, lineHeight: fontSize * 1.2, lines, overflow: fontSize <= 0 }
}
