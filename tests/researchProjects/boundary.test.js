// @vitest-environment node
// Static checks on what can reach a browser bundle or a public file, plus the "own paths only" rule.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { ANSWER_KEYS } from '@/lib/researchProjects/answerKeys'

// `server-only` throws outside a server bundle. This narrow mock lets server modules load under test.
vi.mock('server-only', () => ({}))

const root = resolve(__dirname, '..', '..')
const rel = p => relative(root, p).replaceAll('\\', '/')

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function resolveImport(from, spec) {
  let base
  if (spec.startsWith('@/')) base = join(root, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec)
  else return null
  for (const candidate of [base, base + '.js', base + '.jsx', join(base, 'index.js'), join(base, 'index.jsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const IMPORT = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function importsOf(file) {
  const src = readFileSync(file, 'utf8')
  const specs = []
  for (const m of src.matchAll(IMPORT)) specs.push(m[1] || m[2])
  return specs
}

function closure(entries) {
  const seen = new Set()
  const external = new Set()
  const stack = [...entries]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of importsOf(file)) {
      const target = resolveImport(file, spec)
      if (target) stack.push(target)
      else external.add(spec)
    }
  }
  return { files: seen, external }
}

const SERVER_ONLY = ['answerKeys.js', 'answerKeysSupplemental.js', 'service.js', 'http.js', 'store.js', 'access.js', 'membership.js', 'deps.js', 'pageAccess.js', 'schema.js', 'assets.js']

describe('client bundle boundary', () => {
  const componentFiles = walk(join(root, 'components', 'ResearchProjects')).filter(f => /\.(js|jsx)$/.test(f))

  it('imports nothing server-only from any component, directly or transitively', () => {
    expect(componentFiles.length).toBeGreaterThan(10)
    const { files, external } = closure(componentFiles)
    const names = [...files].map(f => rel(f))
    for (const bad of SERVER_ONLY) expect(names.filter(n => n.endsWith('/' + bad)), bad).toEqual([])
    for (const spec of external) {
      expect(spec).not.toMatch(/^node:/)
      expect(spec).not.toMatch(/mongo|clerk|@\/lib\/(db|authenticate|checkPrivileges)/)
    }
  })

  it('reaches only the client-safe parts of the library: richText, shared, config, sim', () => {
    const { files } = closure(componentFiles)
    const lib = [...files].map(rel).filter(n => n.startsWith('lib/researchProjects/'))
    for (const n of lib) {
      expect(n, n).toMatch(/^lib\/researchProjects\/(richText|shared|config)\.js$|^lib\/researchProjects\/sim\//)
    }
    expect(lib.length).toBeGreaterThan(8)
  })

  it('never imports the project content module; content is passed in by a server component after access passes', () => {
    for (const f of componentFiles) {
      for (const spec of importsOf(f)) expect(spec, rel(f)).not.toMatch(/researchProjects\/content/)
    }
  })

  it('holds no answer-key text in any module a component can reach', () => {
    const { files } = closure(componentFiles)
    const pieces = Object.values(ANSWER_KEYS).flatMap(k => Object.values(k)).flatMap(v => [v.why, v.working, ...(v.points || []), v.notes]).filter(s => s && s.length > 25)
    expect(pieces.length).toBeGreaterThan(80)
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const piece of pieces) expect(src.includes(piece), rel(file) + ' contains key text').toBe(false)
    }
  })

  it('keeps the simulations free of answer or marking material', () => {
    for (const f of walk(join(root, 'lib', 'researchProjects', 'sim'))) {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/answerKeys|tolerancePct|markingNotes|startsWith:/)
    }
  })

  it('does not import keys from content, schema consumers, pages or routes', () => {
    for (const f of [...walk(join(root, 'lib', 'researchProjects', 'content')), ...walk(join(root, 'app', 'class', 'projects'))]) {
      for (const spec of importsOf(f)) expect(spec, rel(f)).not.toMatch(/answerKeys/)
    }
    const importers = walk(join(root, 'lib', 'researchProjects')).concat(walk(join(root, 'app')).filter(f => rel(f).includes('research-projects') || rel(f).includes('class/projects')))
      .filter(f => /\.(js|jsx)$/.test(f) && importsOf(f).some(s => /answerKeys/.test(s)))
      .map(rel)
    expect([...importers].sort()).toEqual(['lib/researchProjects/answerKeys.js', 'lib/researchProjects/service.js'])
  })

  it('marks interactive components as client components and never marks a server module as one', () => {
    for (const f of ['ProjectWorkspace', 'StudentWorkspace', 'TeacherPanel', 'ProjectBody', 'SimulationPanel', 'DataTable', 'QuestionList', 'Checklist']) {
      expect(readFileSync(join(root, 'components', 'ResearchProjects', f + '.jsx'), 'utf8').startsWith("'use client'"), f).toBe(true)
    }
    for (const f of walk(join(root, 'app', 'class', 'projects')).concat(walk(join(root, 'app', 'api', 'research-projects')))) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/^['"]use client['"]/)
    }
  })
})

