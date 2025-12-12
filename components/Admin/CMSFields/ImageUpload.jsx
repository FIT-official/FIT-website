import { useToast } from '@/components/General/ToastProvider';
import { useState, useRef } from 'react'
import { FaRegCopy } from 'react-icons/fa'
import ImageDrop from '@/components/General/ImageDrop'
import { RxReset } from 'react-icons/rx';
import { BiUndo } from 'react-icons/bi';
import Cropper from 'react-easy-crop';

export default function ImageUpload({
    label,
    value,
    onChange,
    placeholder,
    required = false,
    disabled = false,
    className = "",
    uploadPath = null,
    uploadEndpoint = '/api/upload',
    cropAspectRatio = null,
    targetWidth = null,
    targetHeight = null,
    // Value to use when clicking "Reset to placeholder". Defaults
    // to the generic site placeholder image, but can be overridden
    // per-field (e.g. testimonials avatar -> '/user.jpg').
    resetValue = '/placeholder.jpg',
}) {
    const [isUploading, setIsUploading] = useState(false)
    const { showToast } = useToast();
    const fileRef = useRef()

    const [isCropModalOpen, setIsCropModalOpen] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const [imageSrc, setImageSrc] = useState(null)
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

    const isS3Key = value && !(value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/'));

    const shouldCrop = !!(cropAspectRatio || (targetWidth && targetHeight))

    const uploadFile = async (file) => {
        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            if (uploadPath) formData.append('uploadPath', uploadPath)
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
            if (data?.url) onChange(data.url)
            else if (data?.files && data.files.length) {
                onChange(data.files[0].url || data.files[0] || '')
            } else if (data?.key) {
                onChange(data.key)
            } else if (typeof data === 'string') {
                onChange(data)
            }
        } catch (error) {
            console.error('Upload error:', error)
            alert('Failed to upload image')
        } finally {
            setIsUploading(false)
        }
    }

    const readFileAsDataURL = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.addEventListener('load', () => resolve(reader.result))
            reader.addEventListener('error', reject)
            reader.readAsDataURL(file)
        })
    }

    const handleFileUploadFiles = async (files) => {
        const file = files && files[0]
        if (!file) return

        if (shouldCrop) {
            try {
                const src = await readFileAsDataURL(file)
                setSelectedFile(file)
                setImageSrc(src)
                setCrop({ x: 0, y: 0 })
                setZoom(1)
                setCroppedAreaPixels(null)
                setIsCropModalOpen(true)
            } catch (err) {
                console.error('Failed to read file for cropping:', err)
                alert('Failed to open image for cropping')
            }
        } else {
            await uploadFile(file)
        }
    }

    const handleReset = async () => {
        // If current value is an S3 key, request server to delete it.
        // Even if deletion fails, still reset the field locally so the
        // admin UI is never blocked from clearing the banner.
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
                // Non-blocking: notify in console/UI but continue to reset locally
                alert('Unable to delete the existing image from storage, but the banner has been reset.');
            }
        }

        // set to configured resetValue regardless of previous value
        // or delete outcome
        onChange(resetValue)
    }

    const onCropComplete = (_, croppedPixels) => {
        setCroppedAreaPixels(croppedPixels)
    }

    const createImage = (url) => {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.addEventListener('load', () => resolve(img))
            img.addEventListener('error', reject)
            img.setAttribute('crossOrigin', 'anonymous')
            img.src = url
        })
    }

    const getCroppedBlob = async () => {
        if (!imageSrc || !croppedAreaPixels) return null
        const image = await createImage(imageSrc)

        const canvas = document.createElement('canvas')

        // Ensure the final image dimensions either match the crop
        // selection or the explicitly requested target size.
        let outputWidth = croppedAreaPixels.width
        let outputHeight = croppedAreaPixels.height

        if (targetWidth && targetHeight) {
            outputWidth = targetWidth
            outputHeight = targetHeight
        }

        canvas.width = outputWidth
        canvas.height = outputHeight
        const ctx = canvas.getContext('2d')

        // Map the crop area from the displayed image back to the
        // underlying image's pixel grid to ensure the crop and
        // reposition from the modal are preserved exactly.
        const scaleX = image.naturalWidth / image.width
        const scaleY = image.naturalHeight / image.height

        const sx = croppedAreaPixels.x * scaleX
        const sy = croppedAreaPixels.y * scaleY
        const sWidth = croppedAreaPixels.width * scaleX
        const sHeight = croppedAreaPixels.height * scaleY

        ctx.drawImage(
            image,
            sx,
            sy,
            sWidth,
            sHeight,
            0,
            0,
            outputWidth,
            outputHeight
        )

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Canvas is empty'))
                    return
                }
                resolve(blob)
            }, 'image/jpeg', 0.9)
        })
    }

    const handleConfirmCrop = async () => {
        if (!selectedFile || !croppedAreaPixels) {
            setIsCropModalOpen(false)
            return
        }
        try {
            setIsUploading(true)
            const blob = await getCroppedBlob()
            if (!blob) throw new Error('Failed to crop image')
            const croppedFile = new File([blob], selectedFile.name, { type: blob.type || selectedFile.type })
            await uploadFile(croppedFile)
        } catch (err) {
            console.error('Error while cropping/uploading image:', err)
            alert('Failed to process cropped image')
        } finally {
            setIsUploading(false)
            setIsCropModalOpen(false)
            setSelectedFile(null)
            setImageSrc(null)
            setCroppedAreaPixels(null)
        }
    }

    const handleCancelCrop = () => {
        setIsCropModalOpen(false)
        setSelectedFile(null)
        setImageSrc(null)
        setCroppedAreaPixels(null)
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

            {isCropModalOpen && imageSrc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 p-4 flex flex-col gap-4">
                        <h3 className="text-sm font-medium">Adjust image before upload</h3>
                        <div className="relative w-full h-64 bg-black/80 rounded-md overflow-hidden">
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={cropAspectRatio || (targetWidth && targetHeight ? targetWidth / targetHeight : 4 / 3)}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={onCropComplete}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-lightColor">Zoom</span>
                            <input
                                type="range"
                                min={1}
                                max={3}
                                step={0.1}
                                value={zoom}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="w-full accent-textColor"
                            />
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                type="button"
                                onClick={handleCancelCrop}
                                className="px-3 py-1.5 text-xs border border-borderColor rounded hover:bg-baseColor transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmCrop}
                                className="px-3 py-1.5 text-xs rounded bg-black text-white hover:bg-gray-900 transition disabled:opacity-60"
                                disabled={isUploading || !croppedAreaPixels}
                            >
                                {isUploading ? 'Uploading…' : 'Save & Upload'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}