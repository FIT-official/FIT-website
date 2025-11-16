import { useToast } from '@/components/General/ToastProvider';
import { useState, useRef } from 'react'
import { FaRegCopy } from 'react-icons/fa'
import ImageDrop from '@/components/General/ImageDrop'
import { RxReset } from 'react-icons/rx';
import { BiUndo } from 'react-icons/bi';

export default function ImageUpload({
    label,
    value,
    onChange,
    placeholder,
    required = false,
    disabled = false,
    className = "",
    uploadPath = null,
    uploadEndpoint = '/api/upload'
}) {
    const [isUploading, setIsUploading] = useState(false)
    const { showToast } = useToast();
    const fileRef = useRef()

    const isS3Key = value && !(value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/'));

    const handleFileUploadFiles = async (files) => {
        const file = files && files[0]
        if (!file) return

        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            // include uploadPath hint so server can place files under the correct prefix
            if (uploadPath) formData.append('uploadPath', uploadPath)
            // if current value points to an existing S3 key, tell the server so it can delete/replace it
            if (value && !(value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/'))) {
                formData.append('existingKey', value)
            }

            const response = await fetch(uploadEndpoint, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                throw new Error('Upload failed')
            }

            const data = await response.json()
            // accept either { url } or { url: '...', key: '...' } or { files: [...] }
            if (data?.url) onChange(data.url)
            else if (data?.files && data.files.length) {
                // use first file if multiple
                onChange(data.files[0].url || data.files[0] || '')
            } else if (data?.key) {
                // some upload APIs return a key
                onChange(data.key)
            } else {
                // fallback: if server returned string
                if (typeof data === 'string') onChange(data)
            }
        } catch (error) {
            console.error('Upload error:', error)
            alert('Failed to upload image')
        } finally {
            setIsUploading(false)
        }
    }

    const handleReset = async () => {
        // If current value is an S3 key, request server to delete it
        if (isS3Key) {
            try {
                const formData = new FormData()
                formData.append('deleteKey', value)
                // include uploadPath for extra safety on server-side
                if (uploadPath) formData.append('uploadPath', uploadPath)

                const res = await fetch(uploadEndpoint, { method: 'POST', body: formData })
                if (!res.ok) throw new Error('Delete failed')
            } catch (err) {
                console.error('Failed to delete existing image:', err)
                alert('Failed to delete existing image. Try again or contact an admin.')
                return
            }
        }

        // set to placeholder regardless of previous value
        onChange('/placeholder.jpg')
    }

    return (
        <div className={`flex flex-col w-full space-y-2 ${className}`}>
            <label className="formLabel">
                {label} {required && <span className="text-red-500">*</span>}
            </label>

            <div className="flex flex-col w-full space-y-3">
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        value={value || ''}
                        readOnly
                        placeholder={placeholder || "Upload an image using the button"}
                        className="formInput"
                        disabled
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (!value) return
                            try {
                                navigator.clipboard.writeText(value)
                                showToast('Copied to clipboard', 'success')
                            } catch (e) {
                                // noop
                            }
                        }}
                        className="px-3 py-2 border border-borderColor rounded text-xs hover:bg-baseColor transition flex items-center gap-1 cursor-pointer"
                    >
                        <FaRegCopy />
                    </button>
                </div>
                <div className="flex h-full flex-col">
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={disabled}
                        className="formButton"
                    >
                        Reset to placeholder
                        <BiUndo size={16} />
                    </button>
                    {isUploading && <span className="text-sm text-blue-600">Uploading...</span>}
                </div>

                <div className="flex w-full">
                    <ImageDrop
                        label={null}
                        value={value}
                        pendingFiles={[]}
                        multiple={false}
                        inputRef={fileRef}
                        onFilesSelected={(files) => handleFileUploadFiles(files)}
                        onRemove={() => handleReset()}
                        className='w-full'
                    />

                </div>

            </div>
        </div>
    )
}