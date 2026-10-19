// @vitest-environment jsdom
// Regression tests for the "dial keeps stepping after one click" bug (live on /simulations/ratio-u and the other concept-family sims).
// Root cause: bindDials started a setInterval on pointerdown and cleared it only from listeners on the pressed BUTTON, but the first step
// re-rendered the stage (innerHTML), destroying that button before release, so nothing ever cleared the interval.
// These tests use the REAL shell and REAL family games with synthetic state, advance fake time, and assert actual value changes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, bindDials, dial, HOLD_DELAY, HOLD_REPEAT } from '../../public/simulations/families/shell'
import * as ratio from '../../public/simulations/families/ratio/game'
import * as differentiation from '../../public/simulations/families/differentiation/game'
import * as forces from '../../public/simulations/families/forces/game'
import { variants as ratioVariants } from '../../public/simulations/families/ratio/variants'
import { variants as differentiationVariants } from '../../public/simulations/families/differentiation/variants'
import { variants as forcesVariants } from '../../public/simulations/families/forces/variants'

import g0 from '../../public/simulations/games/linear-plant-tracker.js'
import g1 from '../../public/simulations/games/linear-ramp-rescue.js'
import g2 from '../../public/simulations/games/linear-best-fit.js'
import g3 from '../../public/simulations/games/linear-sensor-calibration.js'
import g4 from '../../public/simulations/games/linear-systems-crossing.js'

const FAMILIES = [['ratio', ratio, ratioVariants], ['differentiation', differentiation, differentiationVariants], ['forces', forces, forcesVariants]]
const ALL = FAMILIES.flatMap(([name, family, variants]) => variants.map(v => ({ name, family, variant: v })))

