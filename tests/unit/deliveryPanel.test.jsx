// RTL smokes for the redesigned Delivery panel (§5.14 + client feedback):
// icon cards with a formula-strip pricing summary, a properly-bounded enable
// switch with the label beside it, a stepped create/edit Sheet (Name >
// Pricing > Bounds > Review) that preserves every legacy field and payload,
// and delete through ConfirmDialog (never window.confirm).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('@/components/General/ToastProvider', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}))

import DeliveryTypeManagement from '@/components/Admin/DeliveryTypeManagement'

const deliveryTypes = [
    {
        name: 'digital',
        displayName: 'Digital Delivery',
        isHardcoded: true,
        isActive: true,
        applicableToProductTypes: ['shop'],
    },
    {
        _id: 'abc123',
        name: 'courier',
        displayName: 'Courier',
        isActive: true,
        applicableToProductTypes: ['shop', 'print'],
        basePricing: {
            basePrice: 5,
            volumeFactor: 0.001,
            weightFactor: 0.01,
            minPrice: 2,
            maxPrice: 50,
            freeShippingThreshold: 80,
        },
    },
    {
        _id: 'exp456',
        name: 'express',
        displayName: 'Express Post',
        isActive: false,
        applicableToProductTypes: ['shop'],
        basePricing: {
            basePrice: 9.9,
            volumeFactor: 0.01,
            weightFactor: 0.005,
            minPrice: 9.9,
            maxPrice: 60,
            freeShippingThreshold: 150,
        },
    },
]

const cardOf = (displayName) => screen.getByText(displayName).closest('[data-delivery-card]')

beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
        if (opts.method === 'DELETE' || opts.method === 'PUT' || opts.method === 'POST') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ deliveryTypes }) })
    })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('DeliveryTypeManagement — list cards', () => {
    it('renders each type as a card with a keyword-mapped icon', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')

        expect(cardOf('Digital Delivery').querySelector('[data-icon="download"]')).toBeTruthy()
        expect(cardOf('Courier').querySelector('[data-icon="truck"]')).toBeTruthy()
        expect(cardOf('Express Post').querySelector('[data-icon="express"]')).toBeTruthy()
    })

    it('summarizes pricing as a formula strip with bounded chips, not label rows', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')

        // One-line formula in the tabular data style.
        const courier = cardOf('Courier')
        expect(within(courier).getByText('$5.00 base + $0.001/cm³ + $0.01/g')).toBeInTheDocument()
        expect(within(courier).getByText('min $2.00')).toBeInTheDocument()
        expect(within(courier).getByText('max $50.00')).toBeInTheDocument()
        expect(within(courier).queryByText(/free over/)).toBeNull() // stored legacy threshold does not advertise an offer

        const express = cardOf('Express Post')
        expect(within(express).getByText('$9.90 base + $0.01/cm³ + $0.005/g')).toBeInTheDocument()
        expect(within(express).queryByText(/free over/)).toBeNull() // legacy threshold is not an offer

        // Creator-defined pricing reads as a sentence.
        expect(
            within(cardOf('Digital Delivery')).getByText('Creators set their own delivery price for this option.')
        ).toBeInTheDocument()

        // The old label/value dump is gone.
        expect(screen.queryByText('Base price')).toBeNull()
        expect(screen.queryByText('Volume factor')).toBeNull()
        expect(screen.queryByText('Weight factor')).toBeNull()

        // Metadata pills and protections survive the redesign.
        expect(within(courier).getByText('courier')).toBeInTheDocument() // url chip
        expect(screen.getByText('Built-in')).toBeInTheDocument()
        expect(within(courier).getByText('Print')).toBeInTheDocument()
        // Row actions are labelled ActionIcons (icon-only, fixed 28px).
        expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(2)
        expect(screen.getAllByRole('button', { name: /^Delete / })).toHaveLength(2)
        const edit = screen.getByRole('button', { name: 'Edit Courier' })
        expect(edit.className).toContain('h-7')
        expect(edit.className).toContain('w-7')
        expect(edit.textContent.trim()).toBe('')
        const rawText = Array.from(document.querySelectorAll('button')).filter((b) =>
            ['Edit', 'Delete'].includes(b.textContent.trim()))
        expect(rawText).toHaveLength(0)
    })
})

