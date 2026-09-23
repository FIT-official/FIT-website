export const DEFAULT_TEXT_REGION = Object.freeze({ x: 0.2, y: 0.35, width: 0.6, height: 0.3 })
export const MIN_REGION_SIZE = 0.02
export const MAX_ANALYSIS_SIDE = 256
const clamp = (number, min, max) => Math.max(min, Math.min(max, number))
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback

export function clampRegion(region = DEFAULT_TEXT_REGION) {
  const boundedOrigin = (value, fallback) => value >= 1 ? 1 - MIN_REGION_SIZE : clamp(finite(value, fallback), 0, 1 - Number.EPSILON)
  const x = boundedOrigin(region?.x, DEFAULT_TEXT_REGION.x)
  const y = boundedOrigin(region?.y, DEFAULT_TEXT_REGION.y)
  const width = finite(region?.width, DEFAULT_TEXT_REGION.width), height = finite(region?.height, DEFAULT_TEXT_REGION.height)
  // Preserve valid narrow provider regions; a UI default must not enlarge one
  // beyond the provider's permitted area. Only invalid sizes receive a minimum.
  return { x, y,
    width: Math.min(width > 0 ? width : MIN_REGION_SIZE, 1 - x),
    height: Math.min(height > 0 ? height : MIN_REGION_SIZE, 1 - y) }
}

export function regionFromPoints(start, end) {
  const x1 = clamp(start.x, 0, 1), y1 = clamp(start.y, 0, 1)
  const x2 = clamp(end.x, 0, 1), y2 = clamp(end.y, 0, 1)
  return clampRegion({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) })
}

function summedArea(values, width, height) {
  const stride = width + 1, table = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += values[y * width + x]
      table[(y + 1) * stride + x + 1] = table[y * stride + x + 1] + row
    }
  }
  return (x, y, w, h) => table[(y + h) * stride + x + w] - table[y * stride + x + w]
    - table[(y + h) * stride + x] + table[y * stride + x]
}

function largestComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length), queue = new Int32Array(mask.length)
  let largest = [], total = 0
  for (let first = 0; first < mask.length; first++) {
    if (!mask[first] || visited[first]) continue
    let head = 0, tail = 1
    queue[0] = first; visited[first] = 1
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width)
      const adjacent = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]
      for (const next of adjacent) if (next >= 0 && mask[next] && !visited[next]) {
        visited[next] = 1; queue[tail++] = next
      }
    }
    total += tail
    if (tail > largest.length) largest = Array.from(queue.subarray(0, tail))
  }
  return { pixels: largest, total }
}

/**
 * Suggest a quiet rectangle strictly inside a detected foreground object.
 * This is image-space assistance, not proof of a printable/manufacturable zone.
 * Inputs must already be downsampled, so both memory and search cost are bounded.
 */
export function suggestTextRegion({ data, width, height } = {}) {
  const no = reason => ({ region: null, confidence: 0, reason })
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 24 || height < 24 ||
      width > MAX_ANALYSIS_SIDE || height > MAX_ANALYSIS_SIDE || data?.length !== width * height * 4) return no('image-size')
  const count = width * height, mask = new Uint8Array(count), border = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) border.push(y * width + x)
  }
  const transparent = border.filter(index => data[index * 4 + 3] < 32).length / border.length > 0.55
  let reason = 'transparent-foreground'
  if (transparent) {
    for (let i = 0; i < count; i++) mask[i] = data[i * 4 + 3] > 224 ? 1 : 0
  } else {
    reason = 'uniform-background'
    const background = [0, 1, 2].map(channel => border.reduce((sum, index) => sum + data[index * 4 + channel], 0) / border.length)
    const distance = index => Math.hypot(...background.map((value, channel) => data[index * 4 + channel] - value))
    if (border.filter(index => data[index * 4 + 3] > 224 && distance(index) < 25).length / border.length < 0.9) return no('no-clear-object')
    for (let i = 0; i < count; i++) mask[i] = data[i * 4 + 3] > 224 && distance(i) > 38 ? 1 : 0
  }
  const { pixels, total } = largestComponent(mask, width, height)
  if (pixels.length < count * 0.06 || pixels.length > count * 0.94 || pixels.length < total * 0.7) return no('no-clear-object')
  mask.fill(0)
  let left = width, right = 0, top = height, bottom = 0
  for (const index of pixels) {
    mask[index] = 1
    const x = index % width, y = Math.floor(index / width)
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  const bw = right - left + 1, bh = bottom - top + 1
  if (bw < 16 || bh < 16) return no('no-clear-object')
  const interior = new Uint8Array(count), luminance = new Float64Array(count), squared = new Float64Array(count), edges = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    const offset = i * 4
    luminance[i] = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722
    squared[i] = luminance[i] ** 2
  }
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = y * width + x
    // Keep a small gap from the edge and transparent holes.
    interior[i] = mask[i] && mask[i - 2] && mask[i + 2] && mask[i - 2 * width] && mask[i + 2 * width] ? 1 : 0
    let colourChange = 0
    for (let channel = 0; channel < 3; channel++) {
      colourChange += Math.abs(data[i * 4 + channel] - data[(i - 1) * 4 + channel])
        + Math.abs(data[i * 4 + channel] - data[(i - width) * 4 + channel])
    }
    edges[i] = colourChange > 66 ? 1 : 0
  }
  const inside = summedArea(interior, width, height), sum = summedArea(luminance, width, height)
  const sumSquared = summedArea(squared, width, height), edge = summedArea(edges, width, height)
  let best = null
  for (const wRatio of [0.7, 0.6, 0.5, 0.4]) for (const hRatio of [0.32, 0.25, 0.18]) {
    const w = Math.floor(bw * wRatio), h = Math.floor(bh * hRatio)
    if (w < 14 || h < 8 || w / h < 1.25 || w / h > 6) continue
    const step = Math.max(2, Math.floor(Math.min(bw, bh) / 18))
    for (let y = top + 2; y + h <= bottom - 1; y += step) for (let x = left + 2; x + w <= right - 1; x += step) {
      const area = w * h
      if (inside(x, y, w, h) < area) continue
      const mean = sum(x, y, w, h) / area
      const deviation = Math.sqrt(Math.max(0, sumSquared(x, y, w, h) / area - mean ** 2))
      const detail = edge(x, y, w, h) / area
      if (deviation > 28 || detail > 0.09) continue
      const offCentre = Math.hypot((x + w / 2 - (left + bw / 2)) / bw, (y + h / 2 - (top + bh / 2)) / bh)
      const score = area / (bw * bh) - offCentre * 0.16 - detail * 1.5 - deviation / 500
      if (!best || score > best.score) best = { x, y, w, h, score, deviation, detail }
    }
  }
  if (!best) return no('no-low-detail-region')
  const region = { x: best.x / width, y: best.y / height, width: best.w / width, height: best.h / height }
  const confidence = clamp(0.9 - best.detail * 2 - best.deviation / 160 - (transparent ? 0 : 0.08), 0, 1)
  if (confidence < 0.6) return no('low-confidence')
  return { region, confidence, reason }
}
