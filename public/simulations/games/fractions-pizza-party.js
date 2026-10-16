import { seededRandom, randomInt, createCanvas, roundedRect } from './shared.js'

const CUTS = [2, 3, 4, 6, 8, 9, 12]
const TAU = Math.PI * 2

export function generateLevel(seed, level) {
  const stage = Math.max(1, Math.min(6, Math.trunc(level) || 1))
  const rng = seededRandom(`${seed}:pizza:${stage}`)
  let denominator = stage === 1 ? 4 : 6
  let scale = 1
  const mode = stage >= 5 ? 'add' : stage >= 3 ? 'equivalent' : 'serve'
  if (mode === 'equivalent') {
    denominator = [2, 3, 4][randomInt(rng, 0, 2)]
    scale = stage === 3 ? 2 : 3
  }
  if (mode === 'add') denominator = (stage === 5 ? [4, 6, 8] : [6, 8, 12])[randomInt(rng, 0, 2)]
  const first = randomInt(rng, 1, denominator - (mode === 'add' ? 2 : 1))
  const terms = mode === 'add' ? [first, randomInt(rng, 1, denominator - first)] : [first]
  const targetNumerator = terms.reduce((sum, term) => sum + term, 0)
  const targetLabel = terms.map(term => `${term}/${denominator}`).join(' + ')
  const cutCount = denominator * scale
  const prompt = mode === 'add'
    ? `Two guests want ${targetLabel} of one pizza altogether. Cut ${cutCount} equal slices and serve their total.`
    : mode === 'equivalent'
      ? `Serve ${targetLabel} of one pizza using ${cutCount} equal slices. Find the equivalent fraction.`
      : `Cut the pizza into ${cutCount} equal slices. Serve ${targetLabel} of the pizza.`
  return { level: stage, mode, denominator, targetNumerator, cutCount, terms, targetLabel, prompt }
}

export function initialAnswer() {
  return { cuts: 0, served: [] }
}

export function checkAnswer(challenge, answer) {
  if (!answer || !Array.isArray(answer.served) || answer.cuts !== challenge.cutCount) return false
  if (Array.from(answer.served).some(index => !Number.isInteger(index) || index < 0 || index >= answer.cuts)) return false
  if (new Set(answer.served).size !== answer.served.length) return false
  return answer.served.length * challenge.denominator === challenge.targetNumerator * answer.cuts
}

export function solution(challenge) {
  const count = challenge.targetNumerator * challenge.cutCount / challenge.denominator
  return { cuts: challenge.cutCount, served: Array.from({ length: count }, (_, index) => index) }
}

export function explain(challenge, answer) {
  const served = answer?.served?.length || 0
  if (!answer?.cuts) return 'Start by cutting equal slices. The denominator tells us how many equal parts make one whole pizza.'
  if (answer.cuts !== challenge.cutCount) return `Use ${challenge.cutCount} equal slices for this challenge. Changing the number of equal slices changes the size of each piece.`
  if (checkAnswer(challenge, answer)) {
    return challenge.mode === 'add'
      ? `${challenge.targetLabel} = ${challenge.targetNumerator}/${challenge.denominator}. Add the numerators because all slices are the same size.`
      : `${served}/${answer.cuts} = ${challenge.targetNumerator}/${challenge.denominator}. Equal fractions describe the same amount of one whole pizza.`
  }
  return `You served ${served}/${answer.cuts}. The target is ${challenge.targetLabel}. Count equal slices, keeping the whole pizza the same size.`
}

function pizzaSector(ctx, x, y, radius, from, to, colour, toppings = true) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.arc(x, y, radius, from, to)
  ctx.closePath()
  ctx.fillStyle = colour
  ctx.fill()
  ctx.strokeStyle = '#fff5dd'
  ctx.lineWidth = 3
  ctx.stroke()
  if (toppings) {
    const angle = (from + to) / 2
    const px = x + Math.cos(angle) * radius * 0.65
    const py = y + Math.sin(angle) * radius * 0.65
    ctx.beginPath()
    ctx.arc(px, py, Math.min(12, radius * (to - from) * 0.2), 0, TAU)
    ctx.fillStyle = '#d95c66'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + Math.cos(angle + 0.13) * radius * 0.36, y + Math.sin(angle + 0.13) * radius * 0.36, 8, 4, angle, 0, TAU)
    ctx.fillStyle = '#4c9d77'
    ctx.fill()
  }
}

