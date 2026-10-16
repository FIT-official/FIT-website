import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GameShellStage from '../components/sims/GameShellStage'
import GameShellCanvas from '../components/sims/GameShellCanvas'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Visible experiment surface', () => {
  it('preserves the original player route and adapts to opened model notes without clipping', () => {
    let resize
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { resize = callback } observe() {} disconnect() { disconnect() } })
    const view = render(<GameShellStage activity={{ id: 'sampling', title: 'Signal Sampling Detective' }} />)
    const frame = screen.getByTitle('Signal Sampling Detective interactive experiment')
    expect(frame).toHaveAttribute('src', '/simulations/sampling?embed=1')
    const playerBody = document.createElement('body')
    Object.defineProperty(frame, 'contentDocument', { configurable: true, value: { body: playerBody } })
    const dimensions = vi.spyOn(playerBody, 'getBoundingClientRect').mockReturnValue({ height: 1100 })
    fireEvent.load(frame)
    expect(frame).toHaveStyle({ height: '1102px' })
    dimensions.mockReturnValue({ height: 600 })
    act(() => resize())
    expect(frame).toHaveStyle({ height: '602px' })
    view.unmount()
    expect(disconnect).toHaveBeenCalled()
  })
  it('supports the minimal class embed while retaining a descriptive frame title', () => {
    render(<GameShellStage activity={{ id: 'feedback', title: 'Feedback Control Lab' }} source="/embed/sims/feedback" title="Feedback Control Lab simulation" />)
    expect(screen.getByTitle('Feedback Control Lab simulation')).toHaveAttribute('src', '/embed/sims/feedback')
  })
  it('mounts its canvas only while the artwork itself is visible and skips particles with reduced motion', () => {
    let visibility
    vi.stubGlobal('IntersectionObserver', class { constructor(callback) { visibility = callback } observe() {} disconnect() {} })
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const animate = vi.fn()
    vi.stubGlobal('requestAnimationFrame', animate)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const context = Object.fromEntries(['clearRect', 'fillRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arcTo', 'closePath', 'fill', 'setTransform'].map(name => [name, vi.fn()]))
    context.createLinearGradient = () => ({ addColorStop: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const view = render(<GameShellCanvas accent="#5361d8" celebration={1} reducedMotion />)
    expect(view.container.querySelector('canvas')).toBeNull()
    act(() => visibility([{ isIntersecting: true }]))
    expect(view.container.querySelector('canvas')).not.toBeNull()
    expect(animate).not.toHaveBeenCalled()
    act(() => visibility([{ isIntersecting: false }]))
    expect(view.container.querySelector('canvas')).toBeNull()
  })
})
