import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import ClassPage, { metadata } from '@/app/class/page'

vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }) }))  // the hub now has a client component that reads the account
afterEach(cleanup)

describe('Class hub', () => {
  it('renders a public landing page with a Simulations card', () => {
    render(<ClassPage />)
    const hub = within(screen.getByRole('main'))
    expect(hub.getByRole('heading', { level: 1, name: 'Class' })).toBeVisible()
    // The tab bar also has a Simulations link; the card is the one that contains the heading.
    const card = hub.getAllByRole('link', { name: 'Simulations' }).find(link => link.querySelector('h2'))
    expect(card).toHaveAttribute('href', '/class/simulations')
    expect(within(card).getByRole('heading', { level: 2, name: 'Simulations' })).toBeVisible()
    expect(hub.getByText(/More classes are planned/)).toBeVisible()
    expect(hub.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
    expect(metadata.alternates.canonical).toBe('/class')
  })
})
