import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { blankCanvas } from '@/lib/workshopCanvasModel'
import { canvasId } from '@/lib/workshopCanvasStore'
import { WORKSHOP_SESSION } from '@/lib/workshopFeedback'
import { submissionQuery, listCanvasSubmissions, readCanvasSubmission } from '@/lib/workshopCanvasSubmissions'
import { CanvasPreviewQueue } from '@/lib/workshopCanvasPreviewQueue'
const h = vi.hoisted(() => ({ signedIn: false, admin: false, db: null }))
vi.mock('@/lib/workshopDatabase', () => ({ workshopDatabase: async () => h.db }))
vi.mock('@/lib/authenticate', () => { class UnauthorizedError extends Error {} return { UnauthorizedError, authenticate: async () => { if (!h.signedIn) throw new UnauthorizedError(); return { userId: 'synthetic-teacher' } } } })
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => h.admin }))
import * as route from '@/app/api/admin/workshop/canvas-submissions/route'
const at = '2026-10-15T08:00:00.000Z', access = { role: 'teacher', userId: 'synthetic-teacher' }, query = value => submissionQuery(new Request('https://fit.test/api/admin/workshop/canvas-submissions' + value))
beforeEach(() => { vi.stubEnv('WORKSHOP_CANVAS_ENABLED', 'true'); h.signedIn = false; h.admin = false; h.db = { collection: () => ({ aggregate: () => ({ toArray: async () => [] }) }) } })
afterEach(() => vi.unstubAllEnvs())
describe('submitted drawing API and query boundaries', () => {
    it('rejects unknown/duplicate selectors, invalid filters, limits and historical versions', () => {
        for (const value of ['?group=', '?idea=', '?limit=', '?group=g11', '?group=g1&group=g2', '?idea=0', '?limit=13', '?limit=01', '?session=other', '?collection=other', '?version=2', '?group=g1&idea=1&version=0', '?group=g1&idea=1&version=1&cursor=x']) expect(() => query(value)).toThrow()
        expect(query('?group=g10&idea=2&version=123')).toEqual({ group: 'g10', idea: '2', version: 123 })
    })
    it('bounds untrusted cursors and binds them to canonical scopes and filters', () => {
        const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url'), valid = { v: 1, g: 'all', i: 'all', c: Array(20).fill(6), a: [0, 2] }
        expect(query('?cursor=' + encode(valid)).snapshot).toEqual(valid)
        for (const row of [{ ...valid, c: [1] }, { ...valid, c: Array(20).fill(-1) }, { ...valid, a: [20, 2] }, { ...valid, a: [0, 7] }, { ...valid, g: 'g2' }, { ...valid, session: 'other' }]) expect(() => query('?cursor=' + encode(row))).toThrow()
        for (const cursor of ['x'.repeat(769), '==', 'not-json']) expect(() => query('?cursor=' + cursor)).toThrow()
    })
    it('uses projected metadata, canonical IDs, submitted actions and numeric order only', async () => {
        const pipelines = [], store = { aggregate: pipeline => { pipelines.push(pipeline); return { toArray: async () => pipelines.length === 1 ? [{ _id: canvasId('g1', '1'), version: 6 }] : [{ order: 0, version: 2, submittedAt: at }, { order: 0, version: 5, submittedAt: at }] } } }
        const page = await listCanvasSubmissions(store, access, query('?limit=1'))
        expect(page.items).toEqual([{ id: `${WORKSHOP_SESSION}:g1:1:v2`, session: WORKSHOP_SESSION, group: 'g1', idea: '1', version: 2, submittedAt: at }]); expect(page.nextCursor).toBeTruthy()
        expect(pipelines[0][0].$match._id.$in).toHaveLength(20); expect(pipelines[0][1]).toEqual({ $project: { _id: 1, version: 1 } })
        expect(JSON.stringify(pipelines[1])).toContain('submit'); expect(JSON.stringify(pipelines[1])).not.toMatch(/document|receipts|actor|studentName|seat|\$status/)
        await expect(listCanvasSubmissions(store, { role: 'student' }, query(''))).rejects.toMatchObject({ status: 403 })
    })
    it('returns one exact submitted document without other history or receipts', async () => {
        const store = { aggregate: () => ({ toArray: async () => [{ version: 2, submittedAt: at, document: blankCanvas() }] }) }
        expect(await readCanvasSubmission(store, access, query('?group=g1&idea=1&version=2'))).toEqual({ id: `${WORKSHOP_SESSION}:g1:1:v2`, session: WORKSHOP_SESSION, group: 'g1', idea: '1', version: 2, submittedAt: at, document: blankCanvas() })
        await expect(readCanvasSubmission(store, access, query('?group=g1&idea=1&version=5'))).rejects.toMatchObject({ status: 404 })
    })
    it('enforces existing teacher authentication and private GET-only responses', async () => {
        const req = () => new Request('https://fit.test/api/admin/workshop/canvas-submissions')
        expect((await route.GET(req())).status).toBe(401); h.signedIn = true; expect((await route.GET(req())).status).toBe(403); h.admin = true
        const response = await route.GET(req()); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie'); expect(await response.json()).toEqual({ items: [], nextCursor: null }); expect(route.POST).toBeUndefined()
        vi.stubEnv('WORKSHOP_CANVAS_ENABLED', 'false'); expect((await route.GET(req())).status).toBe(503)
    })
})
describe('bounded private preview queue', () => {
    it('limits concurrent loads, cancels uninterested cards and ignores late completions', async () => {
        const pending = [], load = vi.fn((item, signal) => new Promise(resolve => pending.push({ item, signal, resolve }))), queue = new CanvasPreviewQueue(load), callbacks = Array.from({ length: 4 }, () => vi.fn()), cancel = callbacks.map((fn, i) => queue.subscribe({ id: String(i) }, fn))
        await Promise.resolve(); expect(load).toHaveBeenCalledTimes(2); cancel[0](); expect(pending[0].signal.aborted).toBe(true); pending[0].resolve({ document: 'late' }); pending[1].resolve({ document: 'ok' }); await new Promise(resolve => setTimeout(resolve, 0)); expect(callbacks[0]).not.toHaveBeenCalled(); expect(callbacks[1]).toHaveBeenCalledOnce(); expect(queue.running).toBeLessThanOrEqual(2)
        queue.close(); for (const row of pending) row.resolve({ document: 'late' }); await new Promise(resolve => setTimeout(resolve, 0)); expect(callbacks[2]).not.toHaveBeenCalled(); expect(callbacks[3]).not.toHaveBeenCalled(); expect(queue.cache.size).toBe(0)
    })
    it('clears account-owned caches on close and reports auth failure without data callbacks', async () => {
        const failure = vi.fn(), callback = vi.fn(), queue = new CanvasPreviewQueue(async () => { throw Object.assign(Error('Expired'), { status: 401 }) }, { onAuthFailure: failure }); queue.subscribe({ id: 'one' }, callback); await new Promise(resolve => setTimeout(resolve, 0)); expect(failure).toHaveBeenCalledOnce(); expect(callback).not.toHaveBeenCalled(); queue.close()
    })
})
