'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import JSZip from 'jszip'
import { encode as arrayBufferToBase64 } from 'base64-arraybuffer'
import dynamic from 'next/dynamic'
import FileDrop from '@/components/Editor/fileDrop'
import useStore from '@/utils/store'
import { is3DModel, isZip } from '@/utils/isExtension'
import { loadFileAsArrayBuffer } from '@/utils/buffers'
import { useUser } from '@clerk/nextjs'

const Loading = () => <div className="loader" />

const Result = dynamic(() => import('@/components/Editor/result'), {
    ssr: false,
    loading: Loading,
})

const Editor = () => {
    const { user, isLoaded } = useUser()
    const searchParams = useSearchParams()
    const orderId = searchParams.get('orderId')
    const productId = searchParams.get('productId')
    const variantId = searchParams.get('variantId')
    const requestId = searchParams.get('requestId') // NEW: Custom print request ID
    const buffers = useStore((state) => state.buffers)
    const [orderData, setOrderData] = useState(null)
    const [productData, setProductData] = useState(null)
    const [customRequestData, setCustomRequestData] = useState(null) // NEW
    const [loading, setLoading] = useState(false)

    // NEW: Load custom print request data when requestId is provided
    useEffect(() => {
        if (!requestId || !isLoaded || !user) return

        const loadCustomRequest = async () => {
            setLoading(true)
            try {
                const requestRes = await fetch(`/api/custom-print?requestId=${requestId}`)
                if (!requestRes.ok) {
                    throw new Error('Failed to load custom print request')
                }
                const { request } = await requestRes.json()
                setCustomRequestData(request)

                // Load the 3D model file
                if (request.modelFile?.s3Url) {
                    const modelRes = await fetch(`/api/proxy?key=${encodeURIComponent(request.modelFile.s3Url)}`)
                    if (modelRes.ok) {
                        const modelBuffer = await modelRes.arrayBuffer()
                        const buffers = new Map()

                        const fileName = request.modelFile.originalName || 'model.glb'
                        buffers.set(fileName, modelBuffer)

                        const { setBuffers, setFileName, setProductId, setVariantId } = useStore.getState()
                        setBuffers(buffers)
                        setFileName(fileName)
                        setProductId('custom-print-request')
                        setVariantId(requestId)

                        useStore.setState({
                            textOriginalFile: btoa(arrayBufferToBase64(modelBuffer)),
                            requestId: requestId, // Store request ID in state
                            isCustomPrint: true
                        })
                    }
                }
            } catch (error) {
                console.error('Error loading custom print request:', error)
            } finally {
                setLoading(false)
            }
        }

        loadCustomRequest()
    }, [requestId, isLoaded, user])

    // Load order data and associated 3D model when orderId is provided
    useEffect(() => {
        if (!orderId || !isLoaded || !user) return

        const loadOrderData = async () => {
            setLoading(true)
            try {
                const orderRes = await fetch(`/api/user/print-order/${orderId}`)
                if (!orderRes.ok) {
                    throw new Error('Failed to load order')
                }
                const order = await orderRes.json()
                setOrderData(order)

                // Load the 3D model file
                if (order.modelUrl) {
                    const modelRes = await fetch(`/api/proxy?key=${encodeURIComponent(order.modelUrl)}`)
                    if (modelRes.ok) {
                        const modelBuffer = await modelRes.arrayBuffer()
                        const buffers = new Map()

                        // Determine file extension from the model URL
                        const fileName = order.modelUrl.split('/').pop() || 'model.glb'
                        buffers.set(fileName, modelBuffer)

                        const { setBuffers, setFileName } = useStore.getState()
                        setBuffers(buffers)
                        setFileName(fileName)

                        useStore.setState({
                            textOriginalFile: btoa(arrayBufferToBase64(modelBuffer)),
                            orderId: orderId, // Store order ID in state for later use
                        })
                    }
                }
            } catch (error) {
                console.error('Error loading order:', error)
            } finally {
                setLoading(false)
            }
        }

        loadOrderData()
    }, [orderId, isLoaded, user])

    // Load product data and associated 3D model when productId is provided (for cart items)
    useEffect(() => {
        if (!productId || !isLoaded || !user) return

        const loadProductData = async () => {
            setLoading(true)
            try {
                // Get product details
                const productRes = await fetch(`/api/product/${productId}`)
                if (!productRes.ok) {
                    throw new Error('Failed to load product')
                }
                const product = await productRes.json()
                setProductData(product)

                // Load the 3D model file
                if (product.viewableModel) {
                    const modelRes = await fetch(`/api/proxy?key=${encodeURIComponent(product.viewableModel)}`)
                    if (modelRes.ok) {
                        const modelBuffer = await modelRes.arrayBuffer()
                        const buffers = new Map()

                        // Determine file extension from the model URL
                        const fileName = product.viewableModel.split('/').pop() || 'model.glb'
                        buffers.set(fileName, modelBuffer)

                        const { setBuffers, setFileName } = useStore.getState()
                        setBuffers(buffers)
                        setFileName(fileName)

                        useStore.setState({
                            textOriginalFile: btoa(arrayBufferToBase64(modelBuffer)),
                            productId: productId,
                            variantId: variantId,
                        })
                    }
                }
            } catch (error) {
                console.error('Error loading product:', error)
            } finally {
                setLoading(false)
            }
        }

        loadProductData()
    }, [productId, variantId, isLoaded, user])

    const onDrop = useCallback(async (acceptedFiles) => {
        const buffers = new Map()

        await Promise.all(
            acceptedFiles.map((file) =>
                loadFileAsArrayBuffer(file).then((buffer) => {
                    const arrayBuffer = buffer instanceof ArrayBuffer ? buffer : new ArrayBuffer(0)
                    buffers.set(file.name?.replace(/^\//, '') ?? file.name, arrayBuffer)
                })
            )
        )

        for (const [path, buffer] of buffers.entries()) {
            if (isZip(path)) {
                const { files } = await JSZip.loadAsync(buffer)
                for (const [innerPath, file] of Object.entries(files)) {
                    const innerBuffer = await file.async('arraybuffer')
                    buffers.set(innerPath, innerBuffer)
                }
                buffers.delete(path)
            }
        }

        const filePath = Array.from(buffers.keys()).find((path) => is3DModel(path))

        if (!filePath) return

        const { setBuffers, setFileName } = useStore.getState()
        setBuffers(buffers)
        setFileName(filePath)

        useStore.setState({
            textOriginalFile: buffers.get(filePath) ? btoa(arrayBufferToBase64(buffers.get(filePath))) : '',
        })
    }, [])


    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <main className="flex flex-col items-center justify-center flex-1" style={{ height: 'calc(100vh - 56px)' }}>
                {loading ? (
                    <div className="loader" />
                ) : buffers ? (
                    <Result />
                ) : (orderId || productId || requestId) ? (
                    <div className="flex flex-col items-center justify-center gap-4">
                        <div className="loader" />
                        <p className="text-lightColor text-sm">Loading 3D model...</p>
                    </div>
                ) : (
                    <FileDrop onDrop={onDrop} />
                )}
            </main>
        </div>
    )
}

export default Editor
