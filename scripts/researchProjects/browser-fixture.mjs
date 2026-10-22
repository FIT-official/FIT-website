// SYNTHETIC LOOPBACK BROWSER FIXTURE for the research library.
//
//   node --conditions=react-server scripts/researchProjects/browser-fixture.mjs [--logic-check] [--port 4173]
//
// What is real: the React components, the CSS modules and KaTeX CSS (bundled with esbuild), the content, the access
// adapter, the HTTP handlers, the protected asset route, the service and store logic, and (without --logic-check) a
// portable mongod on 127.0.0.1.
// What is stubbed, and ONLY this: Clerk authentication (a cookie named fixture-user selects one of the synthetic
// accounts below, set at /fixture/login?user=...) and next/link (a plain anchor). The page says so in a banner.
// Nothing here connects to production, reads MONGODB_URI, or uses a real account, class or membership.
//
// Synthetic accounts:  owner-a (review + personal)   owner-b (personal only)   stranger (signed in, not a member)
//                      teacher-only (review, no personal)   anonymous (no cookie)
// Everything is written under <repo parent>/fixture-data (override: RESEARCH_FIXTURE_DATA). Ctrl+C stops the
// server, and the mongod it started (only that process).
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MongoClient } from 'mongodb'
import { build } from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectsDir = path.resolve(here, '..', '..')
const ROOT = path.resolve(projectsDir, '..')
const DATA = process.env.RESEARCH_FIXTURE_DATA ? path.resolve(process.env.RESEARCH_FIXTURE_DATA) : path.join(ROOT, 'fixture-data')
const MONGOD = process.env.RESEARCH_ACCEPTANCE_MONGOD || 'C:/Users/ww/Documents/Codex/2026-10-07/task-2/mongo-portable-8.0.32/mongod.exe'
const LOGIC_CHECK = process.argv.includes('--logic-check')
const portArg = process.argv.indexOf('--port')
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 4173
const DB_NAME = 'fit_fixture_synthetic'
const lib = rel => import(pathToFileURL(path.join(projectsDir, 'lib', 'researchProjects', rel)).href)
const log = m => console.log('[fixture] ' + m)

const ACCOUNTS = {
  'owner-a': { review: true, member: { classId: 'owner-audience', groupId: null, memberId: 'm-owner-a', label: 'Owner A' } },
  'owner-b': { review: false, member: { classId: 'owner-audience', groupId: null, memberId: 'm-owner-b', label: 'Owner B' } },
  stranger: { review: false, member: null },
  'teacher-only': { review: true, member: null },
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
    s.on('error', reject)
  })
}

async function bundle() {
  const outdir = path.join(DATA, 'bundle')
  mkdirSync(outdir, { recursive: true })
  await build({
    entryPoints: [path.join(here, 'fixture', 'entry.jsx')],
    outdir,
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.module.css': 'local-css', '.css': 'css', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    alias: { '@': projectsDir, 'next/link': path.join(here, 'fixture', 'next-link-stub.jsx') },
    nodePaths: [path.join(ROOT, 'node_modules')],
    absWorkingDir: projectsDir,
  })
  return { js: path.join(outdir, 'entry.js'), css: path.join(outdir, 'entry.css') }
}

