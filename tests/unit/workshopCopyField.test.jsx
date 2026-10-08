import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyField from '@/components/Workshop/CopyField'
afterEach(() => vi.unstubAllGlobals())
describe('student copy controls', () => {
    it.each(['Student login', 'Class ID', 'Session ID'])('copies the exact own %s and announces success only after the clipboard resolves', async label => {
        let resolve; const writeText = vi.fn(() => new Promise(done => { resolve = done })); vi.stubGlobal('navigator', { clipboard: { writeText } })
        render(<CopyField label={label} id="own-value" value="synthetic-own-value" />)
        fireEvent.click(screen.getByRole('button', { name: 'Copy ' + label.toLowerCase() })); expect(writeText).toHaveBeenCalledWith('synthetic-own-value'); expect(screen.queryByRole('status')).not.toBeInTheDocument()
        await act(async () => resolve()); expect(screen.getByRole('status')).toHaveTextContent(label + ' copied.')
    })
    it('selects the text when clipboard permission fails and never reports Copied', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(Error('Denied')) } }); render(<CopyField label="Student login" id="private-value" value="synthetic-own-value" privateValue />)
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy student login' })))
        const input = screen.getByLabelText('Student login'); expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(input.value.length); expect(screen.getByRole('status')).toHaveTextContent('Text selected'); expect(screen.getByRole('status')).not.toHaveTextContent(/copied/i)
    })
    it('provides the same select-text fallback when clipboard API is unavailable', async () => { vi.stubGlobal('navigator', {}); render(<CopyField label="Session ID" id="session" value="11111111-1111-4111-8111-111111111111" />); await act(async () => fireEvent.click(screen.getByRole('button'))); expect(screen.getByRole('status')).toHaveTextContent('Text selected') })
})
