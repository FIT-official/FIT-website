'use client'

import { useSignUp } from '@clerk/nextjs'
import { useState } from 'react'
import Link from 'next/link'
import EmailField from './EmailField'
import PasswordField from './PasswordField'
import {
  subscriptionIntentTarget,
  withSubscriptionIntent,
} from '@/lib/subscriptionIntent'
import TermsCheckbox from '@/components/Legal/TermsCheckbox'
import TermsGatedButton from '@/components/Legal/TermsGatedButton'
import { CUSTOMER_TERMS_VERSION } from '@/content/legal/customerTermsV1'

export default function SignUpForm({
  setVerifying,
  priceId,
  termsRequired = false,
}) {
  const { isLoaded, signUp } = useSignUp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [termsTicked, setTermsTicked] = useState(false)
  const [termsError, setTermsError] = useState(false)

  function requireTerms() {
    if (!termsRequired || termsTicked) return true

    setTermsError(true)
    return false
  }

  async function submit(event) {
    event.preventDefault()

    if (!requireTerms()) return
    if (!isLoaded || !signUp || busy) return

    setBusy(true)
    setError('')

    try {
      const options = {
        emailAddress: email.trim(),
        password,
      }

      if (termsRequired) {
        options.unsafeMetadata = {
          termsAcceptance: {
            accepted: true,
            termsVersion: CUSTOMER_TERMS_VERSION,
          },
        }
      }

      await signUp.create(options)

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      })

      setVerifying(true)
    } catch (err) {
      setError(
        err?.errors?.[0]?.longMessage ||
        err?.message ||
        'Unable to create your account. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    if (!requireTerms()) return
    if (!isLoaded || !signUp || busy) return

    setBusy(true)
    setError('')

    try {
      // Clerk signup metadata is a client-side indication,
      // not a durable server acceptance record.
      if (termsRequired) {
        await signUp.update({
          unsafeMetadata: {
            termsAcceptance: {
              accepted: true,
              termsVersion: CUSTOMER_TERMS_VERSION,
            },
          },
        })
      }

      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: withSubscriptionIntent(
          '/sign-up/sso-callback',
          priceId
        ),
        redirectUrlComplete: subscriptionIntentTarget(
          priceId,
          '/dashboard/shop'
        ),
      })
    } catch (err) {
      setError(
        err?.errors?.[0]?.longMessage ||
        err?.message ||
        'Unable to continue with Google.'
      )
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-md flex-col gap-4"
    >
      <h1>Create your account</h1>

      <p className="text-sm text-lightColor">
        Shop with FIT, track your print requests or set up a free creator storefront. No card required.
      </p>

      <p className="text-sm">
        Already registered?{' '}
        <Link
          href={withSubscriptionIntent('/sign-in', priceId)}
          className="underline"
        >
          Sign in
        </Link>
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <label className="text-sm">
        Email
        <EmailField
          email={email}
          setEmail={setEmail}
          required
        />
      </label>

      <label className="text-sm">
        Password
        <PasswordField
          password={password}
          setPassword={setPassword}
          required
        />
      </label>

      <div id="clerk-captcha" />

      {termsRequired && (
        <TermsCheckbox
          document="customer"
          checked={termsTicked}
          onChange={value => {
            setTermsTicked(value)
            setTermsError(false)
          }}
          error={termsError}
        />
      )}

      <TermsGatedButton
        type="submit"
        disabled={!isLoaded || busy}
        termsRequired={termsRequired}
        termsTicked={termsTicked}
        onTermsError={() => setTermsError(true)}
        className="authButton2 disabled:opacity-50"
      >
        {busy ? 'Creating account...' : 'Create free account'}
      </TermsGatedButton>

      <TermsGatedButton
        type="button"
        onClick={google}
        disabled={!isLoaded || busy}
        termsRequired={termsRequired}
        termsTicked={termsTicked}
        onTermsError={() => setTermsError(true)}
        className="authButton2 disabled:opacity-50"
      >
        Continue with Google
      </TermsGatedButton>

      {!termsRequired && (
        <p className="text-xs text-lightColor">
          By creating an account, you agree to the{' '}
          <Link href="/terms" className="underline">
            Terms &amp; Conditions
          </Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          . Paid plans are optional and billed only after you choose one from your account.
        </p>
      )}
    </form>
  )
}
