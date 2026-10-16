import { seededRandom, randomInt, createCanvas, roundedRect } from './shared.js'

const TAU = Math.PI * 2

function fractionLabel({ numerator, denominator }) {
  const whole = Math.floor(numerator / denominator)
  const remainder = numerator % denominator
  if (!remainder) return String(whole)
  return whole ? `${whole} ${remainder}/${denominator}` : `${numerator}/${denominator}`
}

function positionOf(fraction, tickDenominator) {
  return fraction.numerator * tickDenominator / fraction.denominator
}

export function generateLevel(seed, level) {
  const stage = Math.max(1, Math.min(6, Math.trunc(level) || 1))
  const rng = seededRandom(`${seed}:frog:${stage}`)
  let tickDenominator = [4, 6][randomInt(rng, 0, 1)]
  const maxWhole = stage >= 5 ? 2 : 1
  let mode = stage >= 5 ? 'mixed' : 'land'
  let targets
  let expectedPositions
  let prompt
  if (stage === 3 || stage === 4 || stage === 6) {
    mode = stage === 3 ? 'compare' : 'order'
    tickDenominator = 12
    const pool = [
      { numerator: 1, denominator: 6 }, { numerator: 1, denominator: 4 },
      { numerator: 1, denominator: 3 }, { numerator: 1, denominator: 2 },
      { numerator: 2, denominator: 3 }, { numerator: 3, denominator: 4 }, { numerator: 5, denominator: 6 },
    ].map(fraction => stage === 6 ? { ...fraction, numerator: fraction.numerator + fraction.denominator } : fraction)
    targets = []
    const count = stage === 3 ? 2 : 3
    while (targets.length < count) targets.push(pool.splice(randomInt(rng, 0, pool.length - 1), 1)[0])
    const ascending = stage !== 3 || randomInt(rng, 0, 1) === 0
    const positions = targets.map(fraction => positionOf(fraction, tickDenominator)).sort((a, b) => a - b)
    expectedPositions = stage === 3 ? [positions[ascending ? 0 : positions.length - 1]] : positions
    prompt = stage === 3
      ? `Compare ${targets.map(fractionLabel).join(' and ')}. Land on the ${ascending ? 'smaller' : 'larger'} fraction.`
      : `Land on ${targets.map(fractionLabel).join(', ')} in order from smallest to largest. Record all three jumps.`
  } else {
    const denominator = tickDenominator
    const numerator = randomInt(rng, 1, denominator - 1) + (stage === 5 ? denominator : 0)
    targets = [{ numerator, denominator }]
    if (stage === 2) tickDenominator *= 2
    expectedPositions = [positionOf(targets[0], tickDenominator)]
    prompt = stage === 2
      ? `Land on ${fractionLabel(targets[0])}. Each small step is 1/${tickDenominator}; use an equivalent fraction.`
      : `Land on ${fractionLabel(targets[0])}. Each small step is 1/${tickDenominator}.`
  }
  return { level: stage, mode, tickDenominator, maxWhole, targets, expectedPositions, prompt }
}

export function initialAnswer() {
  return { position: 0, landings: [] }
}

export function checkAnswer(challenge, answer) {
  const limit = challenge.maxWhole * challenge.tickDenominator
  if (!answer || !Number.isInteger(answer.position) || answer.position < 0 || answer.position > limit || !Array.isArray(answer.landings)) return false
  return answer.landings.length === challenge.expectedPositions.length && Array.from(answer.landings).every((position, index) => Number.isInteger(position) && position === challenge.expectedPositions[index])
}

export function solution(challenge) {
  return { position: challenge.expectedPositions.at(-1), landings: [...challenge.expectedPositions] }
}

export function explain(challenge, answer) {
  if (checkAnswer(challenge, answer)) {
    if (challenge.mode === 'order') return `${challenge.expectedPositions.map(position => fractionLabel({ numerator: position, denominator: challenge.tickDenominator })).join(' < ')}. Numbers increase as we move right on a number line.`
    if (challenge.mode === 'compare') return 'Fractions farther right are larger. Comparing positions works even when their denominators differ.'
    return `${fractionLabel(challenge.targets[0])} is ${challenge.expectedPositions[0]} steps of 1/${challenge.tickDenominator} from zero. ${challenge.mode === 'mixed' ? 'A mixed number includes whole units and a fractional part.' : 'The denominator counts equal intervals in one whole unit.'}`
  }
  if (!answer?.landings?.length) return 'Aim with the arrow buttons or tap the number line, then press Jump to record a landing.'
  return challenge.mode === 'order'
    ? 'Check each landing from left to right. Use Undo jump to remove the last landing, or Start again to try the sequence afresh.'
    : `Each interval is 1/${challenge.tickDenominator}. Count from zero, then jump again to replace your landing.`
}

