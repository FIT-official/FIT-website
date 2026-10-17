/* @vitest-environment jsdom */

import React, { useState } from 'react'
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
} from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from '@testing-library/react'

import TermsCheckbox from '@/components/Legal/TermsCheckbox'
import TermsGatedButton from '@/components/Legal/TermsGatedButton'

afterEach(cleanup)

function Harness({ document, onProceed }) {
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState(false)

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        if (!checked) {
          setError(true)
          return
        }
        onProceed()
      }}
    >
      <TermsCheckbox
        document={document}
        checked={checked}
        onChange={value => {
          setChecked(value)
          setError(false)
        }}
        error={error}
      />

      <TermsGatedButton
        type="submit"
        termsRequired
        termsTicked={checked}
        onTermsError={() => setError(true)}
      >
        Continue
      </TermsGatedButton>
    </form>
  )
}

function associatedLabel(checkbox) {
  return document.querySelector(
    `label[for="${checkbox.id}"]`
  )
}

describe('Customer acceptance UI', () => {
  it('renders exact approved wording and link attributes', () => {
    render(
      <Harness
        document="customer"
        onProceed={vi.fn()}
      />
    )

    const checkbox = screen.getByRole('checkbox')
    const label = associatedLabel(checkbox)

    expect(label).not.toBeNull()
    expect(label.textContent).toBe(
      'I agree to the Terms and Conditions'
    )

    const link = screen.getByRole('link', {
      name: 'Terms and Conditions',
    })

    expect(link.getAttribute('href')).toBe('/terms')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe(
      'noopener noreferrer'
    )
  })

  it('announces exact error when blocked', () => {
    const proceed = vi.fn()

    render(
      <Harness
        document="customer"
        onProceed={proceed}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Continue',
      })
    )

    expect(proceed).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(
      'Tick the box to agree to the Terms and Conditions.'
    )
  })

  it('allows continuation after acceptance', () => {
    const proceed = vi.fn()

    render(
      <Harness
        document="customer"
        onProceed={proceed}
      />
    )

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue' })
    )

    expect(proceed).toHaveBeenCalledOnce()
  })
})

describe('Creator acceptance UI', () => {
  it('renders exact approved creator wording', () => {
    render(
      <Harness
        document="creator"
        onProceed={vi.fn()}
      />
    )

    const checkbox = screen.getByRole('checkbox')
    const label = associatedLabel(checkbox)

    expect(label).not.toBeNull()
    expect(label.textContent).toBe(
      'I agree to the Creator Terms'
    )

    const link = screen.getByRole('link', {
      name: 'Creator Terms',
    })

    expect(link.getAttribute('href')).toBe(
      '/creator-terms'
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe(
      'noopener noreferrer'
    )
  })

  it('announces exact creator error', () => {
    const proceed = vi.fn()

    render(
      <Harness
        document="creator"
        onProceed={proceed}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue' })
    )

    expect(proceed).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(
      'Tick the box to agree to the Creator Terms.'
    )
  })

  it('does not render placeholders', () => {
    const { container } = render(
      <Harness document="creator" onProceed={vi.fn()} />
    )

    expect(container.textContent).not.toMatch(
      /\[|\]|TODO|TBD/
    )
  })
})
