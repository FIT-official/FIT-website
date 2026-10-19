// @vitest-environment jsdom
// Embedded activities (the sims run inside a real <iframe>) and keyboard focus. Found with a real Chromium iframe proof (iframe-proof.mjs), pinned here.
// jsdom has no pointer capture, so these tests model the browser rule that matters: while an element holds the capture, that pointer's
// pointerup/pointercancel are delivered to IT, not to the (possibly detached) element the finger first touched. Without capture, a touch release is
// dispatched to the detached button and never reaches window listeners, so the hold runs forever (this is how a first version of the fix failed in an iframe).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, bindDials, dial, HOLD_DELAY, HOLD_REPEAT } from '../../public/simulations/families/shell'
import * as ratio from '../../public/simulations/families/ratio/game'
import * as differentiation from '../../public/simulations/families/differentiation/game'
import * as forces from '../../public/simulations/families/forces/game'
import { variants as ratioVariants } from '../../public/simulations/families/ratio/variants'
import { variants as differentiationVariants } from '../../public/simulations/families/differentiation/variants'
import { variants as forcesVariants } from '../../public/simulations/families/forces/variants'

const ALL = [['ratio', ratio, ratioVariants], ['differentiation', differentiation, differentiationVariants], ['forces', forces, forcesVariants]].flatMap(([, family, variants]) => variants.map(variant => ({ family, variant })))
const apps = []
const captures = new Map()
let saved

function fire(target, type, init = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: init.button ?? 0 })
  for (const [k, v] of Object.entries({ pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init })) Object.defineProperty(event, k, { value: v })
  target.dispatchEvent(event); return event
}
const key = (target, k) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
// Browser rule modelled: the capturing element receives that pointer's up/cancel/move wherever the finger or cursor actually is.
const press = (target, type, init = {}) => fire(captures.has(init.pointerId ?? 1) && ['pointerup', 'pointercancel', 'pointermove'].includes(type) ? captures.get(init.pointerId ?? 1) : target, type, init)
const lost = (el, id) => { const e = new Event('lostpointercapture', { bubbles: true }); Object.defineProperty(e, 'pointerId', { value: id }); el.dispatchEvent(e) }
function open({ family, variant }, seed = 7) { const app = document.createElement('div'); document.body.append(app); apps.push(app); mount(app, variant, family, seed); return app }
const values = app => [...app.querySelectorAll('[data-dial] .dv')].map(o => o.textContent)
const button = (app, label) => [...app.querySelectorAll('.db')].find(b => b.getAttribute('aria-label') === label)
const ratioU = () => ALL.find(x => x.variant.id === 'ratio-u')
// A stage that, like the real games, replaces all its buttons on every step.
function rig(render) {
  const calls = [], root = document.createElement('div'); document.body.append(root); apps.push(root); root.innerHTML = dial('n', 'N', 1, '', 1)
  const onStep = (k, d) => { calls.push(d); if (render) { root.innerHTML = dial('n', 'N', 1 + calls.length, '', 1); bindDials(root, onStep) } }
  bindDials(root, onStep)
  return { root, calls }
}

