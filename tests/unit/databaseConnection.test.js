// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mongoose = vi.hoisted(() => ({
    connect: vi.fn(), disconnect: vi.fn(), connection: { readyState: 0 },
}))
vi.mock('mongoose', () => ({ default: mongoose }))

const originalCache = globalThis.mongoose
const uri = 'mongodb://example.invalid/unit-test'
const load = () => import('@/lib/db')
function deferred() {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv('MONGODB_URI', uri)
    delete globalThis.mongoose
    mongoose.connection.readyState = 0
})
afterEach(() => {
    vi.unstubAllEnvs()
    if (originalCache === undefined) delete globalThis.mongoose
    else globalThis.mongoose = originalCache
})

describe('shared database connection', () => {
    it('keeps concurrent callers and a new module evaluation waiting for the same initial connection', async () => {
        const attempt = deferred()
        mongoose.connect.mockReturnValue(attempt.promise)
        const firstModule = await load()
        const callers = Array.from({ length: 8 }, () => firstModule.connectToDatabase())
        const sharedCache = globalThis.mongoose
        expect(sharedCache.promise).toBeTruthy()
        expect(sharedCache.conn).toBeNull()

        vi.resetModules()
        const secondModule = await load()
        let secondReturned = false
        const second = secondModule.connectToDatabase().then(value => { secondReturned = true; return value })
        await Promise.resolve()
        await Promise.resolve()
        expect(globalThis.mongoose).toBe(sharedCache)
        expect(secondReturned).toBe(false)
        expect(mongoose.connect).toHaveBeenCalledTimes(1)

        mongoose.connection.readyState = 1
        attempt.resolve(mongoose)
        expect(await Promise.all([...callers, second])).toEqual(Array(9).fill(mongoose))
        expect(sharedCache.conn).toBe(mongoose)
        expect(mongoose.disconnect).not.toHaveBeenCalled()
    })

    it('lets a later request retry after a rejected initial connection', async () => {
        const attempt = deferred()
        const failure = new Error('Temporary connection failure')
        mongoose.connect.mockReturnValueOnce(attempt.promise).mockResolvedValueOnce(mongoose)
        const { connectToDatabase } = await load()
        const callers = [connectToDatabase(), connectToDatabase()]
        const results = Promise.allSettled(callers)
        attempt.reject(failure)
        expect(await results).toEqual([
            { status: 'rejected', reason: failure }, { status: 'rejected', reason: failure },
        ])
        expect(globalThis.mongoose.conn).toBeNull()
        expect(globalThis.mongoose.promise).toBeNull()
        expect(await connectToDatabase()).toBe(mongoose)
        expect(mongoose.connect).toHaveBeenCalledTimes(2)
        expect(mongoose.disconnect).not.toHaveBeenCalled()
    })

    it('does not clear a newer pending attempt when an older promise rejects', async () => {
        const attempt = deferred()
        mongoose.connect.mockReturnValue(attempt.promise)
        const { connectToDatabase } = await load()
        const caller = connectToDatabase()
        const result = Promise.allSettled([caller])
        const newer = deferred()
        globalThis.mongoose.promise = newer.promise
        attempt.reject(new Error('Old attempt failed'))
        await result
        expect(globalThis.mongoose.promise).toBe(newer.promise)
    })

    it('reuses a successful connection across calls and module reloads without reopening it for a stale heartbeat', async () => {
        mongoose.connect.mockResolvedValue(mongoose)
        const first = await load()
        expect(await first.connectToDatabase()).toBe(mongoose)
        mongoose.connection.readyState = 0
        vi.resetModules()
        const second = await load()
        expect(await second.connectToDatabase()).toBe(mongoose)
        expect(await first.connectToDatabase()).toBe(mongoose)
        expect(mongoose.connect).toHaveBeenCalledTimes(1)
        expect(mongoose.disconnect).not.toHaveBeenCalled()
    })

    it('caps per-client pool growth and expires idle sockets without changing operation timeouts', async () => {
        mongoose.connect.mockResolvedValue(mongoose)
        const { connectToDatabase } = await load()
        await connectToDatabase()
        expect(mongoose.connect).toHaveBeenCalledWith(uri, {
            bufferCommands: false, maxPoolSize: 10, minPoolSize: 0, maxIdleTimeMS: 60000,
        })
        expect(mongoose.disconnect).not.toHaveBeenCalled()
    })
})
