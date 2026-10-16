// Adapts a FIT concept-family variant definition to the shared game contract
// (generateLevel / initialAnswer / checkAnswer / solution / explain / hint / createBoard).
// A definition is pure data + pure functions, so challenges are deterministic and comparable.
import { seededRandom } from '../shared.js'
import { plotSVG, esc, fmt } from './plot.js'

export const pick = (rng, list) => list[Math.floor(rng() * list.length)]
export const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
export const near = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol + 1e-9
export { fmt, esc }

const STYLE = '/simulations/games/families/families.css'
function ensureStyle() {
  if (typeof document === 'undefined' || document.querySelector(`link[href="${STYLE}"]`)) return
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = STYLE; document.head.append(link)
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const roundTo = (v, step) => +(Math.round(v / step) * step).toFixed(6)

export function makeGame(def) {
  const generateLevel = (seed, level) => ({ ...def.make(seededRandom(`${seed}|${def.id}|${level}`), level), level })
  const initialAnswer = challenge => ({ ...def.initial(challenge) })
  const valid = (challenge, answer) => !!answer && typeof answer === 'object' && def.controls(challenge).every(c => c.type === 'chips' ? c.options.some(o => o[0] === answer[c.key]) : Number.isFinite(answer[c.key]))
  const checkAnswer = (challenge, answer) => valid(challenge, answer) && def.check(challenge, answer) === true
  function createBoard(host, api) {
    ensureStyle()
    const wrap = document.createElement('div'); wrap.className = 'fam'
    wrap.innerHTML = '<div class="fam-scene"></div><div class="fam-controls"></div><div class="fam-figs"><div class="fam-plots"></div><div class="fam-figure"></div></div>'
    host.append(wrap)
    const controls = def.controls(api.challenge), box = wrap.querySelector('.fam-controls')
    let timer = null
    const stop = () => { clearInterval(timer); timer = null }
    const step = (c, dir, size) => {
      if (api.solved) return
      const v = roundTo(clamp(api.answer[c.key] + dir * size, c.min, c.max), c.step)
      if (v !== api.answer[c.key]) api.setAnswer({ ...api.answer, [c.key]: v })
    }
    for (const c of controls) {
      const row = document.createElement('div')
      if (c.type === 'chips') {
        row.className = 'fam-chips'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', c.label)
        row.innerHTML = `<span class="fam-dl">${esc(c.label)}</span>` + c.options.map(([v, l]) => `<button type="button" class="fam-chip" data-v="${esc(v)}">${esc(l)}</button>`).join('')
        row.querySelectorAll('button').forEach(b => { b.onclick = () => { if (!api.solved) api.setAnswer({ ...api.answer, [c.key]: b.dataset.v }) } })
      } else {
        row.className = 'fam-dial'
        const sizes = c.coarse ? [[-c.coarse, '−−'], [-c.step, '−'], [c.step, '+'], [c.coarse, '++']] : [[-c.step, '−'], [c.step, '+']]
        const btn = ([d, t]) => `<button type="button" class="fam-db" data-d="${d}" aria-label="${d < 0 ? 'Decrease' : 'Increase'} ${esc(c.label)} by ${Math.abs(d)}">${t}</button>`
        row.innerHTML = `<span class="fam-dl">${esc(c.label)}</span>${sizes.filter(s => s[0] < 0).map(btn).join('')}<output class="fam-dv" aria-live="polite"></output>${sizes.filter(s => s[0] > 0).map(btn).join('')}`
        row.querySelectorAll('button').forEach(b => {
          const d = Number(b.dataset.d)
          b.addEventListener('pointerdown', e => { e.preventDefault(); stop(); step(c, Math.sign(d), Math.abs(d)); timer = setInterval(() => step(c, Math.sign(d), Math.abs(d)), 150) })
          b.addEventListener('click', e => { if (e.detail === 0) step(c, Math.sign(d), Math.abs(d)) }) // keyboard activation
        })
      }
      row.dataset.key = c.key; box.append(row)
    }
    const end = () => stop()
    for (const t of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(t, end)
    function update() {
      const { challenge, answer } = api
      wrap.querySelector('.fam-scene').innerHTML = def.scene ? def.scene(challenge, answer) : ''
      for (const c of controls) {
        const row = box.querySelector(`[data-key="${c.key}"]`)
        if (c.type === 'chips') row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === answer[c.key])))
        else row.querySelector('output').innerHTML = `${esc(c.format ? c.format(answer[c.key]) : fmt(answer[c.key], 4))}<small>${esc(c.unit || '')}</small>`
        row.querySelectorAll('button').forEach(b => { b.disabled = api.solved })
      }
      wrap.querySelector('.fam-plots').innerHTML = def.plots(challenge, answer).map(p => plotSVG(p)).join('')
      wrap.querySelector('.fam-figure').innerHTML = def.figure ? def.figure(challenge, answer) : ''
      if (api.solved) stop()
    }
    return { update, destroy() { stop(); for (const t of ['pointerup', 'pointercancel', 'blur']) window.removeEventListener(t, end); wrap.remove() } }
  }
  return {
    id: def.id, title: def.title, subtitle: def.subtitle, eyebrow: def.eyebrow, meta: def.meta,
    generateLevel, initialAnswer, checkAnswer, createBoard,
    solution: challenge => def.solution(challenge),
    explain: (challenge, answer) => def.explain(challenge, answer),
    hint: (challenge, answer) => def.hint(challenge, answer),
  }
}

// Builds the catalog (games/catalog.js) and registry (content/sims/registry.js) entries for a definition.
export function catalogEntry(def) {
  const m = def.meta
  return { id: def.id, kind: 'game', title: def.title, shortTitle: def.short || def.title, category: m.subject, subjects: [m.subject], level: m.difficultyLabel, ages: m.ages, minutes: '10–15', accent: m.accent, symbol: m.symbol,
    question: m.question, description: def.subtitle, tags: m.tags, prediction: m.question, steps: m.steps, teacher: m.teacher, transfer: m.transfer, model: def.model }
}
export function registryEntry(def) {
  const m = def.meta
  return { id: def.id, title: def.title, level: m.level, subject: m.subject, topic: m.topic, syllabusRef: '', concept: m.concept, difficulty: m.difficulty, objective: m.objective, syllabusSource: m.syllabus,
    approach: def.subtitle, activityPrompt: m.objective, status: 'draft' }
}
