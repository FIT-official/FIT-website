// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECTS, PROJECT_SLUGS, getProject, projectSummaries, todoItems } from '@/lib/researchProjects/content'
import { SOURCES } from '@/lib/researchProjects/content/sources'
import { parseRich, renderTex, plainTextOf } from '@/lib/researchProjects/richText'
import { SIMULATIONS, runSimulation, fspl } from '@/lib/researchProjects/sim'
import { ANSWER_KEYS, getKey } from '@/lib/researchProjects/answerKeys'
import { overlap2D } from '@/lib/researchProjects/sim/fpm'

const root = join(__dirname, '..', '..')
const EXPECTED = [
  'holobox-digital-holography', 'tinylev-acoustic-levitator', 'racecar-degraded-sensing-localisation',
  'range-doppler-radar-sar', 'prandtl-wing-twist-glider', 'cansat-telemetry-tracking-antenna', 'open-fourier-ptychographic-microscopy',
]

// Collect every student-visible string (skipping ids, file paths and urls).
function visibleStrings(project) {
  const out = []
  const skip = new Set(['tex', 'id', 'src', 'url', 'slug', 'simId', 'sourceIds', 'diagramId', 'type', 'kind', 'section', 'unit', 'status', 'publisher'])
  const walk = (value, key) => {
    if (typeof value === 'string') { if (!skip.has(key)) out.push({ key, value }) }
    else if (Array.isArray(value)) value.forEach(v => walk(v, key))
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k)
  }
  const { sources, rubric, todo, ...rest } = project
  walk(rest)
  walk(rubric.map(c => ({ label: c.label, levels: c.levels, focus: c.focus })))
  return out
}

