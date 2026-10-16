// Original FIT game utilities. Rendering is event-driven, with no animation loop.
export const LEVEL_COUNT = 6

export function seededRandom(seed) {
  let state = 2166136261
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => {
    state += 0x6d2b79f5
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

export function randomInt(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)) }

export function scoreAnswer(attempts) {
  if (!Number.isInteger(attempts) || attempts < 1) return 0
  return attempts === 1 ? 100 : attempts === 2 ? 75 : 50
}

export function roundedRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke() }
}

export function createCanvas(host, draw, { height = 300, label = 'Game board' } = {}) {
  const canvas = document.createElement('canvas')
  canvas.className = 'game-canvas'
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', label)
  canvas.style.aspectRatio = `720 / ${height}`
  host.append(canvas)
  const ctx = canvas.getContext('2d')
  function redraw() {
    if (!ctx) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.max(300, canvas.getBoundingClientRect().width || 720)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(width * height / 720 * ratio)
    ctx.setTransform(canvas.width / 720, 0, 0, canvas.height / height, 0, 0)
    ctx.clearRect(0, 0, 720, height)
    ctx.save()
    draw(ctx)
    ctx.restore()
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(redraw)
  observer?.observe(canvas)
  // The board calls redraw after its controls have been constructed.
  return {
    canvas, redraw,
    point(event) {
      const bounds = canvas.getBoundingClientRect()
      return { x: (event.clientX - bounds.left) * 720 / bounds.width, y: (event.clientY - bounds.top) * height / bounds.height }
    },
    destroy() { observer?.disconnect(); canvas.remove() },
  }
}

export function createSession(game, seed = 'FIT-2026') {
  let level = 1, challenge = game.generateLevel(seed, level)
  let answer = game.initialAnswer(challenge), attempts = 0, points = 0, solved = false, stars = 0
  return {
    get level() { return level }, get challenge() { return challenge }, get answer() { return answer },
    get attempts() { return attempts }, get points() { return points }, get solved() { return solved }, get stars() { return stars },
    setAnswer(next) { if (!solved) answer = next },
    check() {
      if (solved) return { correct: true, awarded: 0 }
      attempts++
      const correct = game.checkAnswer(challenge, answer) === true
      const awarded = correct ? scoreAnswer(attempts) : 0
      if (correct) { points += awarded; stars++; solved = true }
      return { correct, awarded }
    },
    next() {
      if (!solved || level >= LEVEL_COUNT) return false
      challenge = game.generateLevel(seed, ++level)
      answer = game.initialAnswer(challenge); attempts = 0; solved = false
      return true
    },
    resetAnswer() { if (!solved) answer = game.initialAnswer(challenge) },
  }
}
