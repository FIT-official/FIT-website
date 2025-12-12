import React from 'react'
import SelectField from '../SelectField'
import FieldErrorBanner from './FieldErrorBanner'
import { BsPlus } from 'react-icons/bs'
import { BiMinus } from 'react-icons/bi'

export default function DiscountsField({ form, setForm, events }) {
    const showDiscount = form.showDiscount
    const discount = form.discount || {}
    const hasEvent = !!discount.eventId

    const percentageNum = Number(discount.percentage)
    const minimumNum = Number(discount.minimumPrice)
    const startDate = discount.startDate ? new Date(discount.startDate) : null
    const endDate = discount.endDate ? new Date(discount.endDate) : null

    const percentageInvalid = showDiscount && !hasEvent && (Number.isNaN(percentageNum) || percentageNum <= 0 || percentageNum > 100)
    const minimumInvalid = showDiscount && !hasEvent && (!Number.isNaN(minimumNum) && minimumNum < 0)
    const datesInvalid = showDiscount && !hasEvent && !!startDate && !!endDate && startDate > endDate

    const hasDiscountErrors = percentageInvalid || minimumInvalid || datesInvalid

    return (
        <div className="flex flex-col gap-2 w-full">
            <label className="formLabel">Discounts</label>
            <button
                type="button"
                className="formButton"
                onClick={() => setForm(f => ({ ...f, showDiscount: true }))}
                disabled={form.showDiscount}
            >
                Add Discount
                <BsPlus className="ml-2" size={20} />
            </button>

            {form.showDiscount && (
                <div className="flex flex-col gap-2 bg-baseColor border border-extraLight p-4 rounded-sm my-3">
                    {hasDiscountErrors && (
                        <FieldErrorBanner
                            title="Discount details need attention"
                            message={[
                                percentageInvalid ? 'Set a percentage between 1% and 100%.' : null,
                                minimumInvalid ? 'Minimum amount cannot be negative.' : null,
                                datesInvalid ? 'Start date must be before the end date.' : null,
                            ].filter(Boolean).join(' ')}
                        />
                    )}
                    {events && events.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <SelectField
                                onChangeFunction={e =>
                                    setForm(f => ({
                                        ...f,
                                        discount: { ...f.discount, eventId: e.target.value }
                                    }))}
                                value={form.discount.eventId}
                                name="eventId"
                                label="Event"
                                options={[{ value: "", label: "None" }, ...events.map(ev => ({ value: ev._id, label: `${ev.name} (${ev.percentage}% off)` }))]}
                            />
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label htmlFor="discountPercentage" className="formLabel">Discount Percentage (%)</label>
                        <input
                            id="discountPercentage"
                            name="discountPercentage"
                            type="number"
                            min={1}
                            max={100}
                            value={form.discount.percentage ?? ""}
                            onChange={e => setForm(f => ({
                                ...f,
                                discount: { ...f.discount, percentage: e.target.value }
                            }))}
                            className={`formInput ${percentageInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                            placeholder="e.g. 10"
                            required={!form.discount.eventId}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="discountMinimumAmount" className="formLabel">Minimum Amount</label>
                        <input
                            id="discountMinimumAmount"
                            name="discountMinimumAmount"
                            type="number"
                            min={0}
                            value={form.discount.minimumPrice}
                            step="0.01"
                            onChange={e => setForm(f => ({ ...f, discount: { ...f.discount, minimumPrice: e.target.value } }))}
                            className={`formInput ${minimumInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                            placeholder="e.g. 50"
                            required={!form.discount.eventId}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="discountStartDate" className="formLabel">Start Date</label>
                        <input
                            id="discountStartDate"
                            name="discountStartDate"
                            type="date"
                            value={form.discount.startDate}
                            onChange={e => setForm(f => ({ ...f, discount: { ...f.discount, startDate: e.target.value } }))}
                            className={`formInput ${datesInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                            required={!form.discount.eventId}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="discountEndDate" className="formLabel">End Date</label>
                        <input
                            id="discountEndDate"
                            name="discountEndDate"
                            type="date"
                            value={form.discount.endDate}
                            onChange={e => setForm(f => ({ ...f, discount: { ...f.discount, endDate: e.target.value } }))}
                            className={`formInput ${datesInvalid ? 'border-2 border-red-500 focus:border-red-500' : ''}`}
                            required={!form.discount.eventId}
                        />
                    </div>
                    <button
                        type="button"
                        className="formButton mt-4"
                        onClick={() =>
                            setForm(f => ({
                                ...f,
                                showDiscount: false,
                                discount: {
                                    eventId: "",
                                    percentage: "",
                                    minimumPrice: "",
                                    startDate: "",
                                    endDate: "",
                                }
                            }))
                        }
                    >
                        Remove Discount
                        <BiMinus />
                    </button>
                </div>
            )}
        </div>
    )
}
