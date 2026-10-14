// Synthetic loopback fixture only. No .env, real identity, or production data is read.
import { createServer } from 'vite'
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { memoryDb } from '../../tests/groupCanvas/memory.mjs'
const repo = fileURLToPath(new URL('../../', import.meta.url)), root = fileURLToPath(new URL('./preview/', import.meta.url)), origin = 'http://127.0.0.1:4341'
const bundle = await build({ stdin: { contents: "export * as canvas from './lib/workshopCanvasStore.js'; export * as identity from './lib/workshopGuestIdentity.js';", resolveDir: repo }, bundle: true, write: false, format: 'esm', platform: 'node' })
const { canvas, identity } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const now = new Date('2026-10-16T00:00:00Z'), actors = Object.fromEntries([['alpha', 'g1'], ['partner', 'g1'], ['beta', 'g2']].map(([key, group]) => [key, identity.guestAccess(identity.newGuest(group, 'Synthetic ' + key, now).record, now)])); actors.teacher = { role: 'teacher', userId: 'synthetic-teacher' }
let db = memoryDb(), submissionsOpen = true
const server = await createServer({ configFile: false, root, publicDir: path.join(repo, 'public'), cacheDir: path.join(repo, '../canvas-preview-cache'), define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }, resolve: { alias: { '@': repo } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 4341, strictPort: true, fs: { allow: [repo] } }, plugins: [{ name: 'synthetic-canvas-api', configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/__fixture/')) return next()
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
    try {
        const url = new URL(req.url, origin), actor = actors[req.headers['x-fixture-actor']]
        if (req.method !== 'GET' && req.headers.origin !== origin) throw Object.assign(Error('Origin denied'), { status: 403 })
        if (url.pathname === '/__fixture/reset' && req.method === 'POST') { db = memoryDb(); submissionsOpen = true; res.end('{"syntheticReset":true}'); return }
        if (!actor) throw Object.assign(Error('Sign in'), { status: 401 })
        if (url.pathname === '/__fixture/actor') { res.end(JSON.stringify({ ...actor, refinementOpen: submissionsOpen })); return }
        const teacher = url.pathname.startsWith('/api/admin/'); if (teacher && actor.role !== 'teacher') throw Object.assign(Error('Teacher access required'), { status: 403 })
        const group = url.searchParams.get(teacher ? 'group' : 'homeGroup'), idea = url.searchParams.get('idea'), store = db.collection('synthetic-canvases')
        if (req.method === 'GET') { const row = url.searchParams.get('export') === '1' ? await canvas.exportCanvas(store, actor, group, idea) : await canvas.readCanvas(store, actor, group, idea, url.searchParams.has('revision') ? +url.searchParams.get('revision') : undefined); res.end(JSON.stringify({ ...row, seat: actor.seat })); return }
        const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 260000) throw Object.assign(Error('Oversize'), { status: 413 }); chunks.push(chunk) }
        const payload = JSON.parse(Buffer.concat(chunks)); res.end(JSON.stringify({ ...await canvas.writeCanvas(store, actor, group, idea, payload, { submissionsOpen }), seat: actor.seat }))
    } catch (e) { res.writeHead(e.status || 400); res.end(JSON.stringify({ error: e.message })) }
}) } }] })
await server.listen(); console.log('Synthetic canvas preview: ' + origin)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0) })
