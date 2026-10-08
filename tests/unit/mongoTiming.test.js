// @vitest-environment node
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { attachMongoTiming, withMongoTiming } from '@/lib/mongoTiming'
import { workshopTiming } from '@/lib/workshopTiming'

describe('Mongo duration correlation', () => {
    it('attributes interleaved checkout events by connection and commands by originating request', async () => {
        const client = new EventEmitter(), first = [], second = []
        attachMongoTiming(client); attachMongoTiming(client)
        expect(client.listenerCount('commandStarted')).toBe(1)
        const connection = id => ({ address: 'private-host', connectionId: id })
        await withMongoTiming((...row) => first.push(row), async () => {
            // A pool drain may finish a different caller's checkout in this context.
            client.emit('connectionCheckedOut', { ...connection(2), durationMS: 34 })
            client.emit('connectionCheckedOut', { ...connection(1), durationMS: 12 })
            client.emit('commandStarted', { ...connection(1), requestId: 1, commandName: 'find', command: { secret: 'never-read' } })
        })
        await withMongoTiming((...row) => second.push(row), async () => {
            client.emit('commandStarted', { ...connection(2), requestId: 2, commandName: 'find' })
            client.emit('commandSucceeded', { requestId: 1, duration: 56, reply: { private: 'never-read' } })
        })
        client.emit('commandFailed', { requestId: 2, duration: 78 })
        client.emit('commandSucceeded', { requestId: 1, duration: 999 })
        expect(first).toEqual([['pool', 12], ['command', 56]])
        expect(second).toEqual([['pool', 34], ['command', 78]])
    })
    it('forgets returned connections and ignores unmeasured operations and invalid durations', () => {
        const client = new EventEmitter(), result = [], connection = { address: 'private', connectionId: 1 }
        attachMongoTiming(client)
        client.emit('connectionCheckedOut', { ...connection, durationMS: 99 })
        client.emit('connectionCheckedIn', connection)
        withMongoTiming((...row) => result.push(row), () => {
            client.emit('commandStarted', { ...connection, requestId: 1, commandName: 'find' })
            client.emit('commandSucceeded', { requestId: 1, duration: NaN })
            client.emit('commandStarted', { ...connection, requestId: 2, commandName: 'insert' })
            client.emit('commandSucceeded', { requestId: 2, duration: 100 })
        })
        client.emit('commandStarted', { ...connection, requestId: 3, commandName: 'find' })
        client.emit('commandSucceeded', { requestId: 3, duration: 100 })
        expect(result).toEqual([])
    })
    it('measures checkout-to-command separately when driver checkout duration is unavailable', () => {
        const client = new EventEmitter(), result = []
        attachMongoTiming(client)
        withMongoTiming((...row) => result.push(row), () => {
            client.emit('connectionCheckOutStarted', {})
            client.emit('commandStarted', { address: 'private', connectionId: 1, requestId: 1, commandName: 'find' })
            client.emit('commandSucceeded', { requestId: 1, duration: 42 })
        })
        expect(result[0][0]).toBe('checkout_to_command')
        expect(result[0][1]).toBeGreaterThanOrEqual(0)
        expect(result[1]).toEqual(['command', 42])
        expect(result.some(row => row[0] === 'pool')).toBe(false)
    })
    it('adds numeric pool and command durations without changing response data or access headers', async () => {
        const client = new EventEmitter(), timing = workshopTiming()
        attachMongoTiming(client)
        await timing.measure('session', async () => {
            client.emit('connectionCheckedOut', { address: 'private-host', connectionId: 1, durationMS: 123 })
            client.emit('commandStarted', { address: 'private-host', connectionId: 1, requestId: 1, commandName: 'find' })
            await Promise.resolve()
            client.emit('commandSucceeded', { requestId: 1, duration: 234 })
        })
        const response = timing.finish(new Response(null, { status: 304, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } }))
        expect(response.status).toBe(304)
        expect(response.headers.get('Vary')).toBe('Cookie')
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
        expect(response.headers.get('Server-Timing')).toMatch(/session_pool;dur=123.0, session_command;dur=234.0/)
        expect(response.headers.get('Server-Timing')).not.toMatch(/private|host|find|requestId/)
    })
})
