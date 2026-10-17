'use client'
import { useEffect, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'

// Non-blocking prompt for request/purchase flows (not Class): signed-out visitors may log in to prefill their
// details and come back to the same page; guests can simply carry on with the form.
export default function SoftSignInPrompt({ onBeforeSignIn, className = 'mx-8 my-4 flex flex-wrap items-center gap-3 rounded-xl border border-borderColor bg-baseColor px-4 py-3 text-sm' }) {
  const { isLoaded, isSignedIn } = useUser()
  const [returnUrl, setReturnUrl] = useState('/')
  useEffect(() => { setReturnUrl(window.location.pathname + window.location.search) }, [])
  if (!isLoaded || isSignedIn) return null
  return (
    <div className={className} data-soft-sign-in="">
      <p className="m-0">Log in to prefill your details.</p>
      <SignInButton mode="modal" forceRedirectUrl={returnUrl} signUpForceRedirectUrl={returnUrl}>
        <button type="button" className="underline" onClick={onBeforeSignIn}>Log in</button>
      </SignInButton>
    </div>
  )
}