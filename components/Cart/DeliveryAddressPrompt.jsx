'use client'
import { useEffect, useState } from 'react'
import { HiLocationMarker } from 'react-icons/hi'
import { useToast } from '@/components/General/ToastProvider'
import { missingAddressFields } from '@/lib/checkoutAddressGate'

const EMPTY_ADDRESS = {
    street: '',
    unitNumber: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
}

const FIELD_LABELS = {
    street: 'Street address',
    unitNumber: 'Unit / apt number',
    city: 'City',
    state: 'State / province',
    postalCode: 'Postal code',
    country: 'Country'
}

const inputClass = "w-full px-3 py-2 text-sm border border-borderColor rounded-md bg-background text-textColor placeholder:text-extraLight focus:outline-none focus:ring-2 focus:ring-textColor/20 focus:border-textColor transition-all disabled:opacity-50 disabled:cursor-not-allowed"

/**
 * Inline delivery-address form. Saves through POST /api/user/contact/address
 * (the same endpoint the account page uses) and reports the saved address to
 * the parent so the cart summary and checkout can re-run their gating without
 * a page change.
 *
 * - `initialAddress`: prefill (editing an existing address).
 * - `title` / `description`: header copy; pass `title={null}` to hide the header.
 * - `onCancel`: when given, renders a Cancel button (edit-in-place mode).
 * - `onAddressSaved(address)`: called after a successful save.
 */
export default function DeliveryAddressPrompt({
    onAddressSaved,
    onCancel,
    initialAddress = null,
    title = 'Delivery address required',
    description = 'Add your delivery address to see shipping costs and proceed to checkout.',
    saveLabel = 'Save delivery address',
}) {
    const [address, setAddress] = useState({ ...EMPTY_ADDRESS, ...(initialAddress || {}) })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const { showToast } = useToast()

    useEffect(() => {
        setAddress({ ...EMPTY_ADDRESS, ...(initialAddress || {}) })
    }, [initialAddress])

    const handleAddressChange = (e) => {
        const { name, value } = e.target
        setAddress(prev => ({ ...prev, [name]: value }))
        if (error) setError('')
    }

    const handleSave = async (e) => {
        if (e?.preventDefault) e.preventDefault()
        const missing = missingAddressFields(address)
        if (missing.length > 0) {
            setError(`Please fill in: ${missing.map((f) => FIELD_LABELS[f]).join(', ')}.`)
            return
        }

        setSaving(true)
        setError('')
        try {
            const trimmed = Object.fromEntries(Object.entries(address).map(([k, v]) => [k, String(v || '').trim()]))
            const response = await fetch('/api/user/contact/address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: trimmed })
            })

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data?.error || 'Failed to save address')
            }
            const data = await response.json().catch(() => ({}))
            showToast('Delivery address saved', 'success')
            if (onAddressSaved) onAddressSaved(data?.address || trimmed)
        } catch (err) {
            console.error('Error saving address:', err)
            setError(err?.message || 'Failed to save address. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const field = (name, { placeholder, required = true, className = '' } = {}) => (
        <div className={className}>
            <label htmlFor={`delivery-address-${name}`} className="block text-xs font-medium text-textColor mb-1.5">
                {FIELD_LABELS[name]} {required && <span className="text-red-500">*</span>}
            </label>
            <input
                id={`delivery-address-${name}`}
                type="text"
                name={name}
                placeholder={placeholder}
                value={address[name]}
                onChange={handleAddressChange}
                disabled={saving}
                autoComplete={name === 'street' ? 'address-line1' : name === 'unitNumber' ? 'address-line2' : name === 'city' ? 'address-level2' : name === 'state' ? 'address-level1' : name === 'postalCode' ? 'postal-code' : 'country-name'}
                className={inputClass}
            />
        </div>
    )

    return (
        <form
            onSubmit={handleSave}
            noValidate
            data-testid="delivery-address-form"
            className="rounded-lg border border-borderColor bg-baseColor overflow-hidden"
        >
            {title && (
                <div className="bg-textColor/5 p-4 border-b border-borderColor">
                    <div className="flex items-start gap-3">
                        <div className="shrink-0 w-9 h-9 bg-textColor/10 rounded-full flex items-center justify-center">
                            <HiLocationMarker className="text-textColor text-lg" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-textColor mb-0.5">{title}</h3>
                            {description && (
                                <p className="text-xs text-lightColor leading-relaxed">{description}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="p-4 space-y-3">
                {field('street', { placeholder: '123 Main Street' })}
                {field('unitNumber', { placeholder: '#04-12' })}
                <div className="grid grid-cols-2 gap-3">
                    {field('city', { placeholder: 'Singapore' })}
                    {field('state', { placeholder: 'Singapore' })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('postalCode', { placeholder: '123456' })}
                    {field('country', { placeholder: 'Singapore' })}
                </div>

                {error && (
                    <p role="alert" className="text-xs text-red-600">{error}</p>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 bg-textColor text-background rounded-md text-sm font-medium hover:bg-textColor/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
                                <span>Saving...</span>
                            </>
                        ) : (
                            <span>{saveLabel}</span>
                        )}
                    </button>
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={saving}
                            className="px-4 py-2.5 border border-borderColor rounded-md text-sm font-medium text-textColor hover:bg-background transition-all duration-200 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </form>
    )
}
