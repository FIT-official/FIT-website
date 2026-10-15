// Owned loopback fixture with real stores/components and synthetic identities only.
import { createServer } from 'vite'
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { memoryDb } from '../../tests/groupCanvas/memory.mjs'
const repo = fileURLToPath(new URL('../../', import.meta.url)), root = fileURLToPath(new URL('./preview/', import.meta.url)), origin = 'http://127.0.0.1:4381'
const result = await build({ stdin: { contents: "export * as identity from './lib/workshopGuestIdentity.js'; export * as drafts from './lib/workshopGuestDraftStore.js'; export * as lessons from './lib/workshopGuestClassroomStore.js'; export * as canvas from './lib/workshopCanvasStore.js'; export * as assignments from './lib/workshopFeedbackAssignment.js';", resolveDir: repo }, bundle: true, write: false, format: 'esm', platform: 'node' })
const { identity, drafts, lessons, canvas, assignments } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const now = new Date('2026-10-16T00:00:00Z'), actors = Object.fromEntries(['alpha', 'beta', ...Array.from({ length: 40 }, (_, i) => 'client' + i)].map(key => [key, identity.guestAccess(identity.newGuest('g10', 'Synthetic ' + key, now).record, now)]))
let db = memoryDb(), store = db.collection('synthetic-lessons')
let activeWrites = 0, maxActiveWrites = 0
await store.insertOne({ ...lessons.emptyLesson(), refinementOpen: true, feedbackOpen: true })
const virtual = '\0synthetic-classroom-request'
const server = await createServer({ configFile: false, root, publicDir: path.join(repo, 'public'), cacheDir: path.join(repo, '../friday-live-preview-cache'), define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }, resolve: { alias: { '@': repo } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 4381, strictPort: true, fs: { allow: [repo] } }, plugins: [{ name: 'synthetic-classroom', resolveId(source, importer) { if (source === './GuestClassroom' && /Guest(?:Refinement|Feedback)Form\.jsx$/.test(importer || '')) return virtual; if (source === 'next/image') return '\0synthetic-image' }, load(id) { if (id === '\0synthetic-image') return `import React from 'react'; export default function Image({src,alt,width,height,className}) { return React.createElement('img', {src,alt,width,height,className}) }`; if (id === virtual) return `export async function classroomRequest(url, method, body) { const response = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body:JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw Object.assign(Error(result.error), {status:response.status}); return result }` }, configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/api/') && !['/__fixture/reset', '/__fixture/proof', '/__fixture/actor'].includes(req.url)) return next()
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
    try {
        const access = actors[req.headers['x-fixture-actor']]; if (!access) throw Object.assign(Error('Sign in'), {status:401}); const url = new URL(req.url, origin), group = url.searchParams.get('homeGroup') || access.group, idea = url.searchParams.get('idea'), kind = url.pathname.split('/').at(-1)
        if (req.method !== 'GET' && req.headers.origin !== origin) throw Object.assign(Error('Origin denied'), { status: 403 })
        if (url.pathname === '/__fixture/reset' && req.method === 'POST') { db = memoryDb(); store = db.collection('synthetic-lessons'); activeWrites = 0; maxActiveWrites = 0; await store.insertOne({ ...lessons.emptyLesson(), refinementOpen: true, feedbackOpen: true, retainedOriginal: 'synthetic prior class work' }); res.end('{"syntheticReset":true}'); return }
        if (url.pathname === '/__fixture/actor') { res.end(JSON.stringify({ ...access, projectVersion: lessons.emptyLesson().projectVersion })); return }
        if (url.pathname === '/__fixture/proof') { const root = await lessons.readLesson(store); res.end(JSON.stringify({ rootHash: createHash('sha256').update(JSON.stringify(root)).digest('hex'), maxActiveWrites, canvas: await canvas.exportCanvas(store, { role: 'teacher', userId: 'synthetic-fixture-review' }, 'g10', '1') })); return }
        if (group !== access.group) throw Object.assign(Error('Scope denied'), { status: 403 })
        if (req.method === 'GET') {
            const data = kind === 'drafts' ? { seat: access.seat, drafts: (await db.collection('synthetic-drafts').find({ seat: access.seat }).toArray()).map(drafts.draftView) } : kind === 'canvases' ? { ...await canvas.readCanvas(store, access, group, idea), seat: access.seat } : { ...lessons.classroomView(await lessons.readLesson(store), access), seat: access.seat, canvasEnabled: true }
            res.end(JSON.stringify(data)); return
        }
        let size = 0; const chunks = []; for await (const chunk of req) { size += chunk.length; if (size > 260000) throw Object.assign(Error('Oversize'), { status: 413 }); chunks.push(chunk) }
        const input = JSON.parse(Buffer.concat(chunks)), { expectedSeat, ...submission } = input
        if (req.headers['x-fixture-concurrency'] === '1') { activeWrites++; maxActiveWrites = Math.max(maxActiveWrites, activeWrites); res.once('close', () => { activeWrites-- }); await new Promise(resolve => setTimeout(resolve, 40)) }
        const data = kind === 'feedback-assignment' ? await assignments.assignFeedbackIdea(store, access, input, now) : kind === 'drafts' ? await drafts.saveWorkshopDraft(db.collection('synthetic-drafts'), access, input, now) : kind === 'canvases' ? { ...await canvas.writeCanvas(store, access, group, idea, input, { submissionsOpen: true, now }), seat: access.seat } : await lessons.submitClassroom(store, access, submission, now)
        res.end(JSON.stringify(data))
    } catch (error) { res.writeHead(error.status || 400); res.end(JSON.stringify({ error: error.message })) }
}) } }] })
await server.listen(); console.log('Synthetic Friday edit preview: ' + origin)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0) })