describe('public files', () => {
  it('publishes no lesson file: public/research-projects does not exist and assets live in the server-read-only folder', () => {
    expect(existsSync(join(root, 'public', 'research-projects'))).toBe(false)
    const files = walk(join(root, 'content', 'researchProjects', 'assets'))
    expect(files.length).toBeGreaterThan(30)
    for (const f of files) expect(/.(svg|csv)$/.test(f), f).toBe(true)
  })

  it('keeps answer-key text out of every protected asset, including the student-role ones', () => {
    const pieces = Object.values(ANSWER_KEYS).flatMap(k => Object.values(k)).flatMap(v => [v.why, v.working]).filter(s => s && s.length > 30)
    for (const f of walk(join(root, 'content', 'researchProjects', 'assets'))) {
      if (f.includes('teacher')) continue
      const src = readFileSync(f, 'utf8')
      for (const piece of pieces) expect(src, rel(f)).not.toContain(piece)
    }
  })
})

describe('ownership of new files', () => {
  it('adds new source only under the paths this feature owns', () => {
    const owned = [
      'lib/researchProjects/', 'components/ResearchProjects/', 'app/class/projects/', 'app/api/research-projects/',
      'tests/researchProjects/', 'docs/researchProjects/', 'content/researchProjects/assets/', 'scripts/researchProjects/',
    ]
    const all = [
      ...walk(join(root, 'lib', 'researchProjects')), ...walk(join(root, 'components', 'ResearchProjects')),
      ...walk(join(root, 'app', 'class', 'projects')), ...walk(join(root, 'app', 'api', 'research-projects')),
      ...walk(join(root, 'tests', 'researchProjects')), ...walk(join(root, 'content', 'researchProjects')), ...walk(join(root, 'scripts', 'researchProjects')),
    ].map(rel)
    for (const f of all) expect(owned.some(o => f.startsWith(o)), f).toBe(true)
  })

  it('does not depend on any package that is not already in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const known = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)])
    const entries = [
      ...walk(join(root, 'lib', 'researchProjects')), ...walk(join(root, 'components', 'ResearchProjects')),
      ...walk(join(root, 'app', 'class', 'projects')), ...walk(join(root, 'app', 'api', 'research-projects')),
    ].filter(f => /\.(js|jsx)$/.test(f))
    // server-only is the React marker package; Next resolves it, and it is present in the lockfile transitively.
    const builtin = /^(node:|react$|react\/|next\/|server-only$)/
    for (const f of entries) {
      for (const spec of importsOf(f)) {
        if (spec.startsWith('.') || spec.startsWith('@/')) continue
        if (builtin.test(spec)) continue
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        expect(known.has(name), `${rel(f)} imports ${spec}`).toBe(true)
      }
    }
  })
})

describe('server-only boundary', () => {
  const lib = join(root, 'lib', 'researchProjects')
  const marked = f => readFileSync(f, 'utf8').startsWith("import 'server-only'")

  it('marks every server module, every content module and the asset manifest as server-only', () => {
    const files = [
      'access.js', 'answerKeys.js', 'answerKeysSupplemental.js', 'assets.js', 'deps.js', 'http.js', 'membership.js', 'pageAccess.js', 'schema.js', 'service.js', 'store.js',
    ].map(f => join(lib, f))
    for (const f of walk(join(lib, 'content'))) files.push(f)
    for (const f of files) expect(marked(f), rel(f)).toBe(true)
  })

  it('never marks a client-safe module as server-only, and keeps every file a client component reaches unmarked', () => {
    const clientSafe = ['richText.js', 'shared.js', 'config.js'].map(f => join(lib, f)).concat(walk(join(lib, 'sim')))
    for (const f of clientSafe) expect(marked(f), rel(f)).toBe(false)
    const componentFiles = walk(join(root, 'components', 'ResearchProjects')).filter(f => /\.(js|jsx)$/.test(f))
    const { files } = closure(componentFiles)
    for (const f of files) expect(marked(f), rel(f)).toBe(false)
  })

  it('has route handlers and pages that import only through server-marked modules', () => {
    for (const f of walk(join(root, 'app', 'api', 'research-projects'))) {
      for (const spec of importsOf(f)) expect(spec).toMatch(/^@\/lib\/researchProjects\/(http|deps)$/)
    }
    expect(readFileSync(join(root, 'lib', 'researchProjects', 'store.js'), 'utf8')).not.toMatch(/createIndex/)
  })
})
