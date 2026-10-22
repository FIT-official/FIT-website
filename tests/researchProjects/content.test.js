// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { PROJECTS, PROJECT_SLUGS, getProject, projectSummaries, todoItems } from '@/lib/researchProjects/content'
import { SOURCES } from '@/lib/researchProjects/content/sources'
import { parseRich, renderTex, plainTextOf } from '@/lib/researchProjects/richText'
import { SIMULATIONS, runSimulation, fspl } from '@/lib/researchProjects/sim'
import { ANSWER_KEYS, getKey, teacherMaterials } from '@/lib/researchProjects/answerKeys'
import { ASSETS, findAsset } from '@/lib/researchProjects/assets'
import { overlap2D } from '@/lib/researchProjects/sim/fpm'

// `server-only` throws outside a server bundle. This narrow mock lets server modules load under test.
vi.mock('server-only', () => ({}))

const root = join(__dirname, '..', '..')
const ORIGINAL_SEVEN = [
  'holobox-digital-holography', 'tinylev-acoustic-levitator', 'racecar-degraded-sensing-localisation',
  'range-doppler-radar-sar', 'prandtl-wing-twist-glider', 'cansat-telemetry-tracking-antenna', 'open-fourier-ptychographic-microscopy',
]
const SUPPLEMENTAL = ['seismometer-calibrated-vibration-sensor', 'spectrometer-resolution-calibration', 'resistor-network-tomography']
const isSupplemental = p => SUPPLEMENTAL.includes(p.slug)

