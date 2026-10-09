import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import GuestFeedbackForm from '@/components/Workshop/GuestFeedbackForm'
import GuestRefinementForm from '@/components/Workshop/GuestRefinementForm'
import { clearDraftCache } from '@/components/Workshop/useGuestVersionedDraft'
import { workshopGroupPage } from '@/lib/workshopPages'

const { submitRequest } = vi.hoisted(() => ({ submitRequest: vi.fn() }))
vi.mock('@/components/Workshop/GuestClassroom', () => ({ classroomRequest: submitRequest }))
const seat = 'guest_12345678-1234-4234-8234-123456789012'
const lesson = { seat, group: 'g2', phaseVersion: 1, feedbackOpen: true, refinementOpen: true,
    assignment: { target: 'g3', round: 1, projectVersion: 'sample' }, refinements: [], refinementVersion: 0, refinementEntryVersion: 0 }
const cases = [
    { kind: 'feedback', label: 'Submit', count: 3, confirmation: 'Your feedback has been submitted.', next: 'Write new feedback', render: l => <GuestFeedbackForm group={workshopGroupPage('g3')} lesson={l} onRefresh={() => {}} /> },
    { kind: 'refinement', label: 'Submit revised ideas', count: 6, confirmation: 'Both revised ideas have been submitted.', next: 'Prepare another revision', render: l => <GuestRefinementForm lesson={l} onRefresh={() => {}} /> },
]
let saves
beforeEach(() => {
    localStorage.clear(); clearDraftCache(); submitRequest.mockReset(); saves = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
        if (!String(url).includes('/guest/drafts')) throw Error('Unexpected request')
        if (options?.method === 'POST') { saves.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ saved: true, version: saves.length }) } }
        return { ok: true, json: async () => ({ seat, drafts: [] }) }
    }))
})
afterEach(() => { cleanup(); clearDraftCache(); vi.unstubAllGlobals() })
async function fillAll(count) {
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(count))
    screen.getAllByRole('textbox').forEach((field, i) => fireEvent.change(field, { target: { value: 'My idea answer ' + i } }))
}
const receipt = input => ({ confirmed: true, receipt: input.submissionId })

