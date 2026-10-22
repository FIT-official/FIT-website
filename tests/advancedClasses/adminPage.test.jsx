import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FIT, OTHER_ADMIN, STRANGER, adminDeps, directory } from './fixtures'

vi.mock('server-only', () => ({}))

const { default: Page, metadata, dynamic } = await import('@/app/admin/advanced-classes/page')

const renderPage = async (deps) => render(await Page({ deps }))

describe('/admin/advanced-classes page (synthetic users)', () => {
  it('is dynamic and noindex', () => {
    expect(dynamic).toBe('force-dynamic')
    expect(metadata.robots).toMatchObject({ index: false, follow: false })
  })

  it('anonymous visitors get a sign-in prompt with no identities', async () => {
    const dir = directory()
    const { container } = await renderPage(adminDeps({ unauthorised: true, fetchUser: dir.fetchUser }))
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fadmin%2Fadvanced-classes')
    expect(container.textContent).not.toMatch(/SYNTHETIC|example\.test/)
    expect(dir.calls).toEqual([])
  })

  it('non-admins are denied without identities', async () => {
    const dir = directory()
    const { container } = await renderPage(adminDeps({ userId: STRANGER, fetchUser: dir.fetchUser }))
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/SYNTHETIC|example\.test/)
    expect(dir.calls).toEqual([])
  })

  it('admins see a read-only view with scopes, live state, policy and provenance, and no controls', async () => {
    const dir = directory()
    const { container } = await renderPage(adminDeps({ userId: OTHER_ADMIN, fetchUser: dir.fetchUser }))
    expect(screen.getByRole('heading', { level: 1, name: 'Advanced Classes access' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/View only/)
    expect(screen.getAllByText('Verified now')).toHaveLength(2)
    expect(container.textContent).toContain(FIT)
    expect(container.textContent).toContain('synthetic-personal@example.test')
    expect(container.textContent).toContain('Synthetic test fixture')
    expect(container.querySelectorAll('button, form, input, select, textarea, a')).toHaveLength(0)
  })
})
