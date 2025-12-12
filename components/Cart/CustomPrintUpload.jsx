'use client'
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { HiUpload, HiCheck, HiX, HiCube, HiTrash } from 'react-icons/hi'
import { useToast } from '@/components/General/ToastProvider'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export default function CustomPrintUpload({ cartItem, onUploadComplete }) {
    const [uploading, setUploading] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadedFile, setUploadedFile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [savedConfig, setSavedConfig] = useState(null)
    const { showToast } = useToast()
    const { user } = useUser()
    const router = useRouter()

    // Check if cart item already has a requestId and fetch that data
    useEffect(() => {
        const checkExistingUpload = async () => {
            console.log('Checking existing upload for cartItem:', cartItem)
            if (cartItem?.requestId) {
                console.log('Found requestId in cartItem:', cartItem.requestId)
                try {
                    const response = await fetch(`/api/custom-print?requestId=${cartItem.requestId}`)
                    if (response.ok) {
                        const data = await response.json()
                        console.log('Fetched existing upload data:', data)
                        if (data.request?.modelFile) {
                            setUploadedFile({
                                name: data.request.modelFile.originalName,
                                size: data.request.modelFile.fileSize,
                                requestId: data.request.requestId,
                                modelUrl: data.request.modelFile.s3Url
                            })
                        }
                    } else {
                        console.error('Failed to fetch existing upload:', response.status)
                    }
                } catch (error) {
                    console.error('Error fetching existing upload:', error)
                }
            } else {
                console.log('No requestId found in cartItem')
            }
            setLoading(false)
        }
        checkExistingUpload()
    }, [cartItem?.requestId])

    // Load print configuration when uploadedFile changes
    useEffect(() => {
        if (!uploadedFile) return

        const loadConfig = async () => {
            try {
                const response = await fetch(`/api/custom-print?requestId=${uploadedFile.requestId}`)
                if (response.ok) {
                    const data = await response.json()
                    if (data.request?.printConfiguration?.isConfigured) {
                        setSavedConfig(data.request.printConfiguration)
                    }
                }
            } catch (e) {
                console.error('Failed to load config:', e)
            }
        }
        loadConfig()
    }, [uploadedFile])

    const onDrop = useCallback(async (acceptedFiles) => {
        if (acceptedFiles.length === 0) return

        const file = acceptedFiles[0]

        // Validate file type
        const allowedExtensions = ['.stl', '.obj', '.glb', '.gltf', '.3mf', '.ply']
        const fileName = file.name.toLowerCase()
        const isValidFile = allowedExtensions.some(ext => fileName.endsWith(ext))

        if (!isValidFile) {
            showToast('Invalid file type. Please upload a 3D model file (.stl, .obj, .glb, .gltf, .3mf, .ply)', 'error')
            return
        }

        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024 // 50MB
        if (file.size > maxSize) {
            showToast('File too large. Maximum size is 50MB', 'error')
            return
        }

        setUploading(true)
        setUploadProgress(0)

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('userEmail', user?.emailAddresses?.[0]?.emailAddress || '')
            formData.append('userName', user?.fullName || user?.firstName || 'Unknown')

            // Simulate upload progress
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => Math.min(prev + 10, 90))
            }, 200)

            const response = await fetch('/api/custom-print', {
                method: 'POST',
                body: formData
            })

            clearInterval(progressInterval)
            setUploadProgress(100)

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Upload failed')
            }

            const data = await response.json()
            setUploadedFile({
                name: file.name,
                size: file.size,
                requestId: data.requestId,
                modelUrl: data.modelUrl
            })

            // Update cart item with requestId
            console.log('Updating cart with requestId:', data.requestId)
            const updateResponse = await fetch('/api/user/cart/update-custom-print', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: 'custom-print-request',
                    requestId: data.requestId
                })
            })

            if (updateResponse.ok) {
                console.log('Successfully updated cart with requestId')
            } else {
                console.error('Failed to update cart with requestId:', updateResponse.status)
            }

            showToast('Model uploaded successfully! Configure your print settings next.', 'success')

            if (onUploadComplete) {
                onUploadComplete(data)
            }

        } catch (error) {
            console.error('Upload error:', error)
            showToast(error.message || 'Failed to upload model', 'error')
            setUploadProgress(0)
        } finally {
            setUploading(false)
        }
    }, [user, showToast, onUploadComplete])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'model/*': ['.stl', '.obj', '.glb', '.gltf', '.3mf', '.ply']
        },
        maxFiles: 1,
        disabled: uploading || !!uploadedFile
    })

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }

    const handleConfigureClick = () => {
        if (uploadedFile) {
            router.push(`/editor?requestId=${uploadedFile.requestId}`)
        }
    }

    const handleDeleteModel = async () => {
        if (!uploadedFile) return

        const confirmed = window.confirm('Are you sure you want to delete this model? This action cannot be undone.')
        if (!confirmed) return

        setDeleting(true)
        try {
            const response = await fetch(`/api/custom-print/delete?requestId=${uploadedFile.requestId}`, {
                method: 'DELETE'
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete model')
            }

            // Clear the uploaded file state
            setUploadedFile(null)
            setSavedConfig(null)

            // Update cart item to remove requestId
            await fetch('/api/user/cart/update-custom-print', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: 'custom-print-request',
                    requestId: null
                })
            })

            showToast('Model deleted successfully', 'success')
        } catch (error) {
            console.error('Error deleting model:', error)
            showToast(error.message || 'Failed to delete model', 'error')
        } finally {
            setDeleting(false)
        }
    }

    if (loading) {
        return (
            <div className="rounded-lg border border-borderColor bg-baseColor p-6">
                <div className="flex items-center justify-center gap-3 text-lightColor">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-lightColor border-t-transparent"></div>
                    <span className="text-sm font-medium">Loading upload status...</span>
                </div>
            </div>
        )
    }

    if (uploadedFile) {
        return (
            <div className="rounded-lg border border-borderColor overflow-hidden">
                <div className="bg-baseColor p-6">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 w-10 h-10 bg-textColor/5 rounded-full flex items-center justify-center">
                            <HiCheck className="text-textColor text-xl" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-textColor mb-1">3D Model Ready</h4>
                            <p className="text-xs text-lightColor mb-1">{uploadedFile.name}</p>
                            <p className="text-xs text-extraLight">{formatFileSize(uploadedFile.size)}</p>
                        </div>
                    </div>
                </div>

                {savedConfig?.printSettings && (
                    <div className="border-t border-borderColor bg-background p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h5 className="text-xs font-semibold text-textColor uppercase tracking-wide">Print Configuration</h5>
                            <span className="text-xs text-extraLight">
                                {new Date(savedConfig.configuredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-borderColor/50">
                                <span className="text-xs text-lightColor">Layer Height</span>
                                <span className="text-xs font-medium text-textColor">{savedConfig.printSettings.layerHeight}mm</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-borderColor/50">
                                <span className="text-xs text-lightColor">Wall Loops</span>
                                <span className="text-xs font-medium text-textColor">{savedConfig.printSettings.wallLoops}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-borderColor/50">
                                <span className="text-xs text-lightColor">Infill</span>
                                <span className="text-xs font-medium text-textColor">{savedConfig.printSettings.sparseInfillDensity}% {savedConfig.printSettings.sparseInfillPattern}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-borderColor/50">
                                <span className="text-xs text-lightColor">Nozzle</span>
                                <span className="text-xs font-medium text-textColor">{savedConfig.printSettings.nozzleDiameter}mm</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-borderColor/50">
                                <span className="text-xs text-lightColor">Support</span>
                                <span className="text-xs font-medium text-textColor">
                                    {savedConfig.printSettings.enableSupport ? savedConfig.printSettings.supportType : 'None'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-xs text-lightColor">Print Plate</span>
                                <span className="text-xs font-medium text-textColor">{savedConfig.printSettings.printPlate}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="border-t border-borderColor bg-baseColor p-6">
                    <div className="flex gap-3">
                        <button
                            onClick={handleConfigureClick}
                            className="flex-1 px-4 py-3 bg-textColor text-background rounded-md text-sm font-medium hover:bg-textColor/90 transition-all duration-200 flex items-center justify-center gap-2 group"
                        >
                            <span>{savedConfig?.printSettings ? 'Edit Configuration' : 'Configure Print Settings'}</span>
                            <span className="transform group-hover:translate-x-0.5 transition-transform duration-200">→</span>
                        </button>
                        <button
                            onClick={handleDeleteModel}
                            disabled={deleting}
                            className="px-4 py-3 bg-red-50 text-red-600 rounded-md text-sm font-medium hover:bg-red-100 transition-all duration-200 flex items-center justify-center gap-2 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete model"
                        >
                            {deleting ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent"></div>
                            ) : (
                                <HiTrash className="text-lg" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-lg border border-borderColor bg-baseColor overflow-hidden transition-all duration-200 hover:border-lightColor/50">
            <div {...getRootProps()} className={`cursor-pointer transition-all duration-200 ${isDragActive ? 'bg-textColor/5' : ''}`}>
                <input {...getInputProps()} />
                <div className="flex flex-col items-center justify-center text-center gap-6 p-8">
                    {uploading ? (
                        <>
                            <div className="relative w-16 h-16">
                                <div className="absolute inset-0 rounded-full border-4 border-borderColor"></div>
                                <div className="absolute inset-0 rounded-full border-4 border-textColor border-t-transparent animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <HiCube className="text-textColor text-2xl" />
                                </div>
                            </div>
                            <div className="w-full max-w-xs space-y-2">
                                <div className="h-1.5 bg-borderColor rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-textColor transition-all duration-300 ease-out"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                                <p className="text-xs text-lightColor font-medium">Uploading {uploadProgress}%</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 rounded-full bg-textColor/5 flex items-center justify-center transition-all duration-200 group-hover:bg-textColor/10">
                                <HiUpload className="text-lightColor text-2xl transition-transform duration-200 group-hover:scale-110" />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-textColor">
                                    {isDragActive ? 'Release to upload' : 'Upload 3D Model'}
                                </h4>
                                <p className="text-xs text-lightColor">
                                    Drag and drop or click to browse
                                </p>
                                <p className="text-xs text-extraLight">
                                    STL, OBJ, GLB, GLTF, 3MF, PLY • Max 50MB
                                </p>
                            </div>
                            <button
                                type="button"
                                className="px-6 py-2.5 bg-textColor text-background rounded-md text-sm font-medium hover:bg-textColor/90 transition-all duration-200"
                            >
                                Choose File
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
