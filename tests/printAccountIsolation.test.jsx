// Account isolation for the public print request. Written FIRST against the original component to reproduce the review concern;
// it must also pass after the fix. Synthetic: Clerk and fetch are stubbed, nothing is uploaded or sent anywhere.
// What is protected: account A's enquiry text, model file, pending retry body and saved-reference screen must never be visible under
// account B or after sign-out, and a late upload/POST callback from A must neither change B's screen nor submit A's enquiry
// through B's session. What is preserved: an ANONYMOUS draft (and chosen file) carries over when the visitor signs in.
// What is NOT claimed: cancelling the screen does not undo a request the server already accepted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({ clerk: { isLoaded: true, user: null }, store: null }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => state.clerk, SignInButton: ({ children }) => <span>{children}</span> }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="viewer">3D viewer</div> }))
vi.mock('@/utils/store', () => {
  const store = { scene: null, geometryMetrics: null, fileName: '', buffers: null, setFileName: vi.fn(name => { store.fileName = name }), setBuffers: vi.fn(map => { store.buffers = map }), generateScene: vi.fn(async () => { store.scene = { fake: true }; store.geometryMetrics = null }) }
  state.store = store
  return { default: { getState: () => store } }
})
import GuidedPrintRequest from '@/components/PrintRequest/GuidedPrintRequest'

const ok = body => ({ ok: true, status: 200, json: async () => body })
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const asUser = id => { state.clerk = { isLoaded: true, user: id ? { id } : null } }
const ASCII_STL = 'solid cube\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid cube\n'
const LINK = 'https://makerworld.com/en/models/777-private-owl'
const guidedPosts = () => global.fetch.mock.calls.filter(([url, init]) => url === '/api/custom-print/guided' && init?.method === 'POST')
const uploads = () => global.fetch.mock.calls.filter(([url]) => url === '/api/fabrication/assets')
const storageText = () => JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])))
const purpose = () => screen.getByLabelText('Describe what you need')
const send = () => screen.getByRole('button', { name: /Send enquiry for a quote|Retry the same enquiry/ })
const fill = (text, link = LINK) => { fireEvent.change(purpose(), { target: { value: text } }); if (link) fireEvent.change(screen.getByLabelText(/Model reference link/), { target: { value: link } }) }
const base = (uploadsAvailable = true) => async (url, init) => url === '/api/custom-print/guided' ? (init?.method === 'POST' ? ok({ requestId: 'REQ-DEFAULT' }) : ok({ uploadsAvailable })) : url === '/api/fabrication/assets' ? ok({ assetId: 'asset-default' }) : ok({ colours: [] })
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); asUser(null); global.fetch = vi.fn(base()); state.store.scene = null; state.store.buffers = null })
afterEach(cleanup)

