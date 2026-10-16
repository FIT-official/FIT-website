import { seededRandom, randomInt, createCanvas, roundedRect } from './shared.js'

const PALETTES = [
  [{ name: 'Rose', rgb: [244, 93, 136] }, { name: 'Ocean', rgb: [71, 151, 238] }],
  [{ name: 'Gold', rgb: [247, 188, 67] }, { name: 'Lagoon', rgb: [44, 177, 171] }],
  [{ name: 'Coral', rgb: [242, 120, 91] }, { name: 'Iris', rgb: [140, 111, 220] }],
]
const RATIOS = [[[1, 1], [1, 2]], [[1, 3], [3, 1]], [[2, 3], [3, 2]], [[1, 4], [4, 1]], [[3, 4], [4, 3]], [[2, 5], [5, 3]]]

export function generateLevel(seed, level = 1) {
  const stage = Math.max(1, Math.min(6, Number.isInteger(level) ? level : 1))
  const rng = seededRandom(`${seed}:paint:${stage}`)
  const ratio = [...RATIOS[stage - 1][randomInt(rng, 0, 1)]]
  const paints = PALETTES[randomInt(rng, 0, PALETTES.length - 1)].map(paint => ({ ...paint, rgb: [...paint.rgb] }))
  const multiplier = stage <= 2 ? 1 : randomInt(rng, 2, stage)
  const total = ratio.reduce((sum, amount) => sum + amount, 0) * multiplier
  return { level: stage, ratio, total, paints, prompt: `Mix ${total} drops using ${paints[0].name} : ${paints[1].name} = ${ratio.join(' : ')}.${multiplier > 1 ? ' Scale both amounts by the same factor.' : ' Match the target swatch.'}` }
}

export function initialAnswer() { return { counts: [0, 0] } }

export function solution(challenge) {
  const multiplier = challenge.total / (challenge.ratio[0] + challenge.ratio[1])
  return { counts: challenge.ratio.map(amount => amount * multiplier) }
}

export function checkAnswer(challenge, answer) {
  const counts = answer?.counts
  if (!Array.isArray(counts) || counts.length !== 2 || !Array.from(counts).every(value => Number.isInteger(value) && value >= 0)) return false
  return counts[0] + counts[1] === challenge.total && counts[0] * challenge.ratio[1] === counts[1] * challenge.ratio[0]
}

export function mixColour(paints, counts) {
  const total = counts.reduce((sum, amount) => sum + amount, 0)
  if (!total) return '#eef0f8'
  const rgb = [0, 1, 2].map(channel => Math.round(paints.reduce((sum, paint, index) => sum + paint.rgb[channel] * counts[index], 0) / total))
  return `rgb(${rgb.join(', ')})`
}

export function explain(challenge) {
  const parts = challenge.ratio[0] + challenge.ratio[1]
  const scale = challenge.total / parts
  return `Equivalent ratios multiply both amounts by the same number. ${challenge.total} ÷ ${parts} = ${scale}, so ${challenge.ratio.join(' : ')} becomes ${solution(challenge).counts.join(' : ')}. The swatch uses a weighted RGB average to illustrate proportions; real pigments do not mix this way.`
}

export function hint(challenge, answer) {
  const total = answer.counts[0] + answer.counts[1]
  if (total !== challenge.total) return `The recipe needs ${challenge.total} drops altogether; you have ${total}. Multiply both ratio parts by the same factor to make the whole batch.`
  return 'The batch size is right. Compare the amounts with the target ratio: both parts must be multiplied by the same factor. Remove and replace drops to adjust the colour.'
}

function drop(ctx, x, y, size, colour) {
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.bezierCurveTo(x + size * 1.4, y + size * 0.4, x + size * 0.8, y + size, x, y + size)
  ctx.bezierCurveTo(x - size * 0.8, y + size, x - size * 1.4, y + size * 0.4, x, y - size)
  ctx.fill()
  ctx.fillStyle = '#ffffff90'
  ctx.beginPath(); ctx.ellipse(x - size * 0.24, y + size * 0.2, size * 0.16, size * 0.32, 0.4, 0, Math.PI * 2); ctx.fill()
}

