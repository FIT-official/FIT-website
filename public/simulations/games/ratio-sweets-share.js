import { seededRandom, randomInt, createCanvas, roundedRect } from './shared.js'

const FRIENDS = ['Maya', 'Leo', 'Zara']
const COLOURS = ['#ed759b', '#74b6f4', '#edba55']
const LEVEL_RATIOS = [[[1, 2], [2, 1]], [[1, 3], [3, 2]], [[2, 3], [3, 4]], [[1, 1, 2], [1, 2, 1]], [[1, 2, 3], [2, 1, 3]], [[2, 3, 4], [3, 2, 4]]]

export function generateLevel(seed, level = 1) {
  const stage = Math.max(1, Math.min(6, Number.isInteger(level) ? level : 1))
  const rng = seededRandom(`${seed}:sweets:${stage}`)
  const ratio = [...LEVEL_RATIOS[stage - 1][randomInt(rng, 0, 1)]]
  const scale = stage < 4 ? randomInt(rng, stage, stage + 1) : randomInt(rng, stage - 2, stage - 1)
  const total = ratio.reduce((sum, part) => sum + part, 0) * scale
  const names = FRIENDS.slice(0, ratio.length)
  return { level: stage, ratio, total, names, prompt: `Share ${total} sweets between ${names.join(', ')} in the ratio ${ratio.join(' : ')}. Use every sweet.` }
}

export function initialAnswer(challenge) {
  return { counts: challenge.ratio.map(() => 0) }
}

export function solution(challenge) {
  const scale = challenge.total / challenge.ratio.reduce((sum, part) => sum + part, 0)
  return { counts: challenge.ratio.map(part => part * scale) }
}

export function checkAnswer(challenge, answer) {
  const counts = answer?.counts
  if (!Array.isArray(counts) || counts.length !== challenge.ratio.length || !Array.from(counts).every(count => Number.isInteger(count) && count >= 0)) return false
  return counts.reduce((sum, count) => sum + count, 0) === challenge.total && counts.every((count, index) => count * challenge.ratio[0] === counts[0] * challenge.ratio[index])
}

export function explain(challenge) {
  const parts = challenge.ratio.reduce((sum, part) => sum + part, 0)
  const unit = challenge.total / parts
  return `A ratio compares equal-sized parts. There are ${parts} parts altogether, so each part has ${challenge.total} ÷ ${parts} = ${unit} sweets. Multiply every ratio part by ${unit}: ${solution(challenge).counts.join(' : ')}.`
}

export function hint(challenge, answer) {
  const used = answer.counts.reduce((sum, count) => sum + count, 0)
  if (used < challenge.total) return `There are ${challenge.total - used} sweets still in the tray. Add the ratio parts, then divide the total by that sum to find one equal part.`
  return 'All sweets are shared. Check each jar has the same number of sweets per ratio part. You can return sweets with − and share them again.'
}

function sweet(ctx, x, y, size, colour) {
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(x - size * 0.55, y)
  ctx.lineTo(x - size, y - size * 0.55)
  ctx.lineTo(x - size, y + size * 0.55)
  ctx.closePath()
  ctx.moveTo(x + size * 0.55, y)
  ctx.lineTo(x + size, y - size * 0.55)
  ctx.lineTo(x + size, y + size * 0.55)
  ctx.closePath()
  ctx.fill()
  roundedRect(ctx, x - size * 0.65, y - size * 0.6, size * 1.3, size * 1.2, size * 0.45, colour)
  ctx.fillStyle = '#ffffffa8'
  ctx.beginPath()
  ctx.ellipse(x - size * 0.2, y - size * 0.2, size * 0.25, size * 0.12, -0.5, 0, Math.PI * 2)
  ctx.fill()
}

