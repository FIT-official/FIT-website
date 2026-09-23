import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const state = vi.hoisted(() => ({ store: {}, push: vi.fn(), toast: vi.fn(), request: null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/utils/store', () => ({ default: () => state.store }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: state.toast }) }))
vi.mock('@/components/Editor/viewer', () => ({ default: props => <div data-testid="viewer">{props.layerHeight}</div> }))
vi.mock('@/components/Editor/QuotePanel', () => ({ default: props => <><div data-testid="quote-settings">{JSON.stringify(props.settings)}</div><div data-testid="quote-options">{JSON.stringify(props.options)}</div></> }))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('file-saver', () => ({ default: vi.fn() }))
import Result from '@/components/Editor/result'
import { mapPurposeToConfiguration } from '@/lib/quoting/genericPresets'

beforeEach(() => {
  vi.clearAllMocks()
  state.store = { fileName: 'model.stl', scene: { traverse: fn => fn({ isMesh: true, name: 'Model' }) },
    buffers: new Map(), generateScene: vi.fn(), productId: 'product-1', variantId: 'request-1',
    geometryMetrics: { volumeCm3: 10, dimensionsCm: { length: 2, width: 2, height: 2 }, confidence: 'high' } }
  state.request = { status: 'configured', printConfiguration: mapPurposeToConfiguration({ purpose: 'Normal' }) }
  global.fetch = vi.fn(async (url) => ({ ok: true, json: async () =>
    url.startsWith('/api/custom-print?') ? { request: state.request } : url === '/api/quote/config' ? {} : { success: true } }))
})
afterEach(cleanup)

describe('simple and advanced editor settings', () => {
  it('does not show editable services or a different estimate for a product with fixed pricing', async () => {
    state.store.productPrintConfig = { wallLoops: 4 }
    state.store.productColours = [{ name: 'Blue', hex: '#2356c7' }]
    render(<Result />)
    expect(await screen.findByText(/maker’s saved print price/)).toBeInTheDocument()
    expect(screen.queryByTestId('quote-settings')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled()
  })
  it.each([{ stripeSessionId: 'cs_pending' }, { stripePaymentIntentId: 'pi_pending' }, { paidAt: '2026-09-22' }])('locks payment references even if draft status lags %j', async flags => {
    Object.assign(state.request, flags)
    render(<Result />)
    await screen.findByText(/saved print settings are locked/)
    expect(screen.getByRole('button', { name: 'Save settings & quote' })).toBeDisabled()
    expect(screen.queryByTestId('quote-settings')).not.toBeInTheDocument()
  })
  it('restores explicitly selected services including options with no fee', async () => {
    state.request.quote = { inputs: { options: { priority: true, specialRequest: true, postProcessing: false, expedite: false } }, lines: [] }
    render(<Result />)
    await waitFor(() => expect(JSON.parse(screen.getByTestId('quote-options').textContent)).toMatchObject({ priority: true, specialRequest: true }))
  })
  it('changes the real quote parameters when a purpose is selected', async () => {
    render(<Result />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Strong' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Strong' }))
    expect(JSON.parse(screen.getByTestId('quote-settings').textContent)).toMatchObject({ wallLoops: 4, infillPercent: 40 })
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(JSON.parse(screen.getByTestId('quote-settings').textContent).layerHeightMm).toBe(0.12)
    fireEvent.click(screen.getByRole('button', { name: 'Use balanced defaults' }))
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(screen.getByTestId('quote-settings').textContent)).toMatchObject({ layerHeightMm: 0.2, wallLoops: 2 })
  })
  it('preserves detailed settings after closing advanced controls, changing colour, and saving', async () => {
    render(<Result />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Strong' })).toBeEnabled())
    fireEvent.click(screen.getByText('Advanced settings'))
    fireEvent.change(screen.getByLabelText('Infill (%)'), { target: { value: '31' } })
    fireEvent.change(screen.getByLabelText('Walls'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Advanced settings'))
    fireEvent.change(screen.getByLabelText('Colour', { selector: 'select' }), { target: { value: 'Cobalt Blue' } })
    expect(JSON.parse(screen.getByTestId('quote-settings').textContent)).toMatchObject({ wallLoops: 3, infillPercent: 31 })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings & quote' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/cart'))
    const [, init] = global.fetch.mock.calls.find(([url]) => url === '/api/custom-print/config')
    const saved = JSON.parse(init.body)
    expect(saved.printSettings).toMatchObject({ wallLoops: 3, sparseInfillDensity: 31 })
    expect(saved.meshColors).toEqual({ Model: '#0056b8' })
    expect(saved.generic).toBeNull()
  })
  it('restores custom details without substituting a purpose preset', async () => {
    state.request.printConfiguration.printSettings.wallLoops = 5
    state.request.printConfiguration.generic = null
    render(<Result />)
    await waitFor(() => expect(screen.getByLabelText('Walls')).toHaveValue(5))
    expect(screen.getByText('Your detailed print settings are retained.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('locks already-paid requests and exposes model-load failures', async () => {
    state.request.status = 'paid'
    state.store.scene = null
    state.store.loadError = 'This model could not be read'
    render(<Result />)
    await screen.findByText(/saved print settings are locked/)
    expect(screen.getByRole('button', { name: 'Save settings & quote' })).toBeDisabled()
    expect(screen.getByText('This model could not be read')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose another model' })).toHaveAttribute('href', '/prints/request')
  })
  it('only offers plastic by default and supports review for a saved legacy material', async () => {
    state.request.printConfiguration.printSettings.materialType = 'resin'
    state.request.printConfiguration.generic.material = 'resin'
    render(<Result />)
    await screen.findByRole('button', { name: 'Request a manual quote' })
    expect(screen.queryByRole('button', { name: 'Strong' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('quote-settings')).not.toBeInTheDocument()
    expect(screen.getByText('1 model file per request')).toBeInTheDocument()
  })
})
