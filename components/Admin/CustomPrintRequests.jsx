'use client'
import { useEffect, useState } from 'react';
import ShippingFields from '@/components/DashboardComponents/ProductFormFields/ShippingFields';
import { useToast } from '@/components/General/ToastProvider';
import { useAdminSettings } from '@/utils/AdminSettingsContext';
import { FaDownload } from 'react-icons/fa6';
import { FaSearch } from 'react-icons/fa';
import * as XLSX from 'xlsx';

export default function CustomPrintRequests() {
  const { showToast } = useToast();
  const { settings: adminSettings } = useAdminSettings();
  const [search, setSearch] = useState('');
  const [filteredRequests, setFilteredRequests] = useState([]);

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [quoteAmount, setQuoteAmount] = useState('')
  const [note, setNote] = useState('')
  const [selectedDeliveryType, setSelectedDeliveryType] = useState('')
  const [shippingEdit, setShippingEdit] = useState({}); // { [requestId]: {dimensions, delivery} }

  useEffect(() => {
    if (!search) {
      setFilteredRequests(requests);
    } else {
      setFilteredRequests(requests.filter(r => {
        return (
          (r.modelFile?.originalName || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.userEmail || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.requestId || '').toLowerCase().includes(search.toLowerCase())
        );
      }));
    }
  }, [search, requests]);

  // Download print config as txt
  const downloadConfig = (r) => {
    if (!r.printConfiguration) return;
    const configStr = JSON.stringify(r.printConfiguration, null, 2);
    const blob = new Blob([configStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `print-config-${r.requestId}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const downloadModel = (r) => {
    if (!r.modelFile?.s3Key) return;
    const url = `/api/proxy?key=${encodeURIComponent(r.modelFile.s3Key)}`;
    window.open(url, '_blank');
  };

  const exportToExcel = () => {
    if (!filteredRequests.length) return;
    const exportData = filteredRequests.map(r => ({
      RequestID: r.requestId,
      User: r.userEmail,
      Status: r.status,
      ModelName: r.modelFile?.originalName || '',
      ModelSize: r.modelFile?.fileSize || '',
      PrintConfig: r.printConfiguration ? JSON.stringify(r.printConfiguration) : '',
      CreatedAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
      UpdatedAt: r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 36 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 60 }, { wch: 24 }, { wch: 24 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Print Requests');
    const filename = `Custom_Print_Requests_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('Export successful!', 'success');
  };

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      // Load requests
      const res = await fetch('/api/admin/custom-print-requests')
      if (!res.ok) throw new Error('Failed to load requests')
      const data = await res.json()
      setRequests(data.requests || [])
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
    setQuoteAmount(typeof r.printFee === 'number' && r.printFee > 0 ? String(r.printFee) : '')
    setNote(r.adminNote || '')
    setShippingEdit(edit => ({
      ...edit,
      [r.requestId]: {
        dimensions: {
          length: r.dimensions?.length ?? '',
          width: r.dimensions?.width ?? '',
          height: r.dimensions?.height ?? '',
          weight: r.dimensions?.weight ?? '',
        },
        delivery: r.delivery || { deliveryTypes: [] },
      }
    }))
  }

  const submitQuote = async (requestId) => {
    try {
      const shipping = shippingEdit[requestId] || {};
      // Sanitize dimensions: ensure numbers or null, match Product.js
      const dims = shipping.dimensions || {};
      const dimensions = {
        length: dims.length !== undefined && dims.length !== '' ? Number(dims.length) : null,
        width: dims.width !== undefined && dims.width !== '' ? Number(dims.width) : null,
        height: dims.height !== undefined && dims.height !== '' ? Number(dims.height) : null,
        weight: dims.weight !== undefined && dims.weight !== '' ? Number(dims.weight) : null,
      };
      // Sanitize deliveryTypes: match Product.js DeliveryTypeSchema
      const delivery = { deliveryTypes: [] };
      if (shipping.delivery && Array.isArray(shipping.delivery.deliveryTypes)) {
        delivery.deliveryTypes = shipping.delivery.deliveryTypes.map(dt => ({
          type: dt.type,
          price: dt.price !== undefined ? Number(dt.price) : 0,
          customPrice: dt.customPrice !== undefined ? Number(dt.customPrice) : null,
          customDescription: dt.customDescription || null,
          pickupLocation: dt.pickupLocation || null,
          deliveryTypeConfigId: dt.deliveryTypeConfigId || null
        })).filter(dt => dt.type);
      }
      const body = {
        requestId,
        action: 'quote',
        quoteAmount: Number(quoteAmount || 0),
        note,
        dimensions,
        delivery,
      };
      const res = await fetch('/api/admin/custom-print-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save quote');
      setEditing(null);
      await load();
    } catch (e) {
      alert(e.message || 'Failed to save quote');
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
      {/* Top controls: search, export */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <FaSearch className="text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by user, model, or request ID..."
            className="border border-borderColor rounded px-2 py-1 text-xs w-64"
          />
        </div>
        <button
          onClick={exportToExcel}
          disabled={filteredRequests.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-black text-white rounded hover:bg-gray-800 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FaDownload /> Export to Excel
        </button>
      </div>
      <h2 className="font-semibold mb-4 text-sm">Custom Print Requests</h2>
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {loading ? (
        <div className="loader" />
      ) : filteredRequests.length === 0 ? (
        <p className="text-xs text-gray-500">No custom print requests yet.</p>
      ) : (
        <div className="space-y-3 text-xs">
          {filteredRequests.map((r) => (
            <div key={r.requestId} className="border border-borderColor rounded p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.modelFile?.originalName || 'Custom print'}</div>
                  <div className="text-[10px] text-gray-500">{r.userEmail}</div>
                  <div className="text-[10px] text-gray-500">Request ID: {r.requestId}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-gray-100 text-[10px] uppercase tracking-wide">
                  {(() => {
                    // Human readable status
                    switch (r.status) {
                      case 'pending_upload': return 'Awaiting Model Upload';
                      case 'pending_config': return 'Awaiting Print Config';
                      case 'configured': return 'Awaiting Quote';
                      case 'quoted': return 'Quoted';
                      case 'payment_pending': return 'Awaiting Payment';
                      case 'paid': return 'Paid';
                      case 'printing': return 'Printing';
                      case 'printed': return 'Printed';
                      case 'shipped': return 'Shipped';
                      case 'delivered': return 'Delivered';
                      case 'cancelled': return 'Cancelled';
                      default: return r.status;
                    }
                  })()}
                </span>
              </div>
              {/* Download buttons */}
              <div className="flex flex-wrap gap-2 mt-2">
                {r.printConfiguration && (
                  <button
                    onClick={() => downloadConfig(r)}
                    className="flex items-center gap-1 px-2 py-1 border rounded text-xs hover:bg-gray-50"
                  >
                    <FaDownload /> Print Config
                  </button>
                )}
                {r.modelFile?.s3Key && (
                  <button
                    onClick={() => downloadModel(r)}
                    className="flex items-center gap-1 px-2 py-1 border rounded text-xs hover:bg-gray-50"
                  >
                    <FaDownload /> Model File
                  </button>
                )}
              </div>
              {editing === r.requestId ? (
                <div className="mt-2 flex flex-col gap-4">
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
                  </div>
                  {/* ShippingFields for dimensions and delivery types */}
                  <div className="border rounded-lg p-2 bg-baseColor">
                    <ShippingFields
                      form={{
                        productType: 'print',
                        dimensions: (shippingEdit[r.requestId]?.dimensions) || r.dimensions || { length: '', width: '', height: '', weight: '' },
                        delivery: (shippingEdit[r.requestId]?.delivery) || r.delivery || { deliveryTypes: [] },
                      }}
                      handleChange={e => {
                        const { name, value } = e.target;
                        setShippingEdit(edit => ({
                          ...edit,
                          [r.requestId]: {
                            ...edit[r.requestId],
                            dimensions: {
                              ...((edit[r.requestId] && edit[r.requestId].dimensions) || r.dimensions || {}),
                              [name]: ["length", "width", "height", "weight"].includes(name)
                                ? (value === '' ? '' : Number(value))
                                : value
                            },
                            delivery: (edit[r.requestId] && edit[r.requestId].delivery) || r.delivery || { deliveryTypes: [] }
                          }
                        }))
                      }}
                      setForm={updater => {
                        setShippingEdit(edit => {
                          const current = {
                            productType: 'print',
                            dimensions: edit[r.requestId]?.dimensions || r.dimensions || { length: '', width: '', height: '', weight: '' },
                            delivery: edit[r.requestId]?.delivery || r.delivery || { deliveryTypes: [] },
                          }

                          const next = typeof updater === 'function' ? updater(current) : updater

                          return {
                            ...edit,
                            [r.requestId]: {
                              ...edit[r.requestId],
                              dimensions: next?.dimensions ?? current.dimensions,
                              delivery: next?.delivery ?? current.delivery,
                            }
                          }
                        })
                      }}
                      availableDeliveryTypes={adminSettings?.deliveryTypes || []}
                      hidePriceEditor={false}
                      hideDimensions={false}
                    />
                  </div>
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
                    {(() => {
                      switch (r.status) {
                        case 'pending_upload':
                          return <span>No model uploaded</span>;
                        case 'pending_config':
                          return <span>Model uploaded, awaiting print config</span>;
                        case 'configured':
                          return <span>Model & config done, awaiting quote</span>;
                        case 'quoted': {
                          const base = typeof r.basePrice === 'number' ? r.basePrice : 0;
                          const fee = typeof r.printFee === 'number' ? r.printFee : 0;
                          const total = base + fee;
                          return <span>Quote: {total.toFixed(2)} {r.currency?.toUpperCase() || 'SGD'}</span>;
                        }
                        case 'payment_pending':
                          return <span>Quote sent, awaiting payment</span>;
                        case 'paid':
                          return <span>Paid, in queue for printing</span>;
                        case 'printing':
                          return <span>Printing in progress</span>;
                        case 'printed':
                          return <span>Printed, ready for shipping</span>;
                        case 'shipped':
                          return <span>Shipped</span>;
                        case 'delivered':
                          return <span>Delivered</span>;
                        case 'cancelled':
                          return <span>Request cancelled</span>;
                        default:
                          return <span>{r.status}</span>;
                      }
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startQuote(r)}
                      className="px-3 py-1 border rounded text-[11px]"
                    >
                      {typeof r.printFee === 'number' && r.printFee > 0 ? 'Edit quote' : 'Create quote'}
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
