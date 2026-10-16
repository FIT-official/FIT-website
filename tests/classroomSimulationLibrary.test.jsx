import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Library from '../components/ClassroomSimulations/Library'
import Activity from '../components/ClassroomSimulations/Activity'
import { getLiveSims } from '../lib/sims/registry'
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('@/components/sims/AddToClass', () => ({ default: ({ simId }) => <button type="button">Add {simId} to class</button> }))
vi.mock('@/components/sims/GameShell', () => ({ default: ({ activity }) => <div data-testid="game-shell">Game: {activity.title}</div> }))
afterEach(cleanup)

const activities = getLiveSims()

describe('Simulation discovery and classroom embeds', () => {
  it('lists all live routes and filters without losing reset recovery', () => {
    render(<Library />)
    expect(screen.getAllByRole('article')).toHaveLength(8)
    fireEvent.change(screen.getByLabelText('Search activities'), { target: { value: '  aliasing  ' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Launch Signal Sampling Detective' })).toHaveAttribute('href', '/classes/simulations/sampling')
    fireEvent.change(screen.getByLabelText('Learning level'), { target: { value: 'Poly' } })
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Show all activities' }))
    expect(screen.getAllByRole('article')).toHaveLength(8)
  })
  it('combines subject, level and topic with accessible pressed state', () => {
    render(<Library />)
    fireEvent.click(screen.getByRole('button', { name: 'Physics', exact: true }))
    expect(screen.getByRole('button', { name: 'Physics', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('article')).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Learning level'), { target: { value: 'Secondary' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Heat Path Designer' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'Probability and evidence' } })
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByRole('article')).toHaveLength(8)
  })
  it('keeps subject and level outside the decorative artwork, with class controls on every card', () => {
    render(<Library />)
    for (const article of screen.getAllByRole('article')) {
      const activity = activities.find(item => article.textContent.includes(item.title))
      const artwork = article.querySelector('a[aria-hidden="true"]')
      const subject = Array.from(article.querySelectorAll('span')).find(span => span.textContent === activity.subject)
      const level = Array.from(article.querySelectorAll('span')).find(span => span.textContent === (activity.levels?.join(' / ') || activity.level))
      expect(artwork).not.toContainElement(subject)
      expect(subject.closest('[aria-hidden="true"]')).toBeNull()
      expect(level.closest('[aria-hidden="true"]')).toBeNull()
      expect(screen.getByRole('button', { name: `Add ${activity.id} to class` })).toBeInTheDocument()
    }
    expect(screen.getByText('TRUE FLAGS')).toBeInTheDocument()
    expect(screen.getByText(/Syllabus references are awaiting curriculum review/)).toBeVisible()
  })
  it('mounts the shared shell and copies a minimal-player snippet with visible feedback', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
    render(<Activity activity={activities[0]} />)
    expect(screen.getByTestId('game-shell')).toHaveTextContent('Game: Signal Sampling Detective')
    expect(screen.getByRole('link', { name: /Open compact player/ })).toHaveAttribute('href', '/embed/sims/sampling')
    expect(screen.getByText(/external iframe hosting is not enabled/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy player snippet' }))
    expect(await screen.findByText('Player snippet copied.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copied ✓' })).toBeVisible()
    const snippet = screen.getByLabelText('Same-origin iframe HTML').value
    expect(snippet).toContain('title="FIT: Signal Sampling Detective"')
    expect(snippet).toContain('/embed/sims/sampling')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(snippet)
    expect(snippet).not.toContain('student')
  })
  it('provides manual copy fallback when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    render(<Activity activity={activities[1]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy player snippet' }))
    expect(await screen.findByText(/copy it manually/)).toBeVisible()
    expect(screen.getByLabelText('Same-origin iframe HTML')).toHaveAttribute('readonly')
  })
})