function frog(ctx, x, y, happy) {
  ctx.fillStyle = '#38866d'
  ctx.beginPath()
  ctx.ellipse(x - 21, y + 16, 19, 9, -0.2, 0, TAU)
  ctx.ellipse(x + 21, y + 16, 19, 9, 0.2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = happy ? '#6dd3a8' : '#7bdbb3'
  ctx.beginPath()
  ctx.ellipse(x, y, 29, 24, 0, 0, TAU)
  ctx.fill()
  ;[-16, 16].forEach(offset => {
    ctx.beginPath()
    ctx.arc(x + offset, y - 20, 12, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + offset, y - 21, 8, 0, TAU)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + offset + 1, y - 20, 4, 0, TAU)
    ctx.fillStyle = '#3d3353'
    ctx.fill()
    ctx.fillStyle = '#7bdbb3'
  })
  ctx.beginPath()
  ctx.arc(x, y, 11, 0.15, Math.PI - 0.15)
  ctx.strokeStyle = '#3d6b57'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#ed9697'
  ctx.beginPath()
  ctx.ellipse(x - 21, y + 1, 5, 3, 0, 0, TAU)
  ctx.ellipse(x + 21, y + 1, 5, 3, 0, 0, TAU)
  ctx.fill()
}

export function createBoard(host, api) {
  const board = document.createElement('div')
  board.className = 'game-art'
  host.append(board)
  const canvasView = createCanvas(board, ctx => {
    const { challenge, answer } = api
    const limit = challenge.tickDenominator * challenge.maxWhole
    const positionX = position => 60 + position / limit * 600
    const gradient = ctx.createLinearGradient(0, 0, 0, 340)
    gradient.addColorStop(0, '#f1e9ff')
    gradient.addColorStop(0.5, '#e8f8f3')
    gradient.addColorStop(1, '#c1eadd')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 720, 340)
    roundedRect(ctx, 25, 20, 670, 46, 18, '#ffffffdd')
    ctx.fillStyle = '#553b77'
    ctx.font = 'bold 18px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText('FRACTION POND', 44, 50)
    ctx.textAlign = 'right'
    ctx.fillText(`HOP ${challenge.level} · STEP 1/${challenge.tickDenominator}`, 677, 50)
    // Still water and direct redraws also serve reduced-motion users.
    for (let index = 0; index < 5; index += 1) {
      ctx.beginPath()
      ctx.ellipse(110 + index * 135, 285 + index % 2 * 20, 48, 7, 0, 0, TAU)
      ctx.strokeStyle = '#9acfc1'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(60, 232)
    ctx.lineTo(660, 232)
    ctx.strokeStyle = '#76568e'
    ctx.lineWidth = 4
    ctx.stroke()
    for (let position = 0; position <= limit; position += 1) {
      const x = positionX(position)
      const whole = position % challenge.tickDenominator === 0
      ctx.beginPath()
      ctx.moveTo(x, 225)
      ctx.lineTo(x, whole ? 247 : 240)
      ctx.strokeStyle = '#76568e'
      ctx.lineWidth = whole ? 3 : 1.5
      ctx.stroke()
      if (whole || limit <= 12) {
        ctx.fillStyle = '#604579'
        ctx.textAlign = 'center'
        ctx.font = whole ? 'bold 17px system-ui' : '13px system-ui'
        ctx.fillText(whole ? String(position / challenge.tickDenominator) : `${position}/${challenge.tickDenominator}`, x, 265)
      }
      if (position === 0 || position === limit || answer.landings.includes(position)) {
        ctx.beginPath()
        ctx.ellipse(x, 217, 24, 8, -0.08, 0.15, TAU - 0.15)
        ctx.lineTo(x, 217)
        ctx.closePath()
        ctx.fillStyle = '#6dbd9b'
        ctx.fill()
      }
    }
    const aimedX = positionX(answer.position)
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(aimedX, 124)
    ctx.lineTo(aimedX, 222)
    ctx.strokeStyle = '#eaa153'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])
    roundedRect(ctx, Math.max(28, Math.min(602, aimedX - 45)), 86, 90, 34, 13, '#fff5da', '#f0ba67')
    ctx.fillStyle = '#7d4d22'
    ctx.textAlign = 'center'
    ctx.font = 'bold 17px system-ui'
    ctx.fillText(fractionLabel({ numerator: answer.position, denominator: challenge.tickDenominator }), Math.max(73, Math.min(647, aimedX)), 109)
    frog(ctx, positionX(answer.landings.at(-1) ?? 0), 183, api.solved)
    answer.landings.forEach((position, index) => {
      roundedRect(ctx, positionX(position) - 10, 278, 20, 24, 7, '#805aa3')
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 13px system-ui'
      ctx.fillText(String(index + 1), positionX(position), 295)
    })
  }, { height: 340, label: 'A frog beside a fraction number line. Aim using left and right, then jump. The orange guide marks your aim and purple numbers show recorded landings.' })
  const controls = document.createElement('div')
  controls.className = 'game-controls'
  controls.style.flexDirection = 'column'
  controls.style.alignItems = 'stretch'
  const hint = document.createElement('p')
  hint.className = 'game-hint'
  hint.textContent = 'Tap the line to aim, or use ← and →. Press Jump (Space or Enter) to land. Then check your answer.'
  const row = document.createElement('div')
  row.className = 'game-row'
  row.setAttribute('role', 'group')
  row.setAttribute('aria-label', 'Frog jump controls')
  const button = (text, label, action) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'game-button'
    element.textContent = text
    element.setAttribute('aria-label', label)
    element.addEventListener('click', action)
    row.append(element)
    return element
  }
  const move = delta => {
    const limit = api.challenge.tickDenominator * api.challenge.maxWhole
    api.setAnswer({ ...api.answer, position: Math.max(0, Math.min(limit, api.answer.position + delta)) })
  }
  const jump = () => {
    if (api.solved || api.challenge.mode === 'order' && api.answer.landings.length >= api.challenge.expectedPositions.length) return
    api.setAnswer({ ...api.answer, landings: api.challenge.mode === 'order' ? [...api.answer.landings, api.answer.position] : [api.answer.position] })
  }
  const left = button('← Left', 'Aim one step left', () => move(-1))
  const jumpButton = button('Jump', 'Jump to the aimed fraction', jump)
  const right = button('Right →', 'Aim one step right', () => move(1))
  const undo = button('Undo jump', 'Undo the last recorded jump', () => api.setAnswer({ ...api.answer, landings: api.answer.landings.slice(0, -1) }))
  const reset = button('Start again', 'Clear all jumps and return to zero', () => api.setAnswer(initialAnswer()))
  const summary = document.createElement('p')
  summary.className = 'game-stat'
  summary.setAttribute('aria-live', 'polite')
  controls.append(hint, row, summary)
  host.append(controls)
  canvasView.canvas.tabIndex = 0
  canvasView.canvas.style.touchAction = 'pan-y'
  const onPointer = event => {
    const point = canvasView.point(event)
    if (point.y < 75 || point.y > 275) return
    const limit = api.challenge.tickDenominator * api.challenge.maxWhole
    const position = Math.max(0, Math.min(limit, Math.round((point.x - 60) / 600 * limit)))
    api.setAnswer({ ...api.answer, position })
  }
  const onKey = event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      move(event.key === 'ArrowLeft' ? -1 : 1)
    } else if ((event.key === ' ' || event.key === 'Enter') && event.target === canvasView.canvas) {
      event.preventDefault()
      jump()
    }
  }
  canvasView.canvas.addEventListener('pointerup', onPointer)
  host.addEventListener('keydown', onKey)
  function update() {
    const { challenge, answer, solved } = api
    left.disabled = solved || answer.position === 0
    right.disabled = solved || answer.position === challenge.tickDenominator * challenge.maxWhole
    jumpButton.disabled = solved || challenge.mode === 'order' && answer.landings.length === challenge.expectedPositions.length
    undo.disabled = solved || answer.landings.length === 0
    reset.disabled = solved || answer.landings.length === 0 && answer.position === 0
    const landings = answer.landings.map(position => fractionLabel({ numerator: position, denominator: challenge.tickDenominator })).join(' → ')
    summary.textContent = `Aim: ${fractionLabel({ numerator: answer.position, denominator: challenge.tickDenominator })}. ${landings ? `Landed: ${landings}.` : 'No jumps recorded.'} ${challenge.mode === 'order' ? `${answer.landings.length} of 3 jumps.` : ''}`
    canvasView.canvas.setAttribute('aria-label', `Fraction number line. ${summary.textContent} Use arrow keys to aim and Space to jump.`)
    canvasView.redraw()
  }
  update()
  return { update, destroy() { canvasView.canvas.removeEventListener('pointerup', onPointer); host.removeEventListener('keydown', onKey); canvasView.destroy(); board.remove(); controls.remove() } }
}

const game = { id: 'fractions-number-line-jump', title: 'Fraction Frog', subtitle: 'Hop between fractions, compare and put them in order.', generateLevel, initialAnswer, checkAnswer, solution, explain, hint: explain, createBoard }
export default game
