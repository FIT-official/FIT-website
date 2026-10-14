// Starts and stops an empty, owned loopback database. Never loads application env files.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import net from 'node:net'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const repo = fileURLToPath(new URL('../../', import.meta.url))
const bundled = await build({ stdin: { contents: "export * as canvas from './lib/workshopCanvasStore.js'; export * as model from './lib/workshopCanvasModel.js';", resolveDir: repo }, bundle: true, write: false, format: 'esm', platform: 'node' })
const { canvas, model } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const require = createRequire(import.meta.url), { MongoClient } = require('mongoose').mongo
if (!process.argv[2]) throw Error('Pass an existing mongod executable.')
const root = new URL('../../../canvas-mongo-evidence/', import.meta.url); await fs.mkdir(root, { recursive: true }); const data = new URL('data-' + Date.now() + '/', root); await fs.mkdir(data)
const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)) }) })
const child = spawn(process.argv[2], ['--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', fileURLToPath(data), '--quiet'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
const closed = new Promise(resolve => child.once('close', resolve)), log = createWriteStream(new URL('mongo.log', root)), checks = []; let client
const receipt = { syntheticOnly: true, port, checks, startedAt: new Date().toISOString() }
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
try {
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Mongo startup timeout')), 45000); let tail = ''; const read = b => { log.write(b); tail = (tail + b).slice(-10000); if (tail.includes('Waiting for connections')) { clearTimeout(timeout); resolve() } }; child.stdout.on('data', read); child.stderr.on('data', read); child.once('error', reject) })
    client = new MongoClient(`mongodb://127.0.0.1:${port}/canvas_synthetic`, { serverSelectionTimeoutMS: 15000 }); await client.connect(); const db = client.db('canvas_synthetic'), store = db.collection('workshopGuestLessons')
    receipt.mongoVersion = (await client.db('admin').command({ buildInfo: 1 })).version
    const access = { role: 'student', guest: true, seat: 'guest_' + randomUUID(), group: 'g1' }, teacher = { role: 'teacher', userId: 'synthetic-teacher' }, drawing = n => ({ ...model.blankCanvas(), objects: [model.shapeObject('rect', [n, 20], [n + 100, 120], { colour: '#234e48', fill: 'none', size: 5 }, 'synthetic-rectangle')] }), input = (version, n = version) => ({ action: 'draft', expectedSeat: access.seat, expectedVersion: version, requestId: randomUUID(), document: drawing(n) })
    await store.insertOne({ _id: '2026-10-09', version: 8, refinements: ['synthetic existing work'], feedback: ['synthetic feedback'] })
    const first = input(0)
    await check('40 append-only drawings retain the original receipt and full revision history', async () => { await canvas.writeCanvas(store, access, 'g1', '1', first); for (let i = 1; i < 40; i++) await canvas.writeCanvas(store, access, 'g1', '1', input(i)); const retry = await canvas.writeCanvas(store, access, 'g1', '1', first); assert.equal(retry.ackVersion, 1); assert.equal(retry.version, 40); const row = await store.findOne({ _id: canvas.canvasId('g1', '1') }); assert.equal(row.revisions.length, 40); assert.equal(row.receipts.length, 40); assert.deepEqual(row.revisions[0].document, first.document); assert.equal(row.expiresAt, undefined) })
    await check('concurrent group writers have one atomic winner and four conflicts', async () => { const results = await Promise.allSettled([1, 2, 3, 4, 5].map(n => canvas.writeCanvas(store, { ...access, seat: 'guest_' + randomUUID() }, 'g1', '1', { ...input(40, n), expectedSeat: null }))); assert.equal(results.filter(r => r.status === 'rejected' && r.reason.status === 403).length, 5); const race = await Promise.allSettled([1, 2, 3, 4, 5].map(n => { const member = { ...access, seat: 'guest_' + randomUUID() }; return canvas.writeCanvas(store, member, 'g1', '1', { ...input(40, n), expectedSeat: member.seat }) })); assert.equal(race.filter(r => r.status === 'fulfilled').length, 1); assert.equal(race.filter(r => r.status === 'rejected' && r.reason.status === 409).length, 4); assert.equal((await store.findOne({ _id: canvas.canvasId('g1', '1') })).revisions.length, 41) })
    await check('submitted snapshots remain read-only and teacher restore appends without erasing', async () => { await canvas.writeCanvas(store, access, 'g1', '1', { ...input(41), action: 'submit' }, { submissionsOpen: true }); await assert.rejects(canvas.writeCanvas(store, access, 'g1', '1', input(42)), e => e.status === 409); const restored = await canvas.writeCanvas(store, teacher, 'g1', '1', { action: 'restore', requestId: randomUUID(), expectedVersion: 42, sourceVersion: 1 }); assert.equal(restored.version, 43); assert.deepEqual(restored.document, first.document); assert.equal((await canvas.readCanvas(store, access, 'g1', '1', 42)).readonly, true); const exported = await canvas.exportCanvas(store, teacher, 'g1', '1'); assert.equal(exported.revisions.length, 43); assert(!JSON.stringify(exported).includes(access.seat)) })
    await check('other groups and ideas are isolated; original written class data remains intact', async () => { await assert.rejects(canvas.readCanvas(store, access, 'g2', '1'), e => e.status === 403); assert.equal((await canvas.readCanvas(store, access, 'g1', '2')).version, 0); assert.deepEqual((await store.findOne({ _id: '2026-10-09' })).refinements, ['synthetic existing work']) })
    await check('a fresh database connection recovers all acknowledged revisions', async () => { const fresh = new MongoClient(`mongodb://127.0.0.1:${port}/canvas_synthetic`); try { await fresh.connect(); const row = await fresh.db('canvas_synthetic').collection('workshopGuestLessons').findOne({ _id: canvas.canvasId('g1', '1') }); assert.equal(row.revisions.length, 43); assert.equal(row.revisions[41].action, 'submit') } finally { await fresh.close() } })
    receipt.success = true
} catch (error) { receipt.success = false; receipt.error = error.stack; process.exitCode = 1; console.error(error.stack) }
finally { await client?.close(); child.kill(); await closed; log.end(); receipt.ownedMongoStopped = true; await fs.writeFile(new URL('receipt.json', root), JSON.stringify(receipt, null, 2)); console.log('Evidence: ' + fileURLToPath(root)) }
