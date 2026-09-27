// /dashboard/print-service → Pricing: the one-time switch from legacy per-gram
// prices, Override checkboxes against the recommended values, "Use all
// recommended", the live sample card priced with the shared engine, colour
// chips, delivery inherit/replace and the pricing payload the page PUTs.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import PrintServicePage from '@/app/dashboard/print-service/page'

const showToast = vi.fn()
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast }) }))
vi.mock('@/components/DashboardComponents/CreatorShell', () => ({
    CreatorGate: ({ children }) => children,
    useShopIdentity: () => ({ displayName: 'Kai Prints', displayNameAvailable: true }),
}))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))

const recommended = {
    quotingConfig: { materialRatePerGram: 0.1, printTimeRatePerHour: 3, baseFee: 2, postProcessingFee: 6, specialRequestFee: 0, priorityFee: 0,
        expediteMode: 'greater', expediteSurchargePercent: 35, expediteSurchargeFlat: 5, minimumPrice: 5,
        timeModel: { baseFlowCm3PerHour: 8, layerHeightRefMm: 0.2, supportTimeFactor: 1.25, wallTimeFactorPerLoop: 0.08, minHours: 0.05 } },
    machineLimits: { maxLengthCm: 25.6, maxWidthCm: 25.6, maxHeightCm: 25.6, maxWeightKg: null },
    materials: [
        { filament: 'pla', label: 'PLA', ratePerGram: 0.1, colours: [{ name: 'Jade White', hex: '#ffffff' }, { name: 'Black', hex: '#000000' }] },
        { filament: 'petg', label: 'PETG', ratePerGram: 0.1, colours: [{ name: 'White', hex: '#f7f7f4' }] },
    ],
    deliveryOptions: [{ type: 'pickup', displayName: 'Collect at Sunview', description: '', price: 0, needsAddress: false }],
}
const baseService = { enabled: true, headline: 'Kai', description: '', minimumCharge: 0, leadTimeDays: 5,
    maxBuildMm: { x: 250, y: 250, z: 250 }, acceptedFormats: ['stl'], turnaroundNote: '' }

let calls
let getResponse
beforeEach(() => {
    calls = []
    showToast.mockClear()
    getResponse = { service: { ...baseService, materials: [{ name: 'PLA', colours: ['Black'], pricePerGram: 0.15, note: '' }], pricing: null }, recommended }
    global.fetch = vi.fn(async (url, init = {}) => {
        calls.push({ url: String(url), init })
        if (init.method === 'PUT') {
            const body = JSON.parse(init.body)
            return { ok: true, json: async () => ({ success: true, service: { ...body, pricing: body.pricing ? { ...body.pricing, version: 1 } : null }, recommended }) }
        }
        return { ok: true, json: async () => getResponse }
    })
})
afterEach(cleanup)

const sampleTotal = () => screen.getByTestId('sample-total').textContent
const rates = () => screen.getByRole('heading', { name: 'Rates and fees' }).closest('section')

describe('switching a legacy service to per-farm pricing', () => {
    it('offers a one-time switch that carries the legacy per-gram price over and hides the legacy editor', async () => {
        render(<PrintServicePage />)
        fireEvent.click(await screen.findByRole('button', { name: 'Switch to the new pricing' }))
        expect(screen.queryByRole('button', { name: 'Add material' })).toBeNull()
        expect(screen.queryByText('Minimum charge (SGD)')).toBeNull()
        // 0.15 S$/g over a 0.10 recommendation = 1.5x; only Black was listed.
        expect(screen.getByLabelText('PLA price multiplier')).toHaveValue(1.5)
        expect(within(screen.getByRole('group', { name: 'PLA colours' })).getByRole('button', { name: /Jade White/ })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByTestId('sample-fit')).toHaveTextContent(/Fix It Today would charge S\$\d+\.\d\d for the same part\./)
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true))
        const body = JSON.parse(calls.find((c) => c.init.method === 'PUT').init.body)
        expect(body.pricing.materials).toEqual([{ filament: 'pla', enabled: true, priceMultiplier: 1.5, coloursOff: expect.arrayContaining(['Jade White']) }])
        expect(body.pricing.materials[0].coloursOff).not.toContain('Black')
        expect(body.pricing.overrides).toEqual({ machineLimits: { maxLengthCm: 25, maxWidthCm: 25, maxHeightCm: 25 } })
        expect(body.pricing.delivery).toEqual([])
        expect(body.pricing).not.toHaveProperty('version')
    })
})

