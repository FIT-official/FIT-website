import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MakerPlayground from '@/components/MakerPlayground/MakerPlayground'
import { starterSketch } from '@/lib/makerPlayground/starters'
import { saveDraft } from '@/lib/makerPlayground/storage'
beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const edit = source => fireEvent.change(screen.getByLabelText('Sketch source'), { target: { value: source } })
it('restores saved draft after remount and keeps other lesson slots separate', () => {
  const first = render(<MakerPlayground />)
  edit('my exact draft'); fireEvent.click(screen.getByRole('button', { name: 'Save on this device' }))
  first.unmount(); render(<MakerPlayground />)
  expect(screen.getByLabelText('Sketch source')).toHaveValue('my exact draft')
  fireEvent.change(screen.getByLabelText('Board profile'), { target: { value: 'esp32' } })
  expect(screen.getByLabelText('Sketch source')).toHaveValue(starterSketch('esp32', 'blink'))
})
it('cancels destructive switches and resets', () => {
  render(<MakerPlayground />); edit('unsaved draft'); window.confirm.mockReturnValue(false)
  fireEvent.change(screen.getByLabelText('Starter lesson'), { target: { value: 'button' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset lesson' }))
  expect(screen.getByLabelText('Starter lesson')).toHaveValue('blink')
  expect(screen.getByLabelText('Sketch source')).toHaveValue('unsaved draft')
})
it('reset deletes only the selected saved draft', () => {
  saveDraft(localStorage, 'uno', 'button', 'other lesson')
  render(<MakerPlayground />); edit('changed'); fireEvent.click(screen.getByRole('button', { name: 'Save on this device' })); fireEvent.click(screen.getByRole('button', { name: 'Reset lesson' }))
  expect(screen.getByLabelText('Sketch source')).toHaveValue(starterSketch('uno', 'blink'))
  expect(localStorage.getItem('fit.makerPlayground.v1.uno.blink')).toBeNull()
  expect(localStorage.getItem('fit.makerPlayground.v1.uno.button')).toContain('other lesson')
})
it('preserves edits when local save fails and offers export', () => {
  render(<MakerPlayground />); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
  edit('keep my work'); fireEvent.click(screen.getByRole('button', { name: 'Save on this device' }))
  expect(screen.getByRole('status')).toHaveTextContent('Could not save')
  expect(screen.getByLabelText('Sketch source')).toHaveValue('keep my work')
})
it('invalidates an old trace on source or input changes', () => {
  render(<MakerPlayground />); fireEvent.click(screen.getByRole('button', { name: 'Preview sketch logic' }))
  expect(screen.getByText(/Trace ready/)).toBeInTheDocument()
  edit('bad code'); expect(screen.queryByText(/Trace ready/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Preview sketch logic' }))
  expect(screen.getByRole('alert')).toHaveTextContent('No partial result')
  fireEvent.click(screen.getByRole('button', { name: 'Go to error line' }))
  expect(screen.getByLabelText('Sketch source')).toHaveFocus()
})
it('steps actual output and Serial text, rendering hostile strings as text only', () => {
  render(<MakerPlayground />)
  edit('void setup() { Serial.begin(1); } void loop() { Serial.println("<img src=x onerror=alert(1)>"); }')
  fireEvent.click(screen.getByRole('button', { name: 'Preview sketch logic' })); fireEvent.click(screen.getByRole('button', { name: 'Show final event' }))
  expect(screen.getByLabelText('Serial text')).toHaveTextContent('<img src=x onerror=alert(1)>')
  expect(document.querySelector('img')).toBeNull()
  expect(within(screen.getByRole('main')).queryByRole('button', { name: /compile/i })).toBeNull()
})
it('renders blocked storage without preventing local editing', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('denied') })
  render(<MakerPlayground />)
  expect(screen.getByRole('status')).toHaveTextContent('could not be read')
  expect(screen.getByLabelText('Sketch source')).not.toBeDisabled()
})
it('excludes typed code and trace output from default autocapture and session recording', () => {
  render(<MakerPlayground />)
  expect(screen.getByRole('main')).toHaveClass('ph-no-capture', 'rr-block')
})
