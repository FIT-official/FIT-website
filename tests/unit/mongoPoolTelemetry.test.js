// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachMongoPoolTelemetry, mongoDeploymentAttribution } from '@/lib/mongoPoolTelemetry'

const key = Symbol.for('fit.mongoPoolTelemetry.v1')
const saved = globalThis[key]
let log, time
beforeEach(() => {
    delete globalThis[key]
    vi.stubEnv('MONGO_POOL_TELEMETRY', 'true')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_TestOnly123')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '')
    vi.stubEnv('VERCEL_REGION', 'sin1')
    log = vi.spyOn(console, 'info').mockImplementation(() => {})
    time = vi.spyOn(performance, 'now').mockReturnValue(0)
})
afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    if (saved === undefined) delete globalThis[key]
    else globalThis[key] = saved
})
const records = () => log.mock.calls.map(call => JSON.parse(call[1]))

describe('safe deployment attribution', () => {
    it('uses only bounded deployment and environment metadata in the handshake', () => {
        expect(mongoDeploymentAttribution(process.env)).toEqual({
            appName: 'fit:preview:dpl_TestOnly123',
            environment: 'preview', deployment: 'dpl_TestOnly123', region: 'sin1',
        })
    })
    it('falls back to a short verified git hash when no deployment ID exists', () => {
        expect(mongoDeploymentAttribution({ NODE_ENV: 'test', VERCEL_GIT_COMMIT_SHA: 'A'.repeat(40) })).toEqual({
            appName: 'fit:test:git-aaaaaaaaaaaa', environment: 'test', deployment: 'git-aaaaaaaaaaaa', region: 'unknown',
        })
    })
    it.each(['mongodb://secret@host/customer', 'dpl_a\nprivate', 'dpl_' + 'a'.repeat(65), '<script>', 'dpl_customer@example.com'])('rejects unstructured or overlong attribution %s', value => {
        const result = mongoDeploymentAttribution({
            VERCEL_ENV: value, VERCEL_DEPLOYMENT_ID: value, VERCEL_GIT_COMMIT_SHA: value,
            VERCEL_REGION: value, NODE_ENV: value, MONGODB_URI: value, VERCEL_URL: value,
        })
        expect(result).toEqual({ appName: 'fit:unknown:unattributed', environment: 'unknown', deployment: 'unattributed', region: 'unknown' })
    })
    it('stays below the driver appName byte limit with the longest accepted deployment', () => {
        expect(Buffer.byteLength(mongoDeploymentAttribution({ VERCEL_ENV: 'development', VERCEL_DEPLOYMENT_ID: 'dpl_' + 'A'.repeat(64) }).appName)).toBeLessThan(128)
    })
})