async function main() {
  mkdirSync(DATA, { recursive: true })
  const assets = await bundle()
  log('bundled the real components with esbuild')

  let client
  let child = null
  if (LOGIC_CHECK) {
    log('LOGIC CHECK: an in-memory stand-in is used instead of Mongo. Nothing persists.')
  } else {
    const port = await freePort()
    mkdirSync(path.join(DATA, 'db'), { recursive: true })
    child = spawn(MONGOD, ['--dbpath', path.join(DATA, 'db'), '--bind_ip', '127.0.0.1', '--port', String(port), '--logpath', path.join(DATA, 'mongod.log'), '--logappend', '--wiredTigerCacheSizeGB', '0.25', '--noauth'], { stdio: 'ignore', windowsHide: true })
    const early = await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(() => r('running'), 6000))])
    if (early !== 'running') throw new Error('mongod exited early (code ' + early + '). On an exFAT volume it rejects the data directory; set RESEARCH_FIXTURE_DATA to an NTFS directory, or use --logic-check.')
    client = new MongoClient(`mongodb://127.0.0.1:${port}/`, { serverSelectionTimeoutMS: 5000 })
    await client.connect()
    log(`mongod pid ${child.pid} on 127.0.0.1:${port}`)
  }

  const http = await lib('http.js')
  const store = await lib('store.js')
  const { createReviewedRegistryMembership } = await lib('membership.js')
  const { getProject, projectSummaries } = await lib('content/index.js')
  const { getPageAccess } = await lib('pageAccess.js')

  // In-memory stand-in for --logic-check only.
  const mem = new Map()
  const memCollection = {
    async insertOne(doc) { if (mem.has(doc._id)) throw Object.assign(new Error('E11000'), { code: 11000 }); mem.set(doc._id, structuredClone(doc)) },
    async findOne(filter) { for (const d of mem.values()) if (Object.entries(filter).every(([k, v]) => d[k] === v)) return structuredClone(d); return null },
    find(filter = {}) {
      let rows = [...mem.values()].filter(d => Object.entries(filter).every(([k, v]) => d[k] === v)).map(d => structuredClone(d))
      const chain = { sort() { return chain }, limit() { return chain }, toArray: async () => rows }
      return chain
    },
    async updateOne(filter, update) {
      for (const d of mem.values()) {
        const ok = Object.entries(filter).every(([k, c]) => (c && typeof c === 'object' && '$in' in c ? c.$in.includes(d[k]) : d[k] === c))
        if (!ok) continue
        Object.assign(d, structuredClone(update.$set || {}))
        for (const [field, spec] of Object.entries(update.$push || {})) { d[field] = [...(d[field] || []), ...structuredClone(spec.$each)]; if (spec.$slice < 0) d[field] = d[field].slice(spec.$slice) }
        return { matchedCount: 1, modifiedCount: 1 }
      }
      return { matchedCount: 0, modifiedCount: 0 }
    },
  }

  const members = Object.entries(ACCOUNTS).filter(([, a]) => a.member).map(([userId, a]) => ({ userId, ...a.member, reviewedBy: 'synthetic-fixture', reviewedAt: '2026-10-22' }))
  const depsFor = userId => ({
    authenticate: async () => {
      if (!userId) throw Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError' })
      return userId
    },
    canReview: async id => !!ACCOUNTS[id]?.review,
    membership: createReviewedRegistryMembership(members),
    attachedClassIds: ['owner-audience'],
    collection: async () => (LOGIC_CHECK ? memCollection : client.db(DB_NAME).collection(store.researchCollectionName({}))),
    now: () => new Date(),
    newId: () => 'fx-' + Math.random().toString(36).slice(2, 10),
  })

  const cookieUser = req => {
    const m = /(?:^|;\s*)fixture-user=([a-z-]+)/.exec(req.headers.cookie || '')
    return m && ACCOUNTS[m[1]] ? m[1] : null
  }

  const banner = user => `<div style="background:#fff3cd;border-bottom:2px solid #b45309;padding:8px 16px;font:14px system-ui"><strong>SYNTHETIC FIXTURE.</strong> Authentication is a stub (cookie <code>fixture-user</code>); nothing here is a real account, class or membership. Signed in as: <strong>${user || 'anonymous'}</strong>. Switch: ${['owner-a', 'owner-b', 'stranger', 'teacher-only'].map(u => `<a href="/fixture/login?user=${u}">${u}</a>`).join(' · ')} · <a href="/fixture/login?user=">anonymous</a> · <a href="/class/projects">library</a></div>`
  const shell = (user, data) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><title>Class | FIT Learning Studio (synthetic fixture)</title><link rel="stylesheet" href="/fixture/entry.css"></head><body style="margin:0">${banner(user)}<div id="root"></div><script type="application/json" id="fixture-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script><script type="module" src="/fixture/entry.js"></script></body></html>`

  const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff', ...extra })
    res.end(body)
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
      const user = cookieUser(req)
      if (url.pathname === '/fixture/login') {
        const who = url.searchParams.get('user')
        const cookie = who && ACCOUNTS[who] ? `fixture-user=${who}; Path=/; SameSite=Strict; HttpOnly` : 'fixture-user=; Path=/; Max-Age=0'
        return send(res, 302, '', 'text/plain', { Location: '/class/projects', 'Set-Cookie': cookie })
      }
      if (url.pathname === '/fixture/entry.js') return send(res, 200, readFileSync(assets.js), 'text/javascript; charset=utf-8')
      if (url.pathname === '/fixture/entry.css') return send(res, 200, readFileSync(assets.css), 'text/css; charset=utf-8')
      if (url.pathname.startsWith('/api/research-projects/')) {
        const chunks = []
        for await (const c of req) chunks.push(c)
        const init = { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])) }
        if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks)
        const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, init)
        const deps = depsFor(user)
        const route = url.pathname.slice('/api/research-projects/'.length)
        const handler = { records: { GET: http.handleRecordsGet, PUT: http.handleRecordsPut }, actions: { POST: http.handleActionsPost }, keys: { GET: http.handleKeysGet }, assets: { GET: http.handleAssetGet } }[route]?.[req.method]
        if (!handler) return send(res, 404, '{"error":"Not found"}', 'application/json')
        const response = await handler(request, deps)
        const headers = Object.fromEntries(response.headers.entries())
        res.writeHead(response.status, headers)
        return res.end(Buffer.from(await response.arrayBuffer()))
      }
      if (url.pathname === '/class/projects' || url.pathname.startsWith('/class/projects/')) {
        const access = await getPageAccess(depsFor(user))
        if (!access.ok) return send(res, access.status === 401 ? 200 : 200, shell(user, { view: 'notice', status: access.status }))
        const slug = url.pathname.split('/')[3]
        if (!slug) return send(res, 200, shell(user, { view: 'library', projects: projectSummaries(), canReview: access.canReview }))
        const project = getProject(slug)
        if (!project) return send(res, 404, shell(user, { view: 'notice', status: 403 }))
        return send(res, 200, shell(user, { view: 'project', project, canReview: access.canReview, hasPersonal: access.hasPersonal, viewer: access.viewer, classIds: access.classIds }))
      }
      if (url.pathname === '/') return send(res, 302, '', 'text/plain', { Location: '/class/projects' })
      return send(res, 404, 'Not found', 'text/plain')
    } catch (error) {
      console.error('[fixture] request failed:', error?.message)
      send(res, 500, 'Fixture error', 'text/plain')
    }
  })

  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve))
  writeFileSync(path.join(DATA, 'fixture-ready.json'), JSON.stringify({ url: `http://127.0.0.1:${PORT}/class/projects`, mode: LOGIC_CHECK ? 'logic-check (in-memory, not Mongo)' : 'mongod', pid: process.pid, mongodPid: child?.pid ?? null, startedAt: new Date().toISOString(), accounts: Object.keys(ACCOUNTS) }, null, 2))
  log(`ready: http://127.0.0.1:${PORT}/class/projects  (synthetic auth cookie: /fixture/login?user=owner-a)`)

  const stop = async () => {
    log('stopping')
    server.close()
    try { await client?.db(DB_NAME).dropDatabase() } catch { /* ignore */ }
    try { await client?.db('admin').command({ shutdown: 1, force: true }) } catch { /* closes the socket */ }
    if (child && child.exitCode === null) child.kill()
    setTimeout(() => process.exit(0), 300)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  if (process.argv.includes('--self-test')) {
    // Fetch the pages the way a browser would, then stop. Used by the harness author to prove the wiring.
    const base = `http://127.0.0.1:${PORT}`
    const get = async (p, cookie) => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie: 'fixture-user=' + cookie } : {} })
    const checks = []
    const check = (name, ok) => { checks.push({ name, ok }); log((ok ? 'PASS ' : 'FAIL ') + name) }
    const anon = await get('/class/projects')
    check('anonymous library page is a notice with no project data', (await anon.text()).includes('"view":"notice"'))
    check('bundle and css are served', (await get('/fixture/entry.js')).status === 200 && (await get('/fixture/entry.css')).status === 200)
    const a = await (await get('/class/projects', 'owner-a')).text()
    check('owner-a sees the library with ten tiles and review access', a.includes('"view":"library"') && (a.match(/"slug"/g) || []).length === 10 && a.includes('"canReview":true'))
    const b = await (await get('/class/projects/resistor-network-tomography', 'owner-b')).text()
    check('owner-b project page has personal work only and no teacher material', b.includes('"hasPersonal":true') && b.includes('"canReview":false') && !/teacher-simulation|edge 7|6\.57116/.test(b))
    const s = await (await get('/class/projects/resistor-network-tomography', 'stranger')).text()
    check('stranger gets the neutral notice only', s.includes('"view":"notice"') && !s.includes('Locate a hidden electrical change'))
    check('assets: anonymous 401, member 200 nosniff, teacher asset hidden from owner-b', (await get('/api/research-projects/assets?id=seismometer-build-diagram')).status === 401 && (await get('/api/research-projects/assets?id=seismometer-build-diagram', 'owner-b')).headers.get('x-content-type-options') === 'nosniff' && (await get('/api/research-projects/assets?id=tomography-teacher-simulation-plot', 'owner-b')).status === 404 && (await get('/api/research-projects/assets?id=tomography-teacher-simulation-plot', 'owner-a')).status === 200)
    // Mini end-to-end in jsdom: execute the REAL bundle against the REAL server (cookie-stubbed auth), type, save, verify.
    try {
      const { JSDOM, VirtualConsole } = await import('jsdom')
      const virtualConsole = new VirtualConsole()
      const problems = []
      virtualConsole.on('jsdomError', e => problems.push(String(e.message).slice(0, 200)))
      virtualConsole.on('error', (...a) => problems.push(a.join(' ').slice(0, 200)))
      const html = await (await get('/class/projects/seismometer-calibrated-vibration-sensor', 'owner-b')).text()
      const dom = new JSDOM(html, { url: base + '/class/projects/seismometer-calibrated-vibration-sensor', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole })
      const w = dom.window
      w.MessageChannel = MessageChannel
      w.TextEncoder = TextEncoder
      // jsdom's AbortSignal is not undici's, so the signal is dropped in this bridge only (browsers honour it).
      w.fetch = (u, { signal, ...init } = {}) => fetch(new URL(u, base), { ...init, headers: { ...(init.headers || {}), cookie: 'fixture-user=owner-b', origin: base } })
      w.eval(readFileSync(assets.js, 'utf8'))
      const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)) } return null }
      const statusRegion = await until(() => w.document.querySelector('[aria-label="Save status and submission"]'))
      if (!statusRegion) log('jsdom problems: ' + JSON.stringify(problems.slice(0, 4)) + ' root: ' + w.document.getElementById('root').innerHTML.slice(0, 200))
      check('the real bundle renders the student workspace in a DOM and loads the record from the real API', !!statusRegion)
      const ta = w.document.getElementById('plan-model')
      const setter = Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, 'Typed in the fixture by owner B')
      ta.dispatchEvent(new w.Event('input', { bubbles: true }))
      const saveButton = await until(() => [...w.document.querySelectorAll('button')].find(b => b.textContent === 'Save now' && !b.disabled))
      saveButton?.click()
      const saved = await until(async () => null, 1)
      void saved
      let stored = null
      for (let i = 0; i < 80 && !stored; i++) {
        const r = await (await fetch(base + '/api/research-projects/records?slug=seismometer-calibrated-vibration-sensor', { headers: { cookie: 'fixture-user=owner-b' } })).json()
        if (r.record?.doc?.plan?.model === 'Typed in the fixture by owner B') stored = r
        else await new Promise(r2 => setTimeout(r2, 100))
      }
      check('typing then Save now in the real UI persists through the real API and store', !!stored && stored.record.revision === 1)
      check('the student view shows no teacher-only material', !/teacher-simulation|edge 7|Teacher-only notes/.test(w.document.body.textContent))
      check('KaTeX renders in the bundled page', w.document.querySelectorAll('.katex').length > 10)
      try { dom.window.close() } catch { /* already closed */ }
    } catch (error) {
      check('jsdom end-to-end smoke test ran: ' + String(error?.message).slice(0, 200), false)
    }
    writeFileSync(path.join(DATA, 'fixture-self-test.json'), JSON.stringify({ mode: LOGIC_CHECK ? 'logic-check' : 'mongod', checks }, null, 2))
    await stop()
  }
}

main().catch(error => { console.error('[fixture] ' + error.message + (error.cause ? ' (' + (error.cause.message || error.cause) + ')' : '')); process.exit(1) })
