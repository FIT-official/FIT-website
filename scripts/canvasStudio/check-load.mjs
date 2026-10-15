// Loopback only: 48 synthetic HTTP pupil flows, actual routes and owned Mongo.
// Conflict reconciliation below is an explicit test decision, not product auto-merge.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
const origin = 'http://127.0.0.1:45171', out = fileURLToPath(new URL('../../../studio-evidence/load/', import.meta.url))
await fs.mkdir(out, { recursive: true })
const samples = [], checks = [], actors = [], uploads = new Map(), failures = []
let conflicts = 0, networkDrops = 0, success = false, failure, active = 0, peak = 0
async function call(actor, pathname, { body, mime, fault, label = pathname } = {}) {
    const start = performance.now(); active++; peak = Math.max(peak, active)
    try {
        const response = await fetch(origin + pathname, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: actor?.cookie || '', Origin: origin, ...(body === undefined ? {} : { 'Content-Type': mime || 'application/json' }), ...(fault ? { 'x-fixture-disconnect': fault } : {}) }, ...(body === undefined ? {} : { body: mime ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(20000) })
        const data = await response.json(); samples.push({ operation: label, ms: performance.now() - start, status: response.status })
        if (response.status === 409) conflicts++
        return { status: response.status, data }
    } catch (error) { samples.push({ operation: label, ms: performance.now() - start, status: 'network' }); if (fault) { actor.faultInjected = true; networkDrops++; return { status: 'network' } }; throw error }
    finally { active-- }
}
const canvasUrl = actor => '/api/workshop/guest/canvases?homeGroup=' + actor.group + '&idea=2'
async function read(actor) { const r = await call(actor, canvasUrl(actor), { label: 'canvas GET' }); assert.equal(r.status, 200); return r.data }
async function write(actor, payload, fault) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const r = await call(actor, canvasUrl(actor), { body: payload, fault: actor.faultInjected ? undefined : fault, label: payload.action === 'submit' ? 'submit POST' : 'canvas POST' })
        if (r.status !== 'network') return r
    }
    throw Error('Synthetic disconnect did not recover with the same receipt')
}
try {
    for (let i = 0; i < 48; i++) {
        const response = await fetch(origin + '/__fixture/actor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: 'client' + i }) }), data = await response.json()
        assert(response.ok && data.seat && data.group)
        actors.push({ ...data, i, cookie: response.headers.getSetCookie().map(row => row.split(';')[0]).join('; ') })
    }
    const before = await fetch(origin + '/__fixture/proof').then(r => r.json()), baseline = await fetch(origin + '/__fixture/load-stats').then(r => r.json()), image = await fs.readFile(new URL('../../../studio-evidence/fixtures/load-textured.png', import.meta.url)), startedAt = performance.now()
    assert(image.length <= 4 * 1024 * 1024, 'Synthetic image must fit the published upload limit')
    await Promise.all(actors.map(async actor => {
        try {
            const classroom = await call(actor, '/api/workshop/guest/classroom?homeGroup=' + actor.group, { label: 'classroom GET' }); assert.equal(classroom.status, 200); assert.equal(classroom.data.seat, actor.seat)
            const content = Object.fromEntries(['feedbackUsed', 'problemStatement', 'solutionDescription', 'illustrationNotes', 'change', 'reason', 'test'].map(field => [field, 'Synthetic contribution ' + actor.i + ' ' + field]))
            const draft = await call(actor, '/api/workshop/guest/drafts?homeGroup=' + actor.group, { body: { seat: actor.seat, topic: 'refinement-' + actor.group + '-idea1', expectedVersion: 0, requestId: randomUUID(), content }, label: 'written draft POST' }); assert.equal(draft.status, 200); assert.equal(draft.data.version, 1)
            actor.content = content
            if (!uploads.has(actor.group)) uploads.set(actor.group, call(actor, '/api/workshop/guest/canvas-images?homeGroup=' + actor.group + '&idea=2', { body: image, mime: 'image/png', label: 'image POST' }).then(r => { assert.equal(r.status, 200); return r.data.image }))
            const uploaded = await uploads.get(actor.group); assert(uploaded?.key)
            const mark = { id: randomUUID(), type: 'rect', x: 30 + actor.i * 20, y: 100, w: 12, h: 15, colour: '#234e48', fill: 'none', size: 3, opacity: 1 }; actor.mark = mark
            const fault = actor.i < 8 ? 'before' : actor.i < 16 ? 'after' : undefined
            for (let attempt = 0; attempt < 18; attempt++) {
                const current = await read(actor), document = { ...current.document, image: uploaded, objects: [...current.document.objects, mark] }
                const payload = { action: 'draft', expectedSeat: actor.seat, expectedVersion: current.version, requestId: randomUUID(), document }, r = await write(actor, payload, fault)
                if (r.status === 409) continue
                assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.document.objects.some(row => row.id === mark.id)); actor.ackVersion = r.data.ackVersion; return
            }
            throw Error('CAS retries exhausted')
        } catch (error) { failures.push({ syntheticActor: actor.i, error: error.message }); throw error }
    }))
    const pupilWorkMs = performance.now() - startedAt
    checks.push('All 48 simultaneous HTTP pupil flows saved their own written draft and unique shared-canvas annotation without lost updates')
    await Promise.all(actors.map(async actor => {
        const r = await call(actor, '/api/workshop/guest/drafts?homeGroup=' + actor.group, { label: 'written draft GET' }); assert.equal(r.status, 200); const row = r.data.drafts.find(row => row.topic === 'refinement-' + actor.group + '-idea1'); assert.equal(row.version, 1); assert.deepEqual(row.snapshots[0].content, actor.content)
    }))
    const groups = actors.slice(0, 10), snapshots = new Map()
    await Promise.all(groups.map(async actor => {
        const current = await read(actor), expected = actors.filter(row => row.group === actor.group).map(row => row.mark.id).sort()
        assert.deepEqual(current.document.objects.map(row => row.id).sort(), expected); assert.equal(current.history.length, expected.length); assert(current.document.image.key.startsWith(actor.group + '-2-'))
        const payload = { action: 'submit', expectedSeat: actor.seat, expectedVersion: current.version, requestId: randomUUID(), document: current.document }, pair = await Promise.all([write(actor, payload), write(actor, payload)])
        for (let r of pair) { if (r.status === 409) r = await write(actor, payload); assert.equal(r.status, 200); assert.equal(r.data.ackVersion, current.version + 1) }
        const submitted = await read(actor); assert.equal(submitted.history.filter(row => row.action === 'submit').length, 1); assert.equal(submitted.version, expected.length + 1); assert.deepEqual(submitted.document, current.document); snapshots.set(actor.group, submitted)
    }))
    checks.push('Read-back confirms 48 isolated written drafts, 48 exact marks, ten private images and ten single immutable submissions despite duplicate simultaneous submit requests')
    const teacher = { cookie: 'fixture_actor=teacher' }, gallery = await call(teacher, '/api/admin/workshop/canvas-submissions?idea=2&limit=12', { label: 'teacher gallery GET' }); assert.equal(gallery.status, 200); assert.equal(gallery.data.items.length, 10)
    await Promise.all(gallery.data.items.map(async item => { const r = await call(teacher, '/api/admin/workshop/canvas-submissions?group=' + item.group + '&idea=2&version=' + item.version, { label: 'teacher snapshot GET' }); assert.equal(r.status, 200); assert.deepEqual(r.data.document, snapshots.get(item.group).document) }))
    checks.push('Teacher gallery and every exact submitted snapshot match the verified student documents')
    const after = await fetch(origin + '/__fixture/proof').then(r => r.json()), stats = await fetch(origin + '/__fixture/load-stats').then(r => r.json())
    assert(after.originalRootKept && after.originalSessionsKept && after.originalDrawingKept && after.serviceSubmissionKept); assert.deepEqual(after.document, before.document); assert.deepEqual(after.history, before.history)
    assert.equal(stats.faults.before - baseline.faults.before, 8); assert.equal(stats.faults.after - baseline.faults.after, 8); assert.equal(networkDrops, 16); assert(conflicts > 0)
    checks.push('Eight before-write and eight lost-ack disconnects recover with the same receipt; explicit CAS reconciliation preserves every mark and all original fixture records')
    const percentile = (values, q) => Math.round(values[Math.min(values.length - 1, Math.ceil(values.length * q) - 1)] * 100) / 100
    const operations = Object.fromEntries([...new Set(samples.map(row => row.operation))].map(operation => { const rows = samples.filter(row => row.operation === operation), values = rows.map(row => row.ms).sort((a, b) => a - b); return [operation, { requests: rows.length, p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), p99Ms: percentile(values, .99), statuses: Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length])) }] }))
    const unexpected = samples.filter(row => row.status !== 200 && row.status !== 409 && row.status !== 'network'); assert.equal(unexpected.length, 0)
    success = true; await fs.writeFile(out + '/metrics.json', JSON.stringify({ syntheticOnly: true, loopbackOnly: true, pupilFlows: 48, browserCount: 0, sharedCanvases: 10, imageFixture: {mime:'image/png',width:image.readUInt32BE(16),height:image.readUInt32BE(20),bytes:image.length,uploads:10}, startPattern: '48 HTTP workers start together; 4-5 pupils share each group canvas', peakClientRequests: peak, peakActualRouteHandlers: stats.peak, totalRequests: samples.length, workloadMs: Math.round(pupilWorkMs), totalMs: Math.round(performance.now() - startedAt), expectedCasConflicts: conflicts, expectedNetworkDrops: networkDrops, unexpectedErrors: unexpected.length, correctWrittenDrafts: 48, correctAnnotationMarks: 48, exactSubmissions: 10, duplicateSubmissions: 0, operations, limitations: 'One Windows loopback Node process and Mongo 8.0.32, no production network/Clerk/Vercel cold starts. HTTP load, not 48 browsers. Does not establish a production SLA or zero-crash guarantee.' }, null, 2))
} catch (error) { failure = error }
finally { await fs.writeFile(out + '/receipt.json', JSON.stringify({ success, syntheticOnly: true, checks, failures, ...(failure ? { error: failure.stack } : {}) }, null, 2)); console.log(JSON.stringify({ success, checks, failures })); if (failure) throw failure }
