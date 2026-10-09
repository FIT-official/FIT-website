import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { existsSync } from 'node:fs'
const h = vi.hoisted(() => ({ access: vi.fn(), pathname: '/admin/workshop/projects' }))
vi.mock('@/lib/workshopGuestAccess', () => ({ requireGuestTeacher: h.access }))
vi.mock('@/lib/authenticate', () => ({ UnauthorizedError: class UnauthorizedError extends Error {} }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, redirect: value => { throw Error('REDIRECT ' + value) }, notFound: () => { throw Error('NOT_FOUND') } }))
// A native image keeps the current source and alt text observable in DOM tests.
// eslint-disable-next-line @next/next/no-img-element
vi.mock('next/image', () => ({ default: ({ alt, ...props }) => <img alt={alt} {...props} /> }))
import Page from '@/app/admin/workshop/projects/page'
import GroupProjectReader from '@/components/Workshop/GroupProjectReader'
import PresentationBoundary from '@/components/Workshop/PresentationBoundary'
import { workshopGroupPage, workshopClassroomGroupPage } from '@/lib/workshopPages'
beforeEach(() => { h.access.mockReset(); h.access.mockResolvedValue({ role: 'teacher' }); h.pathname = '/admin/workshop/projects' })
afterEach(cleanup)

describe('private group project reader', () => {
    it('redirects anonymous requests before rendering projects', async () => { h.access.mockRejectedValue(Object.assign(Error('Unauthorized'), { status: 401 })); await expect(Page()).rejects.toThrow('REDIRECT /sign-in?redirect_url=%2Fadmin%2Fworkshop%2Fprojects') })
    it('rejects a signed-in non-teacher', async () => { h.access.mockRejectedValue(Object.assign(Error('Teacher only'), { status: 403 })); await expect(Page()).rejects.toThrow('NOT_FOUND') })
    it('fails closed on an unexpected access error', async () => { h.access.mockRejectedValue(Error('Unavailable')); await expect(Page()).rejects.toThrow('Unavailable') })
    it('passes only current project content for all 10 groups and 20 complete ideas', async () => {
        const page = await Page(); expect(h.access).toHaveBeenCalledOnce(); expect(page.props.groups).toHaveLength(10)
        expect(JSON.stringify(page.props)).not.toMatch(/studentName|sessionToken|classLink|studentLogin|feedbackCount|audit|speakerNotes/)
        for (const group of page.props.groups) {
            expect(Object.keys(group)).toEqual(['id', 'number', 'ideas']); expect(group.ideas).toHaveLength(2)
            group.ideas.forEach((idea, index) => {
                expect(idea.copy).toEqual(workshopGroupPage(group.id).ideas[index].pupilCopy)
                expect(idea.copy).toEqual(workshopClassroomGroupPage(group.id).reading.ideas[index].pupilCopy)
                expect(idea.copy.core_problem).toBeTruthy(); expect(idea.copy.how_it_works_steps.length).toBeGreaterThan(0); expect(idea.copy.key_points.length).toBeGreaterThan(0)
                expect(idea.image.src).toMatch(/^\/workshop\/models\/.*reviewed-v2-pdf-derived\.jpeg$/)
                expect(existsSync('public' + idea.image.src)).toBe(true); expect(idea.image.alt).toBeTruthy()
            })
        }
    })
    it('renders both ideas for every group and disables the first/last boundaries', async () => {
        const page = await Page(); render(page)
        expect(screen.getByRole('button', { name: 'Previous group' })).toBeDisabled()
        for (const group of page.props.groups) {
            expect(screen.getByRole('status')).toHaveTextContent('Group ' + group.number + ' of 10')
            expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
            for (const [index, idea] of group.ideas.entries()) expect(screen.getByRole('heading', { name: 'Idea ' + (index + 1) + ': ' + idea.title })).toBeInTheDocument()
            expect(screen.getByRole('img', { name: 'FIT', exact: true })).toBeInTheDocument()
            expect(within(screen.getByRole('region', { name: 'Project details' })).getAllByRole('img')).toHaveLength(2)
            if (group.number < 10) fireEvent.click(screen.getByRole('button', { name: 'Next group' }))
        }
        expect(screen.getByRole('button', { name: 'Next group' })).toBeDisabled()
        fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(screen.getByRole('status')).toHaveTextContent('Group 10 of 10')
    })
    it('resets vertical scrolling when the group changes and supports selection', async () => {
        render(await Page()); const viewport = screen.getByRole('region', { name: 'Project details' }); viewport.scrollTop = 500
        fireEvent.change(screen.getByRole('combobox', { name: 'Group' }), { target: { value: '7' } })
        expect(screen.getByRole('status')).toHaveTextContent('Group 8 of 10'); expect(viewport.scrollTop).toBe(0)
        expect(within(viewport).getAllByRole('heading', { level: 3 })).toHaveLength(2)
    })
    it('supports left/right keys without intercepting selection, editing or modified keys', async () => {
        const page = await Page(); render(<><GroupProjectReader {...page.props} /><input aria-label="Other input" /><div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editable notes" /></>)
        fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(screen.getByRole('status')).toHaveTextContent('Group 2 of 10')
        for (const target of [screen.getByRole('combobox'), screen.getByRole('textbox', { name: 'Other input' }), screen.getByRole('textbox', { name: 'Editable notes' })]) fireEvent.keyDown(target, { key: 'ArrowRight' })
        fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true }); expect(screen.getByRole('status')).toHaveTextContent('Group 2 of 10')
        fireEvent.keyDown(window, { key: 'ArrowLeft' }); fireEvent.keyDown(window, { key: 'ArrowLeft' }); expect(screen.getByRole('status')).toHaveTextContent('Group 1 of 10')
        fireEvent.keyDown(window, { key: 'ArrowDown' }); expect(screen.getByRole('status')).toHaveTextContent('Group 1 of 10')
    })
    it('unmounts dashboard, storefront and consent UI only on the private reader route', () => {
        const { rerender } = render(<PresentationBoundary presentation={<p>Projects only</p>}><p>Private dashboard</p></PresentationBoundary>)
        expect(screen.queryByText('Private dashboard')).toBeNull(); expect(screen.getByText('Projects only')).toBeInTheDocument()
        h.pathname = '/admin/workshop'; rerender(<PresentationBoundary presentation={<p>Projects only</p>}><p>Private dashboard</p></PresentationBoundary>)
        expect(screen.getByText('Private dashboard')).toBeInTheDocument(); expect(screen.queryByText('Projects only')).toBeNull()
    })
})
