import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const state = vi.hoisted(() => ({ user: null, store: {}, push: vi.fn(), creator: '', failSave: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }), useSearchParams: () => new URLSearchParams(state.creator ? { creator: state.creator } : {}) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => props => <div data-testid="model-preview">{props.fileName}</div> }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => children }))
vi.mock('@/utils/store', () => ({ default: { getState: () => state.store } }))
vi.mock('@/utils/uploadHelpers', () => ({ getMimeType: () => 'model/stl', putWithProgress: vi.fn() }))
import { putWithProgress } from '@/utils/uploadHelpers'
import PrintRequestFlow from '@/components/PrintRequestFlow'

const ok = data => ({ ok: true, json: async () => data })
function file(name = 'part.stl') {
  const model = new File(['printable geometry'], name, { type: 'model/stl' })
  Object.defineProperty(model, 'arrayBuffer', { value: async () => new ArrayBuffer(84) })
  return model
}
const upload = (model = file()) => fireEvent.change(screen.getByLabelText('Choose a 3D model file'), { target: { files: [model] } })
const requests = (url, method) => global.fetch.mock.calls.filter(([calledUrl, init]) => calledUrl === url && (!method || init?.method === method))

beforeEach(() => {
  vi.clearAllMocks()
  state.user = null; state.creator = ''; state.failSave = false
  state.store = {
    setFileName: vi.fn(), setBuffers: vi.fn(), scene: null, geometryMetrics: null,
    generateScene: vi.fn(async () => {
      state.store.scene = { traverse: fn => fn({ isMesh: true, name: 'Model' }) }
      state.store.geometryMetrics = { volumeCm3: 100, dimensionsCm: { length: 5, width: 5, height: 5 }, confidence: 'high' }
    }),
  }
  putWithProgress.mockResolvedValue(undefined)
  global.fetch = vi.fn(async (url, init) => {
    if (url === '/api/quote/config') return ok({})
    if (url === '/api/quote') return ok({ quote: { total: 12.34, currency: 'sgd' } })
    if (url === '/api/custom-print' && init.method === 'POST') return ok({ requestId: 'draft-1' })
    if (url === '/api/upload/models' && init.method === 'POST') return ok({ url: 'https://upload.example/model', key: 'models/user/part.stl' })
    if (url === '/api/custom-print' && init.method === 'PUT') {
      if (state.failSave) { state.failSave = false; return { ok: false, json: async () => ({ error: 'Could not save this time' }) } }
      return ok({ success: true })
    }
    if (url.startsWith('/api/upload/models?') && init.method === 'DELETE') return ok({ success: true })
    if (url === '/api/models/import') return new Response(JSON.stringify({ status: 'upload_required',
      message: 'This site requires a login. Download the file and upload it below.' }), { status: 422, headers: { 'content-type': 'application/json' } })
    if (url.includes('/print-service')) return ok({ enabled: true, creator: { userId: 'creator-1', displayName: 'Print Studio' },
      service: { acceptedFormats: ['stl'], materials: [{ name: 'PETG', pricePerGram: 0.5, colours: ['Blue'] }],
        minimumCharge: 5, maxBuildMm: { x: 200, y: 200, z: 200 }, leadTimeDays: 3 } })
    throw new Error('Unexpected request ' + url)
  })
})
afterEach(cleanup)

