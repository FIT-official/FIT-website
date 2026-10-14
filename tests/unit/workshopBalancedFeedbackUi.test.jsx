import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import GuestBalancedFeedback from '@/components/Workshop/GuestBalancedFeedback'
vi.mock('@/components/Workshop/GuestIdeaReading', () => ({ default: ({ idea }) => <p>Reading Idea {idea}</p> }))
vi.mock('@/components/Workshop/GuestFeedbackForm', () => ({ default: ({ selectedIdea }) => <button>Submit Idea {selectedIdea} feedback</button> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const group = { id: 'g2', number: 2 }, lesson = seat => ({ seat, group: 'g1', assignment: { target: 'g2', round: 1, projectVersion: 'synthetic-project' } })
const response = (seat, firstIdea) => ({ ok: true, json: async () => ({ seat, target: 'g2', round: 1, projectVersion: 'synthetic-project', firstIdea, completed: { 1: false, 2: false } }) })
it('ignores an earlier account’s delayed assignment and retains both separate feedback actions', async () => {
    const pending = []; vi.stubGlobal('fetch', vi.fn((url, options) => new Promise(resolve => pending.push({ resolve, options }))))
    const { rerender } = render(<GuestBalancedFeedback group={group} lesson={lesson('synthetic-A')} onRefresh={() => {}} />)
    expect(screen.queryByText('Submit Idea 1 feedback')).toBeNull()
    rerender(<GuestBalancedFeedback group={group} lesson={lesson('synthetic-B')} onRefresh={() => {}} />)
    expect(pending[0].options.signal.aborted).toBe(true)
    await act(async () => pending[1].resolve(response('synthetic-B', '2')))
    const region = screen.getByRole('region', { name: 'Feedback for both ideas' })
    expect(within(region).getAllByRole('article')[0]).toHaveAccessibleName('Idea 2 reading and feedback')
    await act(async () => pending[0].resolve(response('synthetic-A', '1')))
    expect(within(region).getAllByRole('article')[0]).toHaveAccessibleName('Idea 2 reading and feedback')
    expect(within(region).getByRole('button', { name: 'Submit Idea 1 feedback' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Submit Idea 2 feedback' })).toBeInTheDocument()
})
it('does not render feedback after an unmounted assignment callback', async () => {
    let finish; vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
    const { unmount } = render(<GuestBalancedFeedback group={group} lesson={lesson('synthetic-A')} onRefresh={() => {}} />); unmount()
    await act(async () => finish(response('synthetic-A', '2')))
    expect(screen.queryByRole('region', { name: 'Feedback for both ideas' })).toBeNull()
})