function fire(target, type, init = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: init.button ?? 0 })
  for (const [k, v] of Object.entries({ pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init })) Object.defineProperty(event, k, { value: v })
  target.dispatchEvent(event); return event
}
const key = (target, k, extra = {}) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }); target.dispatchEvent(e); return e }
const apps = []
function open({ family, variant }, seed = 7) {
  const app = document.createElement('div'); document.body.append(app); apps.push(app); mount(app, variant, family, seed); return app
}
const values = app => [...app.querySelectorAll('[data-dial] .dv')].map(o => o.textContent)
const button = (app, label) => [...app.querySelectorAll('.db')].find(b => b.getAttribute('aria-label') === label)
const firstEnabled = app => app.querySelector('.db[data-d="1"]')

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { apps.splice(0).forEach(a => a.remove()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('the live bug: one click on ratio-u "Increase Exponent n" must be one step', () => {
  const u = () => ALL.find(x => x.variant.id === 'ratio-u')
  it('a normal click changes the value once and it stays put, with no timer left running', () => {
    const app = open(u()); const before = values(app)
    const inc = button(app, 'Increase Exponent n'); expect(inc).toBeTruthy()
    fire(inc, 'pointerdown'); vi.advanceTimersByTime(40)
    expect(inc.isConnected).toBe(false)                       // the first step re-rendered the stage and destroyed the pressed button
    fire(document.body, 'pointerup')                         // release lands on whatever is under the pointer
    const afterClick = values(app); expect(afterClick).not.toEqual(before)
    vi.advanceTimersByTime(10_000)                           // the live page ran n from 1.1 to its maximum in 10 s with no further input
    expect(values(app)).toEqual(afterClick); expect(vi.getTimerCount()).toBe(0)
  })
  it('the delta of that single click is exactly one dial step', () => {
    const app = open(u()); const dialEl = [...app.querySelectorAll('[data-dial]')].find(d => d.querySelector('.dl').textContent === 'Exponent n')
    const read = () => parseFloat(dialEl.querySelector('.dv').textContent.replace(/[^0-9.\-]/g, '')) ; const start = read(), step = Number(dialEl.dataset.step)
    fire(button(app, 'Increase Exponent n'), 'pointerdown'); fire(window, 'pointerup'); vi.advanceTimersByTime(5000)
    expect(parseFloat([...app.querySelectorAll('[data-dial]')].find(d => d.querySelector('.dl').textContent === 'Exponent n').querySelector('.dv').textContent.replace(/[^0-9.\-]/g, '')) - start).toBeCloseTo(step, 6)
  })
  it('ten separate clicks make exactly ten steps, never an accelerating cascade', () => {
    const app = open(u()); const dialEl = () => [...app.querySelectorAll('[data-dial]')].find(d => d.querySelector('.dl').textContent === 'Exponent n')
    const read = () => parseFloat(dialEl().querySelector('.dv').textContent.replace(/[^0-9.\-]/g, '')), step = Number(dialEl().dataset.step), start = read()
    for (let i = 0; i < 10; i++) { fire(button(app, 'Increase Exponent n'), 'pointerdown'); vi.advanceTimersByTime(60); fire(window, 'pointerup'); vi.advanceTimersByTime(300) }
    vi.advanceTimersByTime(5000); expect(read() - start).toBeCloseTo(10 * step, 6); expect(vi.getTimerCount()).toBe(0)
  })
})

describe('deliberate press-and-hold is preserved, but only while actually held', () => {
  it('repeats while held (after the hold delay) and stops on release anywhere', () => {
    const calls = []; const root = document.createElement('div'); document.body.append(root); apps.push(root)
    root.innerHTML = dial('n', 'N', 1, '', 0.5); bindDials(root, (k, d) => calls.push([k, d]))
    fire(root.querySelector('.db[data-d="1"]'), 'pointerdown'); expect(calls).toHaveLength(1)
    vi.advanceTimersByTime(HOLD_DELAY - 1); expect(calls).toHaveLength(1)                       // a slow tap is still one step
    vi.advanceTimersByTime(1 + HOLD_REPEAT * 3); expect(calls).toHaveLength(1 + 3)               // then one step per repeat while held
    fire(document.body, 'pointerup'); vi.advanceTimersByTime(5000); expect(calls).toHaveLength(4); expect(vi.getTimerCount()).toBe(0)
    expect(new Set(calls.map(c => c.join())).size).toBe(1); expect(calls[0]).toEqual(['n', 0.5])
  })
  it('a hold keeps repeating even though every step replaces the pressed button', () => {
    const app = open(ALL.find(x => x.variant.id === 'ratio-u')); const seen = [values(app)[0]]
    fire(button(app, 'Increase Exponent n'), 'pointerdown'); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT * 2 + 5)
    const held = values(app)[0]; expect(held).not.toEqual(seen[0]); fire(window, 'pointerup'); vi.advanceTimersByTime(4000); expect(values(app)[0]).toBe(held)
  })
})

describe('every way a press can end stops the repeat', () => {
  const rig = () => { const calls = []; const root = document.createElement('div'); document.body.append(root); apps.push(root); root.innerHTML = dial('n', 'N', 1, '', 1); bindDials(root, (k, d) => calls.push(d)); return { root, calls, btn: () => root.querySelector('.db[data-d="1"]') } }
  const held = (r, ms = HOLD_DELAY + HOLD_REPEAT) => { fire(r.btn(), 'pointerdown'); vi.advanceTimersByTime(ms); expect(r.calls.length).toBeGreaterThan(1) }
  it.each([['pointerup on the window', () => fire(window, 'pointerup')], ['pointerup on the document body', () => fire(document.body, 'pointerup')], ['pointercancel', () => fire(document.body, 'pointercancel')], ['window blur', () => window.dispatchEvent(new Event('blur'))],
    ['page hide', () => window.dispatchEvent(new Event('pagehide'))], ['context menu', () => window.dispatchEvent(new Event('contextmenu'))]])('%s', (_n, end) => {
    const r = rig(); held(r); const n = r.calls.length; end(); vi.advanceTimersByTime(5000); expect(r.calls).toHaveLength(n); expect(vi.getTimerCount()).toBe(0)
  })
  it('page hidden (visibilitychange)', () => {
    const r = rig(); held(r); const n = r.calls.length; Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5000); expect(r.calls).toHaveLength(n); expect(vi.getTimerCount()).toBe(0); delete document.hidden
  })
  it('removing the stage from the page (navigation, remount) stops it', () => {
    const r = rig(); held(r); const n = r.calls.length; r.root.remove(); vi.advanceTimersByTime(5000); expect(r.calls.length).toBeLessThanOrEqual(n + 1); vi.advanceTimersByTime(5000); expect(vi.getTimerCount()).toBe(0)
  })
  it('a different pointer releasing does not end this hold, but the pressing pointer does', () => {
    const r = rig(); fire(r.btn(), 'pointerdown', { pointerId: 5 }); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT); const n = r.calls.length; fire(window, 'pointerup', { pointerId: 9 }); vi.advanceTimersByTime(HOLD_REPEAT * 2); expect(r.calls.length).toBeGreaterThan(n)
    fire(window, 'pointerup', { pointerId: 5 }); const m = r.calls.length; vi.advanceTimersByTime(5000); expect(r.calls).toHaveLength(m)
  })
  it('a release before the hold delay is a single step (a tap)', () => { const r = rig(); fire(r.btn(), 'pointerdown'); vi.advanceTimersByTime(HOLD_DELAY - 50); fire(window, 'pointerup'); vi.advanceTimersByTime(5000); expect(r.calls).toHaveLength(1) })
})