describe.each(cases)('$kind conscious submission', c => {
    it('keeps Save draft separate, then announces success only after explicit Submit and server confirmation', async () => {
        let resolve
        submitRequest.mockImplementation(() => new Promise(done => { resolve = done }))
        render(c.render(lesson)); await fillAll(c.count)
        fireEvent.click(screen.getAllByRole('button', { name: 'Save draft', exact: true })[0])
        expect(await screen.findByText('Draft saved — not submitted')).toBeInTheDocument()
        expect(saves.length).toBeGreaterThan(0); expect(submitRequest).not.toHaveBeenCalled()
        expect(screen.getByText('Not submitted yet')).toBeInTheDocument()
        const submit = screen.getByRole('button', { name: c.label, exact: true })
        expect(submit).toHaveAccessibleDescription(/Saving keeps a draft. Click Submit/)
        fireEvent.click(submit)
        expect(submitRequest).toHaveBeenCalledOnce(); expect(screen.queryByText('Submitted', { exact: true })).toBeNull()
        expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
        const input = submitRequest.mock.calls[0][2]
        await act(async () => resolve(receipt(input)))
        expect(screen.getByText('Submitted', { exact: true })).toBeInTheDocument()
        expect(screen.getByText(c.confirmation)).toBeInTheDocument()
        expect(screen.queryByText(/not submitted/i)).toBeNull()
        screen.getAllByRole('textbox').forEach(field => expect(field).toBeDisabled())
        fireEvent.click(screen.getByRole('button', { name: c.next }))
        expect(screen.getByText('Not submitted yet')).toBeInTheDocument()
        expect(screen.queryByText('Submitted', { exact: true })).toBeNull()
        expect(submitRequest).toHaveBeenCalledOnce()
    })
    it('preserves a saved draft across remount without submitting it automatically', async () => {
        const first = render(c.render(lesson)); await fillAll(c.count)
        fireEvent.click(screen.getAllByRole('button', { name: 'Save draft' })[0])
        await screen.findByText('Draft saved — not submitted')
        first.unmount(); render(c.render(lesson))
        await waitFor(() => expect(screen.getAllByRole('textbox')[0]).toHaveValue('My idea answer 0'))
        expect(screen.getByText('Not submitted yet')).toBeInTheDocument()
        expect(submitRequest).not.toHaveBeenCalled()
    })
    it('keeps failed or unconfirmed submissions pending and retries only on another explicit click with the same UUID', async () => {
        submitRequest.mockResolvedValueOnce({ confirmed: false }).mockImplementationOnce(async (_url, _method, input) => receipt(input))
        render(c.render(lesson)); await fillAll(c.count)
        fireEvent.click(screen.getByRole('button', { name: c.label, exact: true }))
        const retry = await screen.findByRole('button', { name: 'Try Submit again' })
        expect(screen.getByText('Submission not confirmed yet')).toBeInTheDocument()
        expect(screen.queryByText('Submitted', { exact: true })).toBeNull()
        expect(screen.getAllByRole('textbox')[0]).toHaveValue('My idea answer 0')
        expect(submitRequest).toHaveBeenCalledOnce()
        fireEvent.click(retry); await screen.findByText(c.confirmation)
        expect(submitRequest).toHaveBeenCalledTimes(2)
        expect(submitRequest.mock.calls[1][2]).toEqual(submitRequest.mock.calls[0][2])
    })
    it('respects the teacher pause while keeping writing and Save draft available', async () => {
        render(c.render({ ...lesson, feedbackOpen: false, refinementOpen: false })); await fillAll(c.count)
        const submit = screen.getByRole('button', { name: c.label, exact: true })
        expect(submit).toBeDisabled(); expect(submit).toHaveAccessibleDescription(/teacher has paused/)
        fireEvent.click(submit); fireEvent.click(screen.getAllByRole('button', { name: 'Save draft' })[0])
        await screen.findByText('Draft saved — not submitted')
        expect(submitRequest).not.toHaveBeenCalled(); expect(screen.getAllByRole('textbox')[0]).not.toBeDisabled()
    })
    it('keeps browser validation on empty required answers', async () => {
        render(c.render(lesson)); await screen.findByRole('button', { name: c.label, exact: true })
        fireEvent.click(screen.getByRole('button', { name: c.label, exact: true }))
        expect(submitRequest).not.toHaveBeenCalled(); expect(screen.queryByText('Submitted', { exact: true })).toBeNull()
    })
    it('recovers an interrupted Submit after reopening and waits for an explicit retry with the original payload', async () => {
        submitRequest.mockImplementationOnce(() => new Promise(() => {}))
            .mockImplementationOnce(async (_url, _method, input) => receipt(input))
        const first = render(c.render(lesson)); await fillAll(c.count)
        fireEvent.click(screen.getByRole('button', { name: c.label, exact: true }))
        const sent = submitRequest.mock.calls[0][2]
        first.unmount(); render(c.render(lesson))
        const retry = await screen.findByRole('button', { name: 'Try Submit again' })
        expect(screen.getByText('Submission not confirmed yet')).toBeInTheDocument()
        expect(screen.getAllByRole('textbox')[0]).toHaveValue('My idea answer 0')
        expect(submitRequest).toHaveBeenCalledOnce()
        fireEvent.click(retry); await screen.findByText(c.confirmation)
        expect(submitRequest.mock.calls[1][2]).toEqual(sent)
    })
    it('blocks rapid repeated Submit events until the first receipt arrives', async () => {
        let resolve
        submitRequest.mockImplementationOnce(() => new Promise(done => { resolve = done }))
        render(c.render(lesson)); await fillAll(c.count)
        const button = screen.getByRole('button', { name: c.label, exact: true }), form = button.closest('form')
        fireEvent.click(button); fireEvent.submit(form); fireEvent.submit(form)
        expect(submitRequest).toHaveBeenCalledOnce()
        expect(screen.queryByText('Submitted', { exact: true })).toBeNull()
        await act(async () => resolve(receipt(submitRequest.mock.calls[0][2])))
        expect(screen.getByText(c.confirmation)).toBeInTheDocument()
    })
    it('shows a rejected submission as unsent and keeps answers editable', async () => {
        submitRequest.mockRejectedValueOnce(Object.assign(Error('Changed'), { status: 409 }))
        render(c.render(lesson)); await fillAll(c.count)
        fireEvent.click(screen.getByRole('button', { name: c.label, exact: true }))
        expect(await screen.findByText('The class changed. Your answers are kept. Try again.')).toBeInTheDocument()
        expect(screen.getByText('Not submitted yet')).toBeInTheDocument()
        expect(screen.queryByText('Submitted', { exact: true })).toBeNull()
        expect(screen.getAllByRole('textbox')[0]).toHaveValue('My idea answer 0')
        expect(screen.getAllByRole('textbox')[0]).not.toBeDisabled()
        expect(submitRequest).toHaveBeenCalledOnce()
    })
})
