import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, user: { id: 'customer' } }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => auth, SignInButton: ({ children }) => children }))
import CommunityThread from '@/components/Community/CommunityThread'
const id = '56e1fe9c-33e5-4ae3-8e70-dbc6b0c97b34'
const initial = { entryId: id, kind: 'shop_review', displayName: 'Earlier customer', body: 'The service was disappointing.', rating: 1, completedRequestLinked: true, createdAt: '2026-10-01T00:00:00.000Z' }
let posts, entries, loseResponse, postponeReport, resolveReport
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  Object.assign(auth, { isLoaded: true, isSignedIn: true, user: { id: 'customer' } })
  sessionStorage.clear(); posts = []; entries = [initial]; loseResponse = false; postponeReport = false
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    if (url.includes('/report')) return postponeReport ? new Promise(resolve => { resolveReport = () => resolve(json({ reported: true })) }) : json({ reported: true })
    if (url.includes('/eligibility')) return json({ eligible: posts.length ? [] : [{ orderType: 'print_request', orderId: 'completed-request' }] })
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body); posts.push(payload)
      if (!entries.some(entry => entry.entryId === payload.clientRequestId)) entries.push({ entryId: payload.clientRequestId, kind: payload.kind, displayName: payload.displayName, body: payload.body, rating: payload.rating || null, completedRequestLinked: payload.kind === 'shop_review', replyTo: payload.parentId, createdAt: '2026-10-01T00:01:00.000Z' })
      if (loseResponse) { loseResponse = false; throw new TypeError('Fixture connection lost') }
      return json({ entry: entries.at(-1) })
    }
    return json({ entries: entries.filter(row => row.kind !== 'shop_reply'), replies: entries.filter(row => row.kind === 'shop_reply'), rating: { count: 1, average: 1 }, nextCursor: null })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function fillComment(user, body = 'A useful practical guide to the printer.') {
  await user.type(screen.getByLabelText('Public display name'), 'A reader')
  await user.type(screen.getByLabelText('Your comment'), body)
}
it('shows a low rating publicly to signed-out readers and asks for sign-in to post', async () => {
  auth.isSignedIn = false; auth.user = null
  render(<CommunityThread kind="shop_review" subject="service-shop" />)
  expect(await screen.findByText(initial.body)).toBeVisible()
  expect(screen.getByLabelText('1 out of 5')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Post publicly' })).not.toBeInTheDocument()
})
it('posts an eligible completed-request review immediately and preserves legitimate criticism', async () => {
  render(<CommunityThread kind="shop_review" subject="service-shop" />)
  const user = userEvent.setup()
  await screen.findByRole('form', { name: 'Write a shop review' })
  await user.type(screen.getByLabelText('Public display name'), 'A customer')
  await user.selectOptions(screen.getByLabelText('Completed request'), 'print_request:completed-request')
  await user.selectOptions(screen.getByLabelText('Your rating'), '1')
  await user.type(screen.getByLabelText('Your experience'), 'The finish was poor and delivery was late.')
  await user.click(screen.getByRole('button', { name: 'Post publicly' }))
  expect(await screen.findByText('Posted publicly.')).toBeVisible()
  expect(await screen.findByText('The finish was poor and delivery was late.')).toBeVisible()
  expect(posts[0]).toMatchObject({ kind: 'shop_review', rating: 1, subject: 'service-shop', orderType: 'print_request', orderId: 'completed-request' })
  expect(screen.queryByRole('button', { name: /hide|delete|remove/i })).not.toBeInTheDocument()
})
it('lets the service owner respond and report while offering no self-review or removal control', async () => {
  auth.user = { id: 'service-shop' }
  render(<CommunityThread kind="shop_review" subject="service-shop" />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Respond as the shop' }))
  await user.type(screen.getByLabelText('Public display name'), 'Shop representative')
  await user.type(screen.getByLabelText('Your experience'), 'Thank you for explaining what happened.')
  await user.click(screen.getByRole('button', { name: 'Post publicly' }))
  expect(await screen.findByText('Posted publicly.')).toBeVisible()
  expect(posts[0]).toMatchObject({ kind: 'shop_reply', parentId: id })
  expect(posts[0]).not.toHaveProperty('rating')
  expect(screen.queryByLabelText('Completed request')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /hide|delete|remove/i })).not.toBeInTheDocument()
})
it('rejects private contact information before a public post and focuses the error', async () => {
  render(<CommunityThread subject="first-print" />)
  const user = userEvent.setup(); await fillComment(user, 'Please email demo@example.invalid with details.')
  await user.click(screen.getByRole('button', { name: 'Post publicly' }))
  expect(await screen.findByRole('alert')).toHaveFocus()
  expect(posts).toHaveLength(0)
})
it('keeps an uncertain post immutable and retries with the same reference and details', async () => {
  loseResponse = true
  render(<CommunityThread subject="first-print" />)
  const user = userEvent.setup(); await fillComment(user)
  await user.click(screen.getByRole('button', { name: 'Post publicly' }))
  expect(await screen.findByRole('button', { name: 'Retry same post' })).toBeEnabled()
  expect(screen.getByLabelText('Your comment')).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Retry same post' }))
  expect(await screen.findByText('Posted publicly.')).toBeVisible()
  expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0])
  expect(sessionStorage.length).toBe(0)
})
it('clears private report drafts on account change and ignores the old account response', async () => {
  postponeReport = true
  const view = render(<CommunityThread subject="first-print" />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Report to FIT' }))
  await user.selectOptions(screen.getByLabelText('Reason'), 'privacy')
  await user.type(screen.getByLabelText('Details (optional)'), 'A private report for FIT admins.')
  await user.click(screen.getByRole('button', { name: 'Send report' }))
  auth.user = { id: 'different-customer' }; view.rerender(<CommunityThread subject="first-print" />)
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Report content to FIT' })).not.toBeInTheDocument())
  await act(async () => resolveReport())
  expect(screen.queryByText(/Report sent to FIT/)).not.toBeInTheDocument()
})
it('isolates article drafts while preserving recovery for the original uncertain post', async () => {
  loseResponse = true
  const view = render(<CommunityThread subject="first-print" />)
  const user = userEvent.setup(); await fillComment(user)
  await user.click(screen.getByRole('button', { name: 'Post publicly' }))
  await screen.findByRole('button', { name: 'Retry same post' })
  view.rerender(<CommunityThread subject="another-article" />)
  await waitFor(() => expect(screen.getByLabelText('Your comment')).toHaveValue(''))
  expect(screen.queryByRole('button', { name: 'Retry same post' })).not.toBeInTheDocument()
  view.rerender(<CommunityThread subject="first-print" />)
  expect(await screen.findByRole('button', { name: 'Retry same post' })).toBeVisible()
  expect(screen.getByLabelText('Your comment')).toHaveValue(posts[0].body)
})