describe('pricing editor', () => {
    beforeEach(() => {
        getResponse = { service: { ...baseService, materials: [], pricing: {
            overrides: {}, materials: [{ filament: 'pla', enabled: true, priceMultiplier: null, coloursOff: [] }], delivery: [], version: 2,
        } }, recommended }
    })

    it('shows the recommended value in a disabled input until Override is ticked', async () => {
        render(<PrintServicePage />)
        const input = await screen.findByLabelText('Your material, per gram')
        expect(input).toBeDisabled()
        expect(input).toHaveValue(0.1)
        expect(within(rates()).getByText('S$0.100')).toBeInTheDocument()
        fireEvent.click(screen.getByLabelText('Override material, per gram'))
        expect(input).toBeEnabled()
        expect(input).toHaveValue(0.1)
    })

    it('updates the sample card live and resets with Use all recommended', async () => {
        render(<PrintServicePage />)
        await screen.findByTestId('sample-total')
        const before = sampleTotal()
        expect(screen.getByTestId('sample-fit')).toHaveTextContent(`Fix It Today would charge ${before} for the same part.`)
        fireEvent.click(screen.getByLabelText('Override setup fee per order'))
        fireEvent.change(screen.getByLabelText('Your setup fee per order'), { target: { value: '20' } })
        await waitFor(() => expect(sampleTotal()).not.toBe(before))
        expect(Number(sampleTotal().replace('S$', ''))).toBeGreaterThanOrEqual(20)
        fireEvent.click(within(rates()).getByRole('button', { name: 'Use all recommended' }))
        expect(sampleTotal()).toBe(before)
        expect(screen.getByLabelText('Your setup fee per order')).toBeDisabled()
    })

    it('saves only overridden fields, material and colour choices, and an own delivery list', async () => {
        render(<PrintServicePage />)
        fireEvent.click(await screen.findByLabelText('Override printer time, per hour'))
        fireEvent.change(screen.getByLabelText('Your printer time, per hour'), { target: { value: '2.5' } })
        fireEvent.click(screen.getByLabelText('Override printer speed'))
        fireEvent.change(screen.getByLabelText('Your printer speed'), { target: { value: '14' } })
        fireEvent.click(screen.getByLabelText('Offer PETG'))
        fireEvent.change(screen.getByLabelText('PETG price multiplier'), { target: { value: '1.2' } })
        fireEvent.click(within(screen.getByRole('group', { name: 'PLA colours' })).getByRole('button', { name: /Black/ }))
        fireEvent.click(screen.getByLabelText("Use Fix It Today's delivery options"))
        fireEvent.change(screen.getByLabelText('Delivery option 1 name'), { target: { value: 'Collect in Jurong' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
        fireEvent.change(screen.getByLabelText('Delivery option 2 name'), { target: { value: 'Courier' } })
        fireEvent.change(screen.getByLabelText('Delivery option 2 price'), { target: { value: '8' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true))
        const { pricing } = JSON.parse(calls.find((c) => c.init.method === 'PUT').init.body)
        expect(pricing.overrides).toEqual({ printTimeRatePerHour: 2.5, timeModel: { baseFlowCm3PerHour: 14 } })
        expect(pricing.materials).toEqual([
            { filament: 'pla', enabled: true, priceMultiplier: null, coloursOff: ['Black'] },
            { filament: 'petg', enabled: true, priceMultiplier: 1.2, coloursOff: [] },
        ])
        expect(pricing.delivery).toEqual([
            { type: 'pickup', label: 'Collect in Jurong', price: 0, description: '', needsAddress: false },
            { type: 'courier', label: 'Courier', price: 8, description: '', needsAddress: false },
        ])
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Print service saved and live.', 'success'))
    })

    it('keeps the legacy editor out once pricing exists', async () => {
        render(<PrintServicePage />)
        await screen.findByRole('heading', { name: 'Rates and fees' })
        expect(screen.queryByRole('button', { name: 'Switch to the new pricing' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Add material' })).toBeNull()
        expect(screen.queryByLabelText('Max build X in mm')).toBeNull()
    })
})

describe('machine limit overrides and legacy materials outside the catalogue', () => {
    beforeEach(() => {
        getResponse = { service: { ...baseService, materials: [], pricing: {
            overrides: {}, materials: [{ filament: 'pla', enabled: true, priceMultiplier: null, coloursOff: [] }], delivery: [], version: 2,
        } }, recommended }
    })

    it('seeds the recommended limit, or an empty field when there is none, and blocks Save until it is filled', async () => {
        render(<PrintServicePage />)
        fireEvent.click(await screen.findByLabelText('Override length'))
        expect(screen.getByLabelText('Your length')).toHaveValue(25.6)
        fireEvent.click(screen.getByLabelText('Override weight'))
        const weight = screen.getByLabelText('Your weight')
        expect(weight).toHaveValue(null)
        expect(weight).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText('Enter a value or untick Override')).toBeInTheDocument()
        const save = screen.getByRole('button', { name: 'Save' })
        expect(save).toBeDisabled()
        fireEvent.change(weight, { target: { value: '2' } })
        expect(screen.queryByText('Enter a value or untick Override')).toBeNull()
        expect(save).toBeEnabled()
        fireEvent.click(save)
        await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true))
        const { pricing } = JSON.parse(calls.find((c) => c.init.method === 'PUT').init.body)
        expect(pricing.overrides.machineLimits).toEqual({ maxLengthCm: 25.6, maxWeightKg: 2 })
    })

    it('unticking an empty override clears the block', async () => {
        render(<PrintServicePage />)
        fireEvent.click(await screen.findByLabelText('Override weight'))
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
        fireEvent.click(screen.getByLabelText('Override weight'))
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    })

    it('tells a legacy farm that uncatalogued materials are still requested and priced by hand', async () => {
        getResponse = { service: { ...baseService, pricing: null, materials: [
            { name: 'PLA', colours: [], pricePerGram: 0.1, note: '' }, { name: 'Nylon CF', colours: ['Black'], pricePerGram: 0.4, note: '' },
        ] }, recommended }
        render(<PrintServicePage />)
        const banner = await screen.findByRole('status')
        expect(banner).toHaveTextContent("Some of your materials aren't in the catalogue yet; customers can still request them and you price them by hand.")
        expect(banner).toHaveTextContent('Nylon CF')
    })
    it('removes an uncatalogued material after switching pricing and preserves other materials', async () => {
        getResponse.service.materials = [
            { name: 'Nylon CF', colours: ['Black'], pricePerGram: 0.4, note: '' },
            { name: 'Resin', colours: ['Grey'], pricePerGram: 0.3, note: '' },
        ]
        render(<PrintServicePage />)
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Nylon CF' }))
        fireEvent.change(screen.getByLabelText('Note for Resin'), { target: { value: 'Quote after model review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(calls.some(c => c.init.method === 'PUT')).toBe(true))
        const payload = JSON.parse(calls.find(c => c.init.method === 'PUT').init.body)
        expect(payload.materials).toEqual([{ name: 'Resin', colours: ['Grey'], pricePerGram: 0.3, note: 'Quote after model review' }])
        expect(payload.pricing.materials[0].filament).toBe('pla')
    })
})
