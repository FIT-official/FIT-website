import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductTypeCategory from '@/components/DashboardComponents/ProductFormFields/ProductTypeCategory'
import ProductForm from '@/components/DashboardComponents/ProductForm'

const m = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn(), settings: null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: 'user_synthetic_admin' }, isLoaded: true }) }))
vi.mock('@/utils/useAccess', () => ({ default: () => ({ loading: false, canAccess: true, isAdmin: true }) }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: m.toast }) }))
vi.mock('@/utils/AdminSettingsContext', () => ({ useAdminSettings: () => m.settings }))
vi.mock('@/utils/uploadHelpers', () => ({ uploadImages: vi.fn(async () => []), uploadModels: vi.fn(async () => []), uploadViewable: vi.fn(async () => null) }))

const option = displayName => ({ displayName, name: displayName.toLowerCase(), isActive: true })
const categories = [
    { ...option('Filament'), type: 'shop', subcategories: ['PLA', 'PETG', 'TPU'].map(option) },
    { ...option('Accessories'), type: 'shop', subcategories: ['Tools'].map(option) },
]
function Harness({ product = null, initial = product || { productType: 'shop', categoryId: '', subcategoryId: '' } }) {
    const [form, setForm] = useState(initial)
    return <form aria-label="Classification"><ProductTypeCategory form={form} setForm={setForm} isAdmin categories={categories}
        subcategories={categories.find(c => c.displayName === form.categoryId)?.subcategories || []} originalProduct={product} /></form>
}
// Synthetic fixture only. Prices, quantities and identifiers do not represent inventory.
const product = (subcategoryId = null) => ({
    _id: '000000000000000000000101', creatorUserId: 'user_synthetic_owner', name: 'Synthetic PVA 1kg', description: 'Synthetic PVA support, 1kg spool.',
    productType: 'shop', categoryId: 'Filament', subcategoryId, category: 1, subcategory: 0,
    images: ['images/synthetic/pva.webp'], paidAssets: [], viewableModel: '',
    basePrice: { presentmentAmount: 53.75, presentmentCurrency: 'SGD' }, priceCredits: 0, stock: 7,
    dimensions: { length: 17, width: 18, height: 19, weight: 0.73 },
    delivery: { deliveryTypes: [{ type: 'pick-up', price: 0, customPrice: null, customDescription: 'Synthetic collection' }] },
    shippingCosts: { unitCost: 8, packingCost: 1, deliveryCost: 4, confirmed: true },
    variantTypes: [{ _id: '000000000000000000000102', name: 'Colour', options: [{ _id: '000000000000000000000103', name: 'Synthetic Clear (00000)', additionalFee: 0, stock: 7, image: null, hex: '#eeeeee' }] }],
})
beforeEach(() => {
    m.settings = { loading: false, error: null, settings: { categories, printColours: [], deliveryTypes: [{ ...option('Pick-up'), name: 'pick-up', applicableToProductTypes: ['shop', 'print'], pricingTiers: [] }] } }
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => ({ ok: true, json: async () => ({ success: true, product: { _id: '000000000000000000000101', ...JSON.parse(init.body) } }) })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('existing product classification', () => {
    it.each([null, '', undefined])('allows an existing blank PVA subcategory (%s) without selecting a false material', subcategoryId => {
        const existing = product(subcategoryId)
        if (subcategoryId === undefined) delete existing.subcategoryId
        render(<Harness product={existing} initial={{ ...existing, subcategoryId: existing.subcategoryId || '' }} />)
        const select = screen.getByLabelText('Subcategory')
        expect(select.value).toBe(''); expect(select.required).toBe(false); expect(select.checkValidity()).toBe(true)
        expect(screen.getByRole('option', { name: 'No subcategory (keep existing)' })).toBeInTheDocument()
    })
    it.each(['PLA', 'PETG', 'TPU', 'PVA', 'ABS', 'ASA', 'Specialty', 'PA-CF', 'PC'])('keeps stored %s without changing taxonomy', material => {
        render(<Harness product={product(material)} />)
        expect(screen.getByLabelText('Subcategory').value).toBe(material)
        expect(screen.getByLabelText('Subcategory').checkValidity()).toBe(true)
        expect(screen.getByLabelText('Subcategory').required).toBe(true)
    })
    it('does not offer an unconfigured material to new products', () => {
        render(<Harness initial={{ productType: 'shop', categoryId: 'Filament', subcategoryId: '' }} />)
        expect(screen.getByLabelText('Subcategory').required).toBe(true)
        expect(screen.getByLabelText('Subcategory').checkValidity()).toBe(false)
        expect(screen.queryByRole('option', { name: /PVA/ })).not.toBeInTheDocument()
    })
    it('requires a new selection when the parent category changes', () => {
        render(<Harness product={product('PVA')} />)
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Accessories' } })
        expect(screen.getByLabelText('Subcategory').value).toBe('')
        expect(screen.getByLabelText('Subcategory').required).toBe(true)
        expect(screen.queryByRole('option', { name: /PVA/ })).not.toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Tools' })).toBeInTheDocument()
    })
    it('does not carry the blank exception to a different product type', () => {
        render(<Harness product={product(null)} />)
        fireEvent.change(screen.getByLabelText('Product Type'), { target: { value: 'print' } })
        expect(screen.getByLabelText('Category').required).toBe(true)
        expect(screen.getByLabelText('Subcategory').required).toBe(true)
    })
    it('preserves an inactive legacy category and does not borrow another category options', () => {
        render(<Harness product={{ ...product('PVA'), categoryId: 'Legacy materials' }} />)
        expect(screen.getByLabelText('Category').value).toBe('Legacy materials')
        expect(screen.getByLabelText('Subcategory').value).toBe('PVA')
        expect(screen.queryByRole('option', { name: 'PLA' })).not.toBeInTheDocument()
    })
    it('allows a legacy blank category without relabelling it', () => {
        render(<Harness product={{ ...product(null), categoryId: '' }} initial={{ ...product(''), categoryId: '' }} />)
        expect(screen.getByRole('form').checkValidity()).toBe(true)
        expect(screen.getByLabelText('Category').value).toBe('')
    })
})

describe('supported ProductForm edit path', () => {
    it.each(['loaded', 'async'])('saves a PVA weight correction (%s load) while preserving commercial and variant metadata', async load => {
        const original = product(null)
        const user = userEvent.setup()
        const { container, rerender } = render(<ProductForm mode="Edit" product={load === "loaded" ? original : null} />)
        if (load === "async") rerender(<ProductForm mode="Edit" product={original} />)
        await screen.findByDisplayValue('Synthetic PVA 1kg')
        fireEvent.change(screen.getByLabelText('Product Name'), { target: { value: 'Synthetic PVA 0.5kg' } })
        fireEvent.change(screen.getByLabelText('Product Description'), { target: { value: 'Synthetic PVA support, 0.5kg spool.' } })
        expect(container.querySelector('form').checkValidity()).toBe(true)
        await user.click(screen.getAllByRole('button', { name: 'Save Product' })[0])
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
        const [url, init] = fetch.mock.calls[0], body = JSON.parse(init.body)
        expect(url).toBe('/api/product?productId=000000000000000000000101'); expect(init.method).toBe('PUT')
        expect(body).toMatchObject({ name: 'Synthetic PVA 0.5kg', description: 'Synthetic PVA support, 0.5kg spool.', categoryId: 'Filament', subcategoryId: null })
        for (const key of ['basePrice', 'stock', 'variantTypes', 'dimensions', 'delivery', 'shippingCosts', 'images']) expect(body[key]).toEqual(original[key])
        await waitFor(() => expect(m.toast).toHaveBeenCalledWith('Product updated successfully!', 'success'))
    })
    it('uses the matching hardcoded category when settings cannot load', async () => {
        m.settings = { loading: false, error: 'Synthetic settings outage', settings: null }
        render(<ProductForm mode="Edit" product={product('ABS')} />)
        await screen.findByDisplayValue('Synthetic PVA 1kg')
        expect(screen.getByLabelText('Subcategory').value).toBe('ABS')
        expect(screen.getByRole('option', { name: 'Specialty' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Microcontrollers' })).not.toBeInTheDocument()
    })
    it('keeps required basic fields effective for a legacy blank product', async () => {
        const user = userEvent.setup()
        const { container } = render(<ProductForm mode="Edit" product={product(null)} />)
        fireEvent.change(screen.getByLabelText('Product Name'), { target: { value: '' } })
        expect(container.querySelector('form').checkValidity()).toBe(false)
        await user.click(screen.getAllByRole('button', { name: 'Save Product' })[0])
        expect(fetch).not.toHaveBeenCalled()
    })
})
