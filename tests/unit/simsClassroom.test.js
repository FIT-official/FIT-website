import { afterEach, describe, expect, it, vi } from 'vitest'
import { classSimulationIds, classSimulations, MAX_CLASS_SIMULATIONS } from '@/lib/sims/classroom'
import { classroomView, emptyLesson, moderateClassroom } from '@/lib/workshopGuestClassroomStore'
import * as registry from '@/lib/sims/registry'
import { simsRegistry } from '@/content/sims/registry'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

function memoryLesson(initial = null) {
    let row = initial
    return {
        findOne: vi.fn(async () => row ? structuredClone(row) : null),
        insertOne: vi.fn(async value => {
            if (row) throw Object.assign(new Error('Duplicate key'), { code: 11000 })
            row = structuredClone(value)
        }),
        replaceOne: vi.fn(async (query, value) => {
            if (row?.version !== query.version) return { modifiedCount: 0 }
            row = structuredClone(value)
            return { modifiedCount: 1 }
        }),
        read: () => row,
    }
}
const teacher = { role: 'teacher', userId: 'synthetic-teacher' }

describe('simulations in the existing workshop lesson', () => {
    it('supports old lesson documents and suppresses unknown or non-live entries', () => {
        expect(classSimulationIds({})).toEqual([])
        expect(classSimulationIds({ simIds: 'sampling' })).toEqual([])
        expect(classSimulationIds({ simIds: ['sampling', 'unpublished-activity', 'sampling', null] })).toEqual(['sampling'])
        expect(classSimulations({ simIds: ['sampling'] })[0]).toMatchObject({ id: 'sampling', status: 'live' })
    })

    it('adds once using the existing lesson document and audit trail', async () => {
        const store = memoryLesson()
        const input = { action: 'addSimulation', simId: 'sampling' }
        const added = await moderateClassroom(store, teacher, input)
        const retried = await moderateClassroom(store, teacher, input)
        expect(added).toEqual({ saved: true, version: 1, simIds: ['sampling'] })
        expect(retried).toEqual(added)
        expect(store.insertOne).toHaveBeenCalledTimes(1)
        expect(store.replaceOne).not.toHaveBeenCalled()
        expect(store.read()).toMatchObject({ _id: '2026-10-09', feedback: [], refinements: [], simIds: ['sampling'] })
        expect(store.read().audit).toHaveLength(1)
        expect(store.read().audit[0]).toMatchObject({ action: 'addSimulation', actor: teacher.userId })
    })

    it('preserves parallel additions and unrelated existing class state', async () => {
        const initial = { ...emptyLesson(), version: 8, entryOpen: true, navigationVersion: 4 }
        const store = memoryLesson(initial)
        await Promise.all(['sampling', 'heat-path'].map(simId => moderateClassroom(store, teacher, { action: 'addSimulation', simId })))
        expect(store.read().simIds.sort()).toEqual(['heat-path', 'sampling'])
        expect(store.read()).toMatchObject({ version: 10, entryOpen: true, navigationVersion: 4, phaseVersion: 0 })
        expect(store.read().audit).toHaveLength(2)
    })

    it('returns a retryable conflict if the lesson keeps changing', async () => {
        vi.useFakeTimers()
        const store = memoryLesson({ ...emptyLesson(), version: 5 })
        store.replaceOne.mockResolvedValue({ modifiedCount: 0 })
        const assertion = expect(moderateClassroom(store, teacher, { action: 'addSimulation', simId: 'sampling' })).rejects.toMatchObject({ status: 409 })
        await vi.runAllTimersAsync()
        await assertion
        expect(store.replaceOne).toHaveBeenCalledTimes(20)
        expect(store.read()).toMatchObject({ version: 5, audit: [] })
        expect(store.read().simIds).toBeUndefined()
    })

    it('rejects student writes, unknown sims and client-supplied class targets', async () => {
        const store = memoryLesson()
        await expect(moderateClassroom(store, { role: 'student' }, { action: 'addSimulation', simId: 'sampling' })).rejects.toMatchObject({ status: 403 })
        expect(store.findOne).not.toHaveBeenCalled()
        await expect(moderateClassroom(store, teacher, { action: 'addSimulation', simId: 'unpublished-activity' })).rejects.toMatchObject({ status: 404 })
        await expect(moderateClassroom(store, teacher, { action: 'addSimulation', simId: 'sampling', classId: 'another-class' })).rejects.toMatchObject({ status: 400 })
        expect(store.insertOne).not.toHaveBeenCalled()
        expect(store.replaceOne).not.toHaveBeenCalled()
    })

    it('withdraws draft entries from existing classes and rejects new draft assignments', async () => {
        const entry = simsRegistry.find(row => row.id === 'sampling'), originalStatus = entry.status
        entry.status = 'draft'
        try {
            expect(classSimulationIds({ simIds: ['sampling', 'heat-path'] })).toEqual(['heat-path'])
            const store = memoryLesson({ ...emptyLesson(), simIds: ['sampling'] })
            await expect(moderateClassroom(store, teacher, { action: 'addSimulation', simId: 'sampling' })).rejects.toMatchObject({ status: 404 })
            expect(store.replaceOne).not.toHaveBeenCalled()
        } finally { entry.status = originalStatus }
    })

    it('bounds the existing class list without requiring a new collection', async () => {
        const realGetLiveSim = registry.getLiveSim
        vi.spyOn(registry, 'getLiveSim').mockImplementation(id => /^fixture-\d+$/.test(id) ? { id, title: id, status: 'live' } : realGetLiveSim(id))
        const ids = Array.from({ length: MAX_CLASS_SIMULATIONS + 1 }, (_, i) => 'fixture-' + i)
        expect(classSimulationIds({ simIds: ids })).toHaveLength(MAX_CLASS_SIMULATIONS)
        const store = memoryLesson({ ...emptyLesson(), version: 1, simIds: ids.slice(0, MAX_CLASS_SIMULATIONS) })
        await expect(moderateClassroom(store, teacher, { action: 'addSimulation', simId: ids.at(-1) })).rejects.toMatchObject({ status: 429 })
        expect(store.replaceOne).not.toHaveBeenCalled()
    })

    it('removes idempotently and exposes the assignment in the existing student view', async () => {
        const store = memoryLesson({ ...emptyLesson(), version: 2, simIds: ['sampling', 'heat-path'] })
        const student = { role: 'student', group: 'g1', seat: 'synthetic-student' }
        expect(classroomView(store.read(), student).simIds).toEqual(['sampling', 'heat-path'])
        await moderateClassroom(store, teacher, { action: 'removeSimulation', simId: 'sampling' })
        await moderateClassroom(store, teacher, { action: 'removeSimulation', simId: 'sampling' })
        expect(classroomView(store.read(), student).simIds).toEqual(['heat-path'])
        expect(store.read().version).toBe(3)
        expect(store.read().audit).toHaveLength(1)
    })
})
