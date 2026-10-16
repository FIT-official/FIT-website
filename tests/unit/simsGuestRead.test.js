import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ database: vi.fn(), collection: vi.fn(), aggregate: vi.fn(), updateOne: vi.fn(), findOne: vi.fn() }))
vi.mock('@/lib/workshopDatabase', () => ({ workshopDatabase: h.database }))
vi.mock('@/lib/workshopGuestAccess', () => ({ verifyGuestHome: vi.fn() }))

import { readGuestClassroom } from '@/lib/workshopGuestRead'
import { emptyLesson } from '@/lib/workshopGuestClassroomStore'
import { GUEST_CLASS_EXPIRY } from '@/lib/workshopGuestPolicy'

const seat = 'guest_00000000-0000-4000-8000-000000000000'
const request = () => new Request('https://www.fixitoday.com/api/workshop/guest/classroom', {
    headers: { cookie: 'fit_workshop_guest=' + '0'.repeat(64) },
})
const timing = { measure: (_name, operation) => operation() }
const projection = () => h.aggregate.mock.calls.at(-1)[0][2].$lookup.pipeline[1].$project

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-09T02:00:00Z'))
    vi.stubEnv('WORKSHOP_GUEST_ENABLED', 'true')
    h.database.mockResolvedValue({ collection: h.collection })
    h.collection.mockImplementation(name => {
        if (name === 'workshopGuestSessions') return { aggregate: h.aggregate, updateOne: h.updateOne, findOne: h.findOne }
        if (name === 'workshopGuestLessons') return { collectionName: name }
        throw new Error('Unexpected collection: ' + name)
    })
    h.aggregate.mockReturnValue({ toArray: async () => [{
        session: '2026-10-09', seat, group: 'g1', name: 'Synthetic student', enabled: true,
        expiresAt: new Date(GUEST_CLASS_EXPIRY), lesson: [emptyLesson()],
    }] })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('simulation fields in guest lesson reads', () => {
    it.each([undefined, '', '0', 'true', 'false', '01', '1 '])('does not project simIds when flag is %s', async value => {
        vi.stubEnv('SIMS_ADD_TO_CLASS', value)
        const result = await readGuestClassroom(request(), timing)
        expect(projection()).not.toHaveProperty('simIds')
        expect(result.state).toEqual(emptyLesson())
        expect(h.aggregate).toHaveBeenCalledTimes(1)
        expect(h.collection.mock.calls).toEqual([['workshopGuestSessions'], ['workshopGuestLessons']])
        expect(h.updateOne).not.toHaveBeenCalled()
        expect(h.findOne).not.toHaveBeenCalled()
    })

    it('adds only the simulation projection when enabled', async () => {
        vi.stubEnv('SIMS_ADD_TO_CLASS', undefined)
        await readGuestClassroom(request(), timing)
        const previous = projection()
        vi.stubEnv('SIMS_ADD_TO_CLASS', '1')
        await readGuestClassroom(request(), timing)
        expect(projection()).toEqual({ ...previous, simIds: 1 })
        expect(h.updateOne).not.toHaveBeenCalled()
    })
})
