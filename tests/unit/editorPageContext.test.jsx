import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
const state = vi.hoisted(() => ({ store: {}, user: { id: 'buyer' }, params: null }))
vi.mock('next/navigation', () => ({ useSearchParams: () => state.params }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="editor-result" /> }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => children }))
vi.mock('@/utils/store', () => {
  const hook = selector => selector(state.store)
  hook.getState = () => state.store
  hook.setState = update => { Object.assign(state.store, update) }
  return { default: hook }
})
vi.mock('@/components/Editor/fileDrop', () => ({ default: () => <div>Choose file</div> }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
import Editor from '@/app/editor/page'

beforeEach(() => {
  state.user = { id: 'buyer' }
  state.params = new URLSearchParams({ productId: 'product-1', returnTo: '/cart' })
  state.store = {
    buffers: null, productPrintConfig: null,
    setReturnTo: value => { state.store.returnTo = value },
    setFileName: value => { state.store.fileName = value },
    setBuffers: value => { state.store.buffers = value },
  }
  global.fetch = vi.fn(async url => url.startsWith('/api/product/') ? { ok: true, json: async () => ({
    productType: 'print', printConfig: { wallLoops: 4 }, viewableModel: 'products/model.stl',
    variantTypes: [{ name: 'Colour', options: [{ name: 'Blue' }] }],
  }) } : { ok: true, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(84) })
})
afterEach(cleanup)

describe('editor page model context', () => {
  it('keeps vendor fixed settings when only the return destination changes', async () => {
    const { rerender } = render(<Editor />)
    await screen.findByTestId('editor-result')
    expect(state.store.productPrintConfig).toEqual({ wallLoops: 4 })
    state.params = new URLSearchParams({ productId: 'product-1', returnTo: '/account' })
    rerender(<Editor />)
    await waitFor(() => expect(state.store.returnTo).toBe('/account'))
    expect(state.store.productPrintConfig).toEqual({ wallLoops: 4 })
    expect(state.store.productColours).toEqual([{ name: 'Blue', hex: undefined }])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
  it('does not download a saved request before authentication', async () => {
    state.user = null
    state.params = new URLSearchParams({ requestId: 'saved-request' })
    render(<Editor />)
    expect(await screen.findByText('Sign in to open your saved print request.')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
