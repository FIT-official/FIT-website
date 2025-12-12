import React, { useState } from 'react'
import { RxCross1 } from 'react-icons/rx'
import { MdExpandMore, MdExpandLess, MdOutlineLightbulb, MdAdd } from 'react-icons/md'
import { BiPalette } from 'react-icons/bi'
import { IoMdPricetag } from 'react-icons/io'

export default function VariantTypesField({ form, setForm, isDigitalDelivery }) {
    // Check if digital delivery is selected
    const isDigitalProduct = !!isDigitalDelivery
    const [expandedVariants, setExpandedVariants] = useState(false)
    const [expandedVariantTypes, setExpandedVariantTypes] = useState({})

    const toggleVariantType = (index) => {
        setExpandedVariantTypes(prev => ({
            ...prev,
            [index]: !prev[index]
        }))
    }

    return (
        <div className="border border-borderColor rounded-lg overflow-hidden transition-all duration-200 hover:border-extraLight w-full">
            <button
                type="button"
                onClick={() => setExpandedVariants(!expandedVariants)}
                className="w-full p-4 flex items-center justify-between bg-background hover:bg-extraLight/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <BiPalette className="text-textColor text-xl" />
                    <div className="text-left">
                        <h3 className="font-medium text-sm text-textColor">Variant Types</h3>
                        <p className="text-xs text-extraLight mt-0.5">
                            {isDigitalProduct
                                ? 'Digital products are sold as a single configuration.'
                                : form.variantTypes?.length > 0
                                    ? `${form.variantTypes.length} variant ${form.variantTypes.length === 1 ? 'type' : 'types'} (${form.variantTypes.reduce((sum, vt) => sum + (vt.options?.length || 0), 0)} total options)`
                                    : 'Add customization options (max 5 types)'}
                        </p>
                    </div>
                </div>
                {expandedVariants ? (
                    <MdExpandLess className="text-xl text-lightColor transition-transform" />
                ) : (
                    <MdExpandMore className="text-xl text-lightColor transition-transform" />
                )}
            </button>

            {expandedVariants && (
                <div className="p-4 border-t border-borderColor bg-baseColor animate-slideDown space-y-4">
                    {isDigitalProduct ? (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded flex gap-2 items-start text-xs text-blue-950">
                            <MdOutlineLightbulb className="flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-1">
                                <p className="font-semibold">Only one variant configuration allowed</p>
                                <p>For digital products, customers receive a single downloadable item. To avoid confusion and file access issues, only one variant type with one option is permitted. All variant controls are disabled while digital delivery is active.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded flex gap-2 items-start text-xs font-medium text-blue-950">
                            <MdOutlineLightbulb className="flex-shrink-0 mt-0.5" />
                            <span>Create variant types like Color, Size, or Material. Customers select one option from each type, and fees are added to the base price.</span>
                        </div>
                    )}

                    {/* Add new variant type form */}
                    <div className={`border-2 border-dashed rounded-lg p-4 transition-all ${(isDigitalProduct && form.variantTypes?.length >= 1) || form.variantTypes?.length >= 5
                        ? 'border-borderColor bg-borderColor/10 opacity-50'
                        : 'border-purple-200 bg-purple-50/30 hover:bg-purple-50/50'
                        }`}>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <MdAdd className="text-textColor text-lg" />
                                <h4 className="text-xs font-semibold text-textColor uppercase tracking-wide">
                                    Add New Variant Type ({form.variantTypes?.length || 0}/5)
                                </h4>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-lightColor">Variant Type Name</label>
                                <input
                                    type="text"
                                    className="formInput text-sm"
                                    placeholder="e.g., Color, Size, Material"
                                    maxLength={50}
                                    id="variantTypeName"
                                    disabled={(isDigitalProduct && form.variantTypes?.length >= 1) || form.variantTypes?.length >= 5}
                                />
                                <p className="text-xs text-extraLight">
                                    Example: "Color" for options like Red, Blue, Green
                                </p>
                            </div>

                            <button
                                type="button"
                                className="formBlackButton w-full"
                                disabled={(isDigitalProduct && form.variantTypes?.length >= 1) || form.variantTypes?.length >= 5}
                                onClick={() => {
                                    const input = document.getElementById('variantTypeName');
                                    const name = input.value.trim();
                                    if (name && !(isDigitalProduct && form.variantTypes?.length >= 1)) {
                                        setForm(f => ({
                                            ...f,
                                            variantTypes: [...(f.variantTypes || []), { name, options: [] }]
                                        }));
                                        input.value = '';
                                    }
                                }}
                            >
                                <MdAdd className="inline mr-1" />
                                Add Variant Type
                            </button>
                        </div>
                    </div>

                    {/* Display existing variant types */}
                    {form.variantTypes?.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-textColor uppercase tracking-wide">
                                Your Variant Types
                            </h4>

                            {form.variantTypes.map((variantType, typeIdx) => (
                                <div key={typeIdx} className="border border-borderColor rounded-lg overflow-hidden bg-white shadow-sm">
                                    {/* Variant Type Header */}
                                    <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-borderColor">
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => toggleVariantType(typeIdx)}
                                                className="flex items-center gap-2 flex-1 text-left"
                                            >
                                                <BiPalette className="text-purple-600" />
                                                <div className="flex-1">
                                                    <h5 className="font-semibold text-sm text-textColor">{variantType.name}</h5>
                                                    <p className="text-xs text-extraLight">
                                                        {variantType.options?.length || 0} {variantType.options?.length === 1 ? 'option' : 'options'}
                                                    </p>
                                                </div>
                                                {expandedVariantTypes[typeIdx] ? (
                                                    <MdExpandLess className="text-lightColor" />
                                                ) : (
                                                    <MdExpandMore className="text-lightColor" />
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setForm(f => ({
                                                        ...f,
                                                        variantTypes: f.variantTypes.filter((_, i) => i !== typeIdx)
                                                    }));
                                                }}
                                                className="ml-2 p-1.5 hover:bg-red-50 rounded transition-colors group"
                                            >
                                                <RxCross1 className="text-lightColor group-hover:text-red-600 transition-colors" size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Variant Type Content */}
                                    {expandedVariantTypes[typeIdx] !== false && (
                                        <div className="p-4 space-y-4 animate-slideDown">
                                            {/* Add option form */}
                                                            <div className="space-y-3 p-3 bg-extraLight/10 rounded-lg border border-borderColor">
                                                <div className="flex items-center gap-2">
                                                    <IoMdPricetag className="text-textColor text-sm" />
                                                    <span className="text-xs font-semibold text-textColor uppercase tracking-wide">
                                                        Add Option
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-lightColor">Option Name</label>
                                                        <input
                                                            type="text"
                                                            className="formInput text-sm"
                                                            placeholder="e.g., Red, Large, Plastic"
                                                            id={`optionName-${typeIdx}`}
                                                            disabled={isDigitalProduct && variantType.options?.length >= 1}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-lightColor">Additional Fee</label>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lightColor text-sm font-medium">$</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                className="formInput text-sm flex-1"
                                                                placeholder="0.00"
                                                                id={`optionFee-${typeIdx}`}
                                                                disabled={isDigitalProduct && variantType.options?.length >= 1}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    className="formButton text-sm w-full"
                                                    disabled={isDigitalProduct && variantType.options?.length >= 1}
                                                    onClick={() => {
                                                        if (!(isDigitalProduct && variantType.options?.length >= 1)) {
                                                            const nameInput = document.getElementById(`optionName-${typeIdx}`);
                                                            const feeInput = document.getElementById(`optionFee-${typeIdx}`);
                                                            const name = nameInput.value.trim();
                                                            const additionalFee = parseFloat(feeInput.value) || 0;

                                                            if (name) {
                                                                setForm(f => ({
                                                                    ...f,
                                                                    variantTypes: f.variantTypes.map((vt, i) =>
                                                                        i === typeIdx
                                                                            ? { ...vt, options: [...(vt.options || []), { name, additionalFee, stock: 1 }] }
                                                                            : vt
                                                                    )
                                                                }));
                                                                nameInput.value = '';
                                                                feeInput.value = '';
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <MdAdd className="inline mr-1" />
                                                    Add Option
                                                </button>
                                            </div>

                                            {/* Display options */}
                                            {variantType.options?.length > 0 && (
                                                <div className="space-y-2">
                                                    <h6 className="text-xs font-semibold text-textColor uppercase tracking-wide">
                                                        Available Options
                                                    </h6>
                                                    {variantType.options.map((option, optionIdx) => (
                                                        <div key={optionIdx} className="flex items-center justify-between bg-white border border-borderColor p-3 rounded-lg hover:shadow-sm transition-shadow group">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                                                <div>
                                                                    <span className="text-sm font-medium text-textColor">{option.name}</span>
                                                                    {option.additionalFee > 0 && (
                                                                        <span className="ml-2 text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-semibold">
                                                                            +${option.additionalFee.toFixed(2)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setForm(f => ({
                                                                        ...f,
                                                                        variantTypes: f.variantTypes.map((vt, i) =>
                                                                            i === typeIdx
                                                                                ? { ...vt, options: vt.options.filter((_, j) => j !== optionIdx) }
                                                                                : vt
                                                                        )
                                                                    }));
                                                                }}
                                                                className="p-1.5 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <RxCross1 className="text-lightColor hover:text-red-600 transition-colors" size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {variantType.options?.length === 0 && (
                                                <div className="text-center py-6 border-2 border-dashed border-borderColor rounded-lg bg-extraLight/5">
                                                    <IoMdPricetag className="text-3xl text-extraLight mx-auto mb-2" />
                                                    <p className="text-xs text-extraLight">No options yet</p>
                                                    <p className="text-xs text-extraLight">Add your first option above</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {form.variantTypes?.length === 0 && !isDigitalProduct && (
                        <div className="text-center py-8 border-2 border-dashed border-borderColor rounded-lg bg-extraLight/5">
                            <BiPalette className="text-4xl text-extraLight mx-auto mb-3" />
                            <p className="text-sm text-lightColor font-medium">No variant types yet</p>
                            <p className="text-xs text-extraLight mt-1">Add your first variant type above</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
