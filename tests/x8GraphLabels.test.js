import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const html = readFileSync('content/sims/html/x8-algorithms-u2.html', 'utf8')
// Exercise the shipped SVG renderer with each shipped graph, without changing
// the seed or exposing test hooks in the standalone activity.
const graphs = html.match(/const graphSets = ([\s\S]*?);\n  const traversalSets/)[1]
const positions = html.match(/const positions = ([\s\S]*?);\n\n  let round/)[1]
const start = html.indexOf('  function graphSvg()')
const renderer = html.slice(start, html.indexOf('\n  function ', start + 10))
const fixtures = vm.runInNewContext(`
  const graphSets = ${graphs}; const positions = ${positions};
  const state = { type: 'dijkstra', chosen: [] };
  ${renderer}
  graphSets.map(graph => { state.graph = graph; return { graph, svg: graphSvg() }; });
`)

describe('Paths and Genes edge costs', () => {
  it.each(fixtures.map((fixture, index) => [index + 1, fixture]))('keeps all costs legible in graph %i', (_, { graph, svg }) => {
    const stage = document.createElement('div')
    stage.innerHTML = svg
    const boxes = [...stage.querySelectorAll('rect')].map(rect => ({
      x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')),
      width: Number(rect.getAttribute('width')), height: Number(rect.getAttribute('height')),
      weight: rect.nextElementSibling.textContent.trim(),
    }))
    expect(boxes.map(box => Number(box.weight))).toEqual(Object.values(graph).flatMap(links => Object.values(links)))
    for (const [i, a] of boxes.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.y).toBeGreaterThanOrEqual(0)
      expect(a.x + a.width).toBeLessThanOrEqual(390)
      expect(a.y + a.height).toBeLessThanOrEqual(294)
      for (const b of boxes.slice(i + 1)) {
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        expect(overlap, `costs ${a.weight} and ${b.weight} overlap`).toBe(false)
      }
    }
  })
})
