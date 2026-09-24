// The request page completes a Fix It Today print request on its own: the
// checklist gates "Add to cart" (model, fits, material, collection/address),
// courier shows the saved address card or the inline form, the price panel
// lists the server quote lines plus the chosen delivery fee, and adding to
// cart saves the config, persists the quote and adds the cart line in order.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
const state = vi.hoisted(() => ({ user: null, store: {}, push: vi.fn(), params: {}, savedAddress: null, request: null, limits: null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }), useSearchParams: () => new URLSearchParams(state.params) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => props => <div data-testid="model-preview">{props.fileName}</div> }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: true }), SignInButton: ({ children }) => <span data-testid="sign-in">{children}</span> }))
vi.mock('@/utils/store', () => ({ default: { getState: () => state.store } }))
vi.mock('@/utils/uploadHelpers', () => ({ getMimeType: () => 'model/stl', putWithProgress: vi.fn(async () => {}) }))
import PrintRequestFlow from '@/components/PrintRequestFlow'

const ok = data => ({ ok: true, json: async () => data })
const COLOURS = [
  { filament: 'pla', name: 'Jade White', code: '10100', hex: '#ffffff', stockStatus: 'in_stock' },
  { filament: 'pla', name: 'Black', code: '10101', hex: '#000000', stockStatus: 'out_of_stock' },
  { filament: 'petg', name: 'White', code: '30106', hex: '#f7f7f4', stockStatus: 'in_stock' },
]
const DELIVERY = [
  { type: 'pickup', displayName: 'Collect at Sunview', description: 'Weekdays', price: 0, needsAddress: false },
  { type: 'courier', displayName: 'Courier (Singapore)', description: '1 to 2 working days', price: 6, needsAddress: true },
]
const QUOTE = { total: 20, currency: 'sgd', confidence: 'high', minimumApplied: false, expedite: { applied: false, amount: 0 },
  inputs: { weightGrams: 42.4, printHours: 2.25, volumeCm3: 100 },
  lines: [{ key: 'material', amount: 4.24 }, { key: 'printTime', amount: 13.76 }, { key: 'baseFee', amount: 2 }, { key: 'postProcessing', amount: 0 }, { key: 'delivery', amount: 0 }] }
const ADDRESS = { street: '1 Sunview Road', unitNumber: '#02-20', city: 'Singapore', state: 'SG', postalCode: '627615', country: 'Singapore' }

function file(name = 'bracket.stl') {
  const model = new File(['printable geometry'], name, { type: 'model/stl' })
  Object.defineProperty(model, 'arrayBuffer', { value: async () => new ArrayBuffer(84) })
  return model
}
const upload = () => fireEvent.change(screen.getByLabelText('Choose a 3D model file'), { target: { files: [file()] } })
// Exact URL match; a prefix ending in "?" or "=" matches any query string. GET has no init.
const calls = (url, method) => global.fetch.mock.calls.filter(([calledUrl, init]) =>
  (/[?=]$/.test(url) ? String(calledUrl).startsWith(url) : calledUrl === url) && (!method || (init?.method || 'GET') === method))
