// Request-local timings contain durations only, never tokens or student identifiers.
import { withMongoTiming } from './mongoTiming'
const fields = new Set(['db', 'session', 'version', 'lesson'])
export function workshopTiming(now = () => performance.now()) {
    const started = now(), values = new Map()
    return {
        async measure(name, work) {
            const begin = now()
            try {
                if (!['session', 'version', 'lesson'].includes(name)) return await work()
                return await withMongoTiming((part, duration) => {
                    const field = name + '_' + part
                    values.set(field, (values.get(field) || 0) + duration)
                }, work)
            }
            finally { if (fields.has(name)) values.set(name, (values.get(name) || 0) + Math.max(0, now() - begin)) }
        },
        finish(response) {
            const durations = [...values, ['total', Math.max(0, now() - started)]]
            response.headers.set('Server-Timing', durations.map(([name, duration]) => name + ';dur=' + duration.toFixed(1)).join(', '))
            return response
        },
    }
}
