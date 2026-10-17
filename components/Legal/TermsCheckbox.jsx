'use client'

import { useId } from 'react'

const DOCUMENTS = Object.freeze({
  customer: {
    href: '/terms',
    linkText: 'Terms and Conditions',
    error: 'Tick the box to agree to the Terms and Conditions.',
  },
  creator: {
    href: '/creator-terms',
    linkText: 'Creator Terms',
    error: 'Tick the box to agree to the Creator Terms.',
  },
})

const ALIASES = Object.freeze({
  customer: 'customer',
  terms: 'customer',
  creator: 'creator',
  'creator-terms': 'creator',
})

export default function TermsCheckbox({
  document = 'customer',
  checked = false,
  onChange,
  id,
  error = false,
  name,
  value,
}) {
  const generatedId = useId()
  const checkboxId = id || generatedId
  const errorId = `${checkboxId}-error`

  const selected = Object.hasOwn(ALIASES, document)
    ? ALIASES[document]
    : null

  if (!selected) return null

  const config = DOCUMENTS[selected]

  return (
    <div className="w-full">
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={checkboxId}
          name={name}
          value={value}
          type="checkbox"
          checked={checked}
          onChange={event => onChange?.(event.target.checked)}
          aria-required="true"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="h-11 w-11 shrink-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        />

        <label
          htmlFor={checkboxId}
          className="text-sm leading-relaxed"
        >
          I agree to the{' '}
          <a
            href={config.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={event => event.stopPropagation()}
          >
            {config.linkText}
          </a>
        </label>
      </div>

      <p
        id={errorId}
        role={error ? 'alert' : undefined}
        aria-live="polite"
        className={
          error
            ? 'mt-2 text-sm text-red-700'
            : 'sr-only'
        }
      >
        {error ? config.error : ''}
      </p>
    </div>
  )
}
