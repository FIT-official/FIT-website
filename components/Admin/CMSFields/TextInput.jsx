import { useState } from 'react'

export default function TextInput({
    label,
    value,
    onChange,
    placeholder,
    required = false,
    disabled = false,
    className = "",
    rows = 1
}) {
    return (
        <div className={`space-y-2 ${className}`}>
            <label className="formLabel">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            {rows > 1 ? (
                <textarea
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="formInput"
                />
            ) : (
                <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="formInput"
                />
            )}
        </div>
    )
}