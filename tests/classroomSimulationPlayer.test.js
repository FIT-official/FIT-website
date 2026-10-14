import { beforeEach, describe, expect, it, vi } from 'vitest'

async function open(id) {
  document.body.innerHTML = '<div id="app"></div>'
  document.body.dataset.activity = id
  document.body.className = ''
  await import('../public/simulations/lab.js')
}
const input = (id, value) => {
  const el = document.getElementById(id)
  if (el.type === 'checkbox') el.checked = value; else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

describe('Native activity controls and data equivalents', () => {
  it('starts with source concealed, reveals exact agreement, clamps numbers and resets', async () => {
    await open('sampling')
    expect(document.querySelectorAll('circle')).toHaveLength(21)
    expect(document.querySelector('svg path')).toBeNull()
    const folds = [...document.querySelectorAll('[data-key="revealFold"]')][0]
    folds.checked = true; folds.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.querySelectorAll('svg path')).toHaveLength(1)
    expect(document.querySelector('#metrics').textContent).toContain('−3'.replace('−', '-'))
    input('frequency-number', 99)
    expect(document.getElementById('frequency').value).toBe('12')
    document.getElementById('reset').click()
    expect(document.getElementById('frequency').value).toBe('7')
    expect(document.querySelector('svg path')).toBeNull()
    expect(document.querySelectorAll('tbody tr')).toHaveLength(21)
  })
  it('displays undefined inspection evidence and reproduces a sampled seed', async () => {
    await open('base-rates')
    expect(document.getElementById('metrics').textContent).toContain('16.10%')
    input('prevalence', 0); input('specificity', 100)
    expect(document.getElementById('metrics').textContent).toContain('Undefined')
    document.getElementById('reset').click()
    input('mode', 'Sample')
    const counts = document.querySelector('tbody').textContent
    input('mode', 'Expected'); input('mode', 'Sample')
    expect(document.querySelector('tbody').textContent).toBe(counts)
  })
  it('runs only one playback loop, stops on reset, and advances a thermal forecast', async () => {
    await open('feedback')
    document.getElementById('play').click()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    document.getElementById('play').click()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    document.getElementById('step').click()
    expect(document.getElementById('metrics').textContent).toContain('1 s')
    document.getElementById('finish').click()
    expect(document.getElementById('metrics').textContent).toContain('300 s')
    document.getElementById('reset').click()
    expect(document.getElementById('play').textContent).toBe('Run')
    expect(document.getElementById('metrics').textContent).toContain('20.0 °C')
  })
  it('supports roving keyboard heat cells, painting and insulated conservation', async () => {
    await open('heat-path')
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(192)
    const cell = document.querySelector('[data-cell="0"]'); cell.focus()
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(document.activeElement.dataset.cell).toBe('1')
    input('brush', '0'); document.querySelector('[data-cell="1"]').click()
    expect(document.querySelector('[data-cell="1"]')).toHaveClass('insulator')
    const boundary = document.querySelector('[data-key="fixedEdges"]')
    boundary.checked = false; boundary.dispatchEvent(new Event('input', { bubbles: true }))
    document.getElementById('finish').click()
    expect(document.getElementById('status').textContent).toContain('conserved')
    expect(document.getElementById('metrics').textContent).toContain('25.00 °C')
  })
  it('offers precise touch painting without tapping the small heat-grid cells', async () => {
    await open('heat-path')
    input('brush', '0'); input('selectedRow', '7'); input('selectedColumn', '13')
    document.getElementById('paint-selected').click()
    expect(document.querySelector('[data-cell="108"]')).toHaveClass('insulator')
    input('selectedColumn', '1'); document.getElementById('paint-selected').click()
    expect(document.querySelector('[data-cell="96"]')).not.toHaveClass('insulator')
    expect(document.getElementById('announcement').textContent).toContain('cannot be painted')
  })
})
