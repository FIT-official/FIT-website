'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PrintRequestFlow from '@/components/PrintRequestFlow'
import GuidedPrintRequest from '@/components/PrintRequest/GuidedPrintRequest'
function RequestEntry() {
  const params = useSearchParams()
  return params.get('requestId') || params.get('creator') || params.get('mode') === 'advanced'
    ? <PrintRequestFlow /> : <GuidedPrintRequest />
}
export default function CustomPrintRequestPage() {
  return <Suspense fallback={<p className="p-8 text-sm">Loading…</p>}><RequestEntry /></Suspense>
}