describe('DeliveryTypeManagement — enable switch', () => {
    it('renders on state: ink track, knob translated within the track, label beside it', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')

        const sw = screen.getByRole('switch', { name: 'Courier active' })
        expect(sw).toHaveAttribute('aria-checked', 'true')
        expect(sw.className).toContain('w-9')
        expect(sw.className).toContain('h-5')
        expect(sw.className).toContain('bg-[var(--dash-ink)]')

        const knob = sw.querySelector('span')
        expect(knob.className).toContain('left-0.5')
        expect(knob.className).toContain('translate-x-4') // 2 + 16 + 16 = 34px of the 36px track

        // The label sits NEXT to the switch, never inside/under it.
        expect(within(sw).queryByText('Active')).toBeNull()
        expect(within(cardOf('Courier')).getByText('Active')).toBeInTheDocument()
    })

    it('renders off state: line track, knob at the left edge, Inactive beside it', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Express Post')

        const sw = screen.getByRole('switch', { name: 'Express Post active' })
        expect(sw).toHaveAttribute('aria-checked', 'false')
        expect(sw.className).toContain('bg-[var(--dash-line)]')

        const knob = sw.querySelector('span')
        expect(knob.className).toContain('translate-x-0')
        expect(knob.className).not.toContain('translate-x-4')

        expect(within(sw).queryByText('Inactive')).toBeNull()
        expect(within(cardOf('Express Post')).getByText('Inactive')).toBeInTheDocument()
    })

    it('toggles active through the existing PUT payload', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')
        fireEvent.click(screen.getByRole('switch', { name: 'Courier active' }))
        await waitFor(() => {
            const putCall = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
            expect(putCall).toBeTruthy()
            expect(JSON.parse(putCall[1].body)).toEqual({
                type: 'delivery-type',
                action: 'toggleActive',
                name: 'courier',
                isActive: false,
            })
        })
    })
})

describe('DeliveryTypeManagement — stepped edit sheet', () => {
    it('walks Name > Pricing > Bounds > Review with one field group per step, then PUTs the legacy payload', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')

        fireEvent.click(within(cardOf('Courier')).getByRole('button', { name: 'Edit Courier' }))
        const dialog = await screen.findByRole('dialog')

        // Step 1: identity only — pricing inputs are not on this screen.
        expect(within(dialog).getByLabelText('Display Name*')).toHaveValue('Courier')
        expect(within(dialog).getByLabelText('URL Name*')).toHaveValue('courier')
        expect(within(dialog).getByLabelText('Shop Products')).toBeChecked()
        expect(within(dialog).getByLabelText('Print Products')).toBeChecked()
        expect(within(dialog).queryByLabelText('Base Price ($)')).toBeNull()

        // Step 2: how it charges.
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
        expect(within(dialog).getByLabelText('Base Price ($)')).toHaveValue(5)
        expect(within(dialog).getByLabelText('Volume Factor ($/cm³)')).toHaveValue(0.001)
        expect(within(dialog).getByLabelText('Weight Factor ($/g)')).toHaveValue(0.01)
        expect(within(dialog).queryByLabelText('Minimum Price ($)')).toBeNull()

        // Step 3: bounds.
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
        expect(within(dialog).getByLabelText('Minimum Price ($)')).toHaveValue(2)
        expect(within(dialog).getByLabelText('Maximum Price ($)')).toHaveValue(50)
        expect(within(dialog).queryByLabelText('Free Shipping Threshold ($)')).toBeNull()

        // Step 4: human-readable review + live example calculations.
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
        expect(
            within(dialog).getByText(
                'Charges $5.00 base plus $0.001 per cubic cm and $0.01 per gram, never less than $2.00 or more than $50.00.'
            )
        ).toBeInTheDocument()
        expect(within(dialog).getByText('Example Calculations')).toBeInTheDocument()
        // Small item: 5 + 1000×0.001 + 100×0.01 = $7.00
        expect(within(dialog).getByText('$7.00')).toBeInTheDocument()
        expect(within(dialog).getByText('$15.00')).toBeInTheDocument()
        expect(within(dialog).getByText('$25.00')).toBeInTheDocument()

        // Try-your-own calculator clamps through the same formula.
        fireEvent.change(within(dialog).getByLabelText('Volume (cm³)'), { target: { value: '2000' } })
        fireEvent.change(within(dialog).getByLabelText('Weight (g)'), { target: { value: '300' } })
        // 5 + 2 + 3 = $10.00
        expect(within(dialog).getByText('$10.00')).toBeInTheDocument()

        // Back returns to bounds without losing values.
        fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }))
        expect(within(dialog).getByLabelText('Minimum Price ($)')).toHaveValue(2)
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

        // Saving PUTs the exact legacy edit payload.
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
        await waitFor(() => {
            const putCall = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
            expect(putCall).toBeTruthy()
            const body = JSON.parse(putCall[1].body)
            expect(Object.keys(body)).toEqual(['type', 'id', 'data'])
            expect(body.type).toBe('delivery-type')
            expect(body.id).toBe('abc123')
            expect(body.data.basePricing.freeShippingThreshold).toBe(80) // preserve stored settings; no data migration
            expect(Object.keys(body.data)).toEqual([
                'displayName',
                'description',
                'applicableToProductTypes',
                'basePricing',
                'isActive',
            ])
        })
        // Editing notifies affected creators (unchanged side call).
        await waitFor(() => {
            const notify = global.fetch.mock.calls.find(([u]) => String(u).includes('notify-delivery-change'))
            expect(notify).toBeTruthy()
            expect(JSON.parse(notify[1].body).deliveryTypeName).toBe('courier')
        })
    })
})

