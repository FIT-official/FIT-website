'use client'

import { useEffect, useState } from 'react'
import TermsCheckbox from '@/components/Legal/TermsCheckbox'
import TermsGatedButton from '@/components/Legal/TermsGatedButton'
import { CREATOR_TERMS_VERSION } from '@/content/legal/creatorTermsV1'

export default function CreatorTermsCard() {
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(
          '/api/terms/accept',
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        )

        if (!response.ok) return

        const body = await response.json()

        if (!controller.signal.aborted) {
          setAccepted(body.accepted === true)
        }
      } catch {
        // The user can retry through the acceptance action.
      }
    }

    load()

    return () => controller.abort()
  }, [])

  async function submit() {
    if (!checked) {
      setError(true)
      return
    }

    if (busy || accepted) return

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch(
        '/api/terms/accept',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            document: 'creator',
            accepted: true,
            termsVersion: CREATOR_TERMS_VERSION,
          }),
        }
      )

      const body = await response.json()

      if (!response.ok) {
        if (
          body.code === 'terms_required' ||
          body.code === 'terms_version_changed'
        ) {
          setChecked(false)
          setError(true)
        }

        throw new Error(
          body.error || 'The request could not be completed.'
        )
      }

      setAccepted(true)
      setError(false)
    } catch (err) {
      setMessage(
        err.message || 'The request could not be completed.'
      )
    } finally {
      setBusy(false)
    }
  }

  if (accepted) {
    return (
      <section
        aria-label="Creator Terms"
        className="rounded border border-borderColor p-4"
      >
        <p role="status">
          Creator Terms accepted.
        </p>
      </section>
    )
  }

  return (
    <section
      aria-label="Creator Terms"
      className="rounded border border-borderColor p-4"
    >
      <TermsCheckbox
        document="creator"
        checked={checked}
        onChange={value => {
          setChecked(value)
          setError(false)
        }}
        error={error}
      />

      <TermsGatedButton
        type="button"
        termsRequired
        termsTicked={checked}
        onTermsError={() => setError(true)}
        disabled={busy}
        onClick={submit}
        className="formBlackButton mt-4"
      >
        {busy ? 'Please wait…' : 'Accept Creator Terms'}
      </TermsGatedButton>

      {message && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {message}
        </p>
      )}
    </section>
  )
}