describe('private enquiry state never crosses accounts', () => {
  it('A types an enquiry, then B signs in: B sees an empty form and nothing of A is left in this tab', async () => {
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fill('A SECRET OWL FOR ALICE'); await waitFor(() => expect(storageText()).toContain('A SECRET OWL'))
    asUser('user_b'); view.rerender(<GuidedPrintRequest />)
    expect(purpose()).toHaveValue(''); expect(screen.getByLabelText(/Model reference link/)).toHaveValue(''); expect(screen.queryByTestId('link-card')).toBeNull()
    expect(document.body.textContent).not.toMatch(/SECRET OWL|private-owl/); expect(storageText()).not.toMatch(/SECRET OWL|private-owl/)
  })
  it('A signs out: the form is blank and A\'s draft is gone', async () => {
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fill('ALICE ONLY'); await waitFor(() => expect(storageText()).toContain('ALICE ONLY'))
    asUser(null); view.rerender(<GuidedPrintRequest />)
    expect(purpose()).toHaveValue(''); expect(document.body.textContent).not.toMatch(/ALICE ONLY/); expect(storageText()).not.toMatch(/ALICE ONLY/)
  })
  it('a chosen model file is dropped on an account switch', async () => {
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fireEvent.change(screen.getByLabelText('Attach a model (optional)'), { target: { files: [new File([ASCII_STL], 'alice-secret.stl')] } })
    expect(await screen.findByTestId('file-card')).toHaveTextContent('alice-secret.stl')
    asUser('user_b'); view.rerender(<GuidedPrintRequest />)
    expect(screen.queryByTestId('file-card')).toBeNull(); expect(document.body.textContent).not.toMatch(/alice-secret/)
  })
  it('a previewed model buffer is cleared from the shared viewer store when the account changes', async () => {
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fireEvent.change(screen.getByLabelText('Attach a model (optional)'), { target: { files: [new File([ASCII_STL], 'alice.stl')] } })
    fireEvent.click(await screen.findByRole('button', { name: /Preview in 3D/ })); await screen.findByTestId('viewer')
    expect(state.store.buffers?.size).toBe(1)
    asUser('user_b'); view.rerender(<GuidedPrintRequest />)
    expect(state.store.buffers?.size ?? 0).toBe(0); expect(screen.queryByTestId('viewer')).toBeNull()
  })
  it('the saved-reference screen is not shown to the next account', async () => {
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fill('Alice print'); fireEvent.click(send()); await screen.findByText('Your print enquiry is saved')
    asUser('user_b'); view.rerender(<GuidedPrintRequest />)
    expect(screen.queryByText('Your print enquiry is saved')).toBeNull(); expect(document.body.textContent).not.toMatch(/REQ-DEFAULT/); expect(purpose()).toHaveValue('')
  })
  it('a held/pending retry body is not offered to the next account', async () => {
    let first = true
    global.fetch = vi.fn(async (url, init) => { if (url === '/api/custom-print/guided' && init?.method === 'POST') { if (first) { first = false; throw new Error('network down') } return ok({ requestId: 'X' }) } return base()(url, init) })
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fill('Alice retry'); fireEvent.click(send()); await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Retry the same enquiry' })).toBeInTheDocument()
    asUser('user_b'); view.rerender(<GuidedPrintRequest />)
    expect(screen.queryByRole('button', { name: 'Retry the same enquiry' })).toBeNull(); expect(screen.queryByRole('alert')).toBeNull(); expect(purpose()).toBeEnabled(); expect(purpose()).toHaveValue('')
    expect(guidedPosts()).toHaveLength(1)
  })
})

describe('late callbacks from the previous account', () => {
  it('a late POST answer after A -> B changes nothing on B\'s screen', async () => {
    const post = deferred()
    global.fetch = vi.fn((url, init) => url === '/api/custom-print/guided' && init?.method === 'POST' ? post.promise : base()(url, init))
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fill('Alice in flight'); fireEvent.click(send()); await waitFor(() => expect(guidedPosts()).toHaveLength(1))
    asUser('user_b'); view.rerender(<GuidedPrintRequest />)
    fireEvent.change(purpose(), { target: { value: 'Bob typing' } })
    await act(async () => post.resolve(ok({ requestId: 'REQ-ALICE-1' })))
    expect(screen.queryByText('Your print enquiry is saved')).toBeNull(); expect(document.body.textContent).not.toMatch(/REQ-ALICE-1/)
    expect(purpose()).toHaveValue('Bob typing')
    expect(storageText()).not.toMatch(/Alice in flight/)
  })
  it('a late POST FAILURE for A is not shown to B, and a late success after sign-out does not appear', async () => {
    for (const outcome of ['fail', 'signout']) {
      cleanup(); sessionStorage.clear(); const post = deferred()
      global.fetch = vi.fn((url, init) => url === '/api/custom-print/guided' && init?.method === 'POST' ? post.promise : base()(url, init))
      asUser('user_a'); const view = render(<GuidedPrintRequest />)
      fill('Alice ' + outcome); fireEvent.click(send()); await waitFor(() => expect(guidedPosts()).toHaveLength(1))
      asUser(outcome === 'fail' ? 'user_b' : null); view.rerender(<GuidedPrintRequest />)
      await act(async () => { if (outcome === 'fail') post.resolve({ ok: false, status: 500, json: async () => ({ error: 'ALICE-SPECIFIC FAILURE' }) }); else post.resolve(ok({ requestId: 'REQ-SO' })) })
      expect(document.body.textContent).not.toMatch(/ALICE-SPECIFIC FAILURE|REQ-SO|Your print enquiry is saved/); expect(screen.queryByRole('alert')).toBeNull()
    }
  })
  it('a late UPLOAD completion for A never submits A\'s enquiry through B\'s session', async () => {
    const upload = deferred()
    global.fetch = vi.fn((url, init) => url === '/api/fabrication/assets' ? upload.promise : base()(url, init))
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    await waitFor(() => expect(screen.queryByText(/Checking private uploads/)).toBeNull())
    fireEvent.change(screen.getByLabelText('Attach a model (optional)'), { target: { files: [new File([ASCII_STL], 'alice.stl')] } }); await screen.findByTestId('file-card')
    fireEvent.change(purpose(), { target: { value: 'Alice upload' } }); fireEvent.click(send()); await waitFor(() => expect(uploads()).toHaveLength(1))
    asUser('user_b'); view.rerender(<GuidedPrintRequest />)
    await act(async () => upload.resolve(ok({ assetId: 'ALICE-ASSET' })))
    await act(async () => {})
    expect(guidedPosts()).toHaveLength(0)                                                             // nothing was posted with B's cookie
    expect(document.body.textContent).not.toMatch(/ALICE-ASSET|Alice upload/)
  })
  it('after unmount nothing is written to storage by a late callback', async () => {
    const post = deferred()
    global.fetch = vi.fn((url, init) => url === '/api/custom-print/guided' && init?.method === 'POST' ? post.promise : base()(url, init))
    asUser('user_a'); const view = render(<GuidedPrintRequest />)
    fill('Alice leaves'); fireEvent.click(send()); await waitFor(() => expect(guidedPosts()).toHaveLength(1))
    view.unmount(); sessionStorage.clear()
    await act(async () => post.resolve(ok({ requestId: 'REQ-LATE' })))
    expect(storageText()).not.toMatch(/Alice leaves/)
  })
})

