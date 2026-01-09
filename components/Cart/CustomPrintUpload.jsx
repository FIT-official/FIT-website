'use client'
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { HiUpload, HiCheck, HiCube, HiTrash } from 'react-icons/hi'
import { useToast } from '@/components/General/ToastProvider'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { getMimeType } from '@/utils/uploadHelpers'

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

    // Always resolve the requestId for this cart item
    const requestId = cartItem?.requestId || cartItem?.customPrintRequestId

    // Fetch upload status for this request
    useEffect(() => {
        async function checkExistingUpload() {
            if (!requestId) {
                setLoading(false)
                return
            }
            try {
                const response = await fetch(`/api/custom-print?requestId=${requestId}`)
                if (response.ok) {
                    const data = await response.json()
                    // `modelFile` can exist on new requests due to schema defaults.
                    // Only treat as "uploaded" if it has a real stored file.
                    if (data.request?.modelFile?.s3Key && data.request?.modelFile?.originalName) {
                        setUploadedFile({
                            name: data.request.modelFile.originalName,
                            size: data.request.modelFile.fileSize,
                            requestId: data.request.requestId,
                            modelKey: data.request.modelFile.s3Key
                        })
                    }
                }
            } catch (error) {
                // ignore
            }
            setLoading(false)
        }
        checkExistingUpload()
    }, [requestId])

    // Fetch print configuration if model is uploaded
    useEffect(() => {
        if (!uploadedFile) return;
        async function loadConfig() {
            try {
                const response = await fetch(`/api/custom-print?requestId=${uploadedFile.requestId}`)
                if (response.ok) {
                    const data = await response.json()
                    if (data.request?.printConfiguration?.isConfigured) {
                        setSavedConfig(data.request.printConfiguration)
                    }
                }
            } catch (e) {
                // ignore
            }
        }
        loadConfig();

        // If file size is missing, try to fetch from S3
        if ((uploadedFile.size === undefined || uploadedFile.size === null || isNaN(uploadedFile.size)) && uploadedFile.modelKey) {
            (async () => {
                try {
                    const res = await fetch(`/api/proxy?key=${encodeURIComponent(uploadedFile.modelKey)}`, { method: 'HEAD' });
                    if (res.ok) {
                        const size = res.headers.get('content-length');
                        if (size && !isNaN(Number(size))) {
                            setUploadedFile(prev => prev ? { ...prev, size: Number(size) } : prev);
                        }
                    }
                } catch (e) {
                    // ignore
                }
            })();
        }
    }, [uploadedFile])

    const onDrop = useCallback(async (acceptedFiles) => {
        if (acceptedFiles.length === 0) return;
        const file = acceptedFiles[0];
        const allowedExtensions = ['.stl', '.obj', '.glb', '.gltf', '.3mf', '.ply'];
        const fileName = file.name.toLowerCase();
        const isValidFile = allowedExtensions.some(ext => fileName.endsWith(ext));
        if (!isValidFile) {
            showToast('Invalid file type. Please upload a 3D model file (.stl, .obj, .glb, .gltf, .3mf, .ply)', 'error');
            return;
        }
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('File too large. Maximum size is 50MB', 'error');
            return;
        }
        setUploading(true);
        setUploadProgress(0);
        let key = null;
        try {
            // Step 1: Get signed URL and S3 key
            const ext = file.name.split('.').pop().toLowerCase();
            const contentType = file.type || getMimeType(ext);
            const signedRes = await fetch('/api/upload/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType })
            });
            if (!signedRes.ok) {
                const error = await signedRes.json();
                throw new Error(error.error || 'Failed to get upload URL');
            }
            const { url, key: s3Key } = await signedRes.json();
            key = s3Key;
            // Step 2: Upload to S3
            const uploadRes = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': contentType },
                body: file
            });
            if (!uploadRes.ok) {
                throw new Error('Failed to upload model to S3');
            }
            // Step 3: Update custom print request with model file info (store only the S3 key)
            const putRes = await fetch('/api/custom-print', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestId,
                    modelFile: {
                        originalName: file.name,
                        s3Key,
                        fileSize: file.size,
                        uploadedAt: new Date().toISOString()
                    }
                })
            });
            if (!putRes.ok) {
                // Clean up S3 if backend update fails
                await fetch(`/api/upload/models?key=${encodeURIComponent(s3Key)}`, { method: 'DELETE' });
                const error = await putRes.json();
                throw new Error(error.error || 'Failed to update print request');
            }
            setUploadProgress(100);
            setUploadedFile({
                name: file.name,
                size: file.size,
                requestId,
                modelKey: s3Key
            });
            showToast('Model uploaded successfully! Configure your print settings next.', 'success');
            if (onUploadComplete) onUploadComplete();
        } catch (error) {
            // Clean up S3 if upload succeeded but backend failed
            if (key) {
                await fetch(`/api/upload/models?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
            }
            showToast(error.message || 'Failed to upload model', 'error');
            setUploadProgress(0);
        } finally {
            setUploading(false);
        }
    }, [user, showToast, onUploadComplete, requestId]);

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
        if (!window.confirm('Are you sure you want to delete this model? This action cannot be undone.')) return
        setDeleting(true)
        try {
            const response = await fetch(`/api/custom-print/delete?requestId=${uploadedFile.requestId}`, {
                method: 'DELETE'
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete model')
            }
            setUploadedFile(null)
            setSavedConfig(null)
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
                            <p className="text-xs text-extraLight">
                                {/* Show file format/extension from key or filename */}
                                {(() => {
                                    let ext = '';
                                    if (uploadedFile?.modelKey) {
                                        const match = uploadedFile.modelKey.match(/\.([a-zA-Z0-9]+)(\?|$)/);
                                        if (match) ext = match[1].toUpperCase();
                                    }
                                    if (!ext && uploadedFile?.name) {
                                        const nameParts = uploadedFile.name.split('.');
                                        if (nameParts.length > 1) ext = nameParts.pop().toUpperCase();
                                    }
                                    return ext ? `${ext} file` : '';
                                })()}
                            </p>
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
