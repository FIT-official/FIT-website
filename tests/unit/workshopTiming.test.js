import { describe, expect, it } from 'vitest'
import { workshopTiming } from '@/lib/workshopTiming'
describe('anonymous request-local workshop timings', () => {
    it('preserves response status/body/private headers and returns measured durations only', async () => {
        let time = 10
        const timing = workshopTiming(() => time), data = await timing.measure('db', async () => { time += 20; return 'data' })
        expect(data).toBe('data')
        await timing.measure('session', async () => { time += 5 })
        await timing.measure('PRIVATE token', async () => { time += 1 })
        const original = new Response(null, { status: 304, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } }), response = timing.finish(original)
        expect(response).toBe(original); expect(response.status).toBe(304); expect(response.headers.get('Cache-Control')).toBe('private, no-store'); expect(response.headers.get('Vary')).toBe('Cookie'); expect(response.headers.get('Server-Timing')).toBe('db;dur=20.0, session;dur=5.0, total;dur=26.0')
    })
    it('keeps errors intact and isolates timings between requests', async () => {
        let time = 0
        const first = workshopTiming(() => time), second = workshopTiming(() => time), error = Error('failure')
        await expect(first.measure('lesson', async () => { time = 12; throw error })).rejects.toBe(error)
        expect(first.finish(new Response(null)).headers.get('Server-Timing')).toContain('lesson;dur=12.0')
        expect(second.finish(new Response(null)).headers.get('Server-Timing')).toBe('total;dur=12.0')
    })
})
