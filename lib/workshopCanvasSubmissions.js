import { WORKSHOP_SESSION } from './workshopFeedback'
import { canvasId, CanvasError } from './workshopCanvasStore'
import { validCanvas } from './workshopCanvasModel'
import { referenceMatchesIdea } from './workshopPublication'

const MAX_VERSION = 1_000_000
const scopes = Array.from({ length: 10 }, (_, n) => ['1', '2'].map(idea => ({ group: 'g' + (n + 1), idea }))).flat()
const ids = scopes.map(({ group, idea }) => canvasId(group, idea))
const isVersion = n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_VERSION
const fail = () => { throw new CanvasError('Invalid submitted-drawing query.') }
const teacher = access => { if (access?.role !== 'teacher' || typeof access.userId !== 'string' || !access.userId) throw new CanvasError('Teacher access required.', 403) }
const match = selected => ({ _id: { $in: selected }, kind: 'group-canvas', session: WORKSHOP_SESSION })
export const submissionId = (group, idea, version) => `${WORKSHOP_SESSION}:${group}:${idea}:v${version}`
export function submissionQuery(request) {
    const params = new URL(request.url).searchParams
    for (const key of params.keys()) if (!['group', 'idea', 'limit', 'cursor', 'version'].includes(key) || params.getAll(key).length !== 1) fail()
    const group = params.get('group') ?? 'all', idea = params.get('idea') ?? 'all', rawVersion = params.get('version'), rawLimit = params.get('limit') ?? '8'
    if (!/^(all|g(?:[1-9]|10))$/.test(group) || !['all', '1', '2'].includes(idea) || !/^(?:[1-9]|1[0-2])$/.test(rawLimit)) fail()
    if (rawVersion !== null) {
        if (group === 'all' || idea === 'all' || !/^[1-9]\d{0,6}$/.test(rawVersion) || !isVersion(+rawVersion) || params.has('limit') || params.has('cursor')) fail()
        return { group, idea, version: +rawVersion }
    }
    const cursor = params.get('cursor')
    let snapshot = null
    if (cursor !== null) {
        try {
            if (!/^[A-Za-z0-9_-]{1,768}$/.test(cursor)) fail()
            const bytes = Buffer.from(cursor, 'base64url'); if (bytes.toString('base64url') !== cursor) fail()
            snapshot = JSON.parse(bytes.toString('utf8'))
            if (!snapshot || Object.keys(snapshot).sort().join(',') !== 'a,c,g,i,v' || snapshot.v !== 1 || snapshot.g !== group || snapshot.i !== idea || !Array.isArray(snapshot.c) || snapshot.c.length !== 20 || !snapshot.c.every(isVersion) || !Array.isArray(snapshot.a) || snapshot.a.length !== 2) fail()
            const [order, version] = snapshot.a
            if (!Number.isInteger(order) || order < 0 || order >= 20 || !isVersion(version) || version < 1 || version > snapshot.c[order] || group !== 'all' && scopes[order].group !== group || idea !== 'all' && scopes[order].idea !== idea) fail()
        } catch { fail() }
    }
    return { group, idea, limit: +rawLimit, snapshot }
}
export async function listCanvasSubmissions(store, access, query) {
    teacher(access)
    const { group, idea, limit, snapshot } = query
    const ceilings = snapshot?.c || Array(20).fill(0)
    if (!snapshot) {
        const rows = await store.aggregate([{ $match: match(ids) }, { $project: { _id: 1, version: 1 } }], { maxTimeMS: 5000 }).toArray()
        for (const row of rows) { const index = ids.indexOf(row._id); if (index >= 0 && isVersion(row.version)) ceilings[index] = row.version }
    }
    const selected = ids.filter((id, index) => (group === 'all' || scopes[index].group === group) && (idea === 'all' || scopes[index].idea === idea))
    const pipeline = [
        { $match: match(selected) },
        { $project: { _id: 0, order: { $indexOfArray: [ids, '$_id'] }, entries: { $map: { input: { $filter: { input: { $ifNull: ['$revisions', []] }, as: 'r', cond: { $and: [{ $eq: ['$$r.action', 'submit'] }, { $gte: ['$$r.version', 1] }, { $lte: ['$$r.version', { $arrayElemAt: [ceilings, { $indexOfArray: [ids, '$_id'] }] }] }] } } }, as: 'r', in: { version: '$$r.version', submittedAt: '$$r.at' } } } } },
        { $unwind: '$entries' },
        { $project: { order: 1, version: '$entries.version', submittedAt: '$entries.submittedAt' } },
    ]
    if (snapshot) pipeline.push({ $match: { $or: [{ order: { $gt: snapshot.a[0] } }, { order: snapshot.a[0], version: { $gt: snapshot.a[1] } }] } })
    pipeline.push({ $sort: { order: 1, version: 1 } }, { $limit: limit + 1 })
    const rows = await store.aggregate(pipeline, { maxTimeMS: 5000 }).toArray(), more = rows.length > limit, page = rows.slice(0, limit)
    const items = page.map(row => { const scope = scopes[row.order]; return { id: submissionId(scope.group, scope.idea, row.version), session: WORKSHOP_SESSION, ...scope, version: row.version, submittedAt: row.submittedAt } })
    const last = page.at(-1), nextCursor = more ? Buffer.from(JSON.stringify({ v: 1, g: group, i: idea, c: ceilings, a: [last.order, last.version] })).toString('base64url') : null
    return { items, nextCursor }
}
export async function readCanvasSubmission(store, access, { group, idea, version }) {
    teacher(access)
    const rows = await store.aggregate([
        { $match: match([canvasId(group, idea)]) },
        { $project: { _id: 0, entry: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$revisions', []] }, as: 'r', cond: { $and: [{ $eq: ['$$r.action', 'submit'] }, { $eq: ['$$r.version', version] }] } } }, 0] } } },
        { $project: { version: '$entry.version', submittedAt: '$entry.at', document: '$entry.document' } },
    ], { maxTimeMS: 5000 }).toArray()
    const row = rows[0]
    if (!row || row.version !== version || !row.document) throw new CanvasError('Submitted drawing not found.', 404)
    if (!validCanvas(row.document) || !referenceMatchesIdea(row.document.reference, group, idea)) throw new CanvasError('This submitted drawing cannot be previewed. The original record is kept.')
    return { id: submissionId(group, idea, version), session: WORKSHOP_SESSION, group, idea, version, submittedAt: row.submittedAt, document: row.document }
}
