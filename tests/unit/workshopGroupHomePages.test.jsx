import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/components/Workshop/ReviewedGroupPage', () => ({ default: ({ group }) => <article aria-label={'Project ' + group.id}>Group {group.number} own two ideas</article> }))
vi.mock('@/components/Workshop/FeedbackForm', () => ({ default: ({ group, lesson }) => <form aria-label={'Review ' + group.id}>Author {lesson.seat}</form> }))
vi.mock('@/components/Workshop/RefinementForm', () => ({ default: ({ lesson }) => <form aria-label={'Refine ' + lesson.group}>Own received feedback; individual author {lesson.seat}</form> }))
import Classroom from '@/components/Workshop/Classroom'
import { assignedTarget } from '@/lib/workshopReview'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
function lesson(group, phase = 'PRESENT') { return { role: 'student', seat: 'group' + group.slice(1) + 'student1', group, phase, phaseVersion: 0, version: 1, assignment: { target: assignedTarget(group), round: 1 }, feedback: [], refinements: [] } }
async function show(group, phase) { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => lesson(group, phase) }))); render(<Classroom homeGroup={group} />); await screen.findByRole('heading', { name: 'Home Group ' + group.slice(1) + ': present, give feedback, refine' }) }
describe('distinct authenticated group-home presentation', () => {
    it('renders each home identity and own PRESENT project rather than all ten projects', async () => {
        for (let n = 1; n <= 10; n++) {
            const group = 'g' + n; await show(group, 'PRESENT')
            expect(screen.getAllByRole('article')).toHaveLength(1); expect(screen.getByRole('article', { name: 'Project ' + group })).toBeInTheDocument()
            cleanup()
        }
    })
    it('shows the next project during FEEDBACK with Group10 wrapping to Group1', async () => {
        await show('g10', 'FEEDBACK'); expect(screen.getByText('Assigned review: Group 1')).toBeInTheDocument(); expect(screen.getByRole('form', { name: 'Review g1' })).toHaveTextContent('group10student1')
    })
    it('shows its own REFINE project and individual contributions', async () => {
        await show('g2', 'REFINE'); expect(screen.getByRole('article', { name: 'Project g2' })).toBeInTheDocument(); expect(screen.getByRole('form', { name: 'Refine g2' })).toHaveTextContent('group2student1')
    })
    it('uses the generic classroom solely to link the authenticated home', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => lesson('g3') }))); render(<Classroom />)
        expect(await screen.findByRole('link', { name: 'Open my Group 3 classroom' })).toHaveAttribute('href', '/workshop/g3/classroom'); expect(screen.queryByRole('article')).not.toBeInTheDocument()
    })
    it('does not render private data on a wrong-group home, and links the authorised home', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Wrong group home.', homeGroup: 'g2' }) }))); render(<Classroom homeGroup="g1" />)
        await waitFor(() => expect(screen.getByRole('link', { name: 'Open my Group 2 classroom' })).toHaveAttribute('href', '/workshop/g2/classroom')); expect(screen.queryByRole('article')).not.toBeInTheDocument(); expect(screen.queryByRole('form', { name: /Refine|Review/ })).not.toBeInTheDocument()
    })
})
