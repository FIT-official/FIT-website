'use client'
import { useSignUp } from '@clerk/nextjs'
import { useState } from 'react'
import Link from 'next/link'
import EmailField from './EmailField'
import PasswordField from './PasswordField'
import { subscriptionIntentTarget, withSubscriptionIntent } from '@/lib/subscriptionIntent'

export default function SignUpForm({ setVerifying, priceId }) {
    const { isLoaded, signUp } = useSignUp()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    async function submit(event) {
        event.preventDefault()
        if (!isLoaded || !signUp || busy) return
        setBusy(true)
        setError('')
        try {
            await signUp.create({ emailAddress: email.trim(), password })
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
            setVerifying(true)
        } catch (err) {
            setError(err?.errors?.[0]?.longMessage || err?.message || 'Unable to create your account. Please try again.')
        } finally { setBusy(false) }
    }
    async function google() {
        if (!isLoaded || !signUp || busy) return
        setBusy(true)
        setError('')
        try {
            await signUp.authenticateWithRedirect({
                strategy: 'oauth_google', redirectUrl: withSubscriptionIntent('/sign-up/sso-callback', priceId),
                redirectUrlComplete: subscriptionIntentTarget(priceId, '/dashboard/shop'),
            })
        } catch (err) {
            setError(err?.errors?.[0]?.longMessage || err?.message || 'Unable to continue with Google.')
            setBusy(false)
        }
    }
    return <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4">
        <h1>Create your account</h1>
        <p className="text-sm text-lightColor">Start free with your own creator page, 3 product listings and 10 print requests each month. No card required.</p>
        <p className="text-sm">Already registered? <Link href={withSubscriptionIntent('/sign-in', priceId)} className="underline">Sign in</Link></p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <label className="text-sm">Email<EmailField email={email} setEmail={setEmail} required /></label>
        <label className="text-sm">Password<PasswordField password={password} setPassword={setPassword} required /></label>
        <div id="clerk-captcha" />
        <button type="submit" disabled={!isLoaded || busy} className="authButton2 disabled:opacity-50">{busy ? 'Creating account...' : 'Create free account'}</button>
        <button type="button" onClick={google} disabled={!isLoaded || busy} className="authButton2 disabled:opacity-50">Continue with Google</button>
        <p className="text-xs text-lightColor">By creating an account, you agree to the <Link href="/terms" className="underline">Terms & Conditions</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>. Paid plans are optional and billed only after you choose one from your account.</p>
    </form>
}
