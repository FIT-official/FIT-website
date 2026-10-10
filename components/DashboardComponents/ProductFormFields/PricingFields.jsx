import React from 'react'
import FieldErrorBanner from './FieldErrorBanner'
import { DashSelect, InfoStrip, inputCls, labelCls } from './dashFormUi'

export default function PricingFields({ form, setForm, allCurrencies, missingFields = [] }) {
    const basePriceMissing = missingFields.includes('basePrice')
    const priceCreditsMissing = missingFields.includes('priceCredits')

    return (
        <div className="w-full space-y-4">
            {form.productType === 'shop' && <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={!!form.quoteOnly}
                    onChange={e => setForm(f => ({ ...f, quoteOnly: e.target.checked }))} />
                <span>Confirm price and availability before purchase
                    <span className="block mt-1 text-lightColor">Customers can ask for a quote. Online checkout stays off until you confirm the cost and stock. The base price below is not displayed as an offer.</span>
                </span>
            </label>}
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
                <span className={labelCls}>Base Price</span>

                <div className="flex gap-2">
                    <div className="flex flex-col gap-1.5 w-32 shrink-0">
                        <label htmlFor="basePriceCurrency" className={labelCls}>Currency</label>
                        <DashSelect
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
                    <div className="flex flex-col gap-1.5 w-full">
                        <label htmlFor="basePriceAmount" className={labelCls}>Amount</label>
                        <input
                            id="basePriceAmount"
                            name="basePriceAmount"
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.basePrice?.presentmentAmount ?? ''}
                            onChange={(e) => setForm(f => ({
                                ...f,
                                basePrice: { ...f.basePrice, presentmentAmount: e.target.value === '' ? '' : parseFloat(e.target.value) }
                            }))}
                            className={`${inputCls(basePriceMissing)} dash-data`}
                            placeholder="0.00"
                        />
                    </div>
                </div>

                <InfoStrip tone="info">
                    This is the starting price. Variant options and delivery fees will be added on top of this base price.
                </InfoStrip>
            </div>

            <div className="space-y-3 pt-4 border-t border-[var(--dash-line)]">
                {form.productType === 'shop' && <fieldset className="space-y-3 pb-4">
                    <legend className={labelCls}>Internal fulfilment costs</legend>
                    <p className="text-sm text-lightColor">Private costs in SGD per unit. Use the highest cost across all variants. Leave unknown costs blank. These costs do not change the delivery charge.</p>
                    {[
                        ['unitCost', 'Landed product cost', 'Include purchase cost, inbound freight and non-recoverable taxes.'],
                        ['packingCost', 'Packing and handling cost', 'Include packaging, labour and any other direct order costs.'],
                        ['deliveryCost', 'Delivery cost', 'Allow enough to send one unit to a Singapore customer.'],
                    ].map(([key, label, help]) => <div key={key} className="space-y-1">
                        <label className={labelCls} htmlFor={`shipping-${key}`}>{label}</label>
                        <input id={`shipping-${key}`} type="number" min="0" max="1000000" step="0.01"
                            value={form.shippingCosts?.[key] ?? ''} className={inputCls(false)}
                            onChange={e => setForm(f => ({ ...f, shippingCosts: { ...f.shippingCosts,
                                [key]: e.target.value === '' ? null : Number(e.target.value), confirmed: false } }))} />
                        <p className="text-xs text-lightColor">{help}</p>
                    </div>)}
                    <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" checked={form.shippingCosts?.confirmed === true}
                            onChange={e => setForm(f => ({ ...f, shippingCosts: { ...f.shippingCosts, confirmed: e.target.checked } }))} />
                        <span>These costs cover every variant of this product.</span>
                    </label>
                </fieldset>}
                <span className={labelCls}>Platform Credits</span>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="priceCredits" className={labelCls}>Credits Amount</label>
                    <input
                        id="priceCredits"
                        name="priceCredits"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.priceCredits ?? ''}
                        onChange={(e) => {
                            const value = e.target.value;
                            setForm(f => ({ ...f, priceCredits: value === '' ? '' : parseFloat(value) }));
                        }}
                        className={`${inputCls(priceCreditsMissing)} dash-data`}
                        placeholder="0"
                    />
                </div>
                <InfoStrip tone="hatch" title="Not yet spendable at checkout">
                    <p>Customers cannot use platform credits as an alternative payment method at the moment.</p>
                </InfoStrip>
            </div>
        </div>
    )
}
