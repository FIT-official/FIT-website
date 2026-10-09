// Behaviours carried over from the first request page: anonymous preview
// before any request exists, invalid replacements clearing the estimate, the
// retained upload on a failed save, and the creator (?creator=) flow. The CTA
// is now "Add to cart" (the page completes the request itself) and the print
// choices are Strength / Surface quality instead of a purpose preset.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const bigPrice = () => within(screen.getByRole('complementary', { name: 'Your price' })).findAllByText('$12.34')

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
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
    if (url === '/api/quote/config') return ok({ deliveryTypes: [{ type: 'pickup', displayName: 'Collect', price: 0, needsAddress: false }] })
    if (url === '/api/quote') return ok({ quote: { total: 12.34, currency: 'sgd' } })
    if (url === '/api/custom-print' && init.method === 'POST') return ok({ requestId: 'draft-1' })
    if (url === '/api/upload/models' && init.method === 'POST') return ok({ url: 'https://upload.example/model', key: 'models/user/part.stl' })
    if (url === '/api/custom-print' && init.method === 'PUT') {
      if (state.failSave) { state.failSave = false; return { ok: false, json: async () => ({ error: 'Could not save this time' }) } }
      return ok({ success: true })
    }
    if (url === '/api/custom-print/config') return ok({ success: true })
    if (url === '/api/cart/custom-print') return ok({ cart: [] })
    if (url.startsWith('/api/upload/models?') && init.method === 'DELETE') return ok({ success: true })
    if (url === '/api/models/import') return new Response(JSON.stringify({ status: 'upload_required',
      message: 'This site requires a login. Download the file and upload it below.' }), { status: 422, headers: { 'content-type': 'application/json' } })
    if (url.includes('/print-service')) return ok({ enabled: true, creator: { userId: 'creator-1', displayName: 'Print Studio' },
      service: { headline: 'Studio prints', acceptedFormats: ['stl'], materials: [{ name: 'PETG', pricePerGram: 0.5, colours: ['Blue'] }],
        minimumCharge: 5, maxBuildMm: { x: 200, y: 200, z: 200 }, leadTimeDays: 3 },
      // The farm's public pricing profile drives materials, colours and delivery.
      profile: { materials: [{ filament: 'petg', label: 'PETG', ratePerGram: 0.5, colours: [{ filament: 'petg', name: 'Blue', code: 'x', hex: '#0000ff' }] }],
        deliveryOptions: [{ type: 'pickup', displayName: 'Collect in Jurong', description: '', price: 0, needsAddress: false }],
        leadTimeDays: 3, machineLimits: { maxLengthCm: 20, maxWidthCm: 20, maxHeightCm: 20, maxWeightKg: null }, offers: { postProcessing: true, specialRequest: true, priority: false, expedite: false } } })
    if (url === '/api/custom-print/estimate') return ok({ estimate: { total: 12.34 }, estimateOnly: true })
    throw new Error('Unexpected request ' + url)
  })
})
afterEach(cleanup)

