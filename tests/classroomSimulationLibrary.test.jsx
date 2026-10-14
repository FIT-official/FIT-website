import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Library from '../components/ClassroomSimulations/Library'
import Activity from '../components/ClassroomSimulations/Activity'
import { activities } from '../public/simulations/catalog'
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
afterEach(cleanup)

describe('Simulation discovery and classroom embeds', () => {
  it('lists four valid activity routes and filters without losing reset recovery', () => {
    render(<Library />)
    expect(screen.getAllByRole('article')).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('Search activities'), { target: { value: '  aliasing  ' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Launch Signal Sampling Detective' })).toHaveAttribute('href', '/classes/simulations/sampling')
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'Advanced' } })
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Show all activities' }))
    expect(screen.getAllByRole('article')).toHaveLength(4)
  })
  it('combines subject and difficulty with accessible pressed state', () => {
    render(<Library />)
    fireEvent.click(screen.getByRole('button', { name: 'Physics', exact: true }))
    expect(screen.getByRole('button', { name: 'Physics', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('article')).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'Intermediate' } })
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
  it('has a titled local iframe and honest external-framing boundary', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
    render(<Activity activity={activities[0]} />)
    expect(screen.getByTitle('Interactive activity: Signal Sampling Detective')).toHaveAttribute('src', '/simulations/sampling?embed=1')
    expect(screen.getByText(/external iframe hosting awaits/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy FIT player snippet' }))
    expect(await screen.findByText('Same-origin player snippet copied.')).toBeVisible()
    const snippet = screen.getByLabelText('Same-origin iframe HTML').value
    expect(snippet).toContain('title="FIT: Signal Sampling Detective"')
    expect(snippet).toContain('/simulations/sampling?embed=1')
    expect(snippet).not.toContain('student')
  })
  it('provides manual copy fallback when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    render(<Activity activity={activities[1]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy FIT player snippet' }))
    expect(await screen.findByText(/copy it manually/)).toBeVisible()
  })
})
