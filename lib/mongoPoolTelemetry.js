import { randomUUID } from 'node:crypto'

// Process-wide across server bundles. No timers, sockets or per-event collections.
const key = Symbol.for('fit.mongoPoolTelemetry.v1')
const intervalMs = 60_000
const countLimit = 2_147_483_647
const eventCounters = {
    connectionPoolCreated: 'poolsCreated',
    connectionPoolClosed: 'poolsClosed',
    connectionPoolCleared: 'poolsCleared',
    connectionCreated: 'connectionsCreated',
    connectionClosed: 'connectionsClosed',
    connectionCheckOutFailed: 'checkoutsFailed',
}
const failureReasons = ['timeout', 'connectionError', 'poolClosed']

// Only known non-secret system metadata is allowed. Never use URLs, branches,
// arbitrary app-name overrides, connection strings, or custom environment names.
export function mongoDeploymentAttribution(env = process.env) {
    const environment = ['production', 'preview', 'development'].includes(env.VERCEL_ENV)
        ? env.VERCEL_ENV
        : ['production', 'development', 'test'].includes(env.NODE_ENV) ? env.NODE_ENV : 'unknown'
    const deployment = /^dpl_[A-Za-z0-9]{1,64}$/.test(env.VERCEL_DEPLOYMENT_ID || '')
        ? env.VERCEL_DEPLOYMENT_ID
        : /^[a-f0-9]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA || '')
            ? 'git-' + env.VERCEL_GIT_COMMIT_SHA.slice(0, 12).toLowerCase() : 'unattributed'
    const region = /^[a-z]{3}[0-9]{1,2}$/.test(env.VERCEL_REGION || '') ? env.VERCEL_REGION : 'unknown'
    return { appName: 'fit:' + environment + ':' + deployment, environment, deployment, region }
}

function stateFor(attribution) {
    return globalThis[key] ||= {
        clients: new WeakSet(),
        instance: randomUUID(),
        attribution,
        lastEmission: -Infinity,
        counters: { clientsObserved: 0, ...Object.fromEntries(Object.values(eventCounters).map(name => [name, 0])) },
        checkoutFailureReasons: { timeout: 0, connectionError: 0, poolClosed: 0, other: 0 },
        saturated: false,
    }
}

function increment(state, counters, name) {
    if (counters[name] < countLimit) counters[name] += 1
    else state.saturated = true
}

// Disabled unless explicitly enabled for a reviewed deployment. Logging must
// never affect database success/failure, even if a log sink throws.
export function attachMongoPoolTelemetry(client) {
    if (process.env.MONGO_POOL_TELEMETRY !== 'true' || !client?.on) return
    try {
        const state = stateFor(mongoDeploymentAttribution())
        if (state.clients.has(client)) return
        state.clients.add(client)
        increment(state, state.counters, 'clientsObserved')
        for (const [event, counter] of Object.entries(eventCounters)) {
            client.on(event, payload => {
                try {
                    increment(state, state.counters, counter)
                    if (event === 'connectionCheckOutFailed') {
                        const reason = failureReasons.includes(payload?.reason) ? payload.reason : 'other'
                        increment(state, state.checkoutFailureReasons, reason)
                    }
                    const now = performance.now()
                    if (now - state.lastEmission < intervalMs) return
                    // Reserve before writing: a failed log sink cannot flood retries.
                    state.lastEmission = now
                    console.info('[mongo-pool]', JSON.stringify({
                        schema: 1,
                        event: 'pool_summary',
                        ...state.attribution,
                        instance: state.instance,
                        counters: { ...state.counters },
                        checkoutFailureReasons: { ...state.checkoutFailureReasons },
                        saturated: state.saturated,
                    }))
                } catch {
                    // Intentionally exclude error objects and their messages.
                }
            })
        }
    } catch {
        // Instrumentation is best-effort and cannot reject a database operation.
    }
}
