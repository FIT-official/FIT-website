// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('mongoose', async importOriginal => {
    const actual = await importOriginal()
    return { ...actual, default: new actual.default.Mongoose() }
})
import mongoose from 'mongoose'

const telemetryKey = Symbol.for('fit.mongoPoolTelemetry.v1')
const originalCache = globalThis.mongoose
const originalTelemetry = globalThis[telemetryKey]
beforeEach(() => {
    delete globalThis.mongoose
    delete globalThis[telemetryKey]
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:1/no_network_fixture')
    vi.stubEnv('MONGO_POOL_TELEMETRY', 'true')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_IsolatedFixture123')
    vi.stubEnv('VERCEL_REGION', 'sin1')
    vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    if (originalCache === undefined) delete globalThis.mongoose
    else globalThis.mongoose = originalCache
    if (originalTelemetry === undefined) delete globalThis[telemetryKey]
    else globalThis[telemetryKey] = originalTelemetry
})

it('attaches to the real Mongoose-created driver client before its connection settles', async () => {
    let rejectConnection
    const network = vi.spyOn(mongoose.mongo.MongoClient.prototype, 'connect').mockImplementation(function () {
        return new Promise((_, reject) => { rejectConnection = reject })
    })
    const { connectToDatabase } = await import('@/lib/db')
    const first = connectToDatabase()
    const second = connectToDatabase()
    const settled = Promise.allSettled([first, second])
    const client = mongoose.connection.getClient()
    expect(client).toBeInstanceOf(mongoose.mongo.MongoClient)
    expect(client.options.appName).toBe('fit:preview:dpl_IsolatedFixture123')
    expect(client.listenerCount('connectionPoolCreated')).toBe(1)
    expect(client.listenerCount('connectionCheckOutFailed')).toBe(1)
    expect(globalThis.mongoose.conn).toBeNull()
    client.emit('connectionPoolCreated', { address: 'not-for-logging', options: { credentials: 'secret' } })
    expect(console.info).toHaveBeenCalledTimes(1)
    expect(JSON.parse(console.info.mock.calls[0][1]).counters.poolsCreated).toBe(1)
    const error = new Error('synthetic stopped connection')
    rejectConnection(error)
    expect(await settled).toEqual([{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }])
    expect(network).toHaveBeenCalledTimes(1)
    expect(globalThis.mongoose.promise).toBeNull()
})