describe('DeliveryTypeManagement — stepped create flow', () => {
    it('gates step 1 on the required fields', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')

        fireEvent.click(screen.getByRole('button', { name: 'New Delivery Type' }))
        const dialog = await screen.findByRole('dialog')

        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
        // Still on step 1 — required fields are empty.
        expect(within(dialog).getByLabelText('Display Name*')).toBeInTheDocument()
        expect(within(dialog).queryByLabelText('Base Price ($)')).toBeNull()
    })

    it('preserves every legacy field across the steps and POSTs the legacy payload', async () => {
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')

        fireEvent.click(screen.getByRole('button', { name: 'New Delivery Type' }))
        const dialog = await screen.findByRole('dialog')

        // Step 1: name and description.
        fireEvent.change(within(dialog).getByLabelText('Display Name*'), { target: { value: 'Premium Delivery' } })
        fireEvent.change(within(dialog).getByLabelText('URL Name*'), { target: { value: 'Premium Delivery' } })
        expect(within(dialog).getByLabelText('URL Name*')).toHaveValue('premium-delivery') // slugified
        fireEvent.click(within(dialog).getByLabelText('Shop Products'))
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

        // Step 2: how it charges.
        fireEvent.change(within(dialog).getByLabelText('Base Price ($)'), { target: { value: '9.9' } })
        fireEvent.change(within(dialog).getByLabelText('Volume Factor ($/cm³)'), { target: { value: '0.01' } })
        fireEvent.change(within(dialog).getByLabelText('Weight Factor ($/g)'), { target: { value: '0.005' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

        // Step 3: bounds.
        fireEvent.change(within(dialog).getByLabelText('Minimum Price ($)'), { target: { value: '9.9' } })
        fireEvent.change(within(dialog).getByLabelText('Maximum Price ($)'), { target: { value: '60' } })
        expect(within(dialog).queryByLabelText('Free Shipping Threshold ($)')).toBeNull()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

        // Step 4: the summary sentence reads the whole configuration back.
        expect(
            within(dialog).getByText(
                'Charges $9.90 base plus $0.01 per cubic cm and $0.005 per gram, never less than $9.90 or more than $60.00.'
            )
        ).toBeInTheDocument()
        expect(within(dialog).getByText('Premium Delivery')).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: 'Add Delivery Type' }))
        await waitFor(() => {
            const postCall = global.fetch.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/api/admin/settings'))
            expect(postCall).toBeTruthy()
            expect(JSON.parse(postCall[1].body)).toEqual({
                type: 'deliveryType',
                action: 'add',
                data: {
                    name: 'premium-delivery',
                    displayName: 'Premium Delivery',
                    description: '',
                    applicableToProductTypes: ['shop'],
                    basePricing: {
                        basePrice: '9.9',
                        volumeFactor: '0.01',
                        weightFactor: '0.005',
                        minPrice: '9.9',
                        maxPrice: '60',
                        freeShippingThreshold: '',
                    },
                    isActive: true,
                },
            })
        })
    })
})

describe('DeliveryTypeManagement — delete', () => {
    it('deletes via ConfirmDialog, not window.confirm', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm')
        render(<DeliveryTypeManagement />)
        await screen.findByText('Courier')

        fireEvent.click(within(cardOf('Courier')).getByLabelText('Delete Courier'))
        expect(screen.getByText('Delete this delivery type?')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        await waitFor(() => {
            const delCall = global.fetch.mock.calls.find(([, o]) => o?.method === 'DELETE')
            expect(delCall).toBeTruthy()
            expect(JSON.parse(delCall[1].body)).toEqual({ type: 'delivery-type', id: 'abc123' })
        })
        expect(confirmSpy).not.toHaveBeenCalled()
    })
})
