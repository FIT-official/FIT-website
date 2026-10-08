import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { classroomView, emptyLesson, moderateClassroom } from '@/lib/workshopClassroomStore'
const bridge = vi.hoisted(() => ({ request: vi.fn(), poll: null }))
vi.mock('next/link', () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }))
vi.mock('@/components/Workshop/Classroom', () => ({ classroomRequest: (...args) => bridge.request(...args) }))
vi.mock('@/components/Workshop/TeacherDraftRecovery', () => ({ default: () => null }))
vi.mock('@/components/Workshop/useClassPolling', async () => {
    const { useEffect, useRef } = await import('react')
    return { useClassPolling: callback => { const initial = useRef(callback); bridge.poll = callback; useEffect(() => { initial.current() }, []) } }
})
import TeacherClassroom from '@/components/Workshop/TeacherClassroom'
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('intentional teacher stage defaults and subsequent visibility controls', () => {
    it('starts FEEDBACK with incoming visibility, preserves an explicit close through refresh/moderation, and opens REFINE intentionally', async () => {
        const teacher = { role: 'teacher', userId: 'synthetic-teacher' }, student = { role: 'student', seat: 'group1student1', group: 'g1' }
        let state = { ...emptyLesson(), version: 1, feedback: [{ id: '642199db-6d94-4289-8b40-45e2f42cc311', presentingGroup: 'g1', visitingGroup: 'g2', seat: 'group2student1', idea: '2', whatWorks: 'TEST works', question: 'TEST question', improvement: 'TEST improvement', visibility: 'visible', version: 1, recordedAt: '2026-10-08T12:00:00Z' }] }
        const store = { findOne: async () => structuredClone(state), replaceOne: async (query, next) => { if (query.version !== state.version) return { modifiedCount: 0 }; state = structuredClone(next); return { modifiedCount: 1 } } }
        bridge.request.mockImplementation(async (url, method = 'GET', input) => method === 'PATCH' ? moderateClassroom(store, teacher, input) : { ...classroomView(state, teacher), accounts: [] })
        render(<TeacherClassroom />)
        await screen.findByRole('heading', { name: 'Active stage: PRESENT' })
        expect(state.showFeedback).toBe(false)
        fireEvent.click(screen.getByRole('button', { name: 'FEEDBACK', exact: true }))
        await screen.findByRole('button', { name: 'Class feedback visibility: open' })
        expect(state).toMatchObject({ phase: 'FEEDBACK', feedbackOpen: true, refinementOpen: false, showFeedback: true })
        expect(classroomView(state, student).feedback).toHaveLength(1)
        fireEvent.click(screen.getByRole('button', { name: 'Class feedback visibility: open' }))
        await screen.findByRole('button', { name: 'Class feedback visibility: closed' })
        expect(classroomView(state, student).feedback).toHaveLength(0)
        await moderateClassroom(store, teacher, { action: 'feedback', id: state.feedback[0].id, expectedEntryVersion: 1, visibility: 'hidden' })
        await act(async () => { await bridge.poll() })
        expect(state.showFeedback).toBe(false)
        expect(state.feedback[0].visibility).toBe('hidden')
        fireEvent.click(screen.getByRole('button', { name: 'REFINE', exact: true }))
        await waitFor(() => expect(state.phase).toBe('REFINE'))
        expect(state).toMatchObject({ feedbackOpen: false, refinementOpen: true, showFeedback: true })
        expect(classroomView(state, student).feedback).toHaveLength(0)
        expect(state.feedback[0].visibility).toBe('hidden')
        await act(async () => { await bridge.poll() })
        expect(state.feedback[0].visibility).toBe('hidden')
    })
})