export function createBoard(host, api) {
  const controls = document.createElement('div')
  controls.className = 'game-controls'
  const labels = []
  const buttons = []
  const status = document.createElement('p')
  status.className = 'game-stat'
  status.setAttribute('aria-live', 'polite')
  const hint = document.createElement('p')
  hint.className = 'game-hint'
  hint.textContent = 'Use + and − to measure drops. A matching colour needs the same ratio; the recipe also needs the exact total. Colours illustrate a weighted RGB average, not physical pigment mixing.'

  function change(index, delta) {
    if (api.solved) return
    const counts = [...api.answer.counts]
    if (delta > 0 ? counts[0] + counts[1] >= api.challenge.total : counts[index] <= 0) return
    counts[index] += delta
    api.setAnswer({ counts })
  }

  function draw(ctx) {
    const { challenge, answer } = api
    const total = answer.counts[0] + answer.counts[1]
    const target = mixColour(challenge.paints, challenge.ratio)
    const current = mixColour(challenge.paints, answer.counts)
    const background = ctx.createLinearGradient(0, 0, 720, 330)
    background.addColorStop(0, '#fff6f3')
    background.addColorStop(1, '#edf4ff')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, 720, 330)
    ctx.fillStyle = '#ffffff9c'
    ctx.beginPath(); ctx.arc(420, 110, 110, 0, Math.PI * 2); ctx.fill()
    roundedRect(ctx, 25, 276, 670, 18, 8, '#ddcbbd')
    ctx.textAlign = 'center'
    challenge.paints.forEach((paint, index) => {
      const x = 88 + index * 139
      const colour = `rgb(${paint.rgb.join(', ')})`
      ctx.font = 'bold 17px system-ui, sans-serif'
      ctx.fillStyle = '#27364e'
      ctx.fillText(paint.name, x, 44)
      drop(ctx, x, 77, 16, colour)
      roundedRect(ctx, x - 48, 121, 96, 150, 13, '#fff', '#b5c0d6')
      const height = Math.max(8, answer.counts[index] / challenge.total * 125)
      roundedRect(ctx, x - 42, 264 - height, 84, height, 8, colour)
      roundedRect(ctx, x - 52, 111, 104, 16, 5, '#4d5774')
      ctx.strokeStyle = '#8997ae'
      ctx.lineWidth = 1
      for (let line = 0; line < 5; line += 1) {
        ctx.beginPath(); ctx.moveTo(x + 28, 144 + line * 23); ctx.lineTo(x + 43, 144 + line * 23); ctx.stroke()
      }
      roundedRect(ctx, x - 31, 174, 62, 43, 12, '#ffffffee')
      ctx.fillStyle = '#27364e'
      ctx.font = 'bold 24px system-ui, sans-serif'
      ctx.fillText(String(answer.counts[index]), x, 204)
    })
    ctx.fillStyle = '#27364e'
    ctx.font = 'bold 17px system-ui, sans-serif'
    ctx.fillText('Your mixture', 407, 44)
    ctx.save()
    ctx.translate(407, 189)
    ctx.rotate(-0.18)
    roundedRect(ctx, -10, -108, 20, 153, 7, '#c59c72', '#a87b53')
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(326, 165)
    ctx.quadraticCurveTo(335, 270, 407, 275)
    ctx.quadraticCurveTo(479, 270, 488, 165)
    ctx.closePath()
    ctx.fillStyle = current; ctx.fill()
    ctx.strokeStyle = '#a9b6cc'; ctx.lineWidth = 3; ctx.stroke()
    ctx.beginPath(); ctx.ellipse(407, 165, 81, 24, 0, 0, Math.PI * 2)
    ctx.fillStyle = current; ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(407, 165, 50, 12, 0, 0, Math.PI * 1.6)
    ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 3; ctx.stroke()
    ctx.font = 'bold 19px system-ui, sans-serif'
    roundedRect(ctx, 359, 217, 96, 32, 13, '#fffffff0')
    ctx.fillStyle = '#27364e'
    ctx.fillText(`${total} drops`, 407, 240)
    roundedRect(ctx, 530, 65, 162, 195, 16, '#fff', '#d4dced')
    roundedRect(ctx, 542, 77, 138, 118, 10, target)
    ctx.fillStyle = '#27364e'
    ctx.font = 'bold 17px system-ui, sans-serif'
    ctx.fillText('Target swatch', 611, 220)
    ctx.font = '15px system-ui, sans-serif'
    ctx.fillText(`${challenge.ratio.join(' : ')} · ${challenge.total} drops`, 611, 244)
    ctx.font = '14px system-ui, sans-serif'
    ctx.fillStyle = '#58667d'
    ctx.fillText(api.solved ? 'Perfect proportions. A colour worth keeping!' : 'Measure the parts. Build the colour.', 360, 318)
  }
  const surface = createCanvas(host, draw, { height: 330, label: 'Paint mixing station with two paint measures, your mixture and a target swatch. Measure paint with the buttons below.' })
  api.challenge.paints.forEach((paint, index) => {
    const row = document.createElement('div')
    row.className = 'game-row'
    const label = document.createElement('span')
    label.className = 'game-pill'
    labels.push(label)
    row.append(label)
    for (const delta of [-1, 1]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'game-button'
      button.textContent = delta < 0 ? '−' : '+'
      button.setAttribute('aria-label', `${delta < 0 ? 'Remove' : 'Add'} ${paint.name} drop`)
      button.addEventListener('click', () => change(index, delta))
      row.append(button)
      buttons.push({ button, index, delta })
    }
    controls.append(row)
  })
  host.append(controls, status, hint)
  function update() {
    const total = api.answer.counts[0] + api.answer.counts[1]
    labels.forEach((label, index) => { label.textContent = `${api.challenge.paints[index].name}: ${api.answer.counts[index]}` })
    buttons.forEach(({ button, index, delta }) => { button.disabled = api.solved || (delta < 0 ? api.answer.counts[index] === 0 : total >= api.challenge.total) })
    status.textContent = `Your amounts: ${api.answer.counts.join(' : ')} · ${total} / ${api.challenge.total} drops`
    surface.canvas.setAttribute('aria-label', `${api.challenge.paints.map((paint, index) => `${paint.name}: ${api.answer.counts[index]} drops`).join(', ')}. Target ratio ${api.challenge.ratio.join(' to ')}, total ${api.challenge.total} drops.`)
    surface.redraw()
  }
  update()
  return { update, destroy() { surface.destroy(); controls.remove(); status.remove(); hint.remove() } }
}

const game = { id: 'ratio-paint-mix', title: 'Paint Mix Studio', subtitle: 'Same proportions. A whole palette of possibilities.', generateLevel, initialAnswer, checkAnswer, solution, explain, hint, createBoard }
export default game
