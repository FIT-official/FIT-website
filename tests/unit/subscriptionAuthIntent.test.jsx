import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ create: vi.fn(), prepare: vi.fn(), verify: vi.fn(), oauth: vi.fn(), signIn: vi.fn(), setActive: vi.fn(), push: vi.fn(), replace: vi.fn(), callback: vi.fn(), signedIn: false }))
vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ isLoaded: true, isSignedIn: mocks.signedIn }),
    useSignUp: () => ({ isLoaded: true, signUp: { create: mocks.create, prepareEmailAddressVerification: mocks.prepare,
        attemptEmailAddressVerification: mocks.verify, authenticateWithRedirect: mocks.oauth }, setActive: mocks.setActive }),
    useSignIn: () => ({ isLoaded: true, signIn: { create: mocks.signIn, authenticateWithRedirect: mocks.oauth }, setActive: mocks.setActive }),
    AuthenticateWithRedirectCallback: props => { mocks.callback(props); return null },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
import SignUpPage from '@/app/sign-up/[[...sign-up]]/SignUpPage'
import SignUpForm from '@/components/AuthComponents/SignUpForm'
import SignInForm from '@/components/AuthComponents/SignInForm'
import SignInPage from '@/app/sign-in/[[...sign-in]]/SignInPage'
import SsoCallback from '@/components/AuthComponents/SsoCallback'
import { subscriptionIntentTarget, subscriptionPriceId } from '@/lib/subscriptionIntent'

const priceId = 'price_standard_year'
const destination = `/account/subscription?priceId=${priceId}`
const credentials = () => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'creator@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } })
}
beforeEach(() => {
    vi.clearAllMocks(); mocks.signedIn = false
    mocks.create.mockResolvedValue({}); mocks.prepare.mockResolvedValue({})
    mocks.verify.mockResolvedValue({ status: 'complete', createdSessionId: 'session_signup' })
    mocks.signIn.mockResolvedValue({ status: 'complete', createdSessionId: 'session_signin' })
    mocks.setActive.mockResolvedValue(); mocks.oauth.mockResolvedValue()
})
afterEach(cleanup)

describe('subscription selection through authentication', () => {
    it('keeps a paid choice through email signup and verification without storing payment metadata', async () => {
        render(<SignUpPage priceId={priceId} />)
        credentials(); fireEvent.click(screen.getByRole('button', { name: 'Create free account' }))
        await screen.findByRole('button', { name: 'Verify' })
        expect(mocks.create).toHaveBeenCalledWith({ emailAddress: 'creator@example.com', password: 'test-only-password' })
        screen.getAllByRole('textbox').forEach((input, index) => fireEvent.change(input, { target: { value: String(index + 1) } }))
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
        await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith({ session: 'session_signup' }))
        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(destination))
    })
    it('preserves the selection between auth forms and through Google signup', async () => {
        render(<SignUpForm setVerifying={vi.fn()} priceId={priceId} />)
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/sign-in?priceId=${priceId}`)
        fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
        await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith({ strategy: 'oauth_google', redirectUrl: `/sign-up/sso-callback?priceId=${priceId}`, redirectUrlComplete: destination }))
    })
    it('activates a completed email sign-in before navigating to the selected subscription', async () => {
        let activate
        mocks.setActive.mockImplementationOnce(() => new Promise(resolve => { activate = resolve }))
        render(<SignInForm priceId={priceId} />)
        expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', `/sign-up?priceId=${priceId}`)
        credentials(); fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
        await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith({ session: 'session_signin' }))
        expect(mocks.push).not.toHaveBeenCalled()
        activate()
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(destination))
    })
    it('starts Google sign-in without requiring password fields and preserves the selected price', async () => {
        render(<SignInForm priceId={priceId} />)
        fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
        await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith({ strategy: 'oauth_google', redirectUrl: `/sign-in/sso-callback?priceId=${priceId}`, redirectUrlComplete: destination }))
        expect(mocks.signIn).not.toHaveBeenCalled()
    })
    it('keeps an already active session on the intended subscription destination', async () => {
        mocks.signedIn = true
        render(<SignInPage priceId={priceId} />)
        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(destination))
    })
    it('sets fixed local OAuth callback targets for a valid price and preserves defaults otherwise', () => {
        const view = render(<SsoCallback priceId={priceId} />)
        expect(mocks.callback).toHaveBeenLastCalledWith({ signInForceRedirectUrl: destination, signUpForceRedirectUrl: destination,
            signInFallbackRedirectUrl: destination, signUpFallbackRedirectUrl: destination })
        view.rerender(<SsoCallback priceId="https://evil.example" />)
        expect(mocks.callback).toHaveBeenLastCalledWith({ signInFallbackRedirectUrl: '/dashboard/shop', signUpFallbackRedirectUrl: '/dashboard/shop' })
    })
    it('preserves the ordinary email sign-in default when no plan was selected', async () => {
        render(<SignInForm />)
        credentials(); fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
    })
    it.each([undefined, '', '//evil.example', 'https://evil.example', 'price&redirect_url=evil', 'price%0aevil', 'a'.repeat(221), ['price_one']])('rejects non-opaque intent %j', value => {
        expect(subscriptionPriceId(value)).toBeNull()
        expect(subscriptionIntentTarget(value, '/onboarding')).toBe('/onboarding')
    })
})
