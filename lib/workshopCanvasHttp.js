import { CanvasError } from './workshopCanvasStore'
export function requireCanvasEnabled(env = process.env) { if (env.WORKSHOP_CANVAS_ENABLED !== 'true') throw new CanvasError('Drawing workspace is not activated yet.', 503) }
export function canvasQuery(request, teacher = false) {
    const url = new URL(request.url), allowed = teacher ? ['group', 'idea', 'revision', 'export'] : ['homeGroup', 'idea', 'revision']
    if ([...url.searchParams.keys()].some(k => !allowed.includes(k))) throw new CanvasError('Invalid drawing address.')
    const idea = url.searchParams.get('idea'), revision = url.searchParams.get('revision')
    if (!['1', '2'].includes(idea) || revision !== null && !/^[1-9]\d{0,6}$/.test(revision)) throw new CanvasError('Choose an existing idea and saved revision.')
    return { group: url.searchParams.get(teacher ? 'group' : 'homeGroup'), idea, revision: revision === null ? undefined : Number(revision), exporting: teacher && url.searchParams.get('export') === '1' }
}
export async function canvasBody(request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new CanvasError('Use JSON.', 415)
    if (Number(request.headers.get('content-length')) > 260000) throw new CanvasError('Drawing request is too large.', 413)
    const reader = request.body?.getReader(); if (!reader) throw new CanvasError('Drawing request is empty.')
    let size = 0, timer; const chunks = []
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { reader.cancel().catch(() => {}); reject(new CanvasError('Drawing request timed out. Retry the saved device copy.', 408)) }, 10000) })
    try { while (true) { const { done, value } = await Promise.race([reader.read(), timeout]); if (done) break; size += value.length; if (size > 260000) { await reader.cancel(); throw new CanvasError('Drawing request is too large.', 413) }; chunks.push(value) }; try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new CanvasError('Invalid drawing JSON.') } } finally { clearTimeout(timer); reader.releaseLock() }
}