describe('input kinds', () => {
  const rig = () => { const calls = []; const root = document.createElement('div'); document.body.append(root); apps.push(root); root.innerHTML = dial('n', 'N', 1, '', 1); bindDials(root, (k, d) => calls.push(d)); return { root, calls, inc: root.querySelector('.db[data-d="1"]'), dec: root.querySelector('.db[data-d="-1"]') } }
  it('touch: one tap is one step, with no duplicate from compatibility mouse events', () => {
    const r = rig(); fire(r.inc, 'pointerdown', { pointerType: 'touch', pointerId: 3 }); vi.advanceTimersByTime(80); fire(window, 'pointerup', { pointerType: 'touch', pointerId: 3 }); fire(r.inc, 'mousedown'); fire(r.inc, 'mouseup'); fire(r.inc, 'click')
    vi.advanceTimersByTime(5000); expect(r.calls).toEqual([1])
  })
  it('only the primary pointer and the main mouse button start a step', () => {
    const r = rig(); fire(r.inc, 'pointerdown', { button: 2 }); fire(r.inc, 'pointerdown', { isPrimary: false, pointerType: 'touch', pointerId: 4 }); vi.advanceTimersByTime(2000); expect(r.calls).toEqual([]); expect(vi.getTimerCount()).toBe(0)
  })
  it('keyboard: Enter and Space are one step each, no timer, other keys ignored, key repeat follows the key', () => {
    const r = rig(); key(r.inc, 'Enter'); key(r.dec, ' '); key(r.inc, 'a'); key(r.inc, 'Enter', { repeat: true }); vi.advanceTimersByTime(5000); expect(r.calls).toEqual([1, -1, 1]); expect(vi.getTimerCount()).toBe(0)
  })
  it('decrement and increment use their own signed steps (not the last pressed)', () => { const r = rig(); fire(r.dec, 'pointerdown'); fire(window, 'pointerup'); fire(r.inc, 'pointerdown'); fire(window, 'pointerup'); expect(r.calls).toEqual([-1, 1]) })
})

describe('no leaked listeners or timers across renders, remounts and visits', () => {
  it('re-binding the same stage (every paint does) never adds a second handler', () => {
    const calls = []; const root = document.createElement('div'); document.body.append(root); apps.push(root); root.innerHTML = dial('n', 'N', 1, '', 1)
    for (let i = 0; i < 25; i++) bindDials(root, (k, d) => calls.push(i)); fire(root.querySelector('.db[data-d="1"]'), 'pointerdown'); fire(window, 'pointerup')
    expect(calls).toEqual([24])                                    // one step, delivered to the newest handler
  })
  it('window listeners exist only while a press is active and are all removed afterwards', () => {
    const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener')
    const root = document.createElement('div'); document.body.append(root); apps.push(root); root.innerHTML = dial('n', 'N', 1, '', 1); bindDials(root, () => {})
    expect(add).not.toHaveBeenCalled()
    for (let i = 0; i < 12; i++) { fire(root.querySelector('.db[data-d="1"]'), 'pointerdown'); fire(window, 'pointerup') }
    expect(add.mock.calls.length).toBe(remove.mock.calls.length); expect(add.mock.calls.length).toBeGreaterThan(0)
    const left = {}; for (const [t] of add.mock.calls) left[t] = (left[t] || 0) + 1; for (const [t] of remove.mock.calls) left[t] -= 1; expect(Object.values(left).every(n => n === 0)).toBe(true)
  })
  it('unbind removes everything, and several visits (mount, use, remove) leave no timers', () => {
    for (let visit = 0; visit < 6; visit++) {
      const app = open(ALL.find(x => x.variant.id === 'ratio-u'), visit + 1)
      fire(button(app, 'Increase Exponent n'), 'pointerdown'); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT)       // user navigates away while still holding
      app.remove()
    }
    vi.advanceTimersByTime(10_000); expect(vi.getTimerCount()).toBe(0)
  })
  it('unbind() stops a live hold and removes the stage handlers', () => {
    const calls = []; const root = document.createElement('div'); document.body.append(root); apps.push(root); root.innerHTML = dial('n', 'N', 1, '', 1)
    const unbind = bindDials(root, (k, d) => calls.push(d)); fire(root.querySelector('.db[data-d="1"]'), 'pointerdown'); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT); unbind(); const n = calls.length
    vi.advanceTimersByTime(5000); fire(root.querySelector('.db[data-d="1"]'), 'pointerdown'); expect(calls).toHaveLength(n); expect(vi.getTimerCount()).toBe(0)
  })
})

