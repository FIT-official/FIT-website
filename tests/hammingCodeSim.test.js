import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import vm from 'vm'
import { JSDOM } from 'jsdom'
import { vetHtmlSim } from '../lib/sims/vetHtmlSim'
import { htmlSims } from '../content/sims/htmlSims'

const html = readFileSync('content/sims/html/hamming-code-jc.html', 'utf8')
const script = html.match(/<script>([\s\S]*)<\/script>/)[1]
const sandbox = { window: {} }
vm.runInNewContext(script, sandbox)
const H = sandbox.window.Hamming74
const bits = n => [3, 2, 1, 0].map(i => (n >> i) & 1)

describe('Hamming(7,4) maths', () => {
  it('no error: every payload has syndrome 0 and decodes unchanged', () => {
    for (let n = 0; n < 16; n++) {
      const c = H.encode(bits(n))
      expect(c).toHaveLength(7)
      expect(H.syndrome(c)).toBe(0)
      expect(H.checks(c)).toEqual([0, 0, 0])
      expect(H.extract(H.correct(c).word)).toEqual(bits(n))
    }
  })
  it('exhaustive: 16 payloads x 7 single-bit errors give syndrome = position and full recovery', () => {
    let cases = 0
    for (let n = 0; n < 16; n++) for (let pos = 1; pos <= 7; pos++) {
      const c = H.encode(bits(n)); c[pos - 1] ^= 1
      const r = H.correct(c)
      expect(r.syndrome).toBe(pos)
      expect(r.word).toEqual(H.encode(bits(n)))
      expect(H.extract(r.word)).toEqual(bits(n))
      cases++
    }
    expect(cases).toBe(112)
  })
  it('limitation: double errors are never recovered to the sent codeword', () => {
    let wrong = 0
    for (let n = 0; n < 16; n++) for (let a = 1; a <= 7; a++) for (let b = a + 1; b <= 7; b++) {
      const c = H.encode(bits(n)); c[a - 1] ^= 1; c[b - 1] ^= 1
      const r = H.correct(c)
      expect(r.word).not.toEqual(H.encode(bits(n)))
      if (H.extract(r.word).join('') !== bits(n).join('')) wrong++
    }
    expect(wrong).toBeGreaterThan(0)
  })
})

describe('Hamming sim page', () => {
  it('passes the HTML sim vetting and is registered live with metadata', () => {
    expect(vetHtmlSim(html)).toMatchObject({ ok: true, block: [] })
    const e = htmlSims.find(s => s.id === 'hamming-code-jc')
    expect(e).toMatchObject({ status: 'live', level: 'JC', subject: 'Computing' })
    expect(e.approach && e.activityPrompt && e.height).toBeTruthy()
    expect(new Set(htmlSims.map(s => s.id)).size).toBe(htmlSims.length)
  })
  it('single clicks flip/clear bits once, keyboard works, no timers, phone width rule', () => {
    expect(html).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/)
    expect(html).toMatch(/@media \(max-width:420px\)/)
    expect(html).toMatch(/min-width:44px;min-height:44px/)
    const dom = new JSDOM(html, { runScripts: 'dangerously' })
    const d = dom.window.document
    const word = () => [...d.querySelectorAll('#word button')]
    expect(word()).toHaveLength(7)
    word()[4].click()
    expect(d.getElementById('status').textContent).toMatch(/position 5 corrected/)
    word()[4].click() // toggle back: repeated click does not accumulate
    expect(d.getElementById('status').textContent).toMatch(/No error/)
    word()[0].click(); word()[1].click()
    expect(d.getElementById('status').textContent).toMatch(/WRONG/)
    d.getElementById('reset').click()
    expect(d.getElementById('status').textContent).toMatch(/No error/)
    expect(d.querySelectorAll('#word button')).toHaveLength(7)
    expect([...d.querySelectorAll('button')].every(b => b.type === 'button' && b.getAttribute('aria-label') || b.id === 'reset')).toBe(true)
    // held-key auto-repeat is ignored (one toggle per key press)
    const before = d.getElementById('status').textContent
    word()[3].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true }))
    expect(d.getElementById('status').textContent).toBe(before)
    expect(html).toMatch(/e.repeat/)
    // native buttons => keyboard activation is the browser default; focus is retained on flip
    word()[2].click()
    expect(d.activeElement).toBe(word()[2])
  })
})