const panel = () => screen.getByRole('complementary', { name: 'Your price' })
const checklist = () => within(panel()).getAllByRole('listitem').filter(item => item.hasAttribute('data-ok')).map(item => [item.textContent.replace(/^[●○]\s*/, '').trim(), item.dataset.ok === 'true'])
const chooseCourier = () => fireEvent.click(screen.getByRole('radio', { name: /Courier/ }))
const fillAddress = () => {
  for (const [label, value] of [['Street address', ADDRESS.street], ['City', ADDRESS.city], ['State / Province', ADDRESS.state], ['Postal code', ADDRESS.postalCode], ['Country', ADDRESS.country]]) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.user = null; state.params = {}; state.savedAddress = null; state.request = null; state.limits = null
  state.store = {
    setFileName: vi.fn(), setBuffers: vi.fn(), scene: null, geometryMetrics: null,
    generateScene: vi.fn(async () => {
      state.store.scene = { traverse: fn => fn({ isMesh: true, name: 'Body' }) }
      state.store.geometryMetrics = { volumeCm3: 100, dimensionsCm: { length: 8, width: 4.2, height: 1.8 }, confidence: 'high' }
    }),
  }
  global.fetch = vi.fn(async (url, init) => {
    const method = init?.method || 'GET'
    if (url === '/api/quote/config') return ok({ printColours: [], deliveryTypes: DELIVERY, machineLimits: state.limits })
    if (url === '/api/filament-availability') return ok({ colours: COLOURS, stockChecked: true })
    if (url === '/api/quote') return ok({ quote: QUOTE, estimateOnly: !JSON.parse(init.body).requestId })
    if (url === '/api/user/contact/address' && method === 'GET') return ok({ address: state.savedAddress })
    if (url === '/api/user/contact/address' && method === 'POST') { state.savedAddress = JSON.parse(init.body).address; return ok({ success: true, address: state.savedAddress }) }
    if (url.startsWith('/api/custom-print?requestId=')) return state.request ? ok({ request: state.request }) : { ok: false, json: async () => ({ error: 'Request not found' }) }
    if (url === '/api/custom-print' && method === 'POST') return ok({ requestId: 'req-1' })
    if (url === '/api/custom-print' && method === 'PUT') return ok({ success: true })
    if (url === '/api/upload/models') return ok({ url: 'https://upload.example/model', key: 'models/buyer/bracket.stl' })
    if (url === '/api/custom-print/config') return ok({ success: true, request: {} })
    if (url === '/api/cart/custom-print') return ok({ cart: [] })
    if (url === '/api/user/cart/delivery') return ok({ success: true })
    if (url.startsWith('/api/proxy?key=')) return { ok: true, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(84) }
    throw new Error('Unexpected request ' + method + ' ' + url)
  })
})
afterEach(cleanup)

describe('checklist gating', () => {
  it('keeps Add to cart disabled until a model is uploaded, then enables it for collection', async () => {
    state.user = { id: 'buyer' }
    render(<PrintRequestFlow />)
    await screen.findByRole('radio', { name: /Collect at Sunview/ })
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
    expect(screen.getByText('Finish the steps above to continue.')).toBeInTheDocument()
    expect(checklist()).toEqual([['Upload a model', false], ['Model fits the printer', false], ['Material and colour chosen', true], ['Collection selected', true]])
    upload()
    await screen.findByTestId('model-preview')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled())
    expect(checklist().every(([, done]) => done)).toBe(true)
    expect(screen.getByText('You can still edit everything in the cart.')).toBeInTheDocument()
  })
  it('requires a complete address for courier delivery and accepts the inline form', async () => {
    state.user = { id: 'buyer' }
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await screen.findByRole('radio', { name: /Courier/ })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled())
    chooseCourier()
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
    expect(checklist().at(-1)).toEqual(['Delivery address complete', false])
    expect(screen.getByLabelText(/^Street address/)).toBeInTheDocument()
    fillAddress()
    expect(checklist().at(-1)).toEqual(['Delivery address complete', true])
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await screen.findByText('Deliver to')
    expect(JSON.parse(calls('/api/user/contact/address', 'POST')[0][1].body).address).toMatchObject({ street: ADDRESS.street, unitNumber: '', postalCode: ADDRESS.postalCode })
  })
  it('shows the saved address card for courier with a Change action', async () => {
    state.user = { id: 'buyer' }; state.savedAddress = ADDRESS
    render(<PrintRequestFlow />); upload()
    await screen.findByRole('radio', { name: /Courier/ })
    await waitFor(() => expect(calls('/api/user/contact/address', 'GET')).toHaveLength(1))
    chooseCourier()
    expect(await screen.findByText('Deliver to')).toBeInTheDocument()
    expect(screen.getByText(/1 Sunview Road #02-20/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Street address/)).toBeNull()
    await waitFor(() => expect(checklist().at(-1)).toEqual(['Delivery address complete', true]))
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText(/^Street address/)).toHaveValue(ADDRESS.street)
  })
  it('blocks a model the printer cannot fit', async () => {
    state.user = { id: 'buyer' }; state.limits = { maxLengthCm: 5, maxWidthCm: 5, maxHeightCm: 5, maxWeightKg: null }
    render(<PrintRequestFlow />)
    await screen.findByRole('radio', { name: /Collect/ })
    upload()
    await screen.findByTestId('model-preview')
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too large for this printer/)
    expect(checklist()[1]).toEqual(['Model fits the printer', false])
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  })
})

