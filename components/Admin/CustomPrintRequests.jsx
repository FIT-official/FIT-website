'use client'
import { useEffect, useState } from 'react'

export default function CustomPrintRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [quoteAmount, setQuoteAmount] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [note, setNote] = useState('')
  const [deliveryTypes, setDeliveryTypes] = useState([])
  const [selectedDeliveryType, setSelectedDeliveryType] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      // Load requests
      const res = await fetch('/api/admin/custom-print-requests')
      if (!res.ok) throw new Error('Failed to load requests')
      const data = await res.json()
      setRequests(data.requests || [])

      // Load custom print product config to get delivery types
      const prodRes = await fetch('/api/product/custom-print-config')
      if (prodRes.ok) {
        const prodData = await prodRes.json()
        const types = prodData.product?.delivery?.deliveryTypes ?? []
        // deliveryTypes can be array of strings or objects; normalize to { type, label }
        const normalized = types.map((t) => {
          if (typeof t === 'string') return { type: t, label: t }
          if (t && typeof t === 'object') return { type: t.type || t.name, label: t.label || t.type || t.name }
          return null
        }).filter(Boolean)
        setDeliveryTypes(normalized)
      }
    } catch (e) {
      setError(e.message || 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const startQuote = (r) => {
    setEditing(r.requestId)
    setQuoteAmount(r.basePrice > 0 ? String(r.basePrice) : '')
    setDeliveryFee(r.deliveryFee > 0 ? String(r.deliveryFee) : '')
    setSelectedDeliveryType(r.deliveryType || deliveryTypes[0]?.type || '')
    setNote('')
  }

  const submitQuote = async (requestId) => {
    try {
      const body = {
        requestId,
        action: 'quote',
        quoteAmount: Number(quoteAmount || 0),
        deliveryFee: deliveryFee === '' ? 0 : Number(deliveryFee),
        deliveryType: selectedDeliveryType || null,
        note,
      }
      const res = await fetch('/api/admin/custom-print-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to save quote')
      setEditing(null)
      await load()
    } catch (e) {
      alert(e.message || 'Failed to save quote')
    }
  }

  const cancelRequest = async (requestId) => {
    if (!confirm('Cancel this request?')) return
    try {
      const res = await fetch('/api/admin/custom-print-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'cancel' }),
      })
      if (!res.ok) throw new Error('Failed to cancel request')
      await load()
    } catch (e) {
      alert(e.message || 'Failed to cancel request')
    }
  }

  return (
    <div className="px-6 md:px-12 py-8">
      <h2 className="font-semibold mb-4 text-sm">Custom Print Requests</h2>
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {loading ? (
        <div className="loader" />
      ) : requests.length === 0 ? (
        <p className="text-xs text-gray-500">No custom print requests yet.</p>
      ) : (
        <div className="space-y-3 text-xs">
          {requests.map((r) => (
            <div key={r.requestId} className="border border-borderColor rounded p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.modelFile?.originalName || 'Custom print'}</div>
                  <div className="text-[10px] text-gray-500">{r.userEmail}</div>
                  <div className="text-[10px] text-gray-500">Request ID: {r.requestId}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-gray-100 text-[10px] uppercase tracking-wide">
                  {r.status}
                </span>
              </div>
              {editing === r.requestId ? (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] mb-1">Print price</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={quoteAmount}
                        onChange={(e) => setQuoteAmount(e.target.value)}
                        className="w-full border rounded px-2 py-1 text-[11px]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] mb-1">Delivery fee</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deliveryFee}
                        onChange={(e) => setDeliveryFee(e.target.value)}
                        className="w-full border rounded px-2 py-1 text-[11px]"
                      />
                    </div>
                  </div>
                  {deliveryTypes.length > 0 && (
                    <div>
                      <label className="block text-[10px] mb-1">Delivery type for this quote</label>
                      <select
                        value={selectedDeliveryType}
                        onChange={(e) => setSelectedDeliveryType(e.target.value)}
                        className="w-full border rounded px-2 py-1 text-[11px] bg-white"
                      >
                        {deliveryTypes.map((dt) => (
                          <option key={dt.type} value={dt.type}>
                            {dt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] mb-1">Admin note (optional)</label>
                    <textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-[11px]"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-3 py-1 border rounded text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitQuote(r.requestId)}
                      className="px-3 py-1 bg-black text-white rounded text-[11px]"
                    >
                      Save quote
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-[11px] text-gray-600">
                    {r.totalAmount > 0 ? (
                      <span>
                        Quote: {r.totalAmount.toFixed(2)} {r.currency?.toUpperCase() || 'SGD'}
                      </span>
                    ) : (
                      <span>No quote yet</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startQuote(r)}
                      className="px-3 py-1 border rounded text-[11px]"
                    >
                      {r.totalAmount > 0 ? 'Edit quote' : 'Create quote'}
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelRequest(r.requestId)}
                      className="px-3 py-1 border rounded text-[11px] text-red-600 border-red-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
