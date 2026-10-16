import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const bridge = vi.hoisted(() => ({ request: vi.fn(), replace: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: bridge.replace }) }))
vi.mock('@/components/Workshop/Classroom', () => ({ classroomRequest: (...args) => bridge.request(...args) }))
vi.mock('@/components/Workshop/useClassPolling', async () => {
    const { useEffect, useRef } = await import('react')
    return { useClassPolling: callback => { const initial = useRef(callback); useEffect(() => { initial.current() }, []) } }
})
vi.mock('@/components/Workshop/useGuestVersionedDraft', () => ({ clearDraftCache: vi.fn() }))
vi.mock('@/components/Workshop/ReviewedGroupPage', () => ({ default: () => null }))
vi.mock('@/components/Workshop/GuestBalancedFeedback', () => ({ default: () => null }))
vi.mock('@/components/Workshop/GuestRefineWorkspace', () => ({ default: () => null }))
vi.mock('@/components/Workshop/GuestIncomingFeedback', () => ({ default: () => null }))
vi.mock('@/components/Workshop/GuestTinkercad', () => ({ default: () => null }))
vi.mock('@/components/Workshop/GuestReturnHelp', () => ({ default: () => null }))
vi.mock('@/components/Workshop/WorkshopAudit', () => ({ default: () => null }))
vi.mock('@/components/Workshop/GuestTeacherResponses', () => ({ default: () => null }))
vi.mock('@/components/Workshop/TeacherTinkercad', () => ({ default: () => null }))
vi.mock('@/components/Workshop/TeacherBackup', () => ({ default: () => null }))
vi.mock('@/components/Workshop/TeacherCanvasPanel', () => ({ default: () => null }))
vi.mock('@/components/Workshop/CanvasSubmissionGallery', () => ({ default: () => null }))
vi.mock('@/components/Workshop/TeacherJoinRequests', () => ({ default: () => null }))
vi.mock('@/components/sims/GameShellStage', () => ({ default: ({ title }) => <div data-testid="class-player">{title}</div> }))

import GuestClassroom from '@/components/Workshop/GuestClassroom'
import GuestTeacherClassroom from '@/components/Workshop/GuestTeacherClassroom'

function lesson(overrides = {}) {
    return {
        seat: 'synthetic-guest', studentName: 'Alex', group: 'g2', phase: 'PRESENT',
        version: 1, assignment: { target: 'g3', round: 1 }, progress: [], audit: [],
        feedbackOpen: false, refinementOpen: false, showFeedback: false,
        ...overrides,
    }
}

beforeEach(() => { bridge.request.mockReset(); localStorage.clear(); vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('classroom simulation availability', () => {
    it.each([undefined, false, '1'])('keeps the teacher panel unchanged and never reads simIds for enabled=%s', async enabled => {
        const readSimIds = vi.fn(() => { throw new Error('Simulation ids must not be read while disabled') })
        const state = lesson({ simsAddToClassEnabled: enabled })
        Object.defineProperty(state, 'simIds', { get: readSimIds })
        bridge.request.mockResolvedValue(state)
        render(<GuestTeacherClassroom />)
        expect(await screen.findByRole('heading', { name: 'Class student work' })).toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Class simulations' })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Choose activities/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Remove .* from class/ })).not.toBeInTheDocument()
        expect(readSimIds).not.toHaveBeenCalled()
        expect(bridge.request.mock.calls).toEqual([['/api/admin/workshop/guest']])
        expect(fetch).not.toHaveBeenCalled()
    })

    it.each([undefined, false, '1'])('keeps the student classroom unchanged and never reads simIds for enabled=%s', async enabled => {
        const readSimIds = vi.fn(() => { throw new Error('Simulation ids must not be read while disabled') })
        const state = lesson({ simsAddToClassEnabled: enabled })
        Object.defineProperty(state, 'simIds', { get: readSimIds })
        bridge.request.mockResolvedValue(state)
        render(<GuestClassroom homeGroup="g2" />)
        expect(await screen.findByRole('heading', { name: 'Group 2 class' })).toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Class simulations' })).not.toBeInTheDocument()
        expect(screen.queryByTestId('class-player')).not.toBeInTheDocument()
        expect(readSimIds).not.toHaveBeenCalled()
        expect(bridge.request.mock.calls).toEqual([['/api/workshop/guest/classroom?homeGroup=g2']])
        expect(fetch).not.toHaveBeenCalled()
    })

    it('keeps enabled teacher assignment links and removal controls working', async () => {
        bridge.request.mockResolvedValue(lesson({ simsAddToClassEnabled: true, simIds: ['sampling'] }))
        render(<GuestTeacherClassroom />)
        expect(await screen.findByRole('region', { name: 'Class simulations' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Choose activities/ })).toHaveAttribute('href', '/class/simulations')
        fireEvent.click(screen.getByRole('button', { name: 'Remove Signal Sampling Detective from class' }))
        await waitFor(() => expect(bridge.request).toHaveBeenCalledWith('/api/admin/workshop/guest', 'PATCH', { action: 'removeSimulation', simId: 'sampling' }))
        await screen.findByText('Saved. Student screens update after their next refresh.')
    })

    it('shows assigned activities to enabled students', async () => {
        bridge.request.mockResolvedValue(lesson({ simsAddToClassEnabled: true, simIds: ['sampling'] }))
        render(<GuestClassroom homeGroup="g2" />)
        expect(await screen.findByRole('region', { name: 'Class simulations' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Signal Sampling Detective' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Remove .* from class/ })).not.toBeInTheDocument()
    })

    it('keeps enabled activities hidden during a locked lesson without reading their ids', async () => {
        const readSimIds = vi.fn(() => ['sampling'])
        const state = lesson({ simsAddToClassEnabled: true, navigationLocked: true, navigationTarget: 'PRESENT' })
        Object.defineProperty(state, 'simIds', { get: readSimIds })
        bridge.request.mockResolvedValue(state)
        render(<GuestClassroom homeGroup="g2" />)
        await screen.findByRole('heading', { name: 'Group 2 class' })
        expect(screen.queryByRole('region', { name: 'Class simulations' })).not.toBeInTheDocument()
        expect(readSimIds).not.toHaveBeenCalled()
    })
})
