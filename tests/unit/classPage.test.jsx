import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import ClassPage, { metadata } from '@/app/class/page'

afterEach(cleanup)

describe('Class hub', () => {
  it('renders a public landing page with a Simulations card', () => {
    render(<ClassPage />)
    const hub = within(screen.getByRole('main'))
    expect(hub.getByRole('heading', { level: 1, name: 'Class' })).toBeVisible()
    const card = hub.getByRole('link', { name: 'Simulations' })
    expect(card).toHaveAttribute('href', '/class/simulations')
    expect(within(card).getByRole('heading', { level: 2, name: 'Simulations' })).toBeVisible()
    expect(hub.getByText('More coming soon.')).toBeVisible()
    expect(hub.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
    expect(metadata.alternates.canonical).toBe('/class')
  })
})