describe('what is deliberately preserved', () => {
  it('an anonymous draft, including the chosen file, carries over when the visitor signs in', async () => {
    const view = render(<GuidedPrintRequest />)
    fill('My own anonymous draft')
    fireEvent.change(screen.getByLabelText('Attach a model (optional)'), { target: { files: [new File([ASCII_STL], 'mine.stl')] } }); await screen.findByTestId('file-card')
    asUser('user_a'); view.rerender(<GuidedPrintRequest />)
    expect(purpose()).toHaveValue('My own anonymous draft'); expect(screen.getByLabelText(/Model reference link/)).toHaveValue(LINK)
    expect(screen.getByTestId('file-card')).toHaveTextContent('mine.stl')
    expect(screen.getByRole('button', { name: 'Send enquiry for a quote' })).toBeEnabled()
  })
  it('a draft kept in this tab for sign-in is restored after a reload, for the account that signs in', async () => {
    const view = render(<GuidedPrintRequest />); fill('Draft across reload'); await waitFor(() => expect(storageText()).toContain('Draft across reload')); view.unmount()
    asUser('user_a'); render(<GuidedPrintRequest />)
    await waitFor(() => expect(purpose()).toHaveValue('Draft across reload'))
  })
  it('the same account keeps its own draft after a reload, and a different account does not get it', async () => {
    asUser('user_a'); let view = render(<GuidedPrintRequest />); fill('Alice reload draft'); await waitFor(() => expect(storageText()).toContain('Alice reload draft')); view.unmount()
    asUser('user_a'); view = render(<GuidedPrintRequest />); await waitFor(() => expect(purpose()).toHaveValue('Alice reload draft')); view.unmount()
    asUser('user_b'); render(<GuidedPrintRequest />); await act(async () => {})
    expect(purpose()).toHaveValue(''); expect(document.body.textContent).not.toMatch(/Alice reload draft/)
  })
  it('nothing is rendered or restored until Clerk has loaded the account', async () => {
    sessionStorage.setItem('fit.guided-print.v1', JSON.stringify({ owner: 'user_a', brief: { purpose: 'Alice owned' }, clientRequestId: null, pending: null }))
    state.clerk = { isLoaded: false, user: undefined }
    const view = render(<GuidedPrintRequest />)
    expect(screen.queryByLabelText('Describe what you need')).toBeNull(); expect(document.body.textContent).not.toMatch(/Alice owned/)
    asUser('user_b'); view.rerender(<GuidedPrintRequest />); await act(async () => {})
    expect(purpose()).toHaveValue('')
  })
  it('the same account on a sign-in refresh (same id) keeps typing intact', async () => {
    asUser('user_a'); const view = render(<GuidedPrintRequest />); fill('Stays put')
    asUser('user_a'); view.rerender(<GuidedPrintRequest />)
    expect(purpose()).toHaveValue('Stays put')
  })
})
