"use client"
import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import Link from "next/link"

const statusLabel = {
  pending_config: "Awaiting configuration",
  configured: "Configured",
  payment_pending: "Awaiting quote payment",
  paid: "Paid",
  printing: "Printing",
  printed: "Printed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export default function AccountPrintRequestsPage() {
  const { user, isLoaded } = useUser()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded) return
    if (!user) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        const res = await fetch("/api/account/custom-print")
        if (!res.ok) throw new Error("Failed to load requests")
        const data = await res.json()
        setRequests(data.requests || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [isLoaded, user])

  if (!isLoaded) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="loader" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-sm text-gray-600">Please sign in to view your custom print requests.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Custom print requests</h1>
        <Link href="/prints/request" className="text-sm underline">
          New request
        </Link>
      </div>

      {loading ? (
        <div className="loader" />
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-600">You have no custom print requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.requestId} className="border rounded px-4 py-3 text-sm flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="font-medium">{r.modelFile?.originalName || "Custom print"}</div>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                  {statusLabel[r.status] || r.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Request ID: {r.requestId}
              </div>
              <div className="flex gap-3 mt-1 text-xs">
                <Link
                  href={`/editor?requestId=${encodeURIComponent(r.requestId)}`}
                  className="underline"
                >
                  Open in editor
                </Link>
                {r.status === "payment_pending" && r.totalAmount > 0 && (
                  <Link
                    href={`/cart?addCustomRequest=${encodeURIComponent(r.requestId)}`}
                    className="underline"
                  >
                    Add quoted print to cart
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
