// Bounded LOOPBACK acceptance run for the research library, using the ACTUAL store, service and HTTP handlers
// against a real portable mongod on 127.0.0.1. Everything it creates (database files, logs, result JSON) lives
// under <repo parent>/acceptance-data, and it only ever stops the one mongod process it started itself.
//
//   node --conditions=react-server scripts/researchProjects/acceptance.mjs
//
// All accounts, classes and groups are SYNTHETIC. No production URI is read (MONGODB_URI is ignored), no
// network other than 127.0.0.1 is used, and no existing class, student or workshop collection exists here.
// `--conditions=react-server` lets the `server-only` marker resolve to its empty module outside Next.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MongoClient } from 'mongodb'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectsDir = path.resolve(here, '..', '..')
const ROOT = path.resolve(projectsDir, '..')
// Data, logs and the result file default to <repo parent>/acceptance-data. RESEARCH_ACCEPTANCE_DATA may point at another
// directory on a volume that mongod can open (see "blocked" below); nothing else in this script chooses a location.
const DATA = process.env.RESEARCH_ACCEPTANCE_DATA ? path.resolve(process.env.RESEARCH_ACCEPTANCE_DATA) : path.join(ROOT, 'acceptance-data')
const MONGOD = process.env.RESEARCH_ACCEPTANCE_MONGOD || 'C:/Users/ww/Documents/Codex/2026-10-07/task-2/mongo-portable-8.0.32/mongod.exe'
const DB_NAME = 'fit_acceptance_synthetic'
const ORIGIN = 'https://acceptance.invalid'
const LOGIC_CHECK = process.argv.includes('--logic-check')
const started = Date.now()
const results = []
let child = null
let childExit = null
let blocked = null
let client = null
let port = 0

const lib = rel => import(pathToFileURL(path.join(projectsDir, 'lib', 'researchProjects', rel)).href)

function log(message) { console.log(`[acceptance ${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`) }

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port: p } = server.address()
      server.close(() => resolve(p))
    })
    server.on('error', reject)
  })
}

// --logic-check: NOT a database. An in-memory stand-in that lets the scenarios below be exercised when no mongod can
// be started (for example on an exFAT volume). It proves the script's own logic only; it proves nothing about Mongo,
// persistence or restarts, and its result file says so.
function fakeClient() {
  const stores = new Map()
  const clone = v => structuredClone(v)
  const matches = (doc, filter) => Object.entries(filter).every(([k, c]) => (c && typeof c === 'object' && '$in' in c ? c.$in.includes(doc[k]) : doc[k] === c))
  const tick = () => Promise.resolve()
  const collectionOf = (db, name) => {
    const key = db + '.' + name
    if (!stores.has(key)) stores.set(key, new Map())
    const docs = stores.get(key)
    return {
      async insertOne(doc) {
        await tick()
        if (docs.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
        docs.set(doc._id, clone(doc))
      },
      async findOne(filter) { await tick(); for (const d of docs.values()) if (matches(d, filter)) return clone(d); return null },
      find(filter = {}) {
        let rows = [...docs.values()].filter(d => matches(d, filter)).map(clone)
        const chain = { sort(spec) { const [[k, dir]] = Object.entries(spec); rows.sort((a, b) => (a[k] < b[k] ? -dir : a[k] > b[k] ? dir : 0)); return chain }, limit() { return chain }, async toArray() { await tick(); return rows } }
        return chain
      },
      async countDocuments(filter = {}) { await tick(); return [...docs.values()].filter(d => matches(d, filter)).length },
      async updateOne(filter, update) {
        await tick()
        for (const d of docs.values()) {
          if (!matches(d, filter)) continue
          Object.assign(d, clone(update.$set || {}))
          for (const [field, spec] of Object.entries(update.$push || {})) {
            d[field] = [...(d[field] || []), ...clone(spec.$each)]
            if (spec.$slice < 0) d[field] = d[field].slice(spec.$slice)
          }
          return { matchedCount: 1, modifiedCount: 1 }
        }
        return { matchedCount: 0, modifiedCount: 0 }
      },
      async indexes() { return [{ name: '_id_' }] },
    }
  }
  return {
    db: name => ({
      collection: n => collectionOf(name, n),
      listCollections: () => ({ toArray: async () => [...stores.keys()].filter(k => k.startsWith(name + '.')).map(k => ({ name: k.slice(name.length + 1) })) }),
      dropDatabase: async () => { for (const k of [...stores.keys()]) if (k.startsWith(name + '.')) stores.delete(k) },
      command: async () => ({ ok: 1 }),
      admin: () => ({ listDatabases: async () => ({ databases: [{ name: 'admin' }, { name }] }) }),
    }),
    close: async () => {},
  }
}

function startMongod() {
  if (LOGIC_CHECK) return
  mkdirSync(path.join(DATA, 'db'), { recursive: true })
  const args = [
    '--dbpath', path.join(DATA, 'db'), '--bind_ip', '127.0.0.1', '--port', String(port),
    '--logpath', path.join(DATA, 'mongod.log'), '--logappend', '--wiredTigerCacheSizeGB', '0.25', '--noauth',
  ]
  child = spawn(MONGOD, args, { stdio: 'ignore', windowsHide: true })
  childExit = new Promise(resolve => child.once('exit', code => resolve(code)))
  child.on('error', error => log('mongod failed to start: ' + error.message))
  log(`started mongod pid ${child.pid} on 127.0.0.1:${port}`)
}

async function connect() {
  if (LOGIC_CHECK) return connectFake()
  const uri = `mongodb://127.0.0.1:${port}/`
  assert.equal(new URL(uri).hostname, '127.0.0.1')
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const c = new MongoClient(uri, { serverSelectionTimeoutMS: 1500, maxPoolSize: 5 })
      await c.connect()
      await c.db('admin').command({ ping: 1 })
      return c
    } catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  throw new Error('mongod did not become ready')
}

