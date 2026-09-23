import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import QuotePanel from '@/components/Editor/QuotePanel'

const metrics = {
  volumeCm3: 12.3,
  dimensionsCm: { length: 2, width: 2, height: 3 },
  confidence: 'low',
}
const settings = { materialType: 'pla', infillPercent: 20, layerHeightMm: 0.2 }

const mockQuote = {
  currency: 'sgd',
  lines: [
    { key: 'material', label: 'Material', amount: 1.5 },
    { key: 'printTime', label: 'Print time', amount: 2.5 },
    { key: 'baseFee', label: 'Base fee', amount: 0 },
  ],
  expedite: { applied: false, amount: 0 },
  total: 5,
  confidence: 'low',
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ quote: mockQuote }) }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('QuotePanel', () => {
  it('shows thin dimensions in millimetres and does not round small positive volume to zero', () => {
    render(<QuotePanel metrics={{ ...metrics, volumeCm3: 0.03, dimensionsCm: { length: 1, width: 1, height: 0.02 } }} settings={settings} />)
    expect(screen.getByText('10.0 × 10.0 × 0.2 mm')).toBeInTheDocument()
    expect(screen.getByText('<0.1 cm³')).toBeInTheDocument()
  })
  it('aborts and ignores an older estimate after the settings change', async () => {
    let finishFirst
    global.fetch = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockResolvedValue({ ok: true, json: async () => ({ quote: { ...mockQuote, total: 9 } }) })
    const { rerender } = render(<QuotePanel embedded metrics={metrics} settings={settings} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const firstSignal = global.fetch.mock.calls[0][1].signal
    rerender(<QuotePanel embedded metrics={metrics} settings={{ ...settings, infillPercent: 40 }} />)
    expect(firstSignal.aborted).toBe(true)
    await act(async () => finishFirst({ ok: true, json: async () => ({ quote: mockQuote }) }))
    expect(screen.queryByText('SGD 5.00')).not.toBeInTheDocument()
    expect(await screen.findByText('SGD 9.00')).toBeInTheDocument()
  })
  it('renders nothing when there is no measurable model', () => {
    const { container } = render(<QuotePanel metrics={null} settings={settings} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a low-confidence warning for non-watertight models', () => {
    render(<QuotePanel metrics={metrics} settings={settings} />)
    expect(screen.getByText(/geometry review/i)).toBeInTheDocument()
  })

  it('fetches and displays the server quote total', async () => {
    render(<QuotePanel metrics={metrics} settings={settings} />)
    expect(await screen.findByText('SGD 5.00')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/quote', expect.objectContaining({ method: 'POST' }))
  })

  it('shows the saved-model dimensions returned with a verified quote', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ quote: {
      ...mockQuote, inputs: { volumeCm3: 64, dimensionsCm: { length: 2.8, width: 2.8, height: 0.5 } },
    } }) }))
    render(<QuotePanel metrics={metrics} settings={settings} />)
    expect(await screen.findByText('28.0 × 28.0 × 5.0 mm')).toBeInTheDocument()
    expect(screen.getByText('64.0 cm³')).toBeInTheDocument()
  })

  it('disables priority and rush when the chosen colour is out of stock', () => {
    render(<QuotePanel metrics={metrics} settings={settings} stockStatus="out_of_stock" />)
    expect(screen.getByRole('checkbox', { name: 'Priority' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Expedite \/ rush/ })).toBeDisabled()
    expect(screen.getByText(/4–6 weeks/)).toBeInTheDocument()
  })

  it('never sends a client-supplied price in the request body', async () => {
    render(<QuotePanel metrics={metrics} settings={settings} />)
    await screen.findByText('SGD 5.00')
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body).not.toHaveProperty('total')
    expect(body).not.toHaveProperty('price')
    expect(body).toHaveProperty('volumeCm3', 12.3)
  })

  it('surfaces the minimum order price when the floor was applied', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            quote: {
              ...mockQuote,
              minimumApplied: true,
              inputs: { printHours: 2.3, weightGrams: 10, volumeCm3: 12.3 },
            },
          }),
      }),
    )
    render(<QuotePanel metrics={metrics} settings={settings} />)
    expect(await screen.findByText(/minimum order price/i)).toBeInTheDocument()
  })

  it('shows the estimated print hours on the print-time line', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            quote: {
              ...mockQuote,
              inputs: { printHours: 2.3, weightGrams: 10, volumeCm3: 12.3 },
            },
          }),
      }),
    )
    render(<QuotePanel metrics={metrics} settings={settings} />)
    expect(await screen.findByText(/2\.3\s*h/i)).toBeInTheDocument()
  })
})
