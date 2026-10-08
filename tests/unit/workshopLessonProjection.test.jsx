import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const h = vi.hoisted(() => ({ access: vi.fn(), pathname: '/admin/workshop/instructions' }))
vi.mock('@/lib/workshopGuestAccess', () => ({ requireGuestTeacher: h.access }))
vi.mock('@/lib/authenticate', () => ({ UnauthorizedError: class UnauthorizedError extends Error {} }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, redirect: value => { throw Error('REDIRECT ' + value) }, notFound: () => { throw Error('NOT_FOUND') } }))
import Page from '@/app/admin/workshop/instructions/page'
import LessonProjection from '@/components/Workshop/LessonProjection'
import PresentationBoundary from '@/components/Workshop/PresentationBoundary'
import deck from '@/content/workshop-lesson-slides.json'
beforeEach(() => { h.access.mockReset(); h.pathname = '/admin/workshop/instructions'; vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('private lesson projection', () => {
    it('redirects an anonymous request without rendering any slides', async () => { h.access.mockRejectedValue(Object.assign(Error('Unauthorized'), { status: 401 })); await expect(Page()).rejects.toThrow('REDIRECT /sign-in?redirect_url=%2Fadmin%2Fworkshop%2Finstructions') })
    it('rejects a signed-in non-teacher', async () => { h.access.mockRejectedValue(Object.assign(Error('Teacher only'), { status: 403 })); await expect(Page()).rejects.toThrow('NOT_FOUND') })
    it('passes only the eight pupil instruction slides after teacher verification', async () => { h.access.mockResolvedValue({ role: 'teacher' }); const page = await Page(); expect(h.access).toHaveBeenCalledOnce(); expect(page.props.deck.slides).toHaveLength(8); expect(JSON.stringify(page.props)).not.toMatch(/speakerNotes|studentName|credentials|audit|feedbackCount/); expect(page.props.deck.workshopUrl).toBe('https://www.fixitoday.com/workshop') })
    it('unmounts surrounding storefront and dashboard UI on the exact projection route', () => { const { rerender } = render(<PresentationBoundary presentation={<p>Instructions only</p>}><p>Private dashboard</p></PresentationBoundary>); expect(screen.queryByText('Private dashboard')).toBe(null); h.pathname = '/admin/workshop'; rerender(<PresentationBoundary presentation={<p>Instructions only</p>}><p>Private dashboard</p></PresentationBoundary>); expect(screen.queryByText('Instructions only')).toBe(null); expect(screen.getByText('Private dashboard')).toBeInTheDocument() })
    it('renders each block once, supports bounded buttons and keyboard navigation', () => { render(<LessonProjection deck={deck} />); expect(screen.getAllByText('Our design class')).toHaveLength(1); expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Next' })); expect(screen.getByText('Explore the ideas')).toBeInTheDocument(); fireEvent.keyDown(window, { key: 'End' }); expect(screen.getByText('Tinkercad')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled(); fireEvent.keyDown(window, { key: 'Home' }); expect(screen.getByText('Our design class')).toBeInTheDocument() })
    it('keeps the clean projection usable when the browser refuses fullscreen', async () => {
        render(<LessonProjection deck={deck} />)
        screen.getByRole('main').requestFullscreen = vi.fn().mockRejectedValue(new Error('User activation required'))
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
        expect(await screen.findByRole('status')).toHaveTextContent('Press F11 on Windows')
        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByText('Explore the ideas')).toBeInTheDocument()
        expect(document.body.textContent).not.toMatch(/studentName|audit|credentials/)
    })
})