async function stopMongod() {
  if (LOGIC_CHECK) return
  if (!child || child.exitCode !== null) return
  const exited = new Promise(resolve => child.once('exit', resolve))
  try {
    await client?.db('admin').command({ shutdown: 1, force: true })
  } catch {
    // The server closes the connection while shutting down; that is expected.
  }
  await Promise.race([exited, new Promise(r => setTimeout(r, 15000))])
  if (child.exitCode === null) child.kill()
  await Promise.race([exited, new Promise(r => setTimeout(r, 5000))])
}

let sharedFake = null
function connectFake() {
  sharedFake ||= fakeClient()
  return sharedFake
}

function request(method, pathname, { body, origin = ORIGIN, headers = {} } = {}) {
  const init = { method, headers: { ...headers } }
  if (origin) init.headers.origin = origin
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  return new Request(ORIGIN + pathname, init)
}

const read = async response => ({ status: response.status, headers: response.headers, body: await response.text().then(t => { try { return JSON.parse(t) } catch { return t } }) })

async function scenario(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - t0 })
    log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(error?.message || error).slice(0, 600) })
    log(`FAIL ${name}: ${error?.message || error}`)
  }
}

async function main() {
  if (!LOGIC_CHECK) assert.ok(existsSync(MONGOD), 'portable mongod not found at ' + MONGOD)
  rmSync(path.join(DATA, 'db'), { recursive: true, force: true })
  mkdirSync(DATA, { recursive: true })
  port = LOGIC_CHECK ? 0 : await freePort()
  if (LOGIC_CHECK) log('LOGIC CHECK ONLY: in-memory stand-in, NOT Mongo. Persistence and restart claims are not tested.')
  else startMongod()
  // Early-exit check: mongod 8 on an exFAT volume (D: on the development machine) rejects every data directory with
  // NonExistentPath even when the directory exists. That is an environment limit, reported as "blocked", not a failure.
  const early = LOGIC_CHECK ? 'running' : await Promise.race([childExit, new Promise(r => setTimeout(() => r('running'), 6000))])
  if (early !== 'running') {
    const tail = existsSync(path.join(DATA, 'mongod.log')) ? readFileSync(path.join(DATA, 'mongod.log'), 'utf8').split('\n').filter(Boolean).slice(-40).join('\n') : ''
    const reason = /NonExistentPath/.test(tail) ? 'mongod rejected the data directory (NonExistentPath), which it does on exFAT volumes' : 'mongod exited early with code ' + early
    blocked = reason + '. Data directory: ' + path.join(DATA, 'db') + '. Re-run with RESEARCH_ACCEPTANCE_DATA pointing at an NTFS directory.'
    throw new Error('BLOCKED: ' + blocked)
  }
  client = await connect()

  const http = await lib('http.js')
  const store = await lib('store.js')
  const { createReviewedRegistryMembership } = await lib('membership.js')
  const { getProject } = await lib('content/index.js')
  const { fullDoc } = {
    fullDoc: (project, overrides = {}) => {
      const safety = Object.fromEntries(project.todo.filter(t => t.id.startsWith('sf:')).map(t => [t.id, true]))
      const long = 'A clear, bounded statement for the plan.'
      return {
        plan: { question: long, model: long, dataPlan: long, uncertainty: long, improvement: long },
        answers: {},
        dataset: [1, 2, 3].map(i => ({ id: 'r' + i, source: 'simulation', note: '', cells: {} })),
        todo: safety,
        ...overrides,
      }
    },
  }

  // ---- synthetic world: nothing here is a real account, class or membership ----
  const reviewed = (userId, classId, groupId, memberId, label) => ({ userId, classId, groupId, memberId, label, reviewedBy: 'synthetic-acceptance', reviewedAt: '2026-10-22' })
  const members = [
    reviewed('owner-a', 'class-a', null, 'm-owner-a', 'Owner A'),
    reviewed('owner-b', 'class-a', null, 'm-owner-b', 'Owner B'),
    reviewed('stu-a1', 'class-a', 'g1', 'm-a1', 'Avery'),
    reviewed('stu-a2', 'class-a', 'g1', 'm-a2', 'Blair'),
    reviewed('stu-a3', 'class-a', 'g2', 'm-a3', 'Casey'),
    reviewed('stu-b1', 'class-b', 'g1', 'm-b1', 'Devon'),
  ]
  const session = { userId: null }
  let attached = ['class-a']
  let n = 0
  const insertSpy = { calls: 0, duplicates: 0 }
  const deps = {
    authenticate: async () => {
      if (!session.userId) throw Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError' })
      return session.userId
    },
    canReview: async id => id === 'owner-a',
    membership: createReviewedRegistryMembership(members),
    get attachedClassIds() { return attached },
    collection: async () => {
      const col = client.db(DB_NAME).collection(store.researchCollectionName({}))
      const insertOne = col.insertOne.bind(col)
      col.insertOne = async doc => {
        insertSpy.calls++
        try { return await insertOne(doc) } catch (error) { if (error?.code === 11000) insertSpy.duplicates++; throw error }
      }
      return col
    },
    now: () => new Date(),
    newId: () => 'fb-' + ++n,
  }
  const as = id => { session.userId = id }
  const SLUG = 'holobox-digital-holography'
  const SLUG2 = 'resistor-network-tomography'
  const project = getProject(SLUG)
  const RECORDS = slug => `/api/research-projects/records?slug=${slug}`
  const get = async (slug, extra = '') => read(await http.handleRecordsGet(request('GET', RECORDS(slug) + extra), deps))
  const put = async body => read(await http.handleRecordsPut(request('PUT', '/api/research-projects/records', { body }), deps))
  const act = async body => read(await http.handleActionsPost(request('POST', '/api/research-projects/actions', { body }), deps))
  const keys = async (slug, extra = '') => read(await http.handleKeysGet(request('GET', `/api/research-projects/keys?slug=${slug}${extra}`), deps))
  const asset = async id => http.handleAssetGet(request('GET', '/api/research-projects/assets?id=' + encodeURIComponent(id)), deps)
  const open = async (user, slug = SLUG) => { as(user); return (await get(slug)).body }
  const saveAs = async (user, doc, base, slug = SLUG) => {
    const o = await open(user, slug)
    return put({ slug, viewer: o.viewer, baseRevision: base ?? o.record.revision, doc })
  }
  const col = () => client.db(DB_NAME).collection(store.researchCollectionName({}))
  const plan = text => ({ question: text, model: '', dataPlan: '', uncertainty: '', improvement: '' })

  await scenario('anonymous and non-member callers get nothing', async () => {
    as(null)
    for (const res of [await get(SLUG), await keys(SLUG), await read(await asset('holobox-inline-layout'))]) {
      assert.equal(res.status, 401)
    }
    as('random-clerk-user')
    for (const res of [await get(SLUG), await keys(SLUG)]) assert.equal(res.status, 403)
    assert.equal((await asset('holobox-inline-layout')).status, 403)
    assert.equal(await col().countDocuments(), 0)
  })

  await scenario('first-save concurrency: two members race, exactly one record, one 409 (real duplicate key)', async () => {
    as('stu-a1'); const v1 = (await get(SLUG)).body.viewer
    as('stu-a2'); const v2 = (await get(SLUG)).body.viewer
    const run = (user, viewer, text) => {
      const own = { ...deps, authenticate: async () => user }
      return http.handleRecordsPut(request('PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer, baseRevision: 0, doc: fullDoc(project, { plan: plan(text) }) } }), own).then(read)
    }
    const before = { ...insertSpy }
    const [r1, r2] = await Promise.all([run('stu-a1', v1, 'First save by Avery'), run('stu-a2', v2, 'First save by Blair')])
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409])
    assert.equal(await col().countDocuments({ slug: SLUG }), 1)
    const doc = await col().findOne({ slug: SLUG })
    assert.equal(doc.revision, 1)
    assert.equal(insertSpy.calls - before.calls, 2, 'both requests attempted the insert')
    assert.equal(insertSpy.duplicates - before.duplicates, 1, 'the unique _id rejected exactly one')
    const loser = r1.status === 409 ? r1 : r2
    assert.equal(loser.body.current.revision, 1)
  })

  await scenario('stale edits are refused with the current record, and ten parallel saves have one winner', async () => {
    await saveAs('stu-a1', fullDoc(project, { plan: plan('Avery edit two of the plan') }))
    const stale = await saveAs('stu-a2', fullDoc(project, { plan: plan('Blair stale edit of the plan') }), 1)
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'conflict')
    assert.equal(stale.body.current.doc.plan.question, 'Avery edit two of the plan')
    assert.equal((await col().findOne({ slug: SLUG })).plan.question, 'Avery edit two of the plan')
    const redo = await saveAs('stu-a2', fullDoc(project, { plan: plan('Blair merged edit of the plan') }), 2)
    assert.equal(redo.status, 200)
    assert.equal(redo.body.record.revision, 3)
    as('stu-a1'); const viewer = (await get(SLUG)).body.viewer
    const writes = await Promise.all(Array.from({ length: 10 }, (_, i) => http.handleRecordsPut(request('PUT', '/api/research-projects/records', { body: { slug: SLUG, viewer, baseRevision: 3, doc: fullDoc(project, { plan: plan('Racing writer number ' + i) }) } }), deps).then(read)))
    assert.equal(writes.filter(w => w.status === 200).length, 1)
    assert.equal(writes.filter(w => w.status === 409).length, 9)
    assert.equal((await col().findOne({ slug: SLUG })).revision, 4)
  })

  await scenario('cross-account, group and class denials; forged scope is rejected', async () => {
    const g1 = await col().findOne({ slug: SLUG, scope: 'group:g1' })
    const other = await saveAs('stu-a3', fullDoc(project, { plan: plan('Casey group two own plan') }), 0)
    assert.equal(other.status, 200)
    assert.equal((await col().findOne({ slug: SLUG, scope: 'group:g1' })).plan.question, g1.plan.question)
    const intruder = await saveAs('stu-a3', fullDoc(project, { plan: plan('Intruder into group one') }), 4)
    assert.equal(intruder.status, 409)
    assert.equal((await col().findOne({ slug: SLUG, scope: 'group:g1' })).revision, g1.revision)
    // Not attached: denied. Attached: a separate record even with the same group id.
    as('stu-b1'); assert.equal((await get(SLUG)).status, 403)
    attached = ['class-a', 'class-b']
    assert.equal((await saveAs('stu-b1', fullDoc(project, { plan: plan('Class B group one plan') }), 0)).status, 200)
    assert.equal(await col().countDocuments({ slug: SLUG, scope: 'group:g1' }), 2)
    attached = ['class-a']
    // A student cannot review or name another scope; neither can a personal-only owner.
    as('stu-a1')
    assert.equal((await get(SLUG, '&classId=class-a&scope=group:g2')).status, 403)
    as('owner-b')
    assert.equal((await get(SLUG, '&classId=class-a')).status, 403)
    assert.equal((await keys(SLUG, '&classId=class-a&scope=group:g1')).status, 403)
    const o = await open('stu-a1')
    const forged = await put({ slug: SLUG, viewer: o.viewer, baseRevision: 4, doc: fullDoc(project), classId: 'class-b', scope: 'group:g1' })
    assert.equal(forged.status, 400)
    // Another account in another tab: the old viewer key is refused.
    as('stu-a3')
    assert.equal((await put({ slug: SLUG, viewer: o.viewer, baseRevision: 4, doc: fullDoc(project) })).body.code, 'account_changed')
  })

  await scenario('submit, review, feedback, revise, accept, and controlled key release', async () => {
    // Owner A (review owner) works personally on a second project, and reviews owner B.
    const done = fullDoc(getProject(SLUG2), { answers: { 'p10-q01': { choice: 'b' } }, todo: {}, dataset: [] })
    assert.equal((await saveAs('owner-b', done, 0, SLUG2)).status, 200)
    let ob = await open('owner-b', SLUG2)
    assert.equal((await act({ slug: SLUG2, viewer: ob.viewer, action: 'submit', baseRevision: ob.record.revision })).status, 422, 'incomplete record is refused')
    const complete = fullDoc(getProject(SLUG2), { answers: { 'p10-q01': { choice: 'b' }, 'p10-q02': { choice: 'c' } } })
    const proj2 = getProject(SLUG2)
    complete.todo = Object.fromEntries(proj2.todo.filter(t => t.id.startsWith('sf:')).map(t => [t.id, true]))
    assert.equal((await saveAs('owner-b', complete, undefined, SLUG2)).status, 200)
    ob = await open('owner-b', SLUG2)
    const submitted = await act({ slug: SLUG2, viewer: ob.viewer, action: 'submit', baseRevision: ob.record.revision })
    assert.equal(submitted.status, 200)
    assert.equal(submitted.body.record.status, 'submitted')
    assert.equal((await saveAs('owner-b', complete, undefined, SLUG2)).status, 423, 'locked while submitted')
    // Keys withheld from the submitter until released.
    as('owner-b'); assert.equal((await keys(SLUG2)).status, 403)
    // Review as the exact review owner.
    as('owner-a')
    const rev = (await get(SLUG2, '&classId=class-a&scope=member:m-owner-b')).body
    assert.equal(rev.record.status, 'submitted')
    const sent = await act({ slug: SLUG2, viewer: rev.viewer, action: 'feedback', outcome: 'revision', rubric: { uncertainty: 2 }, comment: 'Quantify the uncertainty.', classId: 'class-a', scope: 'member:m-owner-b', reviewRevision: rev.record.reviewRevision, baseRevision: rev.record.revision })
    assert.equal(sent.status, 200)
    assert.equal(sent.body.record.status, 'revision_requested')
    // The submitter revises, resubmits; the reviewer accepts and releases the key.
    ob = await open('owner-b', SLUG2)
    assert.equal(ob.record.feedback[0].comment, 'Quantify the uncertainty.')
    assert.equal(ob.record.feedback[0].by, 'Teacher')
    const revised = structuredClone(complete)
    revised.plan.uncertainty = 'Reading uncertainty plus repeat scatter over five runs'
    assert.equal((await saveAs('owner-b', revised, undefined, SLUG2)).status, 200)
    ob = await open('owner-b', SLUG2)
    assert.equal((await act({ slug: SLUG2, viewer: ob.viewer, action: 'submit', baseRevision: ob.record.revision })).status, 200)
    as('owner-a')
    let r2 = (await get(SLUG2, '&classId=class-a&scope=member:m-owner-b')).body
    assert.equal((await act({ slug: SLUG2, viewer: r2.viewer, action: 'feedback', outcome: 'accept', comment: 'Good revision.', classId: 'class-a', scope: 'member:m-owner-b', reviewRevision: r2.record.reviewRevision, baseRevision: r2.record.revision })).body.record.status, 'accepted')
    r2 = (await get(SLUG2, '&classId=class-a&scope=member:m-owner-b')).body
    const types = r2.record.events.map(e => e.type)
    for (const t of ['created', 'submitted', 'revision_requested', 'accepted']) assert.ok(types.includes(t), 'missing event ' + t)
    assert.equal(r2.record.submissions.length, 2)
    const released = await act({ slug: SLUG2, viewer: r2.viewer, action: 'release_keys', released: true, classId: 'class-a', scope: 'member:m-owner-b', reviewRevision: r2.record.reviewRevision })
    assert.equal(released.status, 200)
    as('owner-b')
    const k = await keys(SLUG2)
    assert.equal(k.status, 200)
    assert.equal(k.body.auto['p10-q01'], true)
    assert.equal(k.body.teacher, undefined, 'teacher-only notes never reach the submitter')
    assert.ok(!JSON.stringify((await get(SLUG2)).body).includes(k.body.keys['p10-q05'].points[0]), 'keys never ride along with the record')
    // The review owner sees teacher-only notes and may download teacher assets; the submitter may not.
    as('owner-a'); assert.ok((await keys(SLUG2)).body.teacher.notes.length > 0)
    assert.equal((await asset('tomography-teacher-simulation-plot')).status, 200)
    as('owner-b'); assert.equal((await asset('tomography-teacher-simulation-plot')).status, 404)
    as('owner-a')
    r2 = (await get(SLUG2, '&classId=class-a&scope=member:m-owner-b')).body
    await act({ slug: SLUG2, viewer: r2.viewer, action: 'release_keys', released: false, classId: 'class-a', scope: 'member:m-owner-b', reviewRevision: r2.record.reviewRevision })
    as('owner-b'); assert.equal((await keys(SLUG2)).status, 403)
  })

  await scenario('protected asset route with the real files, traversal and a bounded body', async () => {
    as('stu-a1')
    const ok = await asset('seismometer-build-diagram')
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')
    assert.match(ok.headers.get('cache-control'), /no-store/)
    assert.match(await ok.text(), /<svg/)
    for (const id of ['../../package.json', '..%2F..%2F.env', 'guide', 'tomography-teacher-candidate-scores-csv']) assert.equal((await asset(id)).status, 404)
    const o = await open('stu-a1')
    const big = JSON.stringify({ slug: SLUG, viewer: o.viewer, baseRevision: 4, doc: { plan: { question: 'x'.repeat(200_000) } } })
    assert.equal((await put(big)).status, 413)
  })

  await scenario('reopen and reconnect: the data survives a new connection and a full mongod restart', async () => {
    const before = await col().find({}).sort({ _id: 1 }).toArray()
    assert.ok(before.length >= 4)
    await client.close()
    client = await connect()
    assert.deepEqual(await col().find({}).sort({ _id: 1 }).toArray(), before)
    // Restart the server process this script started, on the same data directory.
    await stopMongod()
    if (!LOGIC_CHECK) assert.notEqual(child.exitCode, null, 'mongod exited')
    startMongod()
    client = await connect()
    assert.deepEqual(await col().find({}).sort({ _id: 1 }).toArray(), before)
    // And the library still serves the saved record to its owner after the restart.
    as('stu-a3')
    const after = (await get(SLUG)).body
    assert.equal(after.record.doc.plan.question, 'Casey group two own plan')
    assert.equal(after.record.revision, 1)
  })

  await scenario('no other collection or database was written', async () => {
    const names = (await client.db(DB_NAME).listCollections().toArray()).map(c => c.name).sort()
    assert.deepEqual(names, [store.researchCollectionName({})])
    const dbs = (await client.db('admin').admin().listDatabases()).databases.map(d => d.name).filter(d => !['admin', 'local', 'config', DB_NAME].includes(d))
    assert.deepEqual(dbs, [])
    const indexes = await col().indexes()
    assert.deepEqual(indexes.map(i => i.name), ['_id_'], 'only the built-in _id index exists: no automatic index was created')
  })
}