describe.each(FAMILIES.map(([name, family, variants]) => [name, family, variants]))('every %s level: one click is one step', (_name, family, variants) => {
  it.each(variants.map(v => [v.id, v]))('%s', (_id, variant) => {
    const app = open({ family, variant }, 11); const dials = [...app.querySelectorAll('[data-dial]')]
    if (!dials.length) return                                                          // rounds without dials have nothing to test
    let moved = 0
    for (const sign of ['1', '-1']) {
      const before = values(app); const btn = app.querySelector(`.db[data-d="${sign}"]`); fire(btn, 'pointerdown'); vi.advanceTimersByTime(30); fire(document.body, 'pointerup')
      const after = values(app); if (after.join() !== before.join()) moved++
      vi.advanceTimersByTime(8000); expect(values(app)).toEqual(after); expect(vi.getTimerCount()).toBe(0)
    }
    expect(moved).toBeGreaterThan(0)
  })
})

describe('the repaired helper is what the sims actually call', () => {
  it('ratio, differentiation and forces all route their dials through bindDials from shell.js', async () => {
    const fs = await import('node:fs'), path = await import('node:path')
    for (const f of ['ratio', 'differentiation', 'forces']) expect(fs.readFileSync(path.join(__dirname, `../../public/simulations/families/${f}/game.js`), 'utf8')).toMatch(/import \{[^}]*bindDials[^}]*\} from '\.\.\/shell\.js'/)
  })
})

// AUDIT of the separate dial implementation (games/families/adapter.js, the five linear-graph sims). It keeps its buttons between updates and ends
// presses from window listeners, so it is NOT affected by the bug; these tests pin that so a future refactor cannot regress it.
describe.each([g0, g1, g2, g3, g4].map(g => [g.id, g]))('linear-graph board %s (separate adapter dial): not affected, kept that way', (_id, game) => {
  it('one click is one step; a hold repeats and stops on release; nothing is left running', () => {
    const challenge = game.generateLevel(3, 1), host = document.createElement('div'); document.body.append(host); apps.push(host)
    const api = { challenge, answer: game.initialAnswer(challenge), solved: false, setAnswer(a) { api.answer = a; board.update() } }
    const board = game.createBoard(host, api); board.update()
    const candidates = [...host.querySelectorAll('.fam-dial .fam-db[data-d]:not([disabled])')]
    const probe = b => { const k = b.closest('.fam-dial').dataset.key, v = api.answer[k]; fire(b, 'pointerdown'); fire(window, 'pointerup'); const moved = api.answer[k] !== v; api.setAnswer({ ...api.answer, [k]: v }); return moved }
    const btn = candidates.find(probe); expect(btn).toBeTruthy()                                        // a button that can move from the starting answer
    const key = btn.closest('.fam-dial').dataset.key, d = Number(btn.dataset.d), before = api.answer[key]
    vi.clearAllTimers()
    fire(btn, 'pointerdown'); vi.advanceTimersByTime(40); fire(window, 'pointerup'); const once = api.answer[key]; expect(once).not.toBe(before)
    vi.advanceTimersByTime(5000); expect(api.answer[key]).toBe(once); expect(vi.getTimerCount()).toBe(0)
    fire(btn, 'pointerdown'); vi.advanceTimersByTime(500); const mid = api.answer[key]; expect(mid).not.toBe(once); fire(window, 'pointerup'); vi.advanceTimersByTime(5000); expect(api.answer[key]).toBe(mid); expect(vi.getTimerCount()).toBe(0)
    board.destroy(); expect(Math.sign(once - before)).toBe(Math.sign(d))
  })
})