describe('preview before sign-in', () => {
  it('quotes an anonymous local model before creating or uploading any request', async () => {
    render(<PrintRequestFlow />); upload()
    expect(await screen.findByTestId('model-preview')).toHaveTextContent('part.stl')
    expect(await screen.findByText('$12.34')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled()
    expect(requests('/api/custom-print', 'POST')).toHaveLength(0)
    expect(putWithProgress).not.toHaveBeenCalled()
    const quoteBody = JSON.parse(requests('/api/quote')[0][1].body)
    expect(quoteBody.requestId).toBeUndefined()
    expect(quoteBody.price).toBeUndefined()
    expect(quoteBody.settings).toMatchObject({ wallLoops: 2, infillPercent: 20 })
  })
  it('re-quotes with actual Strong and Appearance parameters', async () => {
    render(<PrintRequestFlow />); upload()
    await screen.findByText('$12.34')
    fireEvent.click(screen.getByRole('button', { name: 'Strong' }))
    await waitFor(() => expect(requests('/api/quote')).toHaveLength(2))
    expect(JSON.parse(requests('/api/quote')[1][1].body).settings).toMatchObject({ wallLoops: 4, infillPercent: 40 })
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    await waitFor(() => expect(requests('/api/quote')).toHaveLength(3))
    expect(JSON.parse(requests('/api/quote')[2][1].body).settings.layerHeightMm).toBe(0.12)
  })
  it('clears an earlier model and estimate when an invalid replacement is selected', async () => {
    state.user = { id: 'buyer' }
    render(<PrintRequestFlow />); upload()
    await screen.findByText('$12.34')
    upload(file('picture.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a STL, OBJ, 3MF file.')
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument()
    expect(screen.queryByTestId('model-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to print settings' })).toBeDisabled()
  })
  it('clears a previous model on an import fallback instead of leaving an old payable-looking price', async () => {
    render(<PrintRequestFlow />); upload()
    await screen.findByText('$12.34')
    fireEvent.change(screen.getByLabelText('Paste a design link'), { target: { value: 'https://makerworld.com/en/models/123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import design' }))
    await screen.findByText(/This site requires a login/)
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument()
    expect(screen.queryByTestId('model-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'makerworld.com' })).toBeInTheDocument()
  })
  it('blocks another upload while a design import is still pending', async () => {
    global.fetch.mockImplementation(async url => url === '/api/quote/config' ? ok({}) : new Promise(() => {}))
    render(<PrintRequestFlow />)
    fireEvent.change(screen.getByLabelText('Paste a design link'), { target: { value: 'https://example.com/file.stl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import design' }))
    await waitFor(() => expect(screen.getByLabelText('Choose a 3D model file')).toBeDisabled())
  })
})

describe('saving the selected model', () => {
  it.each(['upload', 'save'])('retains potentially saved model bytes after %s failure and retries the same request', async phase => {
    state.user = { id: 'buyer' }
    if (phase === 'upload') putWithProgress.mockRejectedValueOnce(new Error('Upload interrupted'))
    else state.failSave = true
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    fireEvent.click(screen.getByRole('button', { name: 'Continue to print settings' }))
    await screen.findByRole('alert')
    expect(global.fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    expect(state.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to print settings' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/editor?requestId=draft-1'))
    expect(requests('/api/custom-print', 'POST')).toHaveLength(1)
    expect(requests('/api/upload/models', 'POST')).toHaveLength(2)
    const saved = JSON.parse(requests('/api/custom-print', 'PUT').at(-1)[1].body)
    expect(saved.requestId).toBe('draft-1')
    expect(saved.printConfiguration.printSettings).toMatchObject({ layerHeight: 0.2, wallLoops: 2 })
    expect(saved.printConfiguration.meshColors).toEqual({ Model: '#ffffff' })
    expect(saved).not.toHaveProperty('price')
  })
  it('saves creator preferences without presenting a platform instant quote or charging payment', async () => {
    state.user = { id: 'buyer' }; state.creator = 'print-studio'
    render(<PrintRequestFlow />)
    await screen.findByRole('button', { name: 'Strong' })
    fireEvent.click(screen.getByRole('button', { name: 'Strong' })); upload()
    await screen.findByTestId('model-preview')
    fireEvent.click(screen.getByRole('button', { name: 'Send to Print Studio' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/account/prints'))
    const saved = JSON.parse(requests('/api/custom-print', 'PUT')[0][1].body)
    expect(saved.printConfiguration.generic).toMatchObject({ strength: 'Strong', quality: 'Medium', material: 'PETG', colour: 'Blue' })
    expect(saved.printConfiguration.printSettings).toBeUndefined()
    expect(requests('/api/quote')).toHaveLength(0)
  })
})
