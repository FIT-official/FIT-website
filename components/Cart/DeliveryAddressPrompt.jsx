'use client'
import { useState } from 'react'
import { HiLocationMarker } from 'react-icons/hi'
import { useToast } from '@/components/General/ToastProvider'

export default function DeliveryAddressPrompt({ onAddressSaved }) {
    const [address, setAddress] = useState({
        street: '',
        unitNumber: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
    })
    const [saving, setSaving] = useState(false)
    const { showToast } = useToast()

    const handleAddressChange = (e) => {
        const { name, value } = e.target
        setAddress(prev => ({ ...prev, [name]: value }))
    }

    const handleSave = async () => {
        // Validate required fields
        if (!address.street || !address.city || !address.state || !address.postalCode || !address.country) {
            showToast('Please fill in all required address fields', 'error')
            return
        }

        setSaving(true)
        try {
            const response = await fetch('/api/user/contact/address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address })
            })

            if (response.ok) {
                showToast('Delivery address saved successfully!', 'success')
                if (onAddressSaved) onAddressSaved()
            } else {
                throw new Error('Failed to save address')
            }
        } catch (error) {
            console.error('Error saving address:', error)
            showToast('Failed to save address. Please try again.', 'error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="rounded-lg border-2 border-borderColor bg-baseColor overflow-hidden">
            <div className="bg-textColor/5 p-6 border-b border-borderColor">
                <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 bg-textColor/10 rounded-full flex items-center justify-center">
                        <HiLocationMarker className="text-textColor text-xl" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-textColor mb-1">
                            Delivery Address Required
                        </h3>
                        <p className="text-xs text-lightColor leading-relaxed">
                            Please add your delivery address to see accurate shipping costs and proceed with checkout.
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-4">
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-textColor mb-1.5">
                            Street Address <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="street"
                            placeholder="123 Main Street"
                            value={address.street}
                            onChange={handleAddressChange}
                            disabled={saving}
                            className="w-full px-3 py-2 text-sm border border-borderColor rounded-md bg-background text-textColor placeholder:text-extraLight focus:outline-none focus:ring-2 focus:ring-textColor/20 focus:border-textColor transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-textColor mb-1.5">
                            Unit / Apt Number
                        </label>
                        <input
                            type="text"
                            name="unitNumber"
                            placeholder="Apt 4B (optional)"
                            value={address.unitNumber}
                            onChange={handleAddressChange}
                            disabled={saving}
                            className="w-full px-3 py-2 text-sm border border-borderColor rounded-md bg-background text-textColor placeholder:text-extraLight focus:outline-none focus:ring-2 focus:ring-textColor/20 focus:border-textColor transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-textColor mb-1.5">
                                City <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="city"
                                placeholder="New York"
                                value={address.city}
                                onChange={handleAddressChange}
                                disabled={saving}
                                className="w-full px-3 py-2 text-sm border border-borderColor rounded-md bg-background text-textColor placeholder:text-extraLight focus:outline-none focus:ring-2 focus:ring-textColor/20 focus:border-textColor transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-textColor mb-1.5">
                                State / Province <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="state"
                                placeholder="NY"
                                value={address.state}
                                onChange={handleAddressChange}
                                disabled={saving}
                                className="w-full px-3 py-2 text-sm border border-borderColor rounded-md bg-background text-textColor placeholder:text-extraLight focus:outline-none focus:ring-2 focus:ring-textColor/20 focus:border-textColor transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-textColor mb-1.5">
                                Postal Code <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="postalCode"
                                placeholder="10001"
                                value={address.postalCode}
                                onChange={handleAddressChange}
                                disabled={saving}
                                className="w-full px-3 py-2 text-sm border border-borderColor rounded-md bg-background text-textColor placeholder:text-extraLight focus:outline-none focus:ring-2 focus:ring-textColor/20 focus:border-textColor transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-textColor mb-1.5">
                                Country <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="country"
                                placeholder="United States"
                                value={address.country}
                                onChange={handleAddressChange}
                                disabled={saving}
                                className="w-full px-3 py-2 text-sm border border-borderColor rounded-md bg-background text-textColor placeholder:text-extraLight focus:outline-none focus:ring-2 focus:ring-textColor/20 focus:border-textColor transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full px-4 py-3 bg-textColor text-background rounded-md text-sm font-medium hover:bg-textColor/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {saving ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
                            <span>Saving Address...</span>
                        </>
                    ) : (
                        <span>Save Delivery Address</span>
                    )}
                </button>
            </div>
        </div>
    )
}
