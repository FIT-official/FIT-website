import React, { useRef, useState } from 'react'
import Image from 'next/image'
import { RxCross1 } from 'react-icons/rx'

export default function ImageDrop({
    label,
    value,
    pendingFiles = [],
    multiple = false,
    maxFiles = 7,
    maxSize = 2 * 1024 * 1024,
    accept = 'image/*',
    onFilesSelected = () => { },
    onRemove = () => { },
    inputRef = null,
    className = ''
}) {
    const [dragActive, setDragActive] = useState(false)
    const internalInputRef = useRef()
    const fileInputRef = inputRef || internalInputRef

    const currentValues = multiple ? (Array.isArray(value) ? value : (value ? [value] : [])) : (value ? [value] : [])

    const handleClick = () => {
        if (!fileInputRef.current) return
        // prevent selecting more than max
        if (multiple && currentValues.length >= maxFiles) return
        fileInputRef.current.click()
    }

    const toFilesArray = (files) => {
        if (!files) return []
        if (files instanceof FileList) return Array.from(files)
        if (Array.isArray(files)) return files
        return [files]
    }

    const handleInputChange = (e) => {
        const files = toFilesArray(e.target.files)
        if (!files || files.length === 0) return
        onFilesSelected(files)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragActive(false)
        const files = toFilesArray(e.dataTransfer.files)
        if (!files || files.length === 0) return
        onFilesSelected(files)
    }

    const renderPreviewSrc = (item, isPending) => {
        if (isPending) return URL.createObjectURL(item)
        if (typeof item === 'string') {
            if (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('/')) return item
            return `/api/proxy?key=${encodeURIComponent(item)}`
        }
        return ''
    }

    return (
        <div className={className}>
            {label && <label className="formLabel">{label}</label>}

            <div
                className={`formDrag ${dragActive ? 'bg-borderColor/30' : ''}`}
                onClick={handleClick}
                onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
                onDrop={handleDrop}
            >
                {multiple ? (
                    currentValues.length >= maxFiles ? (
                        <span className="text-center text-sm text-lightColor">Maximum {maxFiles} images reached</span>
                    ) : (
                        <span className="text-center">Click to choose images or drag and drop here (max {maxFiles} images, {Math.round(maxSize / (1024 * 1024))}MB each)</span>
                    )
                ) : (
                    <span className="text-center">Click to choose an image or drag and drop here</span>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    onChange={handleInputChange}
                    style={{ display: 'none' }}
                />
            </div>

            {/* previews */}
            {multiple ? (
                <div className="flex gap-2 flex-wrap mt-2">
                    {[...currentValues, ...pendingFiles].map((item, idx) => {
                        const isPending = idx >= (currentValues.length || 0)
                        return (
                            <div key={idx} className="relative">
                                <Image
                                    src={renderPreviewSrc(item, isPending)}
                                    alt={`Preview ${idx + 1}`}
                                    loading="lazy"
                                    width={80}
                                    height={80}
                                    quality={20}
                                    className="w-20 h-20 object-cover rounded-sm border border-borderColor"
                                />
                                <RxCross1
                                    className="absolute top-1 right-1 cursor-pointer p-0.5 bg-white/80 rounded-full"
                                    size={14}
                                    onClick={() => onRemove(idx)}
                                />
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="mt-3">
                    {currentValues[0] ? (
                        <img
                            src={renderPreviewSrc(currentValues[0], pendingFiles && pendingFiles[0])}
                            alt="Preview"
                            className="max-h-32 rounded-md border border-gray-300"
                            onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
                        />
                    ) : (
                        <div className="text-xs font-medium text-lightColor/50">No image selected.</div>
                    )}
                </div>
            )}
        </div>
    )
}