describe('bounded opt-in pool counters', () => {
    it.each([undefined, '', 'false', '1', 'TRUE'])('does nothing when not explicitly enabled: %s', flag => {
        vi.stubEnv('MONGO_POOL_TELEMETRY', flag)
        const client = new EventEmitter()
        attachMongoPoolTelemetry(client)
        client.emit('connectionCreated', {})
        expect(client.eventNames()).toEqual([])
        expect(log).not.toHaveBeenCalled()
        expect(globalThis[key]).toBeUndefined()
    })
    it('attaches once across duplicate calls and module evaluations', async () => {
        const client = new EventEmitter()
        attachMongoPoolTelemetry(client)
        attachMongoPoolTelemetry(client)
        vi.resetModules()
        const reloaded = await import('@/lib/mongoPoolTelemetry')
        reloaded.attachMongoPoolTelemetry(client)
        expect(client.eventNames()).toHaveLength(6)
        expect(client.listenerCount('connectionCreated')).toBe(1)
        client.emit('connectionCreated', {})
        expect(records()[0].counters).toMatchObject({ clientsObserved: 1, connectionsCreated: 1 })
    })
    it('counts lifecycle and checkout failures without exposing event data', () => {
        const client = new EventEmitter()
        attachMongoPoolTelemetry(client)
        const sensitive = { address: 'customer-db.example:27017', connectionId: 12345, command: { find: 'people', email: 'person@example.com' }, error: new Error('mongodb://user:secret@host'), options: { credentials: 'secret' }, reason: 'secret failure' }
        client.emit('connectionPoolCreated', sensitive)
        client.emit('connectionCreated', sensitive)
        client.emit('connectionClosed', sensitive)
        client.emit('connectionPoolCleared', sensitive)
        for (const reason of ['timeout', 'connectionError', 'poolClosed', 'unknown-customer-text']) client.emit('connectionCheckOutFailed', { ...sensitive, reason })
        time.mockReturnValue(60_000)
        client.emit('connectionPoolClosed', sensitive)
        const record = records()[1]
        expect(record.counters).toEqual({ clientsObserved: 1, poolsCreated: 1, poolsClosed: 1, poolsCleared: 1, connectionsCreated: 1, connectionsClosed: 1, checkoutsFailed: 4 })
        expect(record.checkoutFailureReasons).toEqual({ timeout: 1, connectionError: 1, poolClosed: 1, other: 1 })
        expect(Object.keys(record).sort()).toEqual(['schema', 'event', 'appName', 'environment', 'deployment', 'region', 'instance', 'counters', 'checkoutFailureReasons', 'saturated'].sort())
        expect(record.instance).toMatch(/^[a-f0-9-]{36}$/)
        expect(JSON.stringify(records())).not.toMatch(/secret|customer|person@|people|12345/)
        expect(log.mock.calls.every(call => call[1].length < 1024)).toBe(true)
    })
    it('shares the one-per-minute limit across clients while retaining cumulative counters', () => {
        const clients = [new EventEmitter(), new EventEmitter()]
        clients.forEach(attachMongoPoolTelemetry)
        for (let i = 0; i < 20_000; i++) clients[i % 2].emit('connectionCreated', {})
        expect(log).toHaveBeenCalledTimes(1)
        time.mockReturnValue(59_999)
        clients[0].emit('connectionClosed', {})
        expect(log).toHaveBeenCalledTimes(1)
        time.mockReturnValue(60_000)
        clients[1].emit('connectionClosed', {})
        expect(log).toHaveBeenCalledTimes(2)
        expect(records()[1].counters).toMatchObject({ clientsObserved: 2, connectionsCreated: 20_000, connectionsClosed: 2 })
    })
    it('never propagates a logging failure or floods retries after one', () => {
        const client = new EventEmitter()
        attachMongoPoolTelemetry(client)
        log.mockImplementation(() => { throw new Error('broken sink') })
        expect(() => client.emit('connectionCreated', {})).not.toThrow()
        for (let i = 0; i < 100; i++) client.emit('connectionCreated', {})
        expect(log).toHaveBeenCalledTimes(1)
    })
    it('has bounded counters even during prolonged churn', () => {
        const client = new EventEmitter()
        attachMongoPoolTelemetry(client)
        globalThis[key].counters.connectionsCreated = 2_147_483_647
        client.emit('connectionCreated', {})
        expect(records()[0].counters.connectionsCreated).toBe(2_147_483_647)
        expect(records()[0].saturated).toBe(true)
    })
    it('does not inspect commands, error objects or addresses and never subscribes to command events', () => {
        const client = new EventEmitter()
        attachMongoPoolTelemetry(client)
        const payload = Object.defineProperties({}, Object.fromEntries(['address', 'error', 'command', 'options'].map(name => [name, { get() { throw new Error('must not read') } }])))
        expect(() => client.emit('connectionCreated', payload)).not.toThrow()
        expect(records()).toHaveLength(1)
        expect(client.listenerCount('commandStarted')).toBe(0)
    })
    it('tolerates unsupported clients without changing their lifecycle', () => {
        for (const client of [null, {}, { on() { throw new Error('unavailable') } }]) expect(() => attachMongoPoolTelemetry(client)).not.toThrow()
        expect(log).not.toHaveBeenCalled()
    })
})