function character(ctx, x, colour, index) {
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.ellipse(x, 69, 35, 27, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f9d5b9'
  ctx.beginPath()
  ctx.arc(x, 62, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = ['#453148', '#533b30', '#302b43'][index]
  ctx.beginPath()
  ctx.arc(x, 56, 23, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#333747'
  ctx.beginPath()
  ctx.arc(x - 7, 62, 2, 0, Math.PI * 2)
  ctx.arc(x + 7, 62, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#9b5c5a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, 66, 6, 0.2, Math.PI - 0.2)
  ctx.stroke()
}

export function createBoard(host, api) {
  let drag = null
  let selectedJar = 0
  const controls = document.createElement('div')
  controls.className = 'game-controls'
  const countLabels = []
  const buttons = []
  const hint = document.createElement('p')
  hint.className = 'game-hint'
  hint.textContent = 'Drag a sweet from the tray into a jar, or use the + and − buttons. With the board focused: ← → choose a jar, ↑ adds, ↓ returns a sweet.'
  const status = document.createElement('p')
  status.className = 'game-stat'
  status.setAttribute('aria-live', 'polite')

  function change(index, delta) {
    if (api.solved) return
    const counts = [...api.answer.counts]
    const used = counts.reduce((sum, count) => sum + count, 0)
    if (delta > 0 ? used >= api.challenge.total : counts[index] <= 0) return
    counts[index] += delta
    selectedJar = index
    api.setAnswer({ counts })
  }

  const jars = () => api.challenge.ratio.map((_, index, all) => ({ x: 360 + (index - (all.length - 1) / 2) * 205, y: 125, w: 154, h: 126 }))
  function draw(ctx) {
    const { challenge, answer } = api
    const used = answer.counts.reduce((sum, count) => sum + count, 0)
    const background = ctx.createLinearGradient(0, 0, 0, 360)
    background.addColorStop(0, '#fff6ed')
    background.addColorStop(1, '#f3f5ff')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, 720, 360)
    ctx.fillStyle = '#b6c1dd66'
    for (let i = 0; i < 14; i += 1) { ctx.beginPath(); ctx.arc(24 + i * 53, 20 + (i % 3) * 14, 3, 0, Math.PI * 2); ctx.fill() }
    roundedRect(ctx, 25, 246, 670, 15, 7, '#e8d8c7')
    jars().forEach((jar, index) => {
      const x = jar.x
      character(ctx, x, COLOURS[index], index)
      ctx.fillStyle = '#26354b'
      ctx.textAlign = 'center'
      ctx.font = 'bold 17px system-ui, sans-serif'
      ctx.fillText(`${challenge.names[index]} · ${challenge.ratio[index]} ${challenge.ratio[index] === 1 ? 'part' : 'parts'}`, x, 105)
      ctx.lineWidth = selectedJar === index ? 3 : 2
      roundedRect(ctx, x - 77, jar.y, jar.w, jar.h, 18, '#ffffffbd', selectedJar === index ? '#6755c9' : '#b3bdd1')
      roundedRect(ctx, x - 82, jar.y - 7, 164, 13, 6, COLOURS[index])
      const count = answer.counts[index]
      const columns = count <= 25 ? 5 : Math.ceil(Math.sqrt(count * 1.4))
      const rows = Math.max(1, Math.ceil(count / columns))
      const stepX = 124 / Math.max(1, columns - 1)
      const stepY = Math.min(21, 85 / Math.max(1, rows - 1))
      const candySize = Math.min(9, stepX * 0.39, stepY * 0.42)
      for (let i = 0; i < count; i += 1) sweet(ctx, x - 62 + (i % columns) * stepX, 219 - Math.floor(i / columns) * stepY, candySize, COLOURS[index])
      roundedRect(ctx, x - 30, 230, 60, 29, 12, '#26354b')
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 17px system-ui, sans-serif'
      ctx.fillText(String(answer.counts[index]), x, 251)
    })
    roundedRect(ctx, 25, 280, 670, 64, 17, '#ffffff', '#d8deeb')
    const remaining = challenge.total - used
    if (remaining) {
      for (let i = 0; i < remaining; i += 1) sweet(ctx, 45 + (i % 24) * 27, 300 + Math.floor(i / 24) * 27, 9, COLOURS[i % 3])
    } else {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#53627a'
      ctx.font = '16px system-ui, sans-serif'
      ctx.fillText(api.solved ? 'A sweet share for everyone!' : 'Every sweet is shared. Check your ratio!', 360, 320)
    }
    if (drag) sweet(ctx, drag.x, drag.y, 15, COLOURS[selectedJar])
  }

  const surface = createCanvas(host, draw, { height: 360, label: 'Sweet jars. Use arrow keys to choose a jar and add or return sweets, or use the buttons below.' })
  const canvas = surface.canvas
  canvas.tabIndex = 0
  canvas.style.touchAction = 'none'
  canvas.style.cursor = 'grab'
  api.challenge.names.forEach((name, index) => {
    const row = document.createElement('div')
    row.className = 'game-row'
    const label = document.createElement('span')
    label.className = 'game-pill'
    countLabels.push(label)
    row.append(label)
    for (const delta of [-1, 1]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'game-button'
      button.textContent = delta < 0 ? '−' : '+'
      button.setAttribute('aria-label', `${delta < 0 ? 'Remove sweet from' : 'Add sweet to'} ${name}`)
      button.addEventListener('click', () => change(index, delta))
      row.append(button)
      buttons.push({ button, index, delta })
    }
    controls.append(row)
  })
  host.append(controls, status, hint)

  function onPointerDown(event) {
    if (api.solved) return
    const point = surface.point(event)
    const remaining = api.challenge.total - api.answer.counts.reduce((sum, count) => sum + count, 0)
    if (point.y >= 278 && point.y <= 350 && remaining > 0) {
      drag = point
      canvas.setPointerCapture?.(event.pointerId)
      canvas.style.cursor = 'grabbing'
      surface.redraw()
    }
  }
  function onPointerMove(event) {
    if (!drag) return
    drag = surface.point(event)
    surface.redraw()
  }
  function onPointerUp(event) {
    if (!drag) return
    const point = surface.point(event)
    const target = jars().findIndex(jar => Math.abs(point.x - jar.x) <= jar.w / 2 + 10 && point.y >= jar.y - 10 && point.y <= jar.y + jar.h + 10)
    drag = null
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    canvas.style.cursor = 'grab'
    if (target >= 0) change(target, 1)
    surface.redraw()
  }
  function onCancel() { drag = null; canvas.style.cursor = 'grab'; surface.redraw() }
  function onKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || api.solved) return
    event.preventDefault()
    if (event.key === 'ArrowLeft') selectedJar = (selectedJar + api.challenge.ratio.length - 1) % api.challenge.ratio.length
    if (event.key === 'ArrowRight') selectedJar = (selectedJar + 1) % api.challenge.ratio.length
    if (event.key === 'ArrowUp') change(selectedJar, 1)
    if (event.key === 'ArrowDown') change(selectedJar, -1)
    update()
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onCancel)
  canvas.addEventListener('keydown', onKeyDown)
  function update() {
    const used = api.answer.counts.reduce((sum, count) => sum + count, 0)
    countLabels.forEach((label, index) => { label.textContent = `${api.challenge.names[index]}: ${api.answer.counts[index]}` })
    buttons.forEach(({ button, index, delta }) => { button.disabled = api.solved || (delta < 0 ? api.answer.counts[index] === 0 : used >= api.challenge.total) })
    status.textContent = `${api.challenge.total - used} sweets left · Selected jar: ${api.challenge.names[selectedJar]}`
    canvas.setAttribute('aria-label', `${api.challenge.names.map((name, index) => `${name}: ${api.answer.counts[index]}`).join(', ')}. ${api.challenge.total - used} sweets left. Arrow keys select jars and add or return sweets.`)
    surface.redraw()
  }
  update()
  return {
    update,
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('keydown', onKeyDown)
      surface.destroy()
      controls.remove(); status.remove(); hint.remove()
    },
  }
}

const game = { id: 'ratio-sweets-share', title: 'Sweet Share', subtitle: 'A fair share starts with equal parts.', generateLevel, initialAnswer, checkAnswer, solution, explain, hint, createBoard }
export default game