export function createBoard(host, api) {
  const board = document.createElement('div')
  board.className = 'game-art'
  host.append(board)
  const canvasView = createCanvas(board, ctx => {
    const { challenge, answer } = api
    const gradient = ctx.createLinearGradient(0, 0, 720, 340)
    gradient.addColorStop(0, '#f3eaff')
    gradient.addColorStop(1, '#e4faf0')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 720, 340)
    roundedRect(ctx, 25, 20, 670, 46, 18, '#ffffffdd')
    ctx.fillStyle = '#553b77'
    ctx.font = 'bold 18px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText('PIZZA PARTY', 44, 50)
    ctx.textAlign = 'right'
    ctx.fillText(`TABLE ${challenge.level} · ${challenge.targetLabel}`, 677, 50)
    // A fixed whole and identical sectors keep the fraction model visible.
    ctx.beginPath()
    ctx.ellipse(208, 220, 148, 126, 0, 0, TAU)
    ctx.fillStyle = '#cdb5a6'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(208, 205, 127, 0, TAU)
    ctx.fillStyle = '#da9c58'
    ctx.fill()
    const cuts = answer.cuts || 1
    if (!answer.cuts) {
      ctx.beginPath()
      ctx.arc(208, 205, 115, 0, TAU)
      ctx.fillStyle = '#ffcd64'
      ctx.fill()
      for (let index = 0; index < 8; index += 1) {
        const angle = index * TAU / 8
        ctx.beginPath()
        ctx.arc(208 + Math.cos(angle) * 73, 205 + Math.sin(angle) * 73, 11, 0, TAU)
        ctx.fillStyle = '#d95c66'
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(208 + Math.cos(angle + 0.2) * 39, 205 + Math.sin(angle + 0.2) * 39, 8, 4, angle, 0, TAU)
        ctx.fillStyle = '#4c9d77'
        ctx.fill()
      }
    }
    for (let index = 0; index < answer.cuts; index += 1) {
      const from = index * TAU / cuts - Math.PI / 2
      const served = answer.served.includes(index)
      pizzaSector(ctx, 208, 205, 115, from, from + TAU / cuts, served ? '#e7d9c8' : '#ffcd64', !served)
    }
    ctx.beginPath()
    ctx.arc(530, 205, 126, 0, TAU)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#bca9da'
    ctx.lineWidth = 9
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(530, 205, 111, 0, TAU)
    ctx.strokeStyle = '#e8def5'
    ctx.lineWidth = 2
    ctx.stroke()
    answer.served.forEach((_, index) => pizzaSector(ctx, 530, 205, 99, index * TAU / cuts - Math.PI / 2, (index + 1) * TAU / cuts - Math.PI / 2, '#ffcd64'))
    if (!answer.served.length) {
      ctx.fillStyle = '#856ba6'
      ctx.font = 'bold 18px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('A plate to share', 530, 205)
      ctx.font = '14px system-ui'
      ctx.fillText('Serve equal slices here', 530, 228)
    }
    roundedRect(ctx, 120, 293, 176, 34, 15, '#fff')
    roundedRect(ctx, 442, 293, 176, 34, 15, api.solved ? '#c2f3d9' : '#fff')
    ctx.fillStyle = '#51366e'
    ctx.textAlign = 'center'
    ctx.font = 'bold 16px system-ui'
    ctx.fillText(answer.cuts ? `${answer.cuts - answer.served.length} slices left` : 'Ready to cut', 208, 316)
    ctx.fillText(answer.cuts ? `${answer.served.length}/${answer.cuts} served` : '0 served', 530, 316)
  }, { height: 340, label: 'Pizza cut into equal slices beside a serving plate. Use the cut and slice buttons below, or tap slices on the pizza.' })
  const controls = document.createElement('div')
  controls.className = 'game-controls'
  controls.style.flexDirection = 'column'
  controls.style.alignItems = 'stretch'
  const cutLabel = document.createElement('p')
  cutLabel.className = 'game-hint'
  cutLabel.textContent = '1. Cut equal slices. Changing the cut returns all slices to the pizza.'
  const cutsRow = document.createElement('div')
  cutsRow.className = 'game-row'
  cutsRow.setAttribute('role', 'group')
  cutsRow.setAttribute('aria-label', 'Cut the pizza')
  const cutButtons = CUTS.map(count => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'game-button'
    button.textContent = `${count} slices`
    button.setAttribute('aria-label', `Cut into ${count} equal slices`)
    button.addEventListener('click', () => api.setAnswer({ cuts: count, served: [] }))
    cutsRow.append(button)
    return [count, button]
  })
  const serveLabel = document.createElement('p')
  serveLabel.className = 'game-hint'
  serveLabel.textContent = '2. Tap pizza slices or use the numbered buttons to serve or return them. Then check your plate.'
  const sliceRow = document.createElement('div')
  sliceRow.className = 'game-row'
  sliceRow.setAttribute('role', 'group')
  sliceRow.setAttribute('aria-label', 'Serve pizza slices')
  const summary = document.createElement('p')
  summary.className = 'game-stat'
  summary.setAttribute('aria-live', 'polite')
  controls.append(cutLabel, cutsRow, serveLabel, sliceRow, summary)
  host.append(controls)

  const toggle = index => {
    if (!api.answer.cuts || api.solved) return
    const served = api.answer.served.includes(index)
      ? api.answer.served.filter(value => value !== index)
      : [...api.answer.served, index]
    api.setAnswer({ ...api.answer, served })
  }
  const onPointer = event => {
    const point = canvasView.point(event)
    const dx = point.x - 208
    const dy = point.y - 205
    if (Math.hypot(dx, dy) > 120 || !api.answer.cuts) return
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + TAU) % TAU
    toggle(Math.min(api.answer.cuts - 1, Math.floor(angle / TAU * api.answer.cuts)))
  }
  canvasView.canvas.addEventListener('pointerup', onPointer)
  let lastCuts = -1
  const sliceButtons = []
  function update() {
    const { answer, solved } = api
    cutButtons.forEach(([count, button]) => {
      button.disabled = solved
      button.setAttribute('aria-pressed', String(answer.cuts === count))
    })
    if (lastCuts !== answer.cuts) {
      sliceRow.replaceChildren()
      sliceButtons.length = 0
      for (let index = 0; index < answer.cuts; index += 1) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'game-button'
        button.textContent = `Slice ${index + 1}`
        button.addEventListener('click', () => toggle(index))
        sliceRow.append(button)
        sliceButtons.push(button)
      }
      lastCuts = answer.cuts
    }
    sliceButtons.forEach((button, index) => {
      const served = answer.served.includes(index)
      button.setAttribute('aria-pressed', String(served))
      button.setAttribute('aria-label', `${served ? 'Return' : 'Serve'} slice ${index + 1}`)
      button.disabled = solved
    })
    summary.textContent = answer.cuts ? `${answer.served.length} of ${answer.cuts} equal slices on the plate. Target: ${api.challenge.targetLabel}.` : 'The pizza is one whole. Choose how many equal slices to cut.'
    canvasView.redraw()
  }
  update()
  return { update, destroy() { canvasView.canvas.removeEventListener('pointerup', onPointer); canvasView.destroy(); board.remove(); controls.remove() } }
}

const game = { id: 'fractions-pizza-party', title: 'Pizza Party', subtitle: 'Cut, share and discover equal fractions.', generateLevel, initialAnswer, checkAnswer, solution, explain, hint: explain, createBoard }
export default game
