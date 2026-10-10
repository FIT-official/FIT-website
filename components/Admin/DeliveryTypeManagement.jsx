'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import { IoAddOutline, IoPencilOutline, IoTrashOutline } from 'react-icons/io5'
import { TbTruck } from 'react-icons/tb'
import { ActionIcon, DashCard, ConfirmDialog, StatusPill, Tag, EmptyState, SkeletonRow, CoachMarks, useTourOffer, TourOfferStrip, TourHelpButton, TOURS } from '@/components/dashboard-ui'
import DeliveryTypeFormSheet from './DeliveryTypeFormSheet'
import { DeliverySwitch, DeliveryTypeIcon, PricingStrip, sunBtnCls } from './deliveryTypeUi'

const BLANK_FORM = {
    name: '',
    displayName: '',
    description: '',
    applicableToProductTypes: [],
    basePricing: {
        basePrice: '',
        volumeFactor: '',
        weightFactor: '',
        minPrice: '',
        maxPrice: ''
    },
    isActive: true
}

const TYPE_LABELS = { shop: 'Shop', print: 'Print' }

export default function DeliveryTypeManagement() {
    const [deliveryTypes, setDeliveryTypes] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showDeliveryTypeForm, setShowDeliveryTypeForm] = useState(false)
    const [editingDeliveryType, setEditingDeliveryType] = useState(null)
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [tourOpen, setTourOpen] = useState(false)
    const tourOffer = useTourOffer('delivery')
    const { showToast } = useToast()

    const [formData, setFormData] = useState(BLANK_FORM)

    useEffect(() => {
        fetchDeliveryTypes()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const fetchDeliveryTypes = async () => {
        try {
            const response = await fetch('/api/admin/settings')
            const data = await response.json()
            if (response.ok) {
                setDeliveryTypes(data.deliveryTypes || [])
            } else {
                showToast('Failed to fetch delivery types', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    const openCreate = () => {
        setEditingDeliveryType(null)
        setFormData(BLANK_FORM)
        setShowDeliveryTypeForm(true)
    }

    const openEdit = (dt) => {
        setEditingDeliveryType(dt)
        setFormData({
            name: dt.name,
            displayName: dt.displayName,
            description: dt.description || '',
            applicableToProductTypes: dt.applicableToProductTypes || [],
            basePricing: {
                basePrice: dt.basePricing?.basePrice ?? '',
                volumeFactor: dt.basePricing?.volumeFactor ?? '',
                weightFactor: dt.basePricing?.weightFactor ?? '',
                minPrice: dt.basePricing?.minPrice ?? '',
                maxPrice: dt.basePricing?.maxPrice ?? '',
            },
            isActive: dt.isActive,
        })
        setShowDeliveryTypeForm(true)
    }

    const closeForm = () => {
        setShowDeliveryTypeForm(false)
        setEditingDeliveryType(null)
        setFormData(BLANK_FORM)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.name || !formData.displayName || formData.applicableToProductTypes.length === 0) {
            showToast('Please fill in all required fields', 'error')
            return
        }

        // Validate formula-based pricing fields if any are filled
        const bp = formData.basePricing || {}
        const hasFormula = bp.basePrice !== '' || bp.volumeFactor !== '' || bp.weightFactor !== '' || bp.minPrice !== '' || bp.maxPrice !== ''
        if (hasFormula) {
            const basePrice = parseFloat(bp.basePrice)
            const volumeFactor = parseFloat(bp.volumeFactor)
            const weightFactor = parseFloat(bp.weightFactor)
            const minPrice = parseFloat(bp.minPrice)
            const maxPrice = parseFloat(bp.maxPrice)

            if ([basePrice, volumeFactor, weightFactor].some(v => isNaN(v) || v < 0)) {
                showToast('Base price, volume factor, and weight factor must be non-negative numbers', 'error')
                return
            }
            if (!isNaN(minPrice) && !isNaN(maxPrice) && minPrice > maxPrice) {
                showToast('Minimum price cannot exceed maximum price', 'error')
                return
            }
        }

        setSaving(true)
        try {
            let response;
            if (editingDeliveryType) {
                // Edit mode - PUT to update existing delivery type
                response = await fetch('/api/admin/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'delivery-type',
                        id: editingDeliveryType._id,
                        data: {
                            displayName: formData.displayName,
                            description: formData.description,
                            applicableToProductTypes: formData.applicableToProductTypes,
                            basePricing: formData.basePricing,
                            isActive: formData.isActive,
                        }
                    })
                })
            } else {
                // Add mode - POST to create new delivery type
                response = await fetch('/api/admin/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'deliveryType',
                        action: 'add',
                        data: formData
                    })
                })
            }

            const result = await response.json()
            if (response.ok) {
                showToast(editingDeliveryType ? 'Delivery type updated!' : 'Delivery type added!', 'success')

                // Notify affected creators if editing
                if (editingDeliveryType) {
                    try {
                        await fetch('/api/admin/notify-delivery-change', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                deliveryTypeName: editingDeliveryType.name,
                                changes: formData,
                            })
                        })
                    } catch (e) {
                        console.error('Failed to notify creators:', e)
                    }
                }

                closeForm()
                fetchDeliveryTypes()
            } else {
                showToast(result.error || 'Failed to add', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    // Delete goes through ConfirmDialog (window.confirm is banned — §4.10).
    const confirmDelete = async () => {
        const name = deleteTarget?.name
        setDeleteBusy(true)
        try {
            const deliveryType = deliveryTypes.find(dt => dt.name === name && !dt.isHardcoded)
            if (!deliveryType || !deliveryType._id) {
                showToast('Unable to delete: missing id for this delivery type', 'error')
                return
            }

            const response = await fetch('/api/admin/settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'delivery-type', id: deliveryType._id })
            })

            if (response.ok) {
                showToast('Deleted!', 'success')
                fetchDeliveryTypes()
            } else {
                showToast('Failed to delete', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        } finally {
            setDeleteBusy(false)
            setDeleteTarget(null)
        }
    }

    const handleToggleActive = async (name, isActive) => {
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'delivery-type',
                    action: 'toggleActive',
                    name,
                    isActive: !isActive
                })
            })

            if (response.ok) {
                showToast('Updated!', 'success')
                fetchDeliveryTypes()
            } else {
                showToast('Failed to update', 'error')
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error')
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col gap-3 p-4 md:p-6" aria-label="Loading delivery types">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4 p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="dash-title">Delivery</h2>
                    <p className="text-[13px] dash-soft mt-1">
                        The shipping options customers pick at checkout. Digital delivery is always available.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {deliveryTypes.length > 0 && (
                        <button onClick={openCreate} data-tour="delivery-new" className={`${sunBtnCls} flex items-center gap-1.5`}>
                            <IoAddOutline size={16} aria-hidden="true" />
                            New Delivery Type
                        </button>
                    )}
                    <TourHelpButton onClick={() => setTourOpen(true)} />
                </div>
            </div>

            {tourOffer.offered && !tourOpen && (
                <TourOfferStrip
                    onStart={() => { tourOffer.accept(); setTourOpen(true) }}
                    onDismiss={tourOffer.dismiss}
                />
            )}

            {/* Delivery types — icon cards with a sentence-style pricing strip (§5.14) */}
            <DashCard
                data-tour="delivery-list"
                title="All delivery types"
                action={<span className="text-[13px] dash-soft"><span className="dash-data">{deliveryTypes.length}</span> total</span>}
            >
                {deliveryTypes.length === 0 ? (
                    <EmptyState
                        icon={<TbTruck />}
                        title="No Delivery Types Yet"
                        body="Create delivery options for creators to use on their products."
                        cta="Add Delivery Type"
                        onCta={openCreate}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {deliveryTypes.map((dt, idx) => (
                            <div
                                key={dt.name || idx}
                                data-delivery-card="true"
                                className="border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] p-4"
                            >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <DeliveryTypeIcon dt={dt} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[14px] font-semibold text-[var(--dash-ink)]">{dt.displayName}</span>
                                                <span className="font-mono text-[12px] font-medium dash-soft">{dt.name}</span>
                                                {dt.isHardcoded && <StatusPill tone="hatch">Built-in</StatusPill>}
                                                {dt.applicableToProductTypes?.map(type => (
                                                    <Tag key={type}>{TYPE_LABELS[type] || type}</Tag>
                                                ))}
                                            </div>
                                            <div className="mt-2">
                                                <PricingStrip basePricing={dt.basePricing} />
                                            </div>
                                            {dt.description && (
                                                <p className="text-[13px] dash-soft mt-2">{dt.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <DeliverySwitch
                                            checked={dt.isActive}
                                            onChange={() => handleToggleActive(dt.name, dt.isActive)}
                                            label={`${dt.displayName} active`}
                                            data-tour="delivery-toggle"
                                        />
                                        {!dt.isHardcoded && (
                                            <>
                                                <ActionIcon
                                                    icon={IoPencilOutline}
                                                    label={`Edit ${dt.displayName}`}
                                                    onClick={() => openEdit(dt)}
                                                />
                                                <ActionIcon
                                                    icon={IoTrashOutline}
                                                    tone="bad"
                                                    label={`Delete ${dt.displayName}`}
                                                    onClick={() => setDeleteTarget(dt)}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DashCard>

            {/* Create / edit — stepped sheet flow (§5.14 + client feedback) */}
            <DeliveryTypeFormSheet
                open={showDeliveryTypeForm}
                onClose={closeForm}
                editing={!!editingDeliveryType}
                formData={formData}
                setFormData={setFormData}
                saving={saving}
                onSubmit={handleSubmit}
            />

            {/* Delete confirmation — never window.confirm (§4.10) */}
            <ConfirmDialog
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Delete this delivery type?"
                body={deleteTarget ? `"${deleteTarget.displayName}" will no longer be available to creators or customers.` : ''}
                confirmLabel="Delete"
                tone="bad"
                busy={deleteBusy}
            />

            {/* Guided tour (§9.11) */}
            <CoachMarks steps={TOURS.delivery} open={tourOpen} onClose={() => setTourOpen(false)} panelKey="delivery" />
        </div>
    )
}
