import { useState } from 'react'

export default function ImageUpload({
    label,
    value,
    onChange,
    placeholder,
    required = false,
    disabled = false,
    className = ""
}) {
    const [isUploading, setIsUploading] = useState(false)

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                throw new Error('Upload failed')
            }

            const data = await response.json()
            onChange(data.url)
        } catch (error) {
            console.error('Upload error:', error)
            alert('Failed to upload image')
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className={`space-y-2 ${className}`}>
            <label className="block text-sm font-medium text-gray-700">
                {label} {required && <span className="text-red-500">*</span>}
            </label>

            <div className="space-y-3">
                <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder || "Enter image URL or upload below"}
                    disabled={disabled}
                    className="w-full px-3 py-2 border border-borderColor rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />

                <div className="flex items-center space-x-3">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={disabled || isUploading}
                        className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {isUploading && <span className="text-sm text-blue-600">Uploading...</span>}
                </div>

                {value && (
                    <div className="mt-3">
                        <img
                            src={value}
                            alt="Preview"
                            className="max-h-32 rounded-md border border-gray-300"
                        />
                    </div>
                )}
            </div>
        </div>
    )
}