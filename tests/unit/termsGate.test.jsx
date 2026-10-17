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

function Harness({ required, onProceed }) {
  const [ticked, setTicked] = useState(false)
  const [error, setError] = useState(false)

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        if (required && !ticked) {
          setError(true)
          return
        }
        onProceed()
      }}
    >
      {required && (
        <TermsCheckbox
          document="customer"
          checked={ticked}
          onChange={value => {
            setTicked(value)
            setError(false)
          }}
          error={error}
        />
      )}

      <TermsGatedButton
        type="submit"
        termsRequired={required}
        termsTicked={ticked}
        onTermsError={() => setError(true)}
      >
        Continue
      </TermsGatedButton>
    </form>
  )
}

afterEach(cleanup)

describe('terms checkbox gate', () => {
  it('preserves the flag-off flow', () => {
    const proceed = vi.fn()

    render(<Harness required={false} onProceed={proceed} />)

    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue' })
    )

    expect(proceed).toHaveBeenCalledOnce()
  })

  it('blocks and announces missing acceptance', () => {
    const proceed = vi.fn()

    render(<Harness required onProceed={proceed} />)

    const button = screen.getByRole('button', {
      name: 'Continue',
    })

    expect(button.getAttribute('disabled')).toBeNull()
    expect(button.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(button)

    expect(proceed).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(
      'Tick the box to agree to the Terms and Conditions.'
    )

    const checkbox = screen.getByRole('checkbox')
    const description = checkbox.getAttribute('aria-describedby')

    expect(description).toBeTruthy()
    expect(
      document.getElementById(description).textContent
    ).toBe(
      'Tick the box to agree to the Terms and Conditions.'
    )
  })

  it('allows continuation after the tick', () => {
    const proceed = vi.fn()

    render(<Harness required onProceed={proceed} />)

    fireEvent.click(screen.getByRole('checkbox'))

    const button = screen.getByRole('button', {
      name: 'Continue',
    })

    expect(button.getAttribute('aria-disabled')).toBe('false')

    fireEvent.click(button)

    expect(proceed).toHaveBeenCalledOnce()
  })
})
