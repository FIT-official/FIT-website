import { AsyncLocalStorage } from 'node:async_hooks'

// Shared across server bundles. Only durations enter the request's headers;
// command bodies, replies, addresses and identity fields are never recorded.
const key = Symbol.for('fit.mongoTiming')
const shared = globalThis[key] ||= { context: new AsyncLocalStorage(), clients: new WeakSet() }
const validDuration = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const connectionKey = event => String(event.address) + '/' + String(event.connectionId)
function boundedSet(map, id, value) {
    if (map.size >= 1024) map.delete(map.keys().next().value)
    map.set(id, value)
}

export function withMongoTiming(record, work) { return shared.context.run(record, work) }

export function attachMongoTiming(client) {
    if (!client?.on || shared.clients.has(client)) return
    shared.clients.add(client)
    const checkouts = new Map(), commands = new Map()
    client.on('connectionCheckedOut', event => {
        if (validDuration(event.durationMS)) boundedSet(checkouts, connectionKey(event), event.durationMS)
    })
    const forgetCheckout = event => checkouts.delete(connectionKey(event))
    client.on('connectionCheckedIn', forgetCheckout)
    client.on('connectionClosed', forgetCheckout)
    client.on('commandStarted', event => {
        const connection = connectionKey(event), checkout = checkouts.get(connection)
        checkouts.delete(connection)
        const record = shared.context.getStore()
        if (!record || !['find', 'aggregate', 'getMore'].includes(event.commandName)) return
        // Checkout events can run in a different request's async context.
        // Correlate by connection first, then capture the command's own context.
        if (validDuration(checkout)) record('pool', checkout)
        boundedSet(commands, event.requestId, record)
    })
    const finished = event => {
        const record = commands.get(event.requestId)
        commands.delete(event.requestId)
        if (record && validDuration(event.duration)) record('command', event.duration)
    }
    client.on('commandSucceeded', finished)
    client.on('commandFailed', finished)
}