describe('library structure', () => {
  it('has exactly the seven required projects with unique slugs and summaries', () => {
    expect([...PROJECT_SLUGS].sort()).toEqual([...EXPECTED].sort())
    expect(new Set(PROJECT_SLUGS).size).toBe(7)
    expect(projectSummaries()).toHaveLength(7)
    expect(getProject('nope')).toBeNull()
    expect(getProject(undefined)).toBeNull()
    expect(getProject('__proto__')).toBeNull()
  })

  for (const p of PROJECTS) {
    describe(p.slug, () => {
      it('has every required section with substantive content', () => {
        expect(p.researchQuestion.length).toBeGreaterThan(120)
        expect(p.prerequisites.length).toBeGreaterThanOrEqual(4)
        expect(p.concepts.length).toBeGreaterThanOrEqual(4)
        for (const c of p.concepts) {
          expect(c.equations.length).toBeGreaterThanOrEqual(1)
          expect(c.body.length).toBeGreaterThan(100)
        }
        expect(p.buildSteps.length).toBeGreaterThanOrEqual(6)
        expect(p.equipment.length).toBeGreaterThanOrEqual(6)
        expect(p.safety.items.length).toBeGreaterThanOrEqual(5)
        expect(p.milestones.length).toBeGreaterThanOrEqual(6)
        expect(p.tasks.filter(t => t.kind === 'simulation').length).toBeGreaterThanOrEqual(2)
        expect(p.tasks.filter(t => t.kind === 'experiment').length).toBeGreaterThanOrEqual(2)
        expect(p.dataset.columns.length).toBeGreaterThanOrEqual(7)
        expect(p.caveats.length).toBeGreaterThanOrEqual(3)
        expect(p.rubric).toHaveLength(6)
        for (const c of p.rubric) {
          expect(c.levels).toHaveLength(4)
          expect(c.focus).toBeTruthy()
        }
      })

      it('has the required question types: 2 MCQ, short, 2 calculation, derivation, explain, reflection', () => {
        const types = p.questions.map(q => q.type).sort()
        expect(types).toEqual(['calculation', 'calculation', 'derivation', 'explain', 'mcq', 'mcq', 'reflection', 'short'])
        expect(new Set(p.questions.map(q => q.id)).size).toBe(8)
        for (const q of p.questions.filter(q => q.type === 'mcq')) {
          expect(q.options).toHaveLength(4)
          expect(q.options.map(o => o.id)).toEqual(['a', 'b', 'c', 'd'])
          expect(new Set(q.options.map(o => o.text)).size).toBe(4)
        }
        const raw = JSON.stringify(p.questions)
        expect(raw).not.toMatch(/"correct"|"answer"|"key"|startsWith|tolerance/)
      })

      it('distinguishes the published build from the proposed investigation, and never claims FIT built it', () => {
        expect(p.published.label).toMatch(/^Published build/)
        expect(p.proposed.label).toMatch(/^Proposed student investigation/)
        expect(p.proposed.label).toMatch(/not a claim that FIT built this/)
        expect(p.published.text).toMatch(/FIT has not built|FIT adaptation|adaptation/)
        expect(p.published.sourceIds.length).toBeGreaterThan(0)
      })

      it('has unique to-do ids that cover equipment, safety, steps, milestones and tasks', () => {
        const ids = p.todo.map(t => t.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.length).toBe(p.equipment.length + p.safety.items.length + p.buildSteps.length + p.milestones.length + p.tasks.length)
        expect(todoItems(p)).toEqual(p.todo)
        expect(ids.filter(i => i.startsWith('sf:')).length).toBe(p.safety.items.length)
      })

      it('uses unique column ids and only columns that the simulation row can fill', () => {
        const cols = p.dataset.columns.map(c => c.id)
        expect(new Set(cols).size).toBe(cols.length)
        for (const c of p.dataset.columns) {
          expect(['input', 'output']).toContain(c.kind)
          expect(typeof c.unit).toBe('string')
        }
        const sim = SIMULATIONS[p.simId]
        expect(sim).toBeTruthy()
        const row = runSimulation(p.simId, {}).row
        for (const key of Object.keys(row)) expect(cols).toContain(key)
      })

      it('references only registered sources and credits them with links', () => {
        expect(p.sources.length).toBeGreaterThanOrEqual(2)
        for (const s of p.sources) {
          expect(SOURCES[s.id]).toBe(s)
          expect(s.url === null || /^https:\/\//.test(s.url)).toBe(true)
          expect(['read', 'reference', 'unavailable']).toContain(s.status)
        }
        const stepSources = p.buildSteps.flatMap(s => s.sourceIds)
        for (const id of [...stepSources, ...p.concepts.flatMap(c => c.sourceIds)]) expect(SOURCES[id]).toBeTruthy()
      })
    })
  }
})

describe('source honesty', () => {
  it('never claims to have read an unavailable or unopened reference', () => {
    for (const s of Object.values(SOURCES)) {
      if (s.status === 'reference') expect(s.note).toMatch(/not opened/)
      if (s.status === 'unavailable') expect(s.note).toMatch(/502|could not/)
    }
    expect(SOURCES.racecarSite.status).toBe('unavailable')
  })

  it('records the verified facts and licence limits from the source brief', () => {
    expect(SOURCES.ofpmLicense.note).toMatch(/MIT/)
    expect(SOURCES.ofpmLicense.note).toMatch(/CERN-OHL-S/)
    expect(SOURCES.ofpm.note).toMatch(/not peer-review evidence/)
    expect(SOURCES.tinylev.note).toMatch(/CC BY/)
    expect(SOURCES.tinylev.url).toMatch(/research-information\.bris\.ac\.uk/)
    expect(SOURCES.holobox.note).toMatch(/10 October 2026/)
    expect(SOURCES.amaPrandtl.note).toMatch(/all-rights-reserved/)
    expect(SOURCES.ocwRadar.note).toMatch(/not reproduced/)
    expect(SOURCES.esaContrailReport.note).toMatch(/auto-tracking antenna/)
    expect(SOURCES.racecarPaper.note).toMatch(/1\/10-scale/)
  })

  it('does not copy, price, stock or boast', () => {
    for (const p of PROJECTS) {
      const text = visibleStrings(p).flatMap(({ value }) => parseRich(value).filter(s => s.type === 'text').map(s => s.value)).join(' ')
      expect(text, p.slug).not.toMatch(/[£€]\s?\d|\bUSD\b|\bin stock\b|\bprice[ds]?\b|\bcheap(?:est)?\b|\bnovel(?:ty)?\b|world[- ]first|\bDSO\b/i)
    }
  })

  it('states the project-specific safety boundaries', () => {
    const text = id => JSON.stringify(getProject(id))
    expect(text('tinylev-acoustic-levitator')).toMatch(/inert beads/i)
    expect(text('tinylev-acoustic-levitator')).toMatch(/does not (establish|state) any safe ultrasound exposure|No safe ultrasound exposure/i)
    expect(text('range-doppler-radar-sar')).toMatch(/no weapons/i)
    expect(text('range-doppler-radar-sar')).toMatch(/compliant/i)
    expect(text('cansat-telemetry-tracking-antenna')).toMatch(/no launch/i)
    expect(text('open-fourier-ptychographic-microscopy')).toMatch(/mentor-led/i)
    expect(text('open-fourier-ptychographic-microscopy')).toMatch(/inert/i)
    expect(text('racecar-degraded-sensing-localisation')).toMatch(/low-speed/i)
    expect(text('prandtl-wing-twist-glider')).toMatch(/do not transfer/i)
    expect(text('holobox-digital-holography')).toMatch(/low[- ]power/i)
  })
})

describe('mathematics', () => {
  it('parses and renders every equation and inline formula with strict KaTeX', () => {
    let rendered = 0
    for (const p of PROJECTS) {
      for (const c of p.concepts) for (const eq of c.equations) {
        const html = renderTex(eq.tex, true, true)
        expect(html, p.slug + ' ' + eq.tex).toContain('katex-mathml')
        expect(html).toContain('katex-display')
        rendered++
      }
      for (const { value } of visibleStrings(p)) {
        for (const seg of parseRich(value)) {
          if (seg.type !== 'math') continue
          expect(renderTex(seg.value, seg.display, true), p.slug + ' ' + seg.value).toContain('katex-mathml')
          rendered++
        }
      }
    }
    expect(rendered).toBeGreaterThan(150)
  })

  it('leaves no raw TeX in the text a student reads', () => {
    for (const p of PROJECTS) {
      for (const { key, value } of visibleStrings(p)) {
        const text = parseRich(value).filter(s => s.type === 'text').map(s => s.value).join('')
        expect(text, p.slug + ' ' + key).not.toMatch(/\\[A-Za-z]+|[\^_]\{|\$/)
      }
      for (const c of p.concepts) for (const eq of c.equations) expect(eq.caption).not.toMatch(/\\[A-Za-z]+|\$/)
    }
  })

  it('parses escapes and rejects unbalanced dollars', () => {
    expect(parseRich('costs \\$5 and $x^2$')).toEqual([{ type: 'text', value: 'costs $5 and ' }, { type: 'math', value: 'x^2', display: false }])
    expect(parseRich('$$a=b$$')).toEqual([{ type: 'math', value: 'a=b', display: true }])
    expect(() => parseRich('broken $x')).toThrow(/Unbalanced/)
    expect(plainTextOf('speed $v$ in m/s')).toBe('speed [equation] in m/s')
    expect(() => renderTex('\\notacommand{x}')).toThrow()
  })
})

describe('diagrams', () => {
  const dir = join(root, 'public', 'research-projects', 'diagrams')
  it('ships one file per declared diagram, labelled as original diagrams with accessible text', () => {
    const declared = PROJECTS.flatMap(p => p.diagrams)
    expect(declared.length).toBe(14)
    expect(readdirSync(dir).filter(f => f.endsWith('.svg')).sort()).toEqual(declared.map(d => d.id + '.svg').sort())
    for (const d of declared) {
      expect(d.src).toBe('/research-projects/diagrams/' + d.id + '.svg')
      expect(d.alt.length).toBeGreaterThan(80)
      expect(d.caption).toMatch(/^Original/)
      expect(d.label).toMatch(/Diagram \(original/)
      const file = join(dir, d.id + '.svg')
      expect(existsSync(file)).toBe(true)
      const svg = readFileSync(file, 'utf8')
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror')).toBeNull()
      expect(doc.documentElement.getAttribute('role')).toBe('img')
      expect(doc.querySelector('title')?.textContent.length).toBeGreaterThan(10)
      expect(doc.querySelector('desc')?.textContent.length).toBeGreaterThan(60)
      expect(svg).toMatch(/DIAGRAM · original explanatory illustration, not a photograph/)
      expect(svg).not.toMatch(/<script|<image|<foreignObject|href=|onload=|javascript:/i)
    }
  })

  it('references each diagram from a build step of its own project', () => {
    for (const p of PROJECTS) {
      const used = new Set(p.buildSteps.map(s => s.diagramId).filter(Boolean))
      for (const d of p.diagrams) expect(used.has(d.id), p.slug + ' ' + d.id).toBe(true)
      for (const id of used) expect(p.diagrams.some(d => d.id === id)).toBe(true)
    }
  })

  it('contains no raster images in the diagram folder', () => {
    expect(readdirSync(dir).filter(f => !f.endsWith('.svg'))).toEqual([])
  })
})

describe('answer keys', () => {
  it('has one key per question, with the right shape, and never in public content', () => {
    for (const p of PROJECTS) {
      const keys = ANSWER_KEYS[p.slug]
      expect(Object.keys(keys).sort()).toEqual(p.questions.map(q => q.id).sort())
      for (const q of p.questions) {
        const key = getKey(p.slug, q.id)
        if (q.type === 'mcq') {
          expect(key.type).toBe('mcq')
          const option = q.options.find(o => o.id === key.correct)
          expect(option, p.slug + q.id).toBeTruthy()
          expect(option.text.startsWith(key.startsWith), p.slug + q.id).toBe(true)
          expect(key.why.length).toBeGreaterThan(20)
        } else if (q.type === 'calculation') {
          expect(key.type).toBe('calculation')
          expect(Number.isFinite(key.value) && key.value !== 0).toBe(true)
          expect(key.tolerancePct).toBeGreaterThan(0)
          expect(key.working.length).toBeGreaterThan(20)
        } else {
          expect(key.type).toBe('text')
          expect(key.points.length).toBeGreaterThanOrEqual(2)
        }
      }
      const publicText = JSON.stringify(p)
      for (const key of Object.values(keys)) {
        for (const piece of [key.why, key.working, ...(key.points || [])]) if (piece) expect(publicText).not.toContain(piece)
      }
    }
  })

  it('varies the correct MCQ position so the key is not guessable', () => {
    const letters = PROJECTS.flatMap(p => p.questions.filter(q => q.type === 'mcq').map(q => getKey(p.slug, q.id).correct))
    expect(letters).toHaveLength(14)
    for (const l of ['a', 'b', 'c', 'd']) expect(letters.filter(x => x === l).length).toBeGreaterThanOrEqual(2)
  })

  it('agrees with the simulations and with hand formulas', () => {
    const v = (slug, id) => getKey(slug, id).value
    const out = (r, id) => r.outputs.find(o => o.id === id).value
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b)

    const holo = runSimulation('holobox', { wavelengthNm: 635, pixelUm: 1.12, binning: 1, distanceMm: 10 })
    expect(rel(v('holobox-digital-holography', 'q4'), out(holo, 'naNyquist'))).toBeLessThan(1e-4)
    expect(rel(v('holobox-digital-holography', 'q5'), out(holo, 'minPeriodUm'))).toBeLessThan(1e-4)

    const lev = runSimulation('tinylev', { tempC: 20, frequencyKHz: 40 })
    expect(rel(v('tinylev-acoustic-levitator', 'q4'), out(lev, 'wavelengthMm') / 2)).toBeLessThan(1e-4)
    expect(v('tinylev-acoustic-levitator', 'q5')).toBeCloseTo(25 * (Math.PI / 6) * 0.002 ** 3 * 9.81 * 1e6, 9)

    expect(v('racecar-degraded-sensing-localisation', 'q4')).toBeCloseTo(0.9, 9)
    expect(v('racecar-degraded-sensing-localisation', 'q5')).toBeCloseTo(0.5 * 1.0 * (0.4 * Math.PI / 180) * 900, 9)

    const radar = runSimulation('radar', { carrierGHz: 24, bandwidthMHz: 500, chirpUs: 200 })
    expect(rel(v('range-doppler-radar-sar', 'q4'), out(radar, 'rangeResM'))).toBeLessThan(2e-3)
    expect(rel(v('range-doppler-radar-sar', 'q5'), out(radar, 'velMaxMs'))).toBeLessThan(2e-3)

    const V = v('prandtl-wing-twist-glider', 'q4')
    expect(0.5 * 1.225 * V * V * 0.096 * 0.5).toBeCloseTo(0.25 * 9.81, 9)
    expect(v('prandtl-wing-twist-glider', 'q5')).toBeCloseTo((9.1 * 0.12) / 1.46e-5, 4)

    expect(Math.abs(v('cansat-telemetry-tracking-antenna', 'q4') - fspl(500, 433))).toBeLessThan(0.01)
    const can = runSimulation('cansat', { massG: 300, chuteDiameterCm: 60, cdChute: 0.8 })
    expect(rel(v('cansat-telemetry-tracking-antenna', 'q5'), out(can, 'terminalSpeedMs'))).toBeLessThan(1e-6)

    expect(v('open-fourier-ptychographic-microscopy', 'q4')).toBeCloseTo(0.53 / 0.471, 9)
    expect(v('open-fourier-ptychographic-microscopy', 'q5')).toBeCloseTo(overlap2D(0.6, 1), 9)
  })

  it('states every number that the questions use', () => {
    const q = (slug, id) => getProject(slug).questions.find(x => x.id === id).prompt
    expect(q('range-doppler-radar-sar', 'q5')).toMatch(/24 GHz/)
    expect(q('cansat-telemetry-tracking-antenna', 'q4')).toMatch(/not a permission/)
    expect(q('range-doppler-radar-sar', 'q5')).toMatch(/not a permission/)
  })
})
