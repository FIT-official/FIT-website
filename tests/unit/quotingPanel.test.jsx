// RTL smokes for the redesigned Quoting & Pricing panel (§5.14 + §9.3):
// sub-view tabs switch rate-card groups, the wizard's `sections` prop renders
// a single group without tabs, and save PUTs the full loaded config shape
// (byte-compatible with the legacy panel).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}))

import QuotingPricingManagement from '@/components/Admin/QuotingPricingManagement'

const payload = {
    quotingConfig: {
        materialRatePerGram: 0.02,
        printTimeRatePerHour: 3,
        baseFee: 5,
        postProcessingFee: 2,
        specialRequestFee: 4,
        priorityFee: 6,
        expediteSurchargePercent: 25,
        expediteSurchargeFlat: 10,
        minimumPrice: 12,
        expediteMode: 'greater',
        timeModel: { baseFlowCm3PerHour: 10, layerHeightRefMm: 0.2 },
    },
    printColours: [{ name: 'Jet Black', hex: '#111111', material: null }],
    machineLimits: { maxLengthCm: 30 },
}

beforeEach(() => {
    global.fetch = vi.fn((url, opts) => {
        if (opts?.method === 'PUT') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('QuotingPricingManagement — sub-view tabs', () => {
    it('is presented as the recommended pricing creator print farms start from', async () => {
        render(<QuotingPricingManagement />)
        expect(await screen.findByRole('heading', { name: 'Recommended pricing' })).toBeInTheDocument()
        expect(screen.getByText('Creator print farms start from these values and override what differs.')).toBeInTheDocument()
    })
    it('shows Rates by default and switches groups through the tabs', async () => {
        render(<QuotingPricingManagement />)
        expect(await screen.findByLabelText('Material rate')).toHaveValue(0.02)
        expect(screen.getByLabelText('Minimum price')).toHaveValue(12)
        // Other groups are not on this sub-view.
        expect(screen.queryByLabelText('Base fee')).toBeNull()
        expect(screen.queryByText('Machine limits')).toBeNull()

        fireEvent.click(screen.getByRole('tab', { name: 'Fees & rush' }))
        expect(screen.getByLabelText('Base fee')).toHaveValue(5)
        // Mode "greater" reveals both surcharge fields.
        expect(screen.getByLabelText('Expedite surcharge (percent)')).toHaveValue(25)
        expect(screen.getByLabelText('Expedite surcharge (flat)')).toHaveValue(10)
        expect(screen.queryByLabelText('Material rate')).toBeNull()

        fireEvent.click(screen.getByRole('tab', { name: 'Machine speed' }))
        expect(screen.getByLabelText('How much material does a typical print use per hour?')).toHaveValue(10)

        fireEvent.click(screen.getByRole('tab', { name: 'Limits' }))
        expect(screen.getByLabelText('Max length')).toHaveValue(30)

        fireEvent.click(screen.getByRole('tab', { name: 'Colours' }))
        expect(screen.getByLabelText('Colour name')).toHaveValue('Jet Black')
    })

    it('hides surcharge fields that do not apply to the expedite mode', async () => {
        render(<QuotingPricingManagement />)
        await screen.findByLabelText('Material rate')
        fireEvent.click(screen.getByRole('tab', { name: 'Fees & rush' }))

        fireEvent.change(screen.getByLabelText('Expedite mode'), { target: { value: 'percent' } })
        expect(screen.getByLabelText('Expedite surcharge (percent)')).toBeInTheDocument()
        expect(screen.queryByLabelText('Expedite surcharge (flat)')).toBeNull()

        fireEvent.change(screen.getByLabelText('Expedite mode'), { target: { value: 'flat' } })
        expect(screen.queryByLabelText('Expedite surcharge (percent)')).toBeNull()
        expect(screen.getByLabelText('Expedite surcharge (flat)')).toBeInTheDocument()
    })
})

describe('QuotingPricingManagement — wizard `sections` contract', () => {
    it('renders just the pricing group without tabs when sections is passed', async () => {
        render(<QuotingPricingManagement sections={['pricing']} compact />)
        expect(await screen.findByText('Rates & fees')).toBeInTheDocument()
        expect(screen.queryByRole('tablist')).toBeNull()
        // Other groups stay out of a scoped step.
        expect(screen.queryByText('Machine limits')).toBeNull()
        expect(screen.queryByText(/Colour \/ material catalogue/)).toBeNull()
        expect(screen.getByText(/Save Quoting Config/)).toBeInTheDocument()
    })

    it('renders speed questions and limits together for the machines step', async () => {
        render(<QuotingPricingManagement sections={['machines']} compact />)
        expect(await screen.findByText(/Print time estimation/)).toBeInTheDocument()
        expect(screen.getByText('Machine limits')).toBeInTheDocument()
        expect(screen.queryByRole('tablist')).toBeNull()
    })
})

describe('QuotingPricingManagement — save', () => {
    it('PUTs the full loaded config regardless of the visible sub-view', async () => {
        render(<QuotingPricingManagement />)
        await screen.findByLabelText('Material rate')

        fireEvent.click(screen.getByText('Save Quoting Config'))

        await waitFor(() => {
            expect(global.fetch.mock.calls.some(([, opts]) => opts?.method === 'PUT')).toBe(true)
        })
        const [url, opts] = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
        expect(url).toBe('/api/admin/quoting')
        const body = JSON.parse(opts.body)
        expect(Object.keys(body)).toEqual(['quotingConfig', 'printColours', 'machineLimits'])
        // Full config shape and legacy key order — scoped views can't wipe it.
        expect(Object.keys(body.quotingConfig)).toEqual([
            'materialRatePerGram',
            'printTimeRatePerHour',
            'baseFee',
            'postProcessingFee',
            'specialRequestFee',
            'priorityFee',
            'expediteSurchargePercent',
            'expediteSurchargeFlat',
            'minimumPrice',
            'expediteMode',
            'timeModel',
        ])
        expect(body.quotingConfig).toMatchObject({
            materialRatePerGram: 0.02,
            printTimeRatePerHour: 3,
            minimumPrice: 12,
            expediteMode: 'greater',
        })
        // Unanswered time-model questions persist as explicit nulls.
        expect(body.quotingConfig.timeModel).toEqual({
            baseFlowCm3PerHour: 10,
            layerHeightRefMm: 0.2,
            supportTimeFactor: null,
            wallTimeFactorPerLoop: null,
            minHours: null,
        })
        // Empty limits are explicit nulls (clears previously set values).
        expect(body.machineLimits).toEqual({
            maxLengthCm: 30,
            maxWidthCm: null,
            maxHeightCm: null,
            maxWeightKg: null,
        })
        expect(body.printColours).toEqual([{ name: 'Jet Black', hex: '#111111', material: null }])
    })
})
