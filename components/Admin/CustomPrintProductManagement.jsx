'use client'
import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import PricingFields from '@/components/DashboardComponents/ProductFormFields/PricingFields'
import ShippingFields from '@/components/DashboardComponents/ProductFormFields/ShippingFields'
import DiscountsField from '@/components/DashboardComponents/ProductFormFields/DiscountsField'
import ImagesField from '@/components/DashboardComponents/ProductFormFields/ImagesField'
import { uploadImages } from '@/utils/uploadHelpers'
import {
    handleImageChange as handleImageChangeHelper,
    handleImageDrop as handleImageDropHelper,
    handleRemoveImage as handleRemoveImageHelper,
} from '@/utils/formHelpers'

export default function CustomPrintProductManagement() {
    const [product, setProduct] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [events, setEvents] = useState([])
    const [allCurrencies] = useState(['SGD', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'CNY', 'HKD', 'MYR', 'THB', 'INR'])
    const { showToast } = useToast()

    // Image upload state
    const imageInputRef = useRef(null)
    const [pendingImages, setPendingImages] = useState([])
    const [imageValidationErrors, setImageValidationErrors] = useState([])

    const [form, setForm] = useState({
        name: 'Custom 3D Print',
        description: '',
        images: [],
        basePrice: {
            presentmentCurrency: 'SGD',
            presentmentAmount: 0
        },
        priceCredits: 0,
        delivery: {
            deliveryTypes: []
        },
        discount: {
            eventId: '',
            percentage: '',
            minimumPrice: '',
            startDate: '',
            endDate: '',
            tiers: [],
        },
        showDiscount: false,
        productType: 'print'
    })

    useEffect(() => {
        loadProduct()
        loadEvents()
    }, [])

    const loadEvents = async () => {
        try {
            const response = await fetch('/api/admin/events')
            if (response.ok) {
                const data = await response.json()
                setEvents(data.events || [])
            }
        } catch (error) {
            console.error('Error loading events:', error)
        }
    }

    const loadProduct = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/product/custom-print-config')
            if (response.ok) {
                const data = await response.json()
                if (data.product) {
                    setProduct(data.product)
                    setForm({
                        name: data.product.name || 'Custom 3D Print',
                        description: data.product.description || '',
                        images: data.product.images || [],
                        basePrice: data.product.basePrice || { presentmentCurrency: 'SGD', presentmentAmount: 0 },
                        priceCredits: data.product.priceCredits || 0,
                        delivery: data.product.delivery || { deliveryTypes: [] },
                        discount: data.product.discount || { eventId: '', percentage: '', minimumPrice: '', startDate: '', endDate: '' },
                        showDiscount: !!data.product.discount?.percentage || !!data.product.discount?.eventId,
                        productType: 'print'
                    })
                }
            }
        } catch (error) {
            console.error('Error loading custom print product:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target

        setForm(prev => ({
            ...prev,
            [name]: value
        }))
    }

    const handleSave = async () => {
        setSaving(true)
        let uploadedImages = []
        let allUploadedFiles = []

        try {
            // Upload images first
            if (pendingImages.length > 0) {
                uploadedImages = await uploadImages(pendingImages)
                allUploadedFiles.push(...uploadedImages)
            }

            const normalizedBasePrice = {
                presentmentCurrency: form.basePrice.presentmentCurrency,
                presentmentAmount: form.basePrice.presentmentAmount === '' ? 0 : parseFloat(form.basePrice.presentmentAmount) || 0
            }

            const normalizedPriceCredits = form.priceCredits === '' ? 0 : parseInt(form.priceCredits) || 0

            const response = await fetch('/api/product/custom-print-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    description: form.description,
                    images: [...(form.images || []), ...uploadedImages],
                    basePrice: normalizedBasePrice,
                    priceCredits: normalizedPriceCredits,
                    delivery: form.delivery,
                    discount: form.showDiscount ? form.discount : {}
                })
            })

            if (response.ok) {
                showToast('Custom print product updated successfully!', 'success')
                setPendingImages([])
                loadProduct()
            } else {
                const error = await response.json()

                // Cleanup uploaded files on error
                if (allUploadedFiles.length > 0) {
                    try {
                        await fetch('/api/asset', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ keys: allUploadedFiles })
                        })
                    } catch (cleanupError) {
                        console.error('Error cleaning up uploaded files:', cleanupError)
                    }
                }

                throw new Error(error.error || 'Failed to update product')
            }
        } catch (error) {
            console.error('Error saving:', error)
            showToast(error.message || 'Failed to update product', 'error')
        } finally {
            setSaving(false)
        }
    }

    // Image upload handlers
    const handleImageChange = (e) => handleImageChangeHelper(e, setPendingImages, setImageValidationErrors)
    const handleImageDrop = (fileList) => handleImageDropHelper(fileList, setPendingImages, setImageValidationErrors)
    const handleRemoveImage = (idx) => handleRemoveImageHelper(idx, form, setForm, pendingImages, setPendingImages, imageInputRef, setImageValidationErrors)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-textColor border-t-transparent"></div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4 sm:gap-6 p-6 md:p-12  min-h-screen">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-textColor mb-2">Custom 3D Print Product</h2>
                <p className="text-xs text-lightColor">
                    Configure pricing, delivery, and discount settings for custom 3D print requests. This product has no variants.
                </p>
            </div>

            {product && (
                <div className="mb-4 bg-baseColor p-4 rounded-md border border-borderColor">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-lightColor">Product ID</span>
                        <code className="text-xs bg-borderColor/30 px-2 py-1 rounded">{product._id}</code>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {/* Product Details Section */}
                <div className="border border-borderColor rounded-lg overflow-hidden">
                    <div className="bg-borderColor/40 w-full px-4 py-2 border-b border-borderColor">
                        <h3 className="text-sm font-medium text-textColor">Product Details</h3>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="flex flex-col gap-2">
                            <label htmlFor="name" className="text-xs font-medium text-lightColor">Product Name</label>
                            <input
                                id="name"
                                name="name"
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                className="formInput text-sm"
                                placeholder="Custom 3D Print"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label htmlFor="description" className="text-xs font-medium text-lightColor">Description</label>
                            <textarea
                                id="description"
                                name="description"
                                value={form.description}
                                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                className="formInput text-sm min-h-32"
                                placeholder="Describe your custom 3D printing service..."
                            />
                        </div>

                        <ImagesField
                            form={form}
                            imageValidationErrors={imageValidationErrors}
                            imageInputRef={imageInputRef}
                            handleImageChange={handleImageChange}
                            handleImageDrop={handleImageDrop}
                            handleRemoveImage={handleRemoveImage}
                            pendingImages={pendingImages}
                        />
                    </div>
                </div>

                <PricingFields
                    form={form}
                    setForm={setForm}
                    allCurrencies={allCurrencies}
                />

                <ShippingFields
                    form={form}
                    handleChange={handleChange}
                    setForm={setForm}
                    hideDimensions
                    hidePriceEditor
                />

                <DiscountsField
                    form={form}
                    setForm={setForm}
                    events={events}
                />

                <div className="pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="w-full px-4 py-3 bg-textColor text-background rounded-md text-sm font-medium hover:bg-textColor/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Saving Changes...' : 'Save Custom Print Configuration'}
                    </button>
                </div>
            </div>
        </div>
    )
}
