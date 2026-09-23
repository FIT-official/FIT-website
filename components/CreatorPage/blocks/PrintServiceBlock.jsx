'use client'
// Print service: the creator's custom print offer, read client-side from
// GET /api/creators/<id>/print-service. Renders nothing while loading, when
// the endpoint is missing (404) or errors, or when the service is disabled,
// so a page never shows an empty section.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MarkdownRenderer from '@/components/General/MarkdownRenderer'
import { SectionHeading, accentButtonStyle } from '../shared'

const sgd = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return '—'
    return `S$${n.toFixed(2)}`
}

export default function PrintServiceBlock({ settings = {}, creator }) {
    const creatorId = creator?.id ? String(creator.id) : ''
    const accent = creator?.shop?.accentColor || ''
    const [service, setService] = useState(null)

    useEffect(() => {
        if (!creatorId) return undefined
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch(`/api/creators/${encodeURIComponent(creatorId)}/print-service`)
                if (!res.ok) return
                const data = await res.json().catch(() => null)
                if (!cancelled && data && data.enabled) setService(data)
            } catch {
                // degrade to nothing
            }
        })()
        return () => { cancelled = true }
    }, [creatorId])

    if (!service) return null

    const materials = Array.isArray(service.materials) ? service.materials : []
    const requestHref = `/prints/request?creator=${encodeURIComponent(creatorId)}`

    return (
        <div className="flex flex-col gap-4" data-testid="print-service-block">
            <SectionHeading>{settings.heading || service.headline || 'Custom prints'}</SectionHeading>
            <div className="flex flex-col gap-5 rounded-md border border-borderColor bg-background p-5 md:p-6">
                {settings.heading && service.headline && (
                    <h3 className="font-medium text-textColor">{service.headline}</h3>
                )}
                {service.description && (
                    <MarkdownRenderer source={service.description} className="w-full text-sm text-lightColor text-pretty" />
                )}

                {materials.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-lightColor border-b border-borderColor">
                                    <th className="py-2 pr-4 font-medium">Material</th>
                                    <th className="py-2 pr-4 font-medium">Colours</th>
                                    <th className="py-2 font-medium text-right whitespace-nowrap">S$ / g</th>
                                </tr>
                            </thead>
                            <tbody>
                                {materials.map((m, i) => (
                                    <tr key={`${m.name || 'material'}-${i}`} className="border-b border-borderColor last:border-b-0 align-top">
                                        <td className="py-2 pr-4 text-textColor whitespace-nowrap">
                                            {m.name}
                                            {m.note && <div className="text-xs text-lightColor">{m.note}</div>}
                                        </td>
                                        <td className="py-2 pr-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {(Array.isArray(m.colours) ? m.colours : []).map((c, j) => (
                                                    <span
                                                        key={`${c}-${j}`}
                                                        className="rounded-full border border-borderColor bg-baseColor px-2 py-0.5 text-xs text-lightColor"
                                                    >
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-2 text-right text-textColor whitespace-nowrap">
                                            {Number.isFinite(Number(m.pricePerGram)) ? Number(m.pricePerGram).toFixed(2) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-lightColor">
                    <span>Minimum charge: <span className="text-textColor">{sgd(service.minimumCharge)}</span></span>
                    {Number.isFinite(Number(service.leadTimeDays)) && (
                        <span>
                            Lead time: <span className="text-textColor">
                                {Number(service.leadTimeDays)} {Number(service.leadTimeDays) === 1 ? 'day' : 'days'}
                            </span>
                        </span>
                    )}
                    {service.turnaroundNote && <span>{service.turnaroundNote}</span>}
                </div>

                <div>
                    <Link
                        href={requestHref}
                        className="formBlackButton w-fit border"
                        style={accentButtonStyle(accent)}
                    >
                        Upload your model
                    </Link>
                </div>
            </div>
        </div>
    )
}
