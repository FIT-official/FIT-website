import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import reading from '@/content/workshopStudentReadingDraft.json'
import { workshopClassroomGroupPage } from '@/lib/workshopPages'
import { assignedTarget } from '@/lib/workshopReview'
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/components/Workshop/FeedbackForm', () => ({ default: ({ group }) => <form aria-label={'Review ' + group.id} /> }))
import Classroom from '@/components/Workshop/Classroom'
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
const lesson = group => ({ role: 'student', seat: 'group' + group.slice(1) + 'student1', group, phase: 'FEEDBACK', phaseVersion: 0, version: 1, assignment: { target: assignedTarget(group), round: 1 }, feedback: [], refinements: [], feedbackOpen: true, showFeedback: true })
function expectTwoIdeas(group) {
    const project = workshopClassroomGroupPage(group), article = screen.getByRole('article', { name: 'Group ' + project.number + ' complete project reading' })
    for (const [i, idea] of project.reading.ideas.entries()) {
        const section = within(article).getByRole('heading', { name: 'Idea ' + (i + 1) + ': ' + idea.title }).closest('section')
        for (const text of [idea.pupilCopy.core_problem, idea.pupilCopy.importance, idea.pupilCopy.solution, idea.pupilCopy.source_caveat, idea.pupilCopy.next_test, ...idea.pupilCopy.how_it_works_steps]) expect(section).toHaveTextContent(text)
        expect(within(section).getByText(idea.pupilCopy.core_problem, { selector: 'strong' })).toBeInTheDocument()
        expect(within(section).getByText(idea.pupilCopy.target_user, { selector: 'strong' })).toBeInTheDocument()
    }
    expect(project.reading.feedbackQuestions).toHaveLength(3)
    for (const question of project.reading.feedbackQuestions) expect(article).toHaveTextContent(question)
}
describe('all twenty distinct ideas on authenticated group homes', () => {
    it('covers twenty unique idea IDs and renders both full ideas on all ten home and inline target routes', async () => {
        expect(reading.groups).toHaveLength(10)
        expect(reading.groups.every(group => group.ideas.length === 2)).toBe(true)
        expect(new Set(reading.groups.flatMap(group => group.ideas.map(idea => idea.reviewedImageKey))).size).toBe(20)
        for (let n = 1; n <= 10; n++) {
            const group = 'g' + n
            vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => lesson(group) })))
            render(<Classroom homeGroup={group} />)
            await screen.findByRole('heading', { name: 'Home Group ' + n + ': present, give feedback, refine' })
            // The authenticated home presents both own ideas before entering the peer review view.
            fireEvent.click(screen.getByRole('button', { name: 'PRESENT', exact: true }))
            expectTwoIdeas(group)
            fireEvent.click(screen.getByRole('button', { name: 'FEEDBACK', exact: true }))
            expectTwoIdeas(assignedTarget(group))
            expect(screen.getByRole('heading', { name: 'Home Group ' + n + ': present, give feedback, refine' })).toBeInTheDocument()
            cleanup(); localStorage.clear()
        }
    })
})
