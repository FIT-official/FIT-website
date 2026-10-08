import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ api: vi.fn(), refresh: null }))
vi.mock('@/components/Workshop/Classroom', () => ({ classroomRequest: (...args) => h.api(...args) }))
vi.mock('@/components/Workshop/useClassPolling', () => ({ useClassPolling: refresh => { h.refresh = refresh } }))
import TeacherTinkercad from '@/components/Workshop/TeacherTinkercad'
const seats = ['guest_11111111-1111-4111-8111-111111111111','guest_22222222-2222-4222-8222-222222222222']
const view = { imported: true, issuanceOpen: false, configVersion: 4, available: 75, assigned: 0, total: 75, sessions: seats.map(seat => ({ seat, name: 'Alex', group: 'g2', approved: false, approvalVersion: 0, assigned: false })) }
beforeEach(() => { h.api.mockReset(); h.api.mockResolvedValue(view) })
afterEach(() => vi.restoreAllMocks())
async function open() { const rendered = render(<TeacherTinkercad />); const details = rendered.container.querySelector('details'); await act(async () => { details.open = true; fireEvent(details, new Event('toggle')) }); await act(async () => { await h.refresh() }); return { ...rendered, details } }
describe('teacher Tinkercad controls', () => {
    it('does not fetch or reveal anything while its controls are collapsed', async () => { render(<TeacherTinkercad />); await act(async () => { await h.refresh() }); expect(h.api).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Approve selected' })).not.toBeInTheDocument() })
    it('keeps same-name sessions separate and approves only selected identities', async () => { await open(); expect(screen.getAllByText('Alex')).toHaveLength(2); fireEvent.click(screen.getAllByRole('checkbox')[1]); await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve selected' })) }); expect(h.api).toHaveBeenCalledWith('/api/admin/workshop/tinkercad', 'PATCH', { action: 'approval', approved: true, sessions: [{ seat: seats[1], expectedVersion: 0 }] }); expect(document.body.textContent).not.toContain(seats[0]); expect(document.body.textContent).not.toContain(seats[1]) })
    it('passes the reviewed configuration version when opening issuance', async () => { await open(); await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open new Tinkercad assignments' })) }); expect(h.api).toHaveBeenCalledWith('/api/admin/workshop/tinkercad', 'PATCH', { action: 'issuance', open: true, expectedVersion: 4 }) })
    it('previews a private file without rendering its credentials or automatically importing', async () => { h.api.mockImplementation(async (url, method) => method === 'POST' ? { seats: 75, className: 'Friday', originalAssignmentsPreserved: 40, fingerprint: 'synthetic-fingerprint' } : { ...view, imported: false, sessions: [] }); await open(); const file = new File(['{}'], 'private-synthetic.json', { type: 'application/json' }); file.text = async () => JSON.stringify({ privateLogin: 'example-hidden-file-value' }); await act(async () => { fireEvent.change(screen.getByLabelText('Private 75-seat JSON file'), { target: { files: [file] } }) }); expect(screen.getByRole('button', { name: 'Import 75 seats' })).toBeInTheDocument(); expect(document.body.textContent).not.toContain('example-hidden-file-value'); expect(h.api.mock.calls.filter(row => row[2]?.mode === 'import')).toHaveLength(0); fireEvent.click(screen.getByRole('button', { name: 'Clear file' })); expect(screen.queryByRole('button', { name: 'Import 75 seats' })).not.toBeInTheDocument() })
    it('discards a late private preview after the teacher closes the controls', async () => {
        let finish;
        h.api.mockImplementation(async (url, method) => method === 'POST' ? new Promise(resolve => { finish = resolve }) : { ...view, imported: false, sessions: [] });
        const { details } = await open();
        const file = new File(['{}'], 'private-synthetic.json'); file.text = async () => '{}';
        await act(async () => { fireEvent.change(screen.getByLabelText('Private 75-seat JSON file'), { target: { files: [file] } }) });
        await act(async () => { details.open = false; fireEvent(details, new Event('toggle')) });
        await act(async () => { finish({ seats: 75, fingerprint: 'synthetic-fingerprint' }) });
        await act(async () => { details.open = true; fireEvent(details, new Event('toggle')); await h.refresh() });
        expect(screen.queryByRole('button', { name: 'Import 75 seats' })).not.toBeInTheDocument();
    })

    it('previews pasted JSON using the existing endpoint, clears the box, and requires a separate import action', async () => {
        const pool = { seats: [{ studentLogin: 'synthetic-private-canary' }] }
        let imported = false
        h.api.mockImplementation(async (url, method, data) => {
            if (data?.mode === 'import') { imported = true; return { imported: true } }
            if (method === 'POST') return { seats: 75, className: 'Friday', originalAssignmentsPreserved: 40, fingerprint: 'preview-fingerprint' }
            return { ...view, imported, sessions: [] }
        })
        const storage = vi.spyOn(Storage.prototype, 'setItem'), log = vi.spyOn(console, 'log'), error = vi.spyOn(console, 'error')
        await open()
        const input = screen.getByLabelText('Or paste private 75-seat JSON')
        expect(input).toHaveAttribute('autocomplete', 'off'); expect(input).toHaveClass('ph-mask', 'ph-no-capture')
        fireEvent.input(input, { target: { value: JSON.stringify(pool) } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview private JSON' })) })
        expect(h.api).toHaveBeenCalledWith('/api/admin/workshop/tinkercad/import', 'POST', { mode: 'preview', pool })
        expect(input).toHaveValue(''); expect(document.body.innerHTML).not.toContain('synthetic-private-canary')
        expect(h.api.mock.calls.some(row => row[2]?.mode === 'import')).toBe(false)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import 75 seats' })) })
        expect(h.api).toHaveBeenCalledWith('/api/admin/workshop/tinkercad/import', 'POST', { mode: 'import', pool, expectedFingerprint: 'preview-fingerprint' })
        expect(screen.queryByRole('button', { name: 'Import 75 seats' })).not.toBeInTheDocument()
        expect(storage).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
    })
    it.each(['{"synthetic-private-canary":', 'x'.repeat(50001), ''])('rejects invalid or oversized pasted input without echoing or sending it', async text => {
        h.api.mockResolvedValue({ ...view, imported: false, sessions: [] }); await open()
        const input = screen.getByLabelText('Or paste private 75-seat JSON')
        fireEvent.input(input, { target: { value: text } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview private JSON' })) })
        expect(input).toHaveValue(''); expect(document.body.innerHTML).not.toContain('synthetic-private-canary')
        expect(h.api.mock.calls.some(row => row[1] === 'POST')).toBe(false)
        expect(screen.queryByRole('button', { name: 'Import 75 seats' })).not.toBeInTheDocument()
    })
    it('invalidates a preview when new JSON is entered and clears unsent input on close', async () => {
        h.api.mockImplementation(async (url, method) => method === 'POST' ? { seats: 75, fingerprint: 'first' } : { ...view, imported: false, sessions: [] })
        const { details } = await open(), input = screen.getByLabelText('Or paste private 75-seat JSON')
        fireEvent.input(input, { target: { value: '{}' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview private JSON' })) })
        expect(screen.getByRole('button', { name: 'Import 75 seats' })).toBeInTheDocument()
        fireEvent.input(input, { target: { value: '{"synthetic":"private"}' } })
        expect(screen.queryByRole('button', { name: 'Import 75 seats' })).not.toBeInTheDocument()
        await act(async () => { details.open = false; fireEvent(details, new Event('toggle')) })
        await act(async () => { details.open = true; fireEvent(details, new Event('toggle')); await h.refresh() })
        expect(screen.getByLabelText('Or paste private 75-seat JSON')).toHaveValue('')
    })
    it('discards a pending pasted preview after the teacher closes its controls', async () => {
        let finish
        h.api.mockImplementation(async (url, method) => method === 'POST' ? new Promise(resolve => { finish = resolve }) : { ...view, imported: false, sessions: [] })
        const { details } = await open()
        fireEvent.input(screen.getByLabelText('Or paste private 75-seat JSON'), { target: { value: '{}' } })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Preview private JSON' })) })
        await act(async () => { details.open = false; fireEvent(details, new Event('toggle')) })
        await act(async () => { finish({ seats: 75, fingerprint: 'synthetic' }) })
        await act(async () => { details.open = true; fireEvent(details, new Event('toggle')); await h.refresh() })
        expect(screen.queryByRole('button', { name: 'Import 75 seats' })).not.toBeInTheDocument()
    })
    it('allows clearing unsent pasted values without a request', async () => {
        h.api.mockResolvedValue({ ...view, imported: false, sessions: [] }); await open()
        const input = screen.getByLabelText('Or paste private 75-seat JSON')
        fireEvent.input(input, { target: { value: 'synthetic-private-canary' } })
        fireEvent.click(screen.getByRole('button', { name: 'Clear pasted JSON' }))
        expect(input).toHaveValue(''); expect(h.api.mock.calls.some(row => row[1] === 'POST')).toBe(false)
    })
})
