'use client'
import { Suspense } from 'react'
import FabricationRequestFlow from '@/components/Fabrication/FabricationRequestFlow'
export default function ServiceRequestPage() { return <Suspense fallback={<p className="p-8">Loading…</p>}><FabricationRequestFlow /></Suspense> }
