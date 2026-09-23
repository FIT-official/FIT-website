import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PersonalizationEditor from '@/components/Fabrication/PersonalizationEditor'

const suggestRegionFromImage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/fabrication/imagePreview', async importOriginal => ({ ...(await importOriginal()), suggestRegionFromImage }))
const initial = { text: 'Avery', region: { x: 0.2, y: 0.35, width: 0.6, height: 0.3 }, fontFamily: 'sans', textColor: '#123456' }

function Controlled(props) {
  const [value, setValue] = useState(props.initial || initial)
  return <PersonalizationEditor imageUrl="blob:controlled-image" {...props} value={value} onChange={next => { props.onChange?.(next); setValue(next) }} />
}
function imageLoaded(width = 1000, height = 500) {
  const element = screen.getByAltText('Item to personalize')
  Object.defineProperties(element, { naturalWidth: { value: width, configurable: true }, naturalHeight: { value: height, configurable: true } })
  fireEvent.load(element)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ font: '', measureText: text => ({ width: text.length * 20 }) })
  // jsdom does not currently supply browser pointer coordinates by default.
  vi.stubGlobal('PointerEvent', MouseEvent)
  suggestRegionFromImage.mockReturnValue({ region: { x: 0.3, y: 0.3, width: 0.4, height: 0.2 }, confidence: 0.8 })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('PersonalizationEditor', () => {
  it('shows empty, loading and failed-image states without enabling placement', () => {
    const view = render(<PersonalizationEditor value={initial} />)
    expect(screen.getByText('Add an image to place your text.')).toBeInTheDocument()
    view.rerender(<PersonalizationEditor imageUrl="blob:missing" value={initial} />)
    expect(screen.getByText('Loading image…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suggest text area' })).toBeDisabled()
    fireEvent.error(screen.getByAltText('Item to personalize'))
    fireEvent.error(screen.getByAltText('Item to personalize'))
    expect(screen.getByRole('alert')).toHaveTextContent('could not be displayed')
  })

  it('uses image aspect ratio and percentage controls with a live text overlay', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    imageLoaded()
    expect(screen.getByRole('group', { name: 'Image personalization preview' }).style.aspectRatio).toBe('1000 / 500')
    fireEvent.change(screen.getByLabelText('Left (%)'), { target: { value: '90' } })
    expect(onChange.mock.lastCall[0].region.x).toBe(0.9)
    expect(onChange.mock.lastCall[0].region.width).toBeCloseTo(0.1)
    fireEvent.change(screen.getByLabelText('Personalization text'), { target: { value: 'Morgan' } })
    expect(screen.getByRole('img', { name: 'Text preview: Morgan' })).toBeInTheDocument()
    expect(onChange.mock.lastCall[0].fontFamily).toBe('sans')
  })

  it('normalizes pointer coordinates against the rendered image and clamps a drag beyond the edge', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    imageLoaded()
    const stage = screen.getByRole('group', { name: 'Image personalization preview' })
    stage.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200 })
    fireEvent.pointerDown(stage, { clientX: 180, clientY: 90, button: 0 })
    fireEvent.pointerMove(stage, { clientX: 600, clientY: 190 })
    fireEvent.pointerUp(stage, { clientX: 600, clientY: 190 })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.lastCall[0].region).toEqual({ x: 0.2, y: 0.2, width: 0.8, height: expect.closeTo(0.5) })
  })

  it('does not commit cancelled touch gestures or allow fixed-area dragging', () => {
    const onChange = vi.fn()
    const view = render(<Controlled onChange={onChange} />)
    imageLoaded()
    const stage = screen.getByRole('group', { name: 'Image personalization preview' })
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200 })
    fireEvent.pointerDown(stage, { clientX: 20, clientY: 20, button: 0 })
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 150 })
    fireEvent.pointerCancel(stage, { clientX: 300, clientY: 150 })
    expect(onChange).not.toHaveBeenCalled()
    view.rerender(<Controlled onChange={onChange} allowRegionEdit={false} />)
    fireEvent.pointerDown(stage, { clientX: 20, clientY: 20, button: 0 })
    fireEvent.pointerUp(stage, { clientX: 300, clientY: 150 })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Left (%)')).not.toBeInTheDocument()
  })

  it('preserves saved regions until a user requests a suggestion and labels the result cautiously', async () => {
    render(<Controlled />)
    imageLoaded()
    expect(suggestRegionFromImage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest text area' }))
    expect(await screen.findByText('Suggested text area—check placement')).toBeInTheDocument()
    expect(screen.getByLabelText('Left (%)')).toHaveValue(30)
  })

  it('automatically suggests only for a new image without a saved region', async () => {
    render(<Controlled initial={{ ...initial, region: null }} />)
    imageLoaded()
    await waitFor(() => expect(suggestRegionFromImage).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('Width (%)')).toHaveValue(40)
  })

  it('retains manual placement when pixels cannot be read', async () => {
    suggestRegionFromImage.mockImplementation(() => { throw new Error('Tainted canvas') })
    render(<Controlled />)
    imageLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest text area' }))
    expect(await screen.findByText(/Automatic placement is unavailable/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Top (%)'), { target: { value: '20' } })
    expect(screen.getByLabelText('Top (%)')).toHaveValue(20)
  })

  it('does not replace a provider region that arrives while automatic placement is pending', async () => {
    const onChange = vi.fn()
    const view = render(<PersonalizationEditor imageUrl="blob:tag" value={{ ...initial, region: null }} onChange={onChange} />)
    imageLoaded()
    view.rerender(<PersonalizationEditor imageUrl="blob:tag" value={initial} onChange={onChange} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })
    expect(onChange).not.toHaveBeenCalled()
    expect(suggestRegionFromImage).not.toHaveBeenCalled()
  })

  it('cancels deferred analysis on unmount and leaves read-only controls inert', async () => {
    const onChange = vi.fn()
    const view = render(<Controlled onChange={onChange} />)
    imageLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest text area' }))
    view.unmount()
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(onChange).not.toHaveBeenCalled()
    render(<Controlled onChange={onChange} readOnly />)
    imageLoaded()
    expect(screen.getByLabelText('Font')).toBeDisabled()
    expect(screen.getByLabelText('Personalization text')).toHaveAttribute('readonly')
    fireEvent.change(screen.getByLabelText('Personalization text'), { target: { value: 'Changed' } })
    expect(onChange).not.toHaveBeenCalled()
  })
})
