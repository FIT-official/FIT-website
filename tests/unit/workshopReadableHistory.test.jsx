import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import DraftHistory, { DraftPreview, draftStatus } from '@/components/Workshop/DraftHistory'
import WorkshopAudit from '@/components/Workshop/WorkshopAudit'
import GroupedTeacherResponses from '@/components/Workshop/GroupedTeacherResponses'
afterEach(cleanup)
describe('plain draft and teacher history', () => {
    it('previews labelled answers without code or metadata and restores the exact snapshot', () => {
        const content = { idea: '1', whatWorks: 'Easy to hold', question: 'Will it stay dry?', improvement: 'Add a lid', receipt: 'PRIVATE ID', expectedVersion: 9 }, controls = { remote: { snapshots: [{ version: 3, savedAt: '2026-10-09T01:00:00Z', content }] }, compare: vi.fn(), rebase: vi.fn(), retry: vi.fn(), undo: vi.fn(), redo: vi.fn() }
        render(<DraftHistory controls={controls} status="Autosaved draft v3. Not submitted; click Submit when finished." />)
        expect(screen.getByText('Saved')).toBeInTheDocument(); fireEvent.click(screen.getByText('Earlier drafts')); fireEvent.change(screen.getByLabelText('Choose an earlier draft'), { target: { value: '3' } })
        expect(screen.getByText('Easy to hold')).toBeInTheDocument(); expect(screen.getByText('What works well, and why?')).toBeInTheDocument(); expect(document.querySelector('pre')).toBe(null); expect(screen.queryByText(/PRIVATE ID|expectedVersion|v3/)).toBe(null)
        fireEvent.click(screen.getByRole('button', { name: 'Restore draft' })); expect(controls.rebase).toHaveBeenCalledWith(content); fireEvent.click(screen.getByRole('button', { name: 'Save' })); expect(controls.retry).toHaveBeenCalledOnce()
    })
    it('handles empty and legacy refinement drafts without relabelling the earlier answer', () => {
        const { rerender } = render(<DraftPreview content={{ change: '', reason: '', test: '' }} />); expect(screen.getByText('No answers in this draft.')).toBeInTheDocument()
        rerender(<DraftPreview content={{ feedbackUsed: 'A visitor asked about the base.', change: 'Widen it.', reason: 'Less wobble.', test: 'Try two models.' }} />)
        expect(screen.getByText('Earlier answer: Which feedback are you using?')).toBeInTheDocument(); expect(screen.getByText('What would you change to improve this idea?')).toBeInTheDocument()
    })
    it('never calls a failed, pending or restored draft saved', () => {
        for (const status of ['Autosave waiting. Local text kept; retrying the same request.', 'Network failed', 'Draft changes waiting to save.', 'Draft restored using compared saved version. Not submitted.']) expect(draftStatus(status)).not.toBe('Saved')
        expect(draftStatus('Network failed')).toMatch(/Couldn.t save/); expect(draftStatus('Autosaved draft v9.')).toBe('Saved')
    })
    it('shows readable names, groups and before/after history without serialised objects', () => {
        render(<WorkshopAudit events={[{ action: 'feedback', actor: 'PRIVATE TEACHER ID', at: '2026-10-09T01:00:00Z', before: { studentName: 'Aisha', visitingGroup: 'g2', whatWorks: 'Old answer', payloadHash: 'PRIVATE HASH' }, after: { studentName: 'Aisha', visitingGroup: 'g2', whatWorks: 'New answer' } }]} />)
        expect(screen.getByText(/Teacher.*Updated feedback/)).toBeInTheDocument(); expect(screen.getAllByText(/Aisha.*Group 2/)).toHaveLength(2); expect(screen.getByText('Old answer')).toBeInTheDocument(); expect(screen.getByText('New answer')).toBeInTheDocument(); expect(screen.queryByText(/PRIVATE/)).toBe(null); expect(document.querySelector('pre')).toBe(null)
    })
    it('puts deleted work in Trash and confirms bulk deletion for the exact author', async () => {
        const row = { id: 'id-one', seat: 'guest-one', studentName: 'Aisha', visitingGroup: 'g2', presentingGroup: 'g3', idea: '1', whatWorks: 'Works', question: 'Why?', improvement: 'Widen it', recordedAt: '2026-10-09T01:00:00Z', version: 1, visibility: 'visible' }, onAction = vi.fn().mockResolvedValue(true)
        render(<GroupedTeacherResponses lesson={{ version: 4, feedback: [row, { ...row, id: 'deleted', seat: 'guest-other', studentName: 'Ben', visibility: 'deleted' }], refinements: [], progress: [], audit: [] }} onAction={onAction} />)
        expect(screen.queryByRole('heading', { name: /Ben/, level: 4 })).toBe(null); fireEvent.click(screen.getByText('Manage this student’s submissions')); fireEvent.click(screen.getByRole('button', { name: 'Delete this student’s submissions' })); expect(onAction).not.toHaveBeenCalled()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move student’s submissions to Trash' })) }); expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'trashAuthor', seat: 'guest-one', group: 'g2', expectedVersion: 4 }))
        fireEvent.click(screen.getByRole('button', { name: 'Trash', exact: true })); expect(screen.getByRole('heading', { name: /Ben/, level: 4 })).toBeInTheDocument(); expect(screen.queryByRole('heading', { name: /Aisha/, level: 4 })).toBe(null)
    })
})
