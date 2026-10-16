import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ api: vi.fn(), refresh: null, view: null }))
vi.mock('@/components/Workshop/Classroom', () => ({ classroomRequest: (...args) => h.api(...args) }))
vi.mock('@/components/Workshop/useClassPolling', () => ({ useClassPolling: refresh => { h.refresh = refresh } }))
import TeacherTinkercad from '@/components/Workshop/TeacherTinkercad'

const seats = ['guest_11111111-1111-4111-8111-111111111111', 'guest_22222222-2222-4222-8222-222222222222']
const detailsFor = i => screen.getByText('Student ' + i).closest('li').querySelector('details')
const loginFor = i => ({ seat: seats[i], studentLogin: 'synthetic-private-' + i, classId: 'ABC-DEF-123' })
async function toggle(details, open) { await act(async () => { details.open = open; fireEvent(details, new Event('toggle')) }) }
async function start() {
    const result = render(<TeacherTinkercad />), details = result.container.querySelector('details')
    await toggle(details, true)
    await act(async () => { await h.refresh() })
    return { ...result, details }
}
async function reveal(i) {
    await toggle(detailsFor(i), true)
    await act(async () => { fireEvent.click(within(detailsFor(i)).getByRole('button', { name: 'Show Student ID' })) })
}
beforeEach(() => {
    h.api.mockReset(); h.refresh = null
    h.view = { imported: true, issuanceOpen: true, total: 75, available: 73, assigned: 2, sessions: [], expiresAt: '2026-11-30T15:59:00Z', expired: false, assignments: seats.map((seat, i) => ({ seat, studentName: 'Student ' + i, group: 'g2', assignedName: 'Student ' + i, assignedGroup: 'g2', accountLabel: 'Account ' + i, accountReference: 'TC-00' + i, assignedAt: '2026-10-09T00:00:00Z', approved: true })) }
    h.api.mockImplementation(async url => url.includes('/student-login?') ? loginFor(seats.indexOf(new URL(url, 'https://www.fixitoday.com').searchParams.get('seat'))) : h.view)
})

describe('private teacher Student ID reveal', () => {
    it('fetches no credentials until explicitly selected and reveals only one student at a time', async () => {
        await start()
        expect(h.api.mock.calls.some(([url]) => url.includes('/student-login'))).toBe(false)
        expect(screen.queryByLabelText('Student ID')).not.toBeInTheDocument()
        await reveal(0)
        expect(screen.getByLabelText('Student ID')).toHaveValue('synthetic-private-0')
        expect(screen.getByLabelText('Student ID')).toHaveAttribute('readonly')
        expect(screen.getByLabelText('Student ID').closest('.ph-mask')).toHaveClass('ph-no-capture')
        expect(screen.getByLabelText('Class ID')).toHaveValue('ABC-DEF-123')
        await reveal(1)
        expect(screen.getAllByLabelText('Student ID')).toHaveLength(1)
        expect(screen.getByLabelText('Student ID')).toHaveValue('synthetic-private-1')
        expect(document.body.innerHTML).not.toContain('synthetic-private-0')
    })
    it('copies the selected private Student ID without writing storage or logs', async () => {
        const copy = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true })
        const storage = vi.spyOn(Storage.prototype, 'setItem'), log = vi.spyOn(console, 'log')
        await start(); await reveal(0)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy student id' })) })
        expect(copy).toHaveBeenCalledWith('synthetic-private-0')
        expect(storage).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled()
        storage.mockRestore(); log.mockRestore()
    })
    it('clears credentials when a student detail or the main controls close', async () => {
        const { details } = await start(); await reveal(0)
        await toggle(detailsFor(0), false)
        expect(screen.queryByLabelText('Student ID')).not.toBeInTheDocument()
        await reveal(0); await toggle(details, false); await toggle(details, true)
        expect(screen.queryByLabelText('Student ID')).not.toBeInTheDocument()
    })
    it('ignores a late response after a different student is selected', async () => {
        let finish
        h.api.mockImplementation(url => {
            if (!url.includes('/student-login?')) return Promise.resolve(h.view)
            if (url.endsWith(seats[0])) return new Promise(resolve => { finish = resolve })
            return Promise.resolve(loginFor(1))
        })
        await start(); await reveal(0); await reveal(1)
        await act(async () => { finish(loginFor(0)) })
        expect(screen.getByLabelText('Student ID')).toHaveValue('synthetic-private-1')
        expect(document.body.innerHTML).not.toContain('synthetic-private-0')
    })
    it('ignores a late response after the student details close', async () => {
        let finish
        h.api.mockImplementation(url => url.includes('/student-login?') ? new Promise(resolve => { finish = resolve }) : Promise.resolve(h.view))
        await start(); await reveal(0); await toggle(detailsFor(0), false)
        await act(async () => { finish(loginFor(0)) })
        expect(screen.queryByLabelText('Student ID')).not.toBeInTheDocument()
    })
    it('clears a shown ID on revocation and does not offer it for revoked assignments', async () => {
        await start(); await reveal(0)
        h.view = { ...h.view, assignments: h.view.assignments.map(row => ({ ...row, approved: false })) }
        await act(async () => { await h.refresh() })
        expect(screen.queryByLabelText('Student ID')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Show Student ID' })).not.toBeInTheDocument()
    })
    it('honors a revocation refresh that started before the Student ID was shown', async () => {
        await start()
        let finishRefresh, pendingRefresh
        h.api.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
        act(() => { pendingRefresh = h.refresh() })
        await reveal(0)
        expect(screen.getByLabelText('Student ID')).toHaveValue('synthetic-private-0')
        await act(async () => { finishRefresh({ ...h.view, assignments: h.view.assignments.map(row => ({ ...row, approved: false })) }); await pendingRefresh })
        expect(screen.queryByLabelText('Student ID')).not.toBeInTheDocument()
    })
    it('clears a shown ID when access cannot be refreshed', async () => {
        await start(); await reveal(0)
        h.api.mockRejectedValueOnce(Error('Offline'))
        await act(async () => { await h.refresh() })
        expect(screen.queryByLabelText('Student ID')).not.toBeInTheDocument()
        expect(document.body.innerHTML).not.toContain('synthetic-private-0')
    })
})
