import React, { useRef, useState } from 'react'
import Image from 'next/image'
import { RxCross1 } from 'react-icons/rx'

const ImageDrop = function ImageDrop({
    label,
    value,
    pendingFiles = [],
    multiple = false,
    maxFiles = 7,
    maxSize = 2 * 1024 * 1024,
    accept = 'image/*',
    onFilesSelected = () => { },
    onRemove = () => { },
    onValidationError = () => { },
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

    const validateAndSelect = (files) => {
        if (!files || files.length === 0) return

        const allowedSlots = multiple ? Math.max(0, maxFiles - currentValues.length - pendingFiles.length) : 1
        if (multiple && allowedSlots <= 0) {
            onValidationError(`You can upload a maximum of ${maxFiles} images per product.`)
            return
        }

        const valid = []
        for (const file of files) {
            if (file.size > maxSize) {
                onValidationError(`File "${file.name}" is too large. Maximum size is ${Math.round(maxSize / (1024 * 1024))}MB.`)
                continue
            }
            if (multiple && valid.length >= allowedSlots) {
                onValidationError(`You can upload a maximum of ${maxFiles} images per product.`)
                break
            }
            valid.push(file)
        }

        if (valid.length > 0) {
            onFilesSelected(valid)
        }
    }

    const handleInputChange = (e) => {
        const files = toFilesArray(e.target.files)
        validateAndSelect(files)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragActive(false)
        const files = toFilesArray(e.dataTransfer.files)
        validateAndSelect(files)
    }

    const renderPreviewSrc = (item, isPending, forNextImage = false) => {
        let src = '';
        if (isPending) src = URL.createObjectURL(item);
        else if (typeof item === 'string') {
            if (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('/')) src = item;
            else if (forNextImage) src = `/api/proxy?key=${item}`;
            else src = `/api/proxy?key=${encodeURIComponent(item)}`;
        }
        return src;
    }

    // Debug: log all srcs used for images
    // Debug logs removed

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
                        // Use stable key: file.name (pending), S3 key (string), fallback idx
                        let stableKey = idx;
                        if (isPending && item && item.name) stableKey = `pending-${item.name}`;
                        else if (typeof item === 'string') stableKey = item;
                        else if (item && item.name) stableKey = item.name;
                        return (
                            <div key={stableKey} className="relative">
                                <Image
                                    src={renderPreviewSrc(item, isPending, true)}
                                    alt={`Preview ${idx + 1}`}
                                    loading="lazy"
                                    width={80}
                                    height={80}
                                    quality={80}
                                    className="w-20 h-20 object-cover rounded-sm border border-borderColor"
                                    onError={e => {
                                        // fallback to placeholder if image fails
                                        if (e?.target?.src && !e.target.src.endsWith('/placeholder.jpg')) {
                                            e.target.src = '/placeholder.jpg';
                                        }
                                    }}
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

export default React.memo(ImageDrop);
