'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { encode as arrayBufferToBase64 } from 'base64-arraybuffer'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import useStore from '@/utils/store'
import { safeInternalPath } from '@/utils/safeReturnPath'
import { SignInButton, useUser } from '@clerk/nextjs'

const Result = dynamic(() => import('@/components/Editor/result'), {
  ssr: false, loading: () => <p className="p-8 text-sm">Preparing the print editor…</p>,
})
const MAX_BYTES = 25 * 1024 * 1024

export default function Editor() {
  const { user, isLoaded } = useUser()
  const searchParams = useSearchParams()
  const productId = searchParams.get('productId')
  const variantId = searchParams.get('variantId')
  const requestId = searchParams.get('requestId')
  const returnTo = searchParams.get('returnTo')
  const buffers = useStore(state => state.buffers)
  const [loading, setLoading] = useState(Boolean(productId || requestId))
  const [error, setError] = useState('')

  useEffect(() => {
    const state = useStore.getState()
    state.setReturnTo(safeInternalPath(returnTo))
  }, [returnTo])

  useEffect(() => {
    useStore.setState({ productId: productId || null, variantId: variantId || null,
      requestId: requestId || null, isCustomPrint: Boolean(requestId),
      productPrintConfig: null, productColours: null, colourVariantName: null })
  }, [productId, variantId, requestId])

  useEffect(() => {
    if (!requestId && !productId) { setLoading(false); return }
    useStore.setState({ buffers: null, scene: null, geometryMetrics: null })
    if (!isLoaded || !user) { setLoading(false); return }
    const abort = new AbortController()
    setLoading(true); setError('')
    ;(async () => {
      try {
        const endpoint = requestId ? `/api/custom-print?requestId=${encodeURIComponent(requestId)}` : `/api/product/${encodeURIComponent(productId)}`
        const response = await fetch(endpoint, { signal: abort.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'This print request could not be opened.')
        const item = requestId ? data.request : data
        if (!item) throw new Error('This print request was not found.')
        const key = requestId ? item.modelFile?.s3Key : item.viewableModel
        if (!key) throw new Error('No model is attached to this request yet.')
        const modelResponse = await fetch(`/api/proxy?key=${encodeURIComponent(key)}`, { signal: abort.signal })
        if (!modelResponse.ok) throw new Error('The model could not be downloaded. Reload this page to retry.')
        if (Number(modelResponse.headers.get('content-length')) > MAX_BYTES) throw new Error('This model is larger than the 25 MB preview limit.')
        const buffer = await modelResponse.arrayBuffer()
        if (buffer.byteLength > MAX_BYTES) throw new Error('This model is larger than the 25 MB preview limit.')
        if (abort.signal.aborted) return
        const filename = requestId ? item.modelFile.originalName || key.split('/').pop() : key.split('/').pop()
        const state = useStore.getState()
        state.setFileName(filename)
        state.setBuffers(new Map([[filename, buffer]]))
        const colourVariant = item.variantTypes?.find(variant => /colou?r/i.test(variant.name))
        const fixed = !requestId && item.productType === 'print' && item.printConfig
        useStore.setState({
          textOriginalFile: arrayBufferToBase64(buffer),
          productId: requestId ? 'custom-print-request' : productId,
          variantId: requestId || variantId, requestId: requestId || null,
          isCustomPrint: Boolean(requestId), productPrintConfig: fixed ? item.printConfig : null,
          productColours: fixed ? (colourVariant?.options || []).map(option => ({ name: option.name, hex: option.hex })) : null,
          colourVariantName: fixed ? colourVariant?.name || null : null,
        })
      } catch (err) { if (!abort.signal.aborted) setError(err.message || 'The model could not be opened.') }
      finally { if (!abort.signal.aborted) setLoading(false) }
    })()
    return () => abort.abort()
  }, [requestId, productId, variantId, isLoaded, user])

  // A model dropped here without a request could never be saved (D6). The
  // request page creates the request, uploads the model and opens the editor
  // with it, so the editor sends people there instead of offering a drop zone.
  return <main className="w-full min-h-[calc(100vh-56px)]" style={{ height: 'calc(100dvh - 56px)' }}>
    {error ? <div className="mx-auto flex max-w-xl flex-col gap-4 p-8"><p role="alert" className="text-red-700">{error}</p><Link href="/prints/request" className="underline">Start a new print request</Link><button type="button" onClick={() => window.location.reload()} className="text-left underline">Reload this model</button></div>
      : loading ? <p className="p-8 text-center text-sm">Loading your model…</p>
      : (productId || requestId) && !user ? <div className="p-8 text-center"><p className="mb-4">Sign in to open your saved print request.</p><SignInButton mode="modal"><button type="button" className="rounded bg-black px-5 py-3 text-white">Sign in</button></SignInButton></div>
      : buffers ? <Result />
      : <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Start with a print request</h1>
        <p className="text-sm text-lightColor">Upload your model on the request page, choose material and colour and see the price. The 3D editor opens from there for per-part colours and detailed settings.</p>
        <Link href="/prints/request" className="mx-auto rounded-lg bg-textColor px-5 py-3 text-sm font-semibold text-background">Get a 3D print made</Link>
      </div>}
  </main>
}
