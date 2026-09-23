import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ verify: vi.fn(), setActive: vi.fn(), replace: vi.fn(), toast: vi.fn() }))
vi.mock('@clerk/nextjs', () => ({ useSignUp: () => ({ isLoaded: true, signUp: { attemptEmailAddressVerification: mocks.verify }, setActive: mocks.setActive }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: mocks.toast }) }))
vi.mock('@/components/AuthComponents/CodeField', () => ({ default: () => <input aria-label="Verification code" /> }))
import VerificationForm from '@/components/AuthComponents/VerificationForm'
beforeEach(() => { vi.clearAllMocks(); mocks.setActive.mockResolvedValue(undefined) })
afterEach(cleanup)
describe('email verification completion', () => {
    it('activates the verified session before opening onboarding', async () => {
        mocks.verify.mockResolvedValue({ status: 'complete', createdSessionId: 'session_verified' })
        render(<VerificationForm />)
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/onboarding'))
        expect(mocks.setActive).toHaveBeenCalledWith({ session: 'session_verified' })
        expect(mocks.setActive.mock.invocationCallOrder[0]).toBeLessThan(mocks.replace.mock.invocationCallOrder[0])
    })
    it('keeps incomplete verification on the form', async () => {
        mocks.verify.mockResolvedValue({ status: 'missing_requirements' })
        render(<VerificationForm />)
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled())
        expect(mocks.setActive).not.toHaveBeenCalled()
        expect(mocks.replace).not.toHaveBeenCalled()
    })
})
