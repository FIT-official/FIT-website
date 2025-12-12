import React from 'react'
import { MdErrorOutline } from 'react-icons/md'

/**
 * Reusable inline validation banner for highlighting missing or invalid fields.
 */
export default function FieldErrorBanner({
    title = 'Missing required information',
    message,
    children,
    className = '',
}) {
    return (
        <div
            className={`flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 ${className}`}
        >
            <div className="mt-0.5 text-red-700">
                <MdErrorOutline className="text-sm" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
                {title && (
                    <p className="font-semibold leading-snug">
                        {title}
                    </p>
                )}
                {message && (
                    <p className="leading-snug text-red-700">
                        {message}
                    </p>
                )}
                {children}
            </div>
        </div>
    )
}
