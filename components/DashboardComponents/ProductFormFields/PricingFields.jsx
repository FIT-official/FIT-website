import React, { useState } from 'react'
import SelectField from '../SelectField'
import FieldErrorBanner from './FieldErrorBanner'
import { MdExpandMore, MdExpandLess, MdAttachMoney, MdOutlineLightbulb } from 'react-icons/md'
import { BiCoin } from 'react-icons/bi'
import { HiCurrencyDollar } from 'react-icons/hi'

export default function PricingFields({ form, setForm, allCurrencies, missingFields = [] }) {
    const [expandedPricing, setExpandedPricing] = useState(false)

    const basePriceMissing = missingFields.includes('basePrice')
    const priceCreditsMissing = missingFields.includes('priceCredits')

    return (
        <div className="border border-borderColor rounded-lg overflow-hidden transition-all duration-200 hover:border-extraLight w-full">
            <button
                type="button"
                onClick={() => setExpandedPricing(!expandedPricing)}
                className="w-full p-4 flex items-center justify-between bg-background hover:bg-extraLight/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <HiCurrencyDollar className="text-textColor text-xl" />
                    <div className="text-left">
                        <h3 className="font-medium text-sm text-textColor">Pricing</h3>
                        <p className="text-xs text-extraLight mt-0.5">
                            {form.basePrice?.presentmentAmount > 0
                                ? `${form.basePrice?.presentmentCurrency || 'SGD'} ${form.basePrice?.presentmentAmount?.toFixed(2) || '0.00'}${form.priceCredits > 0 ? ` or ${form.priceCredits} credits` : ''}`
                                : 'Set the base price for your product'}
                        </p>
                    </div>
                </div>
                {expandedPricing ? (
                    <MdExpandLess className="text-xl text-lightColor transition-transform" />
                ) : (
                    <MdExpandMore className="text-xl text-lightColor transition-transform" />
                )}
            </button>

            {expandedPricing && (
                <div className="p-4 border-t border-borderColor bg-baseColor animate-slideDown space-y-4">
                    {(basePriceMissing || priceCreditsMissing) && (
                        <FieldErrorBanner
                            title="Pricing information required"
                            message={[
                                basePriceMissing ? 'Set a base price so we can calculate totals at checkout.' : null,
                                priceCreditsMissing ? 'Specify a credit amount if this product can be bought with credits.' : null,
                            ].filter(Boolean).join(' ')}
                        />
                    )}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <MdAttachMoney className="text-textColor text-lg" />
                            <h4 className="text-xs font-semibold tracking-wide text-textColor uppercase">
                                Base Price
                            </h4>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex flex-col gap-1 w-md">
                                <label className="text-xs font-medium text-lightColor">Currency</label>
                                <SelectField
                                    onChangeFunction={(e) => setForm(f => ({
                                        ...f,
                                        basePrice: { ...f.basePrice, presentmentCurrency: e.target.value }
                                    }))}
                                    value={form.basePrice?.presentmentCurrency || 'SGD'}
                                    name="basePriceCurrency"
                                    label=""
                                    options={allCurrencies.map(code => ({ value: code, label: code }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1 w-full">
                                <label className="text-xs font-medium text-lightColor flex items-center gap-1">
                                    <span>Amount</span>
                                </label>
                                <div className="flex items-center gap-2">

                                    <input
                                        name="basePriceAmount"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={form.basePrice?.presentmentAmount ?? ''}
                                        onChange={(e) => setForm(f => ({
                                            ...f,
                                            basePrice: { ...f.basePrice, presentmentAmount: e.target.value === '' ? '' : parseFloat(e.target.value) }
                                        }))}
                                        className={`formInput text-sm font-medium flex-1 ${basePriceMissing ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-2 bg-blue-50 border border-blue-200 rounded flex gap-2 items-start text-xs font-medium text-blue-950">
                            <MdOutlineLightbulb className="flex-shrink-0 mt-0.5" />
                            <span>This is the starting price. Variant options and delivery fees will be added on top of this base price.</span>
                        </div>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-borderColor">
                        <div className="flex items-center gap-2">
                            <BiCoin className="text-textColor text-lg" />
                            <h4 className="text-xs font-semibold text-textColor uppercase tracking-wide">
                                Platform Credits
                            </h4>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-lightColor flex items-center gap-1">
                                <span>Credits Amount</span>
                            </label>
                            <input
                                name="priceCredits"
                                type="number"
                                min={0}
                                value={form.priceCredits ?? ''}
                                onChange={(e) => setForm(f => ({ ...f, priceCredits: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                                className={`formInput text-sm font-medium ${priceCreditsMissing ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                                placeholder="0"
                            />
                        </div>
                        <div className="p-3 bg-red-50 border border-red-200 rounded flex gap-2 items-start text-xs text-red-900">
                            <MdOutlineLightbulb className="flex-shrink-0 mt-0.5" />
                            <span className="font-medium">Customers cannot use platform credits as an alternative payment method at the moment.</span>
                        </div>


                    </div>
                </div>
            )}
        </div>
    )
}
