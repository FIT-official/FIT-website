import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import IncomingFeedback from '@/components/Workshop/IncomingFeedback'
afterEach(cleanup)
it('renders three chronological original-answer lists attributed to group, student and idea', () => {
    const row = (n, minute, idea) => ({ id: 'response-' + n, seat: 'group' + n + 'student1', visitingGroup: 'g' + n, presentingGroup: 'g3', idea, recordedAt: '2026-10-09T02:0' + minute + ':00Z', whatWorks: 'Works ' + n, question: 'Question ' + n, improvement: 'Suggestion ' + n })
    render(<IncomingFeedback lesson={{ group: 'g3', showFeedback: true, feedback: [row(10, 2, '2'), row(1, 0, '1'), row(2, 1, '1')] }} />)
    expect(screen.getAllByRole('list')).toHaveLength(3)
    for (const list of screen.getAllByRole('list')) { const items = within(list).getAllByRole('listitem'); expect(items).toHaveLength(3); expect(items[0]).toHaveTextContent('Reviewer Group 1 | group1student1 | Idea 1'); expect(items[2]).toHaveTextContent('Reviewer Group 10 | group10student1 | Idea 2') }
    expect(screen.getByText(/3 visible responses from 3 reviewer groups/)).toBeInTheDocument()
})
it('returns to all reviewers after moderation removes the selected reviewer last visible response', () => {
    const first = { id: 'response-one', seat: 'group1student1', visitingGroup: 'g1', presentingGroup: 'g3', idea: '1', recordedAt: '2026-10-09T02:00:00Z', whatWorks: 'Visible original', question: 'Visible question', improvement: 'Visible suggestion' }, second = { ...first, id: 'response-ten', seat: 'group10student1', visitingGroup: 'g10', whatWorks: 'Later hidden original' }
    const { rerender } = render(<IncomingFeedback lesson={{ group: 'g3', showFeedback: true, feedback: [first, second] }} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Reviewer group' }), { target: { value: 'g10' } }); expect(screen.getByText('Later hidden original')).toBeInTheDocument()
    rerender(<IncomingFeedback lesson={{ group: 'g3', showFeedback: true, feedback: [first] }} />)
    expect(screen.getByRole('combobox', { name: 'Reviewer group' })).toHaveValue('all'); expect(screen.getByText('Visible original')).toBeInTheDocument(); expect(screen.queryByText('Later hidden original')).not.toBeInTheDocument()
})
