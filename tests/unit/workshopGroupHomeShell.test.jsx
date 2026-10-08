import { describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ notFound: () => { throw Error('Group not found') } }))
import GroupClassroomPage, { generateMetadata } from '@/app/workshop/[group]/classroom/page'
describe('ten stable group-specific classroom shells', () => {
    it('gives every valid group its own URL identity and metadata without reading student cookies or data', async () => {
        for (let n = 1; n <= 10; n++) {
            const params = Promise.resolve({ group: 'g' + n }), shell = await GroupClassroomPage({ params })
            expect(shell.props).toEqual({ homeGroup: 'g' + n }); expect((await generateMetadata({ params })).title).toBe('Group ' + n + ' classroom | Fix It Today')
        }
    })
    it('rejects unknown groups rather than inventing an authenticated home', async () => { await expect(GroupClassroomPage({ params: Promise.resolve({ group: 'g11' }) })).rejects.toThrow('Group not found') })
})
