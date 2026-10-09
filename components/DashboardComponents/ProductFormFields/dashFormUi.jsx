'use client'
import React from 'react'

/**
 * Token-styled form atoms for the product document (blueprint §5.5).
 * Inputs: 12px radius, hairline border, card surface; labels use .dash-label.
 * Every colour goes through a `--dash-*` token (§4.1 — raw palette classes
 * are banned in dashboard code).
 */

// Focus is soft (client polish, 2026-07-05): no hard outline — the hairline
// darkens one step and a faint halo ring appears (--dash-focus-ring token).
// dashboard.css applies the same treatment on :focus-visible for keyboard a11y.
export const inputCls = (error = false) =>
    `w-full rounded-[var(--dash-r-inner)] border bg-[var(--dash-card)] px-3 py-2 text-[13px] text-[var(--dash-ink)] outline-none focus:shadow-[var(--dash-focus-ring)] ${
        error ? 'border-[var(--dash-bad)]' : 'border-[var(--dash-line)] focus:border-[var(--dash-focus-line)]'
    }`

export const labelCls = 'dash-label'

export const quietBtnCls =
    'dash-hoverable rounded-full px-3.5 py-1.5 text-[13px] font-medium border border-[var(--dash-line)] bg-[var(--dash-card)] text-[var(--dash-ink)] cursor-pointer hover:bg-[var(--dash-canvas)] disabled:opacity-50 disabled:cursor-not-allowed'

export const badTextBtnCls =
    'text-[13px] font-medium text-[var(--dash-bad)] cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed'

export const dropZoneCls = (active = false) =>
    `w-full cursor-pointer rounded-[var(--dash-r-inner)] border border-dashed px-4 py-6 text-center text-[13px] text-[var(--dash-ink-soft)] ${
        active
            ? 'bg-[var(--dash-sun-soft)] border-[var(--dash-line)]'
            : 'bg-[var(--dash-card)] border-[var(--dash-line)] hover:bg-[var(--dash-canvas)]'
    }`

const STRIP_TONES = {
    // Quiet informational strip: canvas bg + hairline + 13px ink-soft text.
    info: 'bg-[var(--dash-canvas)] border border-[var(--dash-line)] text-[var(--dash-ink-soft)]',
    // Warnings: sun-soft wash, ink text.
    warn: 'bg-[var(--dash-sun-soft)] border border-[var(--dash-line)] text-[var(--dash-ink)]',
    // Errors: bad bg + bad text.
    error: 'bg-[var(--dash-bad-bg)] border border-[var(--dash-bad-bg)] text-[var(--dash-bad)]',
    // Hatch: probationary/"not yet" notes.
    hatch: 'dash-hatch bg-[var(--dash-card)] border border-[var(--dash-line)] text-[var(--dash-ink)]',
}

export function InfoStrip({ tone = 'info', title, children, className = '' }) {
    return (
        <div className={`rounded-[var(--dash-r-inner)] px-3 py-2 text-[13px] ${STRIP_TONES[tone] || STRIP_TONES.info} ${className}`}>
            {title && <p className="font-medium">{title}</p>}
            {children}
        </div>
    )
}

/** Token-styled select — same contract as the legacy SelectField. */
export function DashSelect({ onChangeFunction, value, name, label, options, className = '', required = true }) {
    return (
        <div className={`flex flex-col gap-1.5 w-full ${className}`}>
            {label && (
                <label htmlFor={name} className={labelCls}>{label}</label>
            )}
            <div className="relative">
                <select
                    id={name}
                    name={name}
                    value={value}
                    onChange={onChangeFunction}
                    className={`${inputCls()} appearance-none pr-8 cursor-pointer`}
                    required={required}
                >
                    {options.map((option, index) => (
                        <option key={index} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="h-4 w-4 absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none text-[var(--dash-ink-soft)]"
                    aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                </svg>
            </div>
        </div>
    )
}
