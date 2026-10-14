import React, { useState } from 'react'
import { RxCross1 } from 'react-icons/rx'
import { MdAdd } from 'react-icons/md'
import { InfoStrip, inputCls, labelCls, quietBtnCls } from './dashFormUi'

/**
 * Variant types & options, document-styled (blueprint §5.5). Options are
 * editable chip-cards; the add-option row is controlled React state (the old
 * imperative document.getElementById reads were a bug class). Payload shape
 * is unchanged: variantTypes[{ name, options[{ name, additionalFee, stock,
 * image, hex }] }].
 */

const emptyDraft = { name: '', fee: '', stock: '', hex: undefined, file: null, fileKey: 0 }

export default function VariantTypesField({ form, setForm, isDigitalDelivery, onVariantImageUpload, productType, printColours = [] }) {
    // Check if digital delivery is selected
    const isDigitalProduct = !!isDigitalDelivery
    const [newTypeName, setNewTypeName] = useState('')
    // Per-variant-type add-option drafts, keyed by type index.
    const [drafts, setDrafts] = useState({})

    // Colour-type variants (e.g. "Colour", "Color") get a colour palette: the
    // admin print-filament catalogue for print products (exclusive to prints),
    // a free-form picker for shop products.
    const isColourType = (name) => /colou?r/i.test(name || '')

    const draftFor = (idx) => ({ ...emptyDraft, ...(drafts[idx] || {}) })
    const setDraft = (idx, patch) =>
        setDrafts(prev => ({ ...prev, [idx]: { ...emptyDraft, ...(prev[idx] || {}), ...patch } }))

    const typeLimitReached = (isDigitalProduct && form.variantTypes?.length >= 1) || form.variantTypes?.length >= 5

    const addVariantType = () => {
        const name = newTypeName.trim()
        if (name && !(isDigitalProduct && form.variantTypes?.length >= 1)) {
            setForm(f => ({
                ...f,
                variantTypes: [...(f.variantTypes || []), { name, options: [] }]
            }));
            setNewTypeName('')
        }
    }

    const removeVariantType = (typeIdx) => {
        setForm(f => ({
            ...f,
            variantTypes: f.variantTypes.filter((_, i) => i !== typeIdx)
        }));
        // Drafts are keyed by index; indices shift on removal, so reset them.
        setDrafts({})
    }

    const addOption = async (typeIdx, variantType) => {
        if (isDigitalProduct && variantType.options?.length >= 1) return
        const draft = draftFor(typeIdx)
        const name = (draft.name || '').trim()
        if (!name) return

        const additionalFee = parseFloat(draft.fee) || 0
        const stock = draft.stock !== '' && draft.stock !== undefined ? parseInt(draft.stock) : undefined

        let imageKey = null;
        if (onVariantImageUpload && draft.file) {
            try {
                imageKey = await onVariantImageUpload(draft.file);
            } catch (e) {
                console.error('Failed to upload variant image:', e);
            }
        }
        const hex = isColourType(variantType.name) ? (draft.hex ?? null) : null;
        setForm(f => ({
            ...f,
            variantTypes: f.variantTypes.map((vt, i) =>
                i === typeIdx
                    ? { ...vt, options: [...(vt.options || []), { name, additionalFee, stock, image: imageKey, hex }] }
                    : vt
            )
        }));
        setDrafts(prev => ({
            ...prev,
            [typeIdx]: { ...emptyDraft, fileKey: ((prev[typeIdx]?.fileKey) || 0) + 1 },
        }))
    }

    const removeOption = (typeIdx, optionIdx) => {
        setForm(f => ({
            ...f,
            variantTypes: f.variantTypes.map((vt, i) =>
                i === typeIdx
                    ? { ...vt, options: vt.options.filter((_, j) => j !== optionIdx) }
                    : vt
            )
        }));
    }

    return (
        <div className="w-full space-y-4">
            {isDigitalProduct ? (
                <InfoStrip tone="info" title="Only one variant configuration allowed">
                    <p>For digital products, customers receive a single downloadable item. To avoid confusion and file access issues, only one variant type with one option is permitted. All variant controls are disabled while digital delivery is active.</p>
                </InfoStrip>
            ) : (
                <InfoStrip tone="info">
                    Create variant types like Color, Size, or Material. Customers select one option from each type, and fees are added to the base price.
                </InfoStrip>
            )}

            {/* Add new variant type */}
            <div className="space-y-2">
                <label htmlFor="variantTypeName" className={labelCls}>
                    Add Variant Type ({form.variantTypes?.length || 0}/5)
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        className={inputCls()}
                        placeholder="e.g., Color, Size, Material"
                        maxLength={50}
                        id="variantTypeName"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        disabled={typeLimitReached}
                    />
                    <button
                        type="button"
                        className={`${quietBtnCls} whitespace-nowrap`}
                        disabled={typeLimitReached || !newTypeName.trim()}
                        onClick={addVariantType}
                    >
                        <MdAdd className="inline mr-1" aria-hidden="true" />
                        Add Type
                    </button>
                </div>
                <p className="text-[13px] text-[var(--dash-ink-soft)]">
                    Example: &quot;Color&quot; for options like Red, Blue, Green
                </p>
            </div>

            {/* Existing variant types */}
            {form.variantTypes?.length > 0 && form.variantTypes.map((variantType, typeIdx) => {
                const draft = draftFor(typeIdx)
                const optionLocked = isDigitalProduct && variantType.options?.length >= 1
                return (
                    <div key={typeIdx} className="border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] bg-[var(--dash-card)]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--dash-line)]">
                            <div>
                                <h5 className="text-[13px] font-medium">{variantType.name}</h5>
                                <p className="text-[13px] text-[var(--dash-ink-soft)]">
                                    {variantType.options?.length || 0} {variantType.options?.length === 1 ? 'option' : 'options'}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label={`Remove variant type ${variantType.name}`}
                                onClick={() => removeVariantType(typeIdx)}
                                className="p-1.5 rounded-full cursor-pointer text-[var(--dash-ink-soft)] hover:text-[var(--dash-bad)] hover:bg-[var(--dash-bad-bg)]"
                            >
                                <RxCross1 size={14} />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Add option (controlled) */}
                            <div className="space-y-3">
                                <span className={labelCls}>Add Option</span>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <label htmlFor={`optionName-${typeIdx}`} className={labelCls}>Option Name</label>
                                        <input
                                            type="text"
                                            className={inputCls()}
                                            placeholder="e.g., Red, Large, Plastic"
                                            id={`optionName-${typeIdx}`}
                                            value={draft.name}
                                            onChange={(e) => setDraft(typeIdx, { name: e.target.value })}
                                            disabled={optionLocked}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor={`optionFee-${typeIdx}`} className={labelCls}>Additional Fee</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[var(--dash-ink-soft)] text-[13px]">$</span>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                className={`${inputCls()} dash-data flex-1`}
                                                placeholder="0.00"
                                                id={`optionFee-${typeIdx}`}
                                                value={draft.fee}
                                                onChange={(e) => setDraft(typeIdx, { fee: e.target.value })}
                                                disabled={optionLocked}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor={`optionStock-${typeIdx}`} className={labelCls}>Stock</label>
                                        <input
                                            type="number"
                                            min={0}
                                            className={`${inputCls()} dash-data`}
                                            placeholder="10"
                                            id={`optionStock-${typeIdx}`}
                                            value={draft.stock}
                                            onChange={(e) => setDraft(typeIdx, { stock: e.target.value })}
                                            disabled={optionLocked}
                                        />
                                    </div>
                                </div>

                                {isColourType(variantType.name) && (
                                    <div className="space-y-2">
                                        <span className={labelCls}>Colour</span>
                                        {productType === 'print' ? (
                                            printColours.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    <p className="text-[13px] text-[var(--dash-ink-soft)]">Printing colours must match available filament stock.</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {printColours.map((c) => {
                                                            const selected = draft.hex === c.hex
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    key={c.name}
                                                                    title={c.hex}
                                                                    onClick={() => setDraft(typeIdx, { name: c.name, hex: c.hex })}
                                                                    className={`dash-hoverable flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] cursor-pointer ${selected ? 'border-[var(--dash-ink)] bg-[var(--dash-sun-soft)]' : 'border-[var(--dash-line)] hover:bg-[var(--dash-canvas)]'}`}
                                                                >
                                                                    <span className="inline-block h-3 w-3 rounded-full border border-[var(--dash-line)]" style={{ backgroundColor: c.hex }} />
                                                                    {c.name}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <InfoStrip tone="warn">
                                                    No printing colours configured yet. Add them in your admin colour catalogue.
                                                </InfoStrip>
                                            )
                                        ) : (
                                            <div className="space-y-1.5">
                                                <p className="text-[13px] text-[var(--dash-ink-soft)]">Pick any colour. Print filament colours are reserved for print products.</p>
                                                <input
                                                    type="color"
                                                    value={draft.hex || '#000000'}
                                                    onChange={(e) => setDraft(typeIdx, { hex: e.target.value })}
                                                    className="h-8 w-16 rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] cursor-pointer"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {onVariantImageUpload && (
                                    <div className="space-y-1.5">
                                        <label htmlFor={`optionImage-${typeIdx}`} className={labelCls}>Variant Image (optional)</label>
                                        <input
                                            key={draft.fileKey}
                                            type="file"
                                            accept="image/*"
                                            id={`optionImage-${typeIdx}`}
                                            className={`${inputCls()} cursor-pointer`}
                                            onChange={(e) => setDraft(typeIdx, { file: e.target.files?.[0] || null })}
                                            disabled={optionLocked}
                                        />
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className={`${quietBtnCls} w-full`}
                                    disabled={optionLocked || !draft.name.trim()}
                                    onClick={() => addOption(typeIdx, variantType)}
                                >
                                    <MdAdd className="inline mr-1" aria-hidden="true" />
                                    Add Option
                                </button>
                            </div>

                            {/* Options as chip-cards */}
                            {variantType.options?.length > 0 && (
                                <div className="space-y-2">
                                    <span className={labelCls}>Available Options</span>
                                    <div className="flex flex-wrap gap-2">
                                        {variantType.options.map((option, optionIdx) => (
                                            <div key={optionIdx} className="flex items-center gap-2.5 border border-[var(--dash-line)] bg-[var(--dash-card)] pl-3 pr-2 py-1.5 rounded-full">
                                                {option.image && (
                                                    <img
                                                        src={`/api/proxy?key=${encodeURIComponent(option.image)}`}
                                                        alt={option.name}
                                                        className="w-6 h-6 rounded-full object-cover border border-[var(--dash-line)]"
                                                    />
                                                )}
                                                {option.hex && (
                                                    <span className="w-3.5 h-3.5 rounded-full border border-[var(--dash-line)]" style={{ backgroundColor: option.hex }} title={option.hex}></span>
                                                )}
                                                <span className="text-[13px] font-medium">{option.name}</span>
                                                {productType === 'shop' && <select aria-label={`${option.name} restocking status`} value={option.restockStatus || 'unknown'}
                                                    onChange={e => setForm(f => ({ ...f, variantTypes: f.variantTypes.map((type, index) => index === typeIdx
                                                        ? { ...type, options: type.options.map((value, index) => index === optionIdx ? { ...value, restockStatus: e.target.value } : value) } : type) }))}>
                                                    <option value="unknown">Restocking unconfirmed</option><option value="expected">Restocking expected</option><option value="not_restocked">Will not be restocked</option>
                                                </select>}
                                                {option.additionalFee > 0 && (
                                                    <span className="dash-data text-[var(--dash-ok)]">
                                                        +${option.additionalFee.toFixed(2)}
                                                    </span>
                                                )}
                                                {option.stock !== undefined && option.stock !== null && (
                                                    <span className="dash-data text-[var(--dash-ink-soft)]">
                                                        Stock: {option.stock}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    aria-label={`Remove option ${option.name}`}
                                                    onClick={() => removeOption(typeIdx, optionIdx)}
                                                    className="p-1 rounded-full cursor-pointer text-[var(--dash-ink-soft)] hover:text-[var(--dash-bad)] hover:bg-[var(--dash-bad-bg)]"
                                                >
                                                    <RxCross1 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {variantType.options?.length === 0 && (
                                <p className="text-[13px] text-[var(--dash-ink-soft)]">No options yet. Add your first option above.</p>
                            )}
                        </div>
                    </div>
                )
            })}

            {/* Empty state */}
            {form.variantTypes?.length === 0 && !isDigitalProduct && (
                <p className="text-[13px] text-[var(--dash-ink-soft)]">No variant types yet, so customers will buy the base configuration.</p>
            )}
        </div>
    )
}
