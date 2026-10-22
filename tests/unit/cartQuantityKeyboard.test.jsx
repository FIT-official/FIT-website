import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CartQuantityEditor from '@/components/Cart/CartQuantityEditor'

afterEach(cleanup)
it('saves once on keyboard Enter, keeps focus behavior and prevents activation while pending', async () => {
  const user = userEvent.setup()
  let resolve
  const onSave = vi.fn(() => new Promise(done => { resolve = done }))
  render(<CartQuantityEditor quantity={1} disabled={false} onSave={onSave} />)
  const input = screen.getByRole('spinbutton', { name: 'Cart quantity' })
  await user.tab()
  expect(input).toHaveFocus()
  await user.clear(input)
  await user.type(input, '2{Enter}{Enter}')
  expect(onSave).toHaveBeenCalledExactlyOnceWith(2)
  expect(input).toBeDisabled()
  resolve()
  await waitFor(() => expect(input).toBeEnabled())
})
it('retains the draft after an interrupted save and permits an explicit keyboard retry', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn().mockRejectedValueOnce(Error('Connection interrupted')).mockResolvedValueOnce()
  render(<CartQuantityEditor quantity={1} disabled={false} onSave={onSave} />)
  const input = screen.getByRole('spinbutton', { name: 'Cart quantity' })
  await user.clear(input)
  await user.type(input, '3{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted')
  expect(input).toHaveValue(3)
  expect(onSave).toHaveBeenCalledTimes(1)
  await user.click(input)
  await user.keyboard('{Enter}')
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(onSave).toHaveBeenCalledTimes(2)
  expect(onSave).toHaveBeenLastCalledWith(3)
})
it.each(['0', '101', '1.5'])('rejects an invalid quantity %s without saving', async value => {
  const user = userEvent.setup(), onSave = vi.fn()
  render(<CartQuantityEditor quantity={1} disabled={false} onSave={onSave} />)
  const input = screen.getByRole('spinbutton', { name: 'Cart quantity' })
  await user.clear(input)
  await user.type(input, `${value}{Enter}`)
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose 1 to 100 whole units.')
  expect(onSave).not.toHaveBeenCalled()
})
