import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ api: vi.fn(), refresh: null }))
vi.mock('@/components/Workshop/Classroom', () => ({ classroomRequest: (...args) => h.api(...args) }))
vi.mock('@/components/Workshop/useClassPolling', () => ({ useClassPolling: refresh => { h.refresh = refresh } }))
import TeacherTinkercad from '@/components/Workshop/TeacherTinkercad'
const seats = ['guest_11111111-1111-4111-8111-111111111111','guest_22222222-2222-4222-8222-222222222222']
const view = { imported: true, issuanceOpen: false, configVersion: 4, available: 75, assigned: 0, total: 75, sessions: seats.map(seat => ({ seat, name: 'Alex', group: 'g2', approved: false, approvalVersion: 0, assigned: false })) }
beforeEach(() => { h.api.mockReset(); h.api.mockResolvedValue(view) })
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

})
