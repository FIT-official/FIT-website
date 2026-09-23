'use client'
import { Suspense } from 'react'
import PrintRequestFlow from '@/components/PrintRequestFlow'

export default function CustomPrintRequestPage() {
  return <Suspense fallback={<p className="p-8 text-sm">Loading…</p>}><PrintRequestFlow /></Suspense>
}