beforeEach(() => {
  vi.useFakeTimers(); captures.clear()
  saved = { set: Element.prototype.setPointerCapture, has: Element.prototype.hasPointerCapture, rel: Element.prototype.releasePointerCapture }
  Element.prototype.setPointerCapture = function (id) { captures.set(id, this) }
  Element.prototype.hasPointerCapture = function (id) { return captures.get(id) === this }
  Element.prototype.releasePointerCapture = function (id) { if (captures.get(id) === this) { captures.delete(id); lost(this, id) } }
})
afterEach(() => {
  for (const [name, v] of Object.entries({ setPointerCapture: saved.set, hasPointerCapture: saved.has, releasePointerCapture: saved.rel })) { if (v) Element.prototype[name] = v; else delete Element.prototype[name] }
  apps.splice(0).forEach(a => a.remove()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks()
})

describe('pointer capture on the stable stage', () => {
  it('captures the pointer on the stage (not the button) when a press starts, and lets go when it ends', () => {
    const { root } = rig(true), first = root.querySelector('.db[data-d="1"]'); press(first, 'pointerdown', { pointerId: 7, pointerType: 'touch' })
    expect(captures.get(7)).toBe(root); expect(first.isConnected).toBe(false)                        // the pressed button was replaced, the captured stage was not
    press(first, 'pointerup', { pointerId: 7, pointerType: 'touch' }); expect(captures.has(7)).toBe(false)
  })
  it('a touch release aimed at the DETACHED pressed button still ends the hold (delivered to the capturing stage)', () => {
    const { root, calls } = rig(true), first = root.querySelector('.db[data-d="1"]'); press(first, 'pointerdown', { pointerId: 3, pointerType: 'touch' })
    vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT * 2); expect(calls.length).toBeGreaterThan(2); const n = calls.length
    press(first, 'pointerup', { pointerId: 3, pointerType: 'touch' }); vi.advanceTimersByTime(8000); expect(calls).toHaveLength(n); expect(vi.getTimerCount()).toBe(0)
  })
  it('pointercancel (the browser takes the touch, or the finger leaves the iframe) ends it the same way', () => {
    const { root, calls } = rig(true), first = root.querySelector('.db[data-d="1"]'); press(first, 'pointerdown', { pointerId: 4, pointerType: 'touch' }); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT)
    const n = calls.length; press(first, 'pointercancel', { pointerId: 4, pointerType: 'touch' }); vi.advanceTimersByTime(8000); expect(calls).toHaveLength(n); expect(vi.getTimerCount()).toBe(0)
  })
  it('lostpointercapture for the pressing pointer ends the hold; for another pointer it does not', () => {
    const { root, calls } = rig(false); press(root.querySelector('.db[data-d="1"]'), 'pointerdown', { pointerId: 5 }); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT)
    lost(root, 99); vi.advanceTimersByTime(HOLD_REPEAT * 2); const n = calls.length; expect(vi.getTimerCount()).toBeGreaterThan(0)
    lost(root, 5); vi.advanceTimersByTime(8000); expect(calls).toHaveLength(n); expect(vi.getTimerCount()).toBe(0)
  })
  it('if the pointer cannot be captured the window listeners still end the press', () => {
    Element.prototype.setPointerCapture = () => { throw new DOMException('no', 'InvalidStateError') }
    const { root, calls } = rig(true), first = root.querySelector('.db[data-d="1"]'); fire(first, 'pointerdown', { pointerId: 8 }); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT); const n = calls.length
    fire(window, 'pointerup', { pointerId: 8 }); vi.advanceTimersByTime(8000); expect(calls).toHaveLength(n); expect(vi.getTimerCount()).toBe(0)
  })
  it('a normal tap and a normal hold behave as before with capture in play', () => {
    const { root, calls } = rig(true), tap = root.querySelector('.db[data-d="1"]'); press(tap, 'pointerdown', { pointerId: 2 }); vi.advanceTimersByTime(80); press(tap, 'pointerup', { pointerId: 2 }); vi.advanceTimersByTime(5000); expect(calls).toHaveLength(1)
    const again = root.querySelector('.db[data-d="1"]'); press(again, 'pointerdown', { pointerId: 2 }); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT * 3 + 1); expect(calls).toHaveLength(1 + 1 + 3)
    press(again, 'pointerup', { pointerId: 2 }); vi.advanceTimersByTime(5000); expect(calls).toHaveLength(5)
  })
  it('real family game: a touch hold on ratio-u released onto the detached button stops with nothing running afterwards', () => {
    const app = open(ratioU()), btn = button(app, 'Increase Exponent n'); press(btn, 'pointerdown', { pointerId: 6, pointerType: 'touch' }); vi.advanceTimersByTime(HOLD_DELAY + HOLD_REPEAT * 2)
    const held = values(app)[0]; press(btn, 'pointerup', { pointerId: 6, pointerType: 'touch' }); vi.advanceTimersByTime(10_000); expect(values(app)[0]).toBe(held); expect(vi.getTimerCount()).toBe(0)
  })
})

describe('keyboard focus survives the stage being replaced', () => {
  it('Enter, Enter, Space on the same dial keep stepping (focus returns to the equivalent new button)', () => {
    const app = open(ratioU()), inc = button(app, 'Increase Exponent n'); inc.focus(); expect(document.activeElement).toBe(inc)
    const read = () => values(app)[0], v0 = read(); key(document.activeElement, 'Enter'); const v1 = read(); expect(v1).not.toBe(v0)
    expect(document.activeElement.getAttribute('aria-label')).toBe('Increase Exponent n'); expect(document.activeElement.isConnected).toBe(true)
    key(document.activeElement, 'Enter'); const v2 = read(); key(document.activeElement, ' '); const v3 = read(); expect(new Set([v0, v1, v2, v3]).size).toBe(4); vi.advanceTimersByTime(5000); expect(read()).toBe(v3)      // keys never start a repeat
  })
  it('Decrease keeps focus too, and focus does not jump to another dial', () => {
    const app = open(ALL.find(x => x.variant.id === 'ratio-p')), dec = button(app, 'Decrease Blue cans'); dec.focus(); key(dec, 'Enter')
    expect(document.activeElement.getAttribute('aria-label')).toBe('Decrease Blue cans')
  })
  it('pointer presses do not steal keyboard focus', () => {
    const app = open(ALL.find(x => x.variant.id === 'ratio-p')), other = document.createElement('button'); document.body.append(other); apps.push(other); other.focus()
    fire(button(app, 'Increase Red cans'), 'pointerdown'); fire(window, 'pointerup'); expect(document.activeElement).toBe(other)
  })
  it.each(ALL.map(x => [x.variant.id, x]))('%s: keyboard Enter leaves focus on a connected dial button', (_id, x) => {
    const app = open(x, 5), btn = app.querySelector('.db[data-d="1"]'); if (!btn) return; btn.focus(); key(btn, 'Enter')
    expect(document.activeElement.isConnected).toBe(true); expect(document.activeElement.classList.contains('db')).toBe(true)
  })
})