describe('preview before sign-in', () => {
  it('quotes an anonymous local model before creating or uploading any request', async () => {
    render(<PrintRequestFlow />); upload()
    expect(await screen.findByTestId('model-preview')).toHaveTextContent('part.stl')
    expect((await bigPrice()).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Sign in to add to cart' })).toBeEnabled()
    expect(requests('/api/custom-print', 'POST')).toHaveLength(0)
    expect(putWithProgress).not.toHaveBeenCalled()
    const quoteBody = JSON.parse(requests('/api/quote')[0][1].body)
    expect(quoteBody.requestId).toBeUndefined()
    expect(quoteBody.price).toBeUndefined()
    expect(quoteBody.settings).toMatchObject({ wallLoops: 2, infillPercent: 20 })
  })
  it('re-quotes with the actual Strong and High quality parameters', async () => {
    render(<PrintRequestFlow />); upload()
    await bigPrice()
    fireEvent.click(within(screen.getByRole('group', { name: 'Strength' })).getByRole('button', { name: 'Strong' }))
    await waitFor(() => expect(requests('/api/quote')).toHaveLength(2))
    expect(JSON.parse(requests('/api/quote')[1][1].body).settings).toMatchObject({ wallLoops: 4, infillPercent: 40 })
    fireEvent.click(within(screen.getByRole('group', { name: 'Surface quality' })).getByRole('button', { name: 'High' }))
    await waitFor(() => expect(requests('/api/quote')).toHaveLength(3))
    expect(JSON.parse(requests('/api/quote')[2][1].body).settings.layerHeightMm).toBe(0.12)
  })
  it('clears an earlier model and estimate when an invalid replacement is selected', async () => {
    state.user = { id: 'buyer' }
    render(<PrintRequestFlow />); upload()
    await bigPrice()
    upload(file('picture.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a STL, OBJ, 3MF file.')
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument()
    expect(screen.queryByTestId('model-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  })
  it('clears a previous model on an import fallback instead of leaving an old payable-looking price', async () => {
    render(<PrintRequestFlow />); upload()
    await bigPrice()
    fireEvent.change(screen.getByLabelText('Paste a design link'), { target: { value: 'https://makerworld.com/en/models/123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import design' }))
    await screen.findByText(/This site requires a login/)
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument()
    expect(screen.queryByTestId('model-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to add to cart' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'makerworld.com' })).toBeInTheDocument()
  })
  it('blocks another upload while a design import is still pending', async () => {
    global.fetch.mockImplementation(async url => url === '/api/quote/config' ? ok({ deliveryTypes: [{ type: 'pickup', displayName: 'Collect', price: 0, needsAddress: false }] }) : new Promise(() => {}))
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    await screen.findByRole('alert')
    expect(global.fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    expect(state.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/cart'))
    expect(requests('/api/custom-print', 'POST')).toHaveLength(1)
    expect(requests('/api/upload/models', 'POST')).toHaveLength(2)
    const saved = JSON.parse(requests('/api/custom-print', 'PUT').at(-1)[1].body)
    expect(saved.requestId).toBe('draft-1')
    expect(saved.modelFile).toMatchObject({ originalName: 'part.stl', s3Key: 'models/user/part.stl' })
    expect(saved.printConfiguration.printSettings).toMatchObject({ layerHeight: 0.2, wallLoops: 2 })
    expect(saved.printConfiguration.meshColors).toEqual({ Model: '#ffffff' })
    expect(saved).not.toHaveProperty('price')
    const config = JSON.parse(requests('/api/custom-print/config', 'PUT').at(-1)[1].body)
    expect(config).toMatchObject({ requestId: 'draft-1', mode: 'instant', meshColors: { Model: '#ffffff' } })
    expect(config.printSettings).toMatchObject({ layerHeight: 0.2, wallLoops: 2, filamentType: 'pla' })
  })
  // Updated for per-farm pricing: the creator flow now shows a live estimate
  // priced by the server with the farm's saved profile (/api/quote with
  // creatorUserId + preview, never a requestId, so nothing is persisted as a
  // quote), and saves that estimate on the request after sending it. It still
  // never saves config through the FIT quote path or touches the cart.
  it('saves creator preferences with a farm estimate, never a platform quote or payment', async () => {
    state.user = { id: 'buyer' }; state.creator = 'print-studio'
    render(<PrintRequestFlow />)
    await screen.findByRole('button', { name: 'Strong' })
    fireEvent.click(screen.getByRole('button', { name: 'Strong' })); upload()
    await screen.findByTestId('model-preview')
    const panel = screen.getByRole('complementary', { name: 'Your price' })
    expect(await within(panel).findAllByText('$12.34')).not.toHaveLength(0)
    expect(within(panel).getByText('Estimate')).toBeInTheDocument()
    expect(within(panel).getByText('Print Studio confirms the final price. Payment is arranged directly with the creator.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send request to Print Studio' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Send request to Print Studio' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/account/prints'))
    const saved = JSON.parse(requests('/api/custom-print', 'PUT')[0][1].body)
    expect(saved.printConfiguration.generic).toMatchObject({ strength: 'Strong', quality: 'Medium', material: 'PETG', filament: 'petg', colour: 'Blue' })
    expect(saved.printConfiguration.printSettings).toBeUndefined()
    const previews = requests('/api/quote').map(([, init]) => JSON.parse(init.body))
    expect(previews.length).toBeGreaterThan(0)
    for (const body of previews) {
      expect(body).toMatchObject({ creatorUserId: 'creator-1', preview: true, selection: { filament: 'petg', colour: 'Blue' } })
      expect(body.requestId).toBeUndefined()
    }
    expect(JSON.parse(requests('/api/custom-print/estimate', 'POST')[0][1].body)).toEqual({ requestId: 'draft-1',
      options: { postProcessing: false, specialRequest: false, priority: false, expedite: false }, deliveryType: 'pickup' })
    expect(requests('/api/custom-print/config')).toHaveLength(0)
    expect(requests('/api/cart/custom-print')).toHaveLength(0)
  })
})

describe('creator print farm mode', () => {
  const farmResponse = (profile) => ({ enabled: true, creator: { userId: 'creator-1', displayName: 'Print Studio' },
    service: { headline: 'Studio prints', acceptedFormats: ['stl'], materials: [], leadTimeDays: 4 }, profile })
  const profile = {
    materials: [
      { filament: 'pla', label: 'PLA', ratePerGram: 0.12, colours: [{ filament: 'pla', name: 'Black', code: '1', hex: '#000000' }, { filament: 'pla', name: 'Red', code: '2', hex: '#ff0000' }] },
      { filament: 'tpu', label: 'TPU', ratePerGram: 0.3, colours: [{ filament: 'tpu', name: 'White', code: '3', hex: '#ffffff' }] },
    ],
    deliveryOptions: [{ type: 'jurong', displayName: 'Collect in Jurong', description: 'Evenings', price: 0, needsAddress: false },
      { type: 'courier', displayName: 'Courier', description: '', price: 8, needsAddress: true }],
    leadTimeDays: 4, machineLimits: { maxLengthCm: 3, maxWidthCm: null, maxHeightCm: null, maxWeightKg: null },
    offers: { postProcessing: true, specialRequest: true, priority: true, expedite: false },
  }
  const withFarm = (farm) => {
    const base = global.fetch.getMockImplementation()
    global.fetch.mockImplementation(async (url, init) => url.includes('/print-service') ? ok(farmResponse(farm)) : base(url, init))
  }

  it('shows only the farm materials, colours, prices, delivery options and offered extras', async () => {
    withFarm({ ...profile, machineLimits: null })
    state.creator = 'print-studio'
    render(<PrintRequestFlow />)
    const materials = await screen.findByRole('group', { name: 'Material' })
    expect(within(materials).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['PLA', 'TPU'])
    expect(within(materials).getByText(/\$0\.12\/g/)).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Colour' })).getAllByRole('button')).toHaveLength(2)
    const delivery = screen.getByRole('radiogroup', { name: 'Delivery' })
    expect(within(delivery).getByText('Collect in Jurong · Free')).toBeInTheDocument()
    expect(within(delivery).getByText(/Courier · /)).toBeInTheDocument()
    expect(screen.getByLabelText('Priority')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rush, sooner')).toBeNull()
    fireEvent.click(within(delivery).getByRole('radio', { name: /Courier/ }))
    // No address form: the creator arranges delivery directly.
    expect(screen.queryByRole('textbox', { name: /Street address/ })).toBeNull()
    expect(screen.getByText('Print Studio arranges collection or courier with you directly once they confirm the price.')).toBeInTheDocument()
    fireEvent.click(within(materials).getByRole('button', { name: 'TPU' })); upload()
    await waitFor(() => expect(requests('/api/quote').length).toBeGreaterThan(0))
    expect(JSON.parse(requests('/api/quote').at(-1)[1].body)).toMatchObject({ creatorUserId: 'creator-1', preview: true, selection: { filament: 'tpu', colour: 'White' } })
    const panel = screen.getByRole('complementary', { name: 'Your price' })
    expect(await within(panel).findByText('Courier')).toBeInTheDocument()
    expect(within(panel).getByText('Printed by').nextSibling).toHaveTextContent('Print Studio')
  })

  it.each(['before', 'after'])('keeps an early courier choice when platform delivery loads %s the farm', async order => {
    const base = global.fetch.getMockImplementation()
    let releaseFarm, releaseConfig
    global.fetch.mockImplementation(async (url, init) => {
      if (url.includes('/print-service')) return new Promise(resolve => { releaseFarm = () => resolve(ok(farmResponse({ ...profile, machineLimits: null }))) })
      if (url === '/api/quote/config') return new Promise(resolve => { releaseConfig = () => resolve(ok({ deliveryTypes: [{ type: 'pickup', displayName: 'Collect', price: 0, needsAddress: false }] })) })
      return base(url, init)
    })
    state.creator = 'print-studio'
    // A native click as the options enter the DOM exercises the interval before
    // passive default-selection effects settle; fireEvent's act flush hides it.
    const observer = new MutationObserver(() => {
      const courier = document.querySelector('input[type="radio"][value="courier"]')
      if (!courier) return
      observer.disconnect()
      courier.click()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    try {
      render(<PrintRequestFlow />)
      if (order === 'before') await act(async () => releaseConfig())
      releaseFarm()
      const courier = await screen.findByRole('radio', { name: /Courier/ })
      if (order === 'after') await act(async () => releaseConfig())
      await waitFor(() => expect(courier).toBeChecked())
      fireEvent.click(within(screen.getByRole('group', { name: 'Material' })).getByRole('button', { name: 'TPU' })); upload()
      expect(await within(screen.getByRole('complementary', { name: 'Your price' })).findByText('Courier')).toBeInTheDocument()
      expect(courier).toBeChecked()
    } finally { observer.disconnect() }
  })

  it('blocks a model larger than the farm machine limits', async () => {
    withFarm(profile)
    state.user = { id: 'buyer' }; state.creator = 'print-studio'
    render(<PrintRequestFlow />)
    await screen.findByRole('group', { name: 'Material' }); upload()
    await screen.findByTestId('model-preview')
    const checklist = screen.getByRole('list', { name: 'Before you send your request' })
    await waitFor(() => expect(within(checklist).getByText('Model fits the printer').closest('li')).toHaveAttribute('data-ok', 'false'))
    expect(screen.getByRole('button', { name: 'Send request to Print Studio' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent("Print Studio's printer takes parts up to 30 mm long. Scale the model down or split it into parts.")
  })
})

describe('creator print farm: review materials and choices', () => {
  const farm = (profile, name = 'Print Studio', userId = 'creator-1') => ({ enabled: true, creator: { userId, displayName: name },
    service: { headline: 'Studio prints', acceptedFormats: ['stl'], materials: [], leadTimeDays: 4 },
    profile: { materials: [], reviewMaterials: [], deliveryOptions: [{ type: 'pickup', displayName: 'Collect', description: '', price: 0, needsAddress: false }],
      leadTimeDays: 4, machineLimits: null, offers: {}, minimumPrice: 0, ...profile } })
  const serve = (byCreator) => {
    const base = global.fetch.getMockImplementation()
    global.fetch.mockImplementation(async (url, init) => {
      const match = url.match(/\/api\/creators\/([^/]+)\/print-service/)
      return match ? ok(byCreator[decodeURIComponent(match[1])]) : base(url, init)
    })
  }
  const pla = { filament: 'pla', label: 'PLA', ratePerGram: 0.1, note: '', colours: [{ filament: 'pla', name: 'Black', code: '1', hex: '#000000' }] }
  const tpu = { filament: 'tpu', label: 'TPU', ratePerGram: 0.3, note: '', colours: [{ filament: 'tpu', name: 'White', code: '3', hex: '#ffffff' }] }

  it('lets a legacy farm with only uncatalogued materials take requests, priced on review', async () => {
    serve({ 'print-studio': farm({ reviewMaterials: [{ key: 'review-1', label: 'Nylon', note: 'Dried first', colours: [{ name: 'Black', hex: null }, { name: 'Natural', hex: null }] }] }) })
    state.user = { id: 'buyer' }; state.creator = 'print-studio'
    render(<PrintRequestFlow />)
    const materials = await screen.findByRole('group', { name: 'Material' })
    expect(within(materials).getByRole('button', { name: 'Nylon' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: 'Colour' })).getByRole('button', { name: 'Choose Black' })).toHaveTextContent('Black')
    upload()
    const panel = screen.getByRole('complementary', { name: 'Your price' })
    expect(await within(panel).findByText('Print Studio prices this on review.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send request to Print Studio' })).toBeEnabled())
    expect(requests('/api/quote')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Send request to Print Studio' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/account/prints'))
    const saved = JSON.parse(requests('/api/custom-print', 'PUT')[0][1].body)
    expect(saved.printConfiguration.generic).toMatchObject({ material: 'Nylon', colour: 'Black' })
    expect(saved.printConfiguration.generic).not.toHaveProperty('filament')
    expect(requests('/api/custom-print/estimate')).toHaveLength(0)
    expect(requests('/api/cart/custom-print')).toHaveLength(0)
  })

  it('keeps the chosen material when the next farm also offers it', async () => {
    serve({ 'studio-a': farm({ materials: [pla, tpu] }, 'Studio A', 'a'), 'studio-b': farm({ materials: [pla, tpu] }, 'Studio B', 'b'),
      'studio-c': farm({ materials: [pla] }, 'Studio C', 'c') })
    state.creator = 'studio-a'
    const view = render(<PrintRequestFlow />)
    const pressed = async () => within(await screen.findByRole('group', { name: 'Material' })).getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(await pressed()).toHaveAccessibleName('PLA')
    fireEvent.click(within(screen.getByRole('group', { name: 'Material' })).getByRole('button', { name: 'TPU' }))
    state.creator = 'studio-b'; view.rerender(<PrintRequestFlow />)
    await screen.findByText(/Studio B · 3D printing/)
    expect(await pressed()).toHaveAccessibleName('TPU')
    state.creator = 'studio-c'; view.rerender(<PrintRequestFlow />)
    await screen.findByText(/Studio C · 3D printing/)
    await waitFor(async () => expect(await pressed()).toHaveAccessibleName('PLA'))
  })
})