let exitCode = 0
try {
  await main()
} catch (error) {
  exitCode = 1
  log(blocked ? String(error.message) : 'harness error: ' + (error?.stack || error))
  results.push({ name: blocked ? 'blocked' : 'harness', ok: false, error: String(error?.message || error) })
  if (blocked) exitCode = 2
} finally {
  try {
    await client?.db(DB_NAME).dropDatabase()
  } catch {
    // The server may already be down.
  }
  await stopMongod().catch(() => {})
  try { await client?.close() } catch { /* closed */ }
  const failed = results.filter(r => !r.ok)
  if (failed.length && !blocked) exitCode = 1
  mkdirSync(DATA, { recursive: true })
  writeFileSync(path.join(DATA, 'acceptance-result.json'), JSON.stringify({
    context: LOGIC_CHECK
      ? 'LOGIC CHECK ONLY: SYNTHETIC accounts and an in-memory stand-in that is NOT Mongo. Actual service and HTTP handlers; no persistence or restart is tested.'
      : 'SYNTHETIC accounts, classes and groups; loopback mongod 127.0.0.1; actual store, service and HTTP handlers',
    mode: LOGIC_CHECK ? 'logic-check' : 'mongod',
    startedAt: new Date(started).toISOString(), seconds: (Date.now() - started) / 1000,
    status: blocked ? 'blocked' : failed.length ? 'failed' : 'passed', blocked,
    passed: results.filter(r => r.ok).length, failed: failed.length, results,
  }, null, 2))
  log(`${results.filter(r => r.ok).length} passed, ${failed.length} failed. Result: ${path.join(DATA, 'acceptance-result.json')}`)
  process.exit(exitCode)
}