// Collect every student-visible string (skipping ids, file paths and urls).
function visibleStrings(project) {
  const out = []
  const skip = new Set(['tex', 'id', 'src', 'url', 'slug', 'simId', 'sourceIds', 'diagramId', 'type', 'kind', 'section', 'unit', 'status', 'publisher', 'assetId', 'filename'])
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

describe('library structure: exactly ten complete lessons', () => {
  it('has the seven original and three supplemental projects, each once', () => {
    expect(PROJECTS).toHaveLength(10)
    expect([...PROJECT_SLUGS].sort()).toEqual([...ORIGINAL_SEVEN, ...SUPPLEMENTAL].sort())
    expect(new Set(PROJECT_SLUGS).size).toBe(10)
    expect(projectSummaries()).toHaveLength(10)
    expect(getProject('nope')).toBeNull()
    expect(getProject(undefined)).toBeNull()
    expect(getProject('__proto__')).toBeNull()
  })

  it('gives every tile a protected original image with alt text, a readiness statement and a 60-minute lesson', () => {
    for (const s of projectSummaries()) {
      expect(s.tile.src).toMatch(/^\/api\/research-projects\/assets\?id=[a-z0-9-]+$/)
      expect(s.tile.alt.length).toBeGreaterThan(40)
      expect(findAsset(s.tile.src.split('=')[1])?.role).toBe('student')
      expect(s.readiness.length).toBeGreaterThan(60)
      expect(s.lessonMinutes).toBe(60)
    }
  })

  for (const p of PROJECTS) {
    describe(p.slug, () => {
      it('has every required section with substantive content', () => {
        expect(p.researchQuestion.length).toBeGreaterThan(100)
        expect(p.prerequisites.length).toBeGreaterThanOrEqual(4)
        expect(p.concepts.length).toBeGreaterThanOrEqual(4)
        for (const c of p.concepts) {
          expect(c.equations.length).toBeGreaterThanOrEqual(1)
          expect(c.body.length).toBeGreaterThan(100)
        }
        expect(p.buildSteps.length).toBeGreaterThanOrEqual(6)
        expect(p.equipment.length).toBeGreaterThanOrEqual(5)
        expect(p.safety.items.length).toBeGreaterThanOrEqual(5)
        expect(p.milestones.length).toBeGreaterThanOrEqual(4)
        expect(p.tasks.filter(t => t.kind === 'simulation').length).toBeGreaterThanOrEqual(2)
        expect(p.tasks.filter(t => t.kind === 'experiment').length).toBeGreaterThanOrEqual(2)
        expect(p.dataset.columns.length).toBeGreaterThanOrEqual(6)
        expect(p.caveats.length).toBeGreaterThanOrEqual(3)
        expect(p.rubric).toHaveLength(6)
        for (const c of p.rubric) {
          expect(c.levels).toHaveLength(4)
          expect(c.focus).toBeTruthy()
        }
      })

      it('has questions covering MCQ, short answer, calculation or derivation, and written reasoning', () => {
        const byType = t => p.questions.filter(q => q.type === t)
        expect(byType('mcq').length).toBeGreaterThanOrEqual(2)
        expect(byType('short').length).toBeGreaterThanOrEqual(1)
        expect(byType('calculation').length + byType('derivation').length).toBeGreaterThanOrEqual(2)
        expect(byType('explain').length + byType('reflection').length).toBeGreaterThanOrEqual(1)
        expect(byType('reflection').length).toBeGreaterThanOrEqual(1)
        expect(new Set(p.questions.map(q => q.id)).size).toBe(p.questions.length)
        for (const q of byType('mcq')) {
          expect(q.options).toHaveLength(4)
          expect(q.options.map(o => o.id)).toEqual(['a', 'b', 'c', 'd'])
          expect(new Set(q.options.map(o => o.text)).size).toBe(4)
        }
        expect(JSON.stringify(p.questions)).not.toMatch(/"correct"|"answer"|"key"|startsWith|tolerance/)
      })

      it('distinguishes the published build from the proposed investigation, and never claims FIT built it', () => {
        expect(p.published.label).toMatch(/^Published build/)
        expect(p.proposed.label).toMatch(/^Proposed student investigation/)
        expect(p.proposed.label).toMatch(/not a claim that FIT built this/)
        expect(p.published.text).toMatch(/FIT has not built|FIT adaptation|adaptation/)
        expect(p.published.sourceIds.length).toBeGreaterThan(0)
      })

      it('has a simulation-first 60-minute lesson that does not pretend hardware is ready', () => {
        const l = p.lesson60
        expect(l.title).toMatch(/60-minute/)
        expect(l.intro).toMatch(/not completing the hardware investigation/)
        expect(l.steps).toHaveLength(6)
        expect(l.steps[0].minutes).toMatch(/^0 to /)
        expect(l.steps[5].minutes).toMatch(/ to 60$/)
        for (const s of l.steps) expect(s.body.length).toBeGreaterThan(40)
        expect(p.readiness).toMatch(/conditional|no kit|needs only|no hardware/i)
        const ids = p.todo.map(t => t.id)
        for (const s of l.steps) expect(ids).toContain('ls:' + s.id)
      })

      it('has unique to-do ids that cover equipment, safety, steps, milestones, tasks and the lesson', () => {
        const ids = p.todo.map(t => t.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.length).toBe(p.equipment.length + p.safety.items.length + p.buildSteps.length + p.milestones.length + p.tasks.length + p.lesson60.steps.length)
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
        expect(SIMULATIONS[p.simId]).toBeTruthy()
        const row = runSimulation(p.simId, {}).row
        for (const key of Object.keys(row)) expect(cols).toContain(key)
      })

      it('references only registered sources and credits them with links', () => {
        expect(p.sources.length).toBeGreaterThanOrEqual(2)
        for (const s of p.sources) {
          expect(SOURCES[s.id]).toBe(s)
          expect(s.url === null || /^https:\/\//.test(s.url)).toBe(true)
          expect(['read', 'reference', 'unavailable', 'checked']).toContain(s.status)
        }
        for (const id of [...p.buildSteps.flatMap(s => s.sourceIds), ...p.concepts.flatMap(c => c.sourceIds)]) expect(SOURCES[id]).toBeTruthy()
      })
    })
  }

  it('gives each supplemental project exactly nine scored questions (4 MCQ, 3 short, 2 derivation) worth 18 marks, plus an unscored reflection', () => {
    for (const p of PROJECTS.filter(isSupplemental)) {
      const scored = p.questions.filter(q => q.marks > 0)
      expect(scored).toHaveLength(9)
      expect(scored.filter(q => q.type === 'mcq')).toHaveLength(4)
      expect(scored.filter(q => q.type === 'short')).toHaveLength(3)
      expect(scored.filter(q => q.type === 'derivation')).toHaveLength(2)
      expect(scored.reduce((s, q) => s + q.marks, 0)).toBe(18)
      const reflection = p.questions.filter(q => q.type === 'reflection')
      expect(reflection).toHaveLength(1)
      expect(reflection[0].marks).toBe(0)
      expect(p.questions.at(-1)).toBe(reflection[0])
    }
  })

  it('does not force the original seven to share the supplemental question count', () => {
    for (const p of PROJECTS.filter(x => !isSupplemental(x))) expect(p.questions.length).toBeGreaterThanOrEqual(8)
  })
})

describe('source honesty and asset rights', () => {
  it('never claims to have read an unavailable, unopened or only link-checked source', () => {
    for (const s of Object.values(SOURCES)) {
      if (s.status === 'reference') expect(s.note).toMatch(/not opened/)
      if (s.status === 'unavailable') expect(s.note).toMatch(/502|could not/)
      if (s.status === 'checked') expect(s.note).toMatch(/Link only|Reference for|reference only|precedent only|Research precedent|Open build precedent|must not be imported/i)
    }
    expect(SOURCES.racecarSite.status).toBe('unavailable')
  })

  it('records the verified facts and licence limits from the source briefs', () => {
    expect(SOURCES.ofpmLicense.note).toMatch(/MIT/)
    expect(SOURCES.ofpmLicense.note).toMatch(/CERN-OHL-S/)
    expect(SOURCES.ofpm.note).toMatch(/not peer-review evidence/)
    expect(SOURCES.tinylev.note).toMatch(/CC BY/)
    expect(SOURCES.holobox.note).toMatch(/10 October 2026/)
    expect(SOURCES.amaPrandtl.note).toMatch(/all-rights-reserved/)
    expect(SOURCES.ocwRadar.note).toMatch(/not reproduced/)
    expect(SOURCES.esaContrailReport.note).toMatch(/auto-tracking antenna/)
    expect(SOURCES.racecarPaper.note).toMatch(/1\/10-scale/)
    // Projects 08 to 10
    expect(SOURCES.openeitLicence.note).toMatch(/CC BY-NC-SA 4\.0/)
    expect(SOURCES.openeitLicence.note).toMatch(/must not be imported/)
    expect(SOURCES.openeit.note).toMatch(/No code, images or hardware schematics are imported/)
    expect(SOURCES.publicLabSpectrometer.note).toMatch(/CERN OHL 1\.2/)
    expect(SOURCES.publicLabSpectrometer.note).toMatch(/No fold templates/)
    expect(SOURCES.sssSeismometer.note).toMatch(/photographs are not imported/)
    expect(SOURCES.tc1.note).toMatch(/no photographs or design files/i)
  })

  it('keeps SYNTHETIC labels on supplemental data and never presents a model as a measurement', () => {
    for (const p of PROJECTS.filter(isSupplemental)) {
      const all = JSON.stringify(p)
      expect(p.dataset.intro).toMatch(/SYNTHETIC/)
      expect(all).toMatch(/SYNTHETIC/)
      for (const d of p.downloads) {
        expect(d.url).toMatch(/assets\?id=/)
        expect(d.note).toMatch(/SYNTHETIC/)
        if (/synthetic/i.test(d.filename)) expect(d.label).toMatch(/SYNTHETIC/)
      }
      expect(p.caveats.join(' ')).toMatch(/not (specifications|an OpenEIT dataset|measured)|teaching model/i)
    }
  })

  it('keeps teacher-only results and keys out of every student-visible object', () => {
    for (const p of PROJECTS) {
      const all = JSON.stringify(p)
      expect(all).not.toMatch(/teacher[-_]candidate|teacher[-_]simulation|teacher_key|answer_key/i)
      expect(all).not.toMatch(/6\.57116|7109\.82|hidden change is|edge 7, connecting/i)
    }
    const meta = teacherMaterials('resistor-network-tomography')
    expect(meta.assets.map(a => a.id).sort()).toEqual(['tomography-teacher-candidate-scores-csv', 'tomography-teacher-simulation-plot'])
    expect(meta.notes.join(' ')).toMatch(/edge 7/)
  })

  it('does not copy, price, stock or boast', () => {
    for (const p of PROJECTS) {
      const text = visibleStrings(p).flatMap(({ value }) => parseRich(value).filter(s => s.type === 'text').map(s => s.value)).join(' ')
      expect(text, p.slug).not.toMatch(/[£€]\s?\d|\bUSD\b|\bin stock\b|\bcheap(?:est)?\b|\bnovel(?:ty)?\b|world[- ]first|\bDSO\b/i)
      expect(text, p.slug).not.toMatch(/\bS?\$\s?\d/)
    }
  })

  it('states the project-specific safety and scope boundaries', () => {
    const text = id => JSON.stringify(getProject(id))
    expect(text('tinylev-acoustic-levitator')).toMatch(/inert beads/i)
    expect(text('tinylev-acoustic-levitator')).toMatch(/No safe ultrasound exposure|does not (establish|state) any safe ultrasound exposure/i)
    expect(text('tinylev-acoustic-levitator')).toMatch(/NOT a real restoring force/)
    expect(text('range-doppler-radar-sar')).toMatch(/no weapons/i)
    expect(text('cansat-telemetry-tracking-antenna')).toMatch(/no launch/i)
    expect(text('open-fourier-ptychographic-microscopy')).toMatch(/mentor-led/i)
    expect(text('racecar-degraded-sensing-localisation')).toMatch(/low-speed/i)
    expect(text('prandtl-wing-twist-glider')).toMatch(/do not transfer/i)
    expect(text('holobox-digital-holography')).toMatch(/not a fixed-sensor comparison/i)
    expect(text('seismometer-calibrated-vibration-sensor')).toMatch(/does not predict earthquakes/i)
    expect(text('seismometer-calibrated-vibration-sensor')).toMatch(/non-magnetic/i)
    expect(text('spectrometer-resolution-calibration')).toMatch(/never pointed at the Sun/i)
    expect(text('spectrometer-resolution-calibration')).toMatch(/verified spectral reference/i)
    expect(text('resistor-network-tomography')).toMatch(/not a complete EIT scanner/i)
    expect(text('resistor-network-tomography')).toMatch(/no body|never connected to a person/i)
  })

  it('labels the TinyLev curvature measure as a proxy in the model output, the guide and the questions', () => {
    const sim = SIMULATIONS.tinylev
    const labels = runSimulation('tinylev', {}).outputs.filter(o => /curvature/i.test(o.label)).map(o => o.label)
    expect(labels.length).toBe(2)
    for (const l of labels) expect(l).toMatch(/proxy/i)
    expect(sim.caveats.join(' ')).toMatch(/NOT a real restoring force, a trap stiffness or a complete Gor’kov stability analysis/)
    const p = getProject('tinylev-acoustic-levitator')
    expect(JSON.stringify(p.concepts)).toMatch(/NOT a real restoring force/)
    expect(p.questions.find(q => q.id === 'q8').prompt).toMatch(/proxy/)
    expect(p.dataset.columns.find(c => c.id === 'curvatureProxy').label).toMatch(/not a force/)
    expect(JSON.stringify(p)).not.toMatch(/stiffest|restoring strength/i)
  })

  it('states the Holobox binning assumption: the modelled window grows, so it is not a fixed-sensor comparison', () => {
    const sim = SIMULATIONS.holobox
    expect(sim.assumptions.join(' ')).toMatch(/NOT a fixed-sensor comparison/)
    const label = runSimulation('holobox', {}).outputs.find(o => o.id === 'sensorWidthMm').label
    expect(label).toMatch(/grows with binning/)
    const p = getProject('holobox-digital-holography')
    expect(p.tasks.find(t => t.id === 't-sim-bin').body).toMatch(/not a fixed-sensor comparison/)
    const narrow = runSimulation('holobox', { binning: 1 }).outputs.find(o => o.id === 'sensorWidthMm').value
    const wide = runSimulation('holobox', { binning: 4 }).outputs.find(o => o.id === 'sensorWidthMm').value
    expect(wide).toBeCloseTo(4 * narrow, 6)
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
    expect(rendered).toBeGreaterThan(250)
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

describe('protected diagrams and teaching files', () => {
  const assetDir = join(root, 'content', 'researchProjects', 'assets')

  it('serves nothing from public: lesson assets live only in the server-read-only directory', () => {
    expect(existsSync(join(root, 'public', 'research-projects'))).toBe(false)
    expect(existsSync(assetDir)).toBe(true)
  })

  it('has a strict manifest: every file listed, hashed, in a known folder, and nothing unlisted on disk', () => {
    const onDisk = ['diagrams', 'projects-08-10'].flatMap(d => readdirSync(join(assetDir, d)).map(f => d + '/' + f)).sort()
    expect(ASSETS.map(a => a.file).sort()).toEqual(onDisk)
    expect(readdirSync(assetDir).sort()).toEqual(['diagrams', 'projects-08-10'])
    expect(new Set(ASSETS.map(a => a.id)).size).toBe(ASSETS.length)
    for (const a of ASSETS) {
      expect(a.id).toMatch(/^[a-z0-9][a-z0-9-]{2,90}$/)
      expect(['svg', 'csv']).toContain(a.kind)
      expect(a.file.endsWith('.' + a.kind)).toBe(true)
      const buf = readFileSync(join(assetDir, a.file))
      expect(buf.length, a.id).toBe(a.bytes)
      expect(createHash('sha256').update(buf).digest('hex'), a.id).toBe(a.sha256)
    }
  })

  it('matches the supplied provenance hashes for the content owner’s diagrams', () => {
    const supplied = join(root, '..', 'content-handoff', 'extracted')
    if (!existsSync(supplied)) return
    const pairs = [
      ['seismometer-build-diagram', 'project_08_seismometer/build_diagram.svg'],
      ['spectrometer-simulation-plot', 'project_09_spectrometer/simulation_plot.svg'],
      ['tomography-teacher-simulation-plot', 'project_10_electrical_tomography/teacher_simulation_plot.svg'],
    ]
    for (const [id, rel] of pairs) {
      const asset = findAsset(id)
      expect(createHash('sha256').update(readFileSync(join(supplied, rel))).digest('hex')).toBe(asset.sha256)
    }
  })

  it('marks teacher results as teacher-only and references only student assets from student content', () => {
    expect(ASSETS.filter(a => a.role === 'teacher').map(a => a.id).sort()).toEqual(['tomography-teacher-candidate-scores-csv', 'tomography-teacher-simulation-plot'])
    for (const p of PROJECTS) {
      const ids = [...p.diagrams.map(d => d.id), ...p.downloads.map(d => d.id), p.tile.assetId]
      for (const id of ids) {
        const a = findAsset(id)
        expect(a, p.slug + ' ' + id).toBeTruthy()
        expect(a.role).toBe('student')
      }
    }
  })

  it('declares every diagram with a protected src, a label, alt text and a caption, and uses it in a build step', () => {
    for (const p of PROJECTS) {
      expect(p.diagrams.length).toBeGreaterThanOrEqual(1)
      const used = new Set(p.buildSteps.map(s => s.diagramId).filter(Boolean))
      for (const d of p.diagrams) {
        expect(d.src).toBe('/api/research-projects/assets?id=' + d.id)
        expect(findAsset(d.id).kind).toBe('svg')
        expect(d.alt.length).toBeGreaterThan(80)
        expect(d.caption).toMatch(/^Original/)
        expect(d.label).toMatch(/Diagram \(original/)
        expect(used.has(d.id), p.slug + ' ' + d.id).toBe(true)
      }
      for (const id of used) expect(p.diagrams.some(d => d.id === id)).toBe(true)
    }
    expect(PROJECTS.flatMap(p => p.diagrams).length).toBe(14 + 5)
  })

  it('has only well-formed, script-free SVG files', () => {
    for (const a of ASSETS.filter(x => x.kind === 'svg')) {
      const svg = readFileSync(join(assetDir, a.file), 'utf8')
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror'), a.id).toBeNull()
      expect(svg, a.id).not.toMatch(/<script|<image|<foreignObject|onload=|javascript:/i)
      expect(svg, a.id).not.toMatch(/href="https?:/i)
    }
    for (const a of ASSETS.filter(x => x.file.startsWith('diagrams/'))) {
      const svg = readFileSync(join(assetDir, a.file), 'utf8')
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(doc.documentElement.getAttribute('role')).toBe('img')
      expect(doc.querySelector('title')?.textContent.length).toBeGreaterThan(10)
      expect(doc.querySelector('desc')?.textContent.length).toBeGreaterThan(60)
      expect(svg).toMatch(/DIAGRAM · original explanatory illustration, not a photograph/)
    }
  })

  it('keeps the supplied synthetic CSV files labelled SYNTHETIC in every data row', () => {
    for (const a of ASSETS.filter(x => x.kind === 'csv' && /synthetic/.test(x.id))) {
      const lines = readFileSync(join(assetDir, a.file), 'utf8').trim().split(/\r?\n/)
      expect(lines[0]).toMatch(/^data_origin,/)
      for (const line of lines.slice(1)) expect(line.startsWith('SYNTHETIC,'), a.id).toBe(true)
    }
    for (const a of ASSETS.filter(x => /measurement-template/.test(x.id))) {
      expect(readFileSync(join(assetDir, a.file), 'utf8').trim().split(/\r?\n/)).toHaveLength(1)
    }
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
    expect(letters.length).toBeGreaterThanOrEqual(20)
    for (const l of ['a', 'b', 'c', 'd']) expect(letters.filter(x => x === l).length).toBeGreaterThanOrEqual(3)
    for (const p of PROJECTS.filter(isSupplemental)) {
      const own = p.questions.filter(q => q.type === 'mcq').map(q => getKey(p.slug, q.id).correct)
      expect(new Set(own).size, p.slug).toBeGreaterThanOrEqual(3)
    }
  })

  it('agrees with the simulations, hand formulas and the supplied datasets', () => {
    const v = (slug, id) => getKey(slug, id).value
    const out = (r, id) => r.outputs.find(o => o.id === id).value
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b)

    const holo = runSimulation('holobox', { wavelengthNm: 635, pixelUm: 1.12, binning: 1, distanceMm: 10 })
    expect(rel(v('holobox-digital-holography', 'q4'), out(holo, 'naNyquist'))).toBeLessThan(1e-4)
    expect(rel(v('holobox-digital-holography', 'q5'), out(holo, 'minPeriodUm'))).toBeLessThan(1e-4)
    const lev = runSimulation('tinylev', { tempC: 20, frequencyKHz: 40 })
    expect(rel(v('tinylev-acoustic-levitator', 'q4'), out(lev, 'wavelengthMm') / 2)).toBeLessThan(1e-4)
    expect(v('racecar-degraded-sensing-localisation', 'q4')).toBeCloseTo(0.9, 9)
    const radar = runSimulation('radar', { carrierGHz: 24, bandwidthMHz: 500, chirpUs: 200 })
    expect(rel(v('range-doppler-radar-sar', 'q4'), out(radar, 'rangeResM'))).toBeLessThan(2e-3)
    expect(rel(v('range-doppler-radar-sar', 'q5'), out(radar, 'velMaxMs'))).toBeLessThan(2e-3)
    const V = v('prandtl-wing-twist-glider', 'q4')
    expect(0.5 * 1.225 * V * V * 0.096 * 0.5).toBeCloseTo(0.25 * 9.81, 9)
    expect(Math.abs(v('cansat-telemetry-tracking-antenna', 'q4') - fspl(500, 433))).toBeLessThan(0.01)
    const can = runSimulation('cansat', { massG: 300, chuteDiameterCm: 60, cdChute: 0.8 })
    expect(rel(v('cansat-telemetry-tracking-antenna', 'q5'), out(can, 'terminalSpeedMs'))).toBeLessThan(1e-6)
    expect(v('open-fourier-ptychographic-microscopy', 'q5')).toBeCloseTo(overlap2D(0.6, 1), 9)

    // Project 08: f0 = 1.000 Hz for m = 0.100 kg, k = 3.94784 N/m, and zeta = 0.1097 for a peak ratio of two.
    const seis = runSimulation('seismometer', { massKg: 0.1, f0Hz: 1 })
    expect(out(seis, 'springNPerM')).toBeCloseTo(3.94784, 4)
    expect(Math.sqrt(3.94784 / 0.1) / (2 * Math.PI)).toBeCloseTo(1.0, 5)
    const delta = Math.log(2)
    expect(delta / Math.sqrt(4 * Math.PI ** 2 + delta ** 2)).toBeCloseTo(0.1097, 4)
    expect(10 / 10.2).toBeCloseTo(0.9804, 4)
    expect(out(runSimulation('seismometer', { dampingRatio: 0.05 }), 'resonanceGain')).toBeCloseTo(10, 9)

    // Project 09: calibration, grating angle and FWHM.
    const spec = runSimulation('spectrometer', { p1: 100, l1: 450, p2: 300, l2: 550, p3: 500, l3: 650 })
    expect(out(spec, 'slopeNmPerPixel')).toBeCloseTo(0.5, 9)
    expect(out(spec, 'interceptNm')).toBeCloseTo(400, 9)
    expect(out(spec, 'heldOutPredictionNm')).toBeCloseTo(650, 9)
    expect(0.5 * 420 + 400).toBe(610)
    expect(Math.asin(550e-9 / (1e-3 / 500)) * 180 / Math.PI).toBeCloseTo(15.96, 2)
    expect(2 * Math.sqrt(2 * Math.log(2)) * 2).toBeCloseTo(4.71, 2)
    expect(0.5 * 2).toBe(1)

    // Project 10: transfer resistance and the divider.
    expect(0.24 / 0.0008).toBeCloseTo(300, 9)
    expect(0.27 / 0.0009).toBeCloseTo(300, 9)
    expect((2 / 3 - 0) / 2000).toBeCloseTo((1 - 2 / 3) / 1000, 12)
  })

  it('reproduces the supplied SYNTHETIC datasets from the ported models', async () => {
    const dir = join(root, 'content', 'researchProjects', 'assets', 'projects-08-10')
    const rows = name => readFileSync(join(dir, name), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','))
    const { relative, gain } = await import('@/lib/researchProjects/sim/seismometer')
    const { spectrum } = await import('@/lib/researchProjects/sim/spectrometer')
    const { forward, EDGES } = await import('@/lib/researchProjects/sim/tomography')

    // 08: ring-down displacement (mm) and frequency response.
    const w0 = 2 * Math.PI
    for (const r of rows('seismometer-synthetic-ringdown.csv').filter((_, i) => i % 37 === 0)) {
      expect(relative(Number(r[1]), w0, 0.005, Number(r[2])) * 1000).toBeCloseTo(Number(r[6]), 4)
    }
    for (const r of rows('seismometer-synthetic-frequency-response.csv')) {
      expect(gain(Number(r[2]) / Number(r[3]), Number(r[1]))).toBeCloseTo(Number(r[4]), 8)
    }
    // 09: expected counts at each slit width.
    for (const r of rows('spectrometer-synthetic-spectra.csv').filter((_, i) => i % 53 === 0)) {
      const s = spectrum({ slitMm: Number(r[1]), lineNm: 520, separationNm: 10, peakScale: 600 })
      expect(s.sigma).toBeCloseTo(Number(r[2]), 9)
      expect(s.expected[Number(r[3])]).toBeCloseTo(Number(r[5]), 4)
    }
    // 10: candidate fingerprints and the supplied scores (all twelve candidates, 28 readings).
    const base = forward(new Array(12).fill(1000))
    const observed = rows('tomography-synthetic-boundary-readings.csv').map(r => Number(r[7]))
    expect(observed).toHaveLength(28)
    const prints = rows('tomography-synthetic-candidate-fingerprints.csv')
    const scores = EDGES.map((_, edge) => {
      const r = new Array(12).fill(1000)
      r[edge] = 1500
      const prediction = forward(r).map((x, i) => x - base[i])
      const supplied = prints.filter(p => Number(p[1]) === edge).map(p => Number(p[9]))
      supplied.forEach((x, i) => expect(prediction[i]).toBeCloseTo(x, 5))
      return prediction.reduce((s, x, i) => s + (observed[i] - x) ** 2, 0)
    })
    const ranked = scores.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s)
    expect(ranked[0].i).toBe(7)
    expect(ranked[0].s).toBeCloseTo(6.57116, 3)
    expect(ranked[1].i).toBe(5)
    expect(ranked[1].s).toBeCloseTo(7109.82306, 2)
    const teacherScores = rows('tomography-teacher-candidate-scores.csv').map(r => [Number(r[0]), Number(r[3])])
    for (const [edge, sse] of teacherScores) expect(scores[edge]).toBeCloseTo(sse, 2)
  })

  it('states every number that the questions use', () => {
    const q = (slug, id) => getProject(slug).questions.find(x => x.id === id).prompt
    expect(q('range-doppler-radar-sar', 'q5')).toMatch(/24 GHz/)
    expect(q('cansat-telemetry-tracking-antenna', 'q4')).toMatch(/not a permission/)
    expect(q('range-doppler-radar-sar', 'q5')).toMatch(/not a permission/)
  })
})