describe('price panel and materials', () => {
  it('lists the instant quote lines with the delivery fee and shows the printer', async () => {
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await screen.findByRole('radio', { name: /Courier/ })
    const lines = () => within(panel()).getAllByRole('listitem').filter(item => !item.hasAttribute('data-ok')).map(item => item.textContent)
    await waitFor(() => expect(lines()).toContain('PLA, 42 g$4.24'))
    expect(lines()).toEqual(['PLA, 42 g$4.24', 'Printing, 2.3 h$13.76', 'Setup$2.00', 'Collect at SunviewFree', 'Total$20.00'])
    expect(within(panel()).getByText('Fix It Today')).toBeInTheDocument()
    expect(within(panel()).getByText('Instant')).toBeInTheDocument()
    chooseCourier()
    await waitFor(() => expect(lines()).toEqual(['PLA, 42 g$4.24', 'Printing, 2.3 h$13.76', 'Setup$2.00', 'Courier (Singapore)$6.00', 'Total$26.00']))
  })
  it('offers material cards with PLA recommended, greys out-of-stock colours and re-quotes on a material change', async () => {
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await waitFor(() => expect(calls('/api/quote')).toHaveLength(1))
    const materials = screen.getByRole('group', { name: 'Material' })
    expect(within(materials).getByRole('button', { name: 'PLA' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(materials).getByText('Recommended')).toBeInTheDocument()
    expect(within(materials).getByText('Tougher, takes heat and outdoor use')).toBeInTheDocument()
    const black = screen.getByRole('button', { name: 'Choose Black · Out of stock' })
    expect(black.className).toMatch(/grayscale/)
    fireEvent.click(black)
    expect(await screen.findByText(/This colour is out of stock/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Rush/)).toBeDisabled()
    fireEvent.click(within(materials).getByRole('button', { name: 'PETG' }))
    await waitFor(() => expect(JSON.parse(calls('/api/quote').at(-1)[1].body).settings.materialType).toBe('petg'))
    expect(JSON.parse(calls('/api/quote').at(-1)[1].body).selection).toEqual({ filament: 'petg', colour: 'White' })
  })
  it('signed-out visitors get a price and a sign-in call to action, never a request', async () => {
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await screen.findByRole('radio', { name: /Courier/ })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in to add to cart' })).toBeEnabled())
    expect(screen.getByTestId('sign-in')).toBeInTheDocument()
    expect(screen.getByText('No account needed to get a price')).toBeInTheDocument()
    chooseCourier()
    expect(screen.getByLabelText(/^Street address/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save address' })).toBeNull()
    expect(screen.getByText('Saved to your account when you sign in.')).toBeInTheDocument()
    expect(calls('/api/custom-print')).toHaveLength(0)
    expect(calls('/api/user/contact/address')).toHaveLength(0)
  })
})

describe('adding to cart', () => {
  it('saves the config, persists the quote and adds the cart line in order, then goes to the cart', async () => {
    state.user = { id: 'buyer' }
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await screen.findByRole('radio', { name: /Courier/ })
    fireEvent.click(within(screen.getByRole('group', { name: 'Strength' })).getByRole('button', { name: 'Strong' }))
    fireEvent.click(screen.getByLabelText(/Sand and finish/))
    fireEvent.change(screen.getByLabelText(/What is it for/), { target: { value: 'Cooker knob' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/cart'))
    const order = global.fetch.mock.calls.map(([url, init]) => `${init?.method || 'GET'} ${url}`)
      .filter(entry => /custom-print|quote$|upload|cart/.test(entry))
    expect(order.slice(order.indexOf('POST /api/custom-print'))).toEqual([
      'POST /api/custom-print', 'POST /api/upload/models', 'PUT /api/custom-print',
      'PUT /api/custom-print/config', 'POST /api/quote', 'POST /api/cart/custom-print', 'PUT /api/user/cart/delivery',
    ])
    const draft = JSON.parse(calls('/api/custom-print', 'PUT')[0][1].body)
    expect(draft).toMatchObject({ requestId: 'req-1', customerNote: 'Cooker knob', modelFile: { s3Key: 'models/buyer/bracket.stl' } })
    const config = JSON.parse(calls('/api/custom-print/config')[0][1].body)
    expect(config).toMatchObject({ requestId: 'req-1', mode: 'instant', options: { postProcessing: true, expedite: false },
      generic: { strength: 'Strong', quality: 'Medium', filament: 'pla', colour: 'Jade White', material: 'plastic' } })
    expect(config.printSettings).toMatchObject({ wallLoops: 4, sparseInfillDensity: 40, filamentType: 'pla' })
    const quote = JSON.parse(calls('/api/quote').at(-1)[1].body)
    expect(quote).toMatchObject({ requestId: 'req-1', mode: 'instant', options: { postProcessing: true }, settings: { wallLoops: 4, infillPercent: 40 } })
    expect(quote.preview).toBeUndefined()
    expect(JSON.parse(calls('/api/cart/custom-print')[0][1].body)).toEqual({ requestId: 'req-1' })
    expect(JSON.parse(calls('/api/user/cart/delivery')[0][1].body)).toMatchObject({ productId: 'custom-print:req-1', chosenDeliveryType: 'pickup' })
  })
  it('skips the extra quote call when the config save already refreshed the quote', async () => {
    state.user = { id: 'buyer' }
    global.fetch.mockImplementation(async (url, init) => url === '/api/custom-print/config' ? ok({ success: true, quote: QUOTE, quoteRefreshed: true })
      : url === '/api/quote' ? ok({ quote: QUOTE }) : url === '/api/quote/config' ? ok({ deliveryTypes: DELIVERY }) : ok({ requestId: 'req-1', colours: COLOURS, cart: [], url: 'u', key: 'models/buyer/bracket.stl' }))
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/cart'))
    expect(calls('/api/quote').filter(([, init]) => JSON.parse(init.body).requestId)).toHaveLength(0)
  })
  it('surfaces a failed cart add without leaving the page', async () => {
    state.user = { id: 'buyer' }
    global.fetch.mockImplementation(async (url, init) => url === '/api/cart/custom-print' ? { ok: false, json: async () => ({ error: 'Request not found' }) }
      : url === '/api/quote' ? ok({ quote: QUOTE }) : url === '/api/quote/config' ? ok({ deliveryTypes: DELIVERY }) : ok({ requestId: 'req-1', colours: COLOURS, url: 'u', key: 'models/buyer/bracket.stl', success: true }))
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Request not found')
    expect(state.push).not.toHaveBeenCalled()
  })
})

describe('re-opening a request', () => {
  const saved = () => ({ requestId: 'req-9', status: 'quoted', customerNote: 'Fits the old hinge', quoteMode: 'instant',
    modelFile: { originalName: 'hinge.3mf', s3Key: 'models/buyer/hinge.3mf', fileSize: 84 },
    printConfiguration: { isConfigured: true, generic: { strength: 'Strong', quality: 'High', colour: 'White', material: 'plastic', filament: 'petg' },
      printSettings: { layerHeight: 0.12, initialLayerHeight: 0.12, wallLoops: 4, sparseInfillDensity: 40, materialType: 'plastic', filamentType: 'petg', enableSupport: true, supportType: 'Tree' },
      meshColors: { Body: '#f7f7f4' } },
    quote: { ...QUOTE, inputs: { ...QUOTE.inputs, options: { postProcessing: true, expedite: false } } } })
  it('restores the model, choices and note from ?requestId= and previews against the stored model', async () => {
    state.user = { id: 'buyer' }; state.params = { requestId: 'req-9' }; state.request = saved()
    render(<PrintRequestFlow />)
    expect(await screen.findByTestId('model-preview')).toHaveTextContent('hinge.3mf')
    expect(calls('/api/proxy?key=models%2Fbuyer%2Fhinge.3mf')).toHaveLength(1)
    expect(within(screen.getByRole('group', { name: 'Material' })).getByRole('button', { name: 'PETG' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Choose White' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: 'Strength' })).getByRole('button', { name: 'Strong' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: 'Surface quality' })).getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Supports')).toHaveValue('Tree')
    expect(screen.getByLabelText(/What is it for/)).toHaveValue('Fits the old hinge')
    expect(screen.getByLabelText(/Sand and finish/)).toBeChecked()
    await waitFor(() => expect(calls('/api/quote')).toHaveLength(1))
    expect(JSON.parse(calls('/api/quote')[0][1].body)).toMatchObject({ requestId: 'req-9', preview: true, settings: { materialType: 'petg', wallLoops: 4 } })
    expect(screen.queryByText('Change file')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/cart'))
    expect(calls('/api/custom-print', 'POST')).toHaveLength(0)
    expect(calls('/api/upload/models')).toHaveLength(0)
    const draft = JSON.parse(calls('/api/custom-print', 'PUT')[0][1].body)
    expect(draft).toEqual({ requestId: 'req-9', customerNote: 'Fits the old hinge' })
    expect(JSON.parse(calls('/api/custom-print/config')[0][1].body)).toMatchObject({ requestId: 'req-9', mode: 'instant' })
  })
  it('asks a signed-out visitor to sign in before opening a saved request', async () => {
    state.params = { requestId: 'req-9' }
    render(<PrintRequestFlow />)
    expect(screen.getByText('Your saved print request')).toBeInTheDocument()
    expect(screen.getByTestId('sign-in')).toBeInTheDocument()
    expect(calls('/api/custom-print?')).toHaveLength(0)
  })
  it('locks a request that is already paid', async () => {
    state.user = { id: 'buyer' }; state.params = { requestId: 'req-9' }; state.request = { ...saved(), status: 'paid', paidAt: '2026-09-20' }
    render(<PrintRequestFlow />)
    expect(await screen.findByText(/already in payment or fulfilment/)).toBeInTheDocument()
    await screen.findByTestId('model-preview')
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  })
  it('opens the 3D editor with a return path back to this request', async () => {
    state.user = { id: 'buyer' }
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open 3D editor for per-part colours →' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Open 3D editor for per-part colours →' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/editor?requestId=req-1&returnTo=%2Fprints%2Frequest%3FrequestId%3Dreq-1'))
    expect(calls('/api/custom-print/config')).toHaveLength(0)
  })
  it('sends a manual quote request through config mode manual', async () => {
    state.user = { id: 'buyer' }
    render(<PrintRequestFlow />); upload()
    await screen.findByTestId('model-preview')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask for a manual quote instead' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a manual quote instead' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/account/prints'))
    expect(JSON.parse(calls('/api/custom-print/config')[0][1].body)).toMatchObject({ requestId: 'req-1', mode: 'manual' })
    expect(calls('/api/cart/custom-print')).toHaveLength(0)
  })
})
