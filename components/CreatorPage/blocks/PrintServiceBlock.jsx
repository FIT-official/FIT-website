'use client'
// Print service: the creator's custom print offer, read client-side from
// GET /api/creators/<id>/print-service, which answers
// `{ enabled, creator, service, profile }`. Materials, colours, per-material
// S$/g, lead time, machine limits and delivery come from the farm's resolved
// pricing `profile`; a response without one (older server) falls back to the
// legacy `service` fields. Renders nothing while loading, when the endpoint is
// missing (404) or errors, or when the service is disabled, so a page never
// shows an empty section.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MarkdownRenderer from '@/components/General/MarkdownRenderer'
import { SectionHeading, accentButtonStyle } from '../shared'

const sgd = (value, dp = 2) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return '—'
    return `S$${n.toFixed(dp)}`
}
// S$/g often needs a third decimal (0.125); keep two when that is exact.
const perGram = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return '—'
    return Math.round(n * 100) === n * 100 ? n.toFixed(2) : n.toFixed(3)
}

/** One shape for the block, from the public profile or the legacy service. */
export function printServiceView(data) {
    const service = data?.service || {}
    const profile = data?.profile || null
    if (profile) {
        const limits = profile.machineLimits || null
        const size = limits && ['maxLengthCm', 'maxWidthCm', 'maxHeightCm'].every((key) => Number(limits[key]) > 0)
            ? `${[limits.maxLengthCm, limits.maxWidthCm, limits.maxHeightCm].map((cm) => Math.round(Number(cm) * 10)).join(' × ')} mm`
            : ''
        return {
            materials: (profile.materials || []).map((m) => ({
                name: m.label || m.filament,
                colours: (m.colours || []).map((c) => ({ name: c.name, hex: c.hex })),
                ratePerGram: m.ratePerGram,
                note: '',
            })),
            minimumCharge: null,
            leadTimeDays: profile.leadTimeDays ?? service.leadTimeDays,
            maxSize: size,
            maxWeightKg: Number(limits?.maxWeightKg) > 0 ? Number(limits.maxWeightKg) : null,
            delivery: (profile.deliveryOptions || []).map((d) => ({ key: d.type, name: d.displayName, price: Number(d.price) || 0 })),
        }
    }
    const build = service.maxBuildMm
    return {
        materials: (Array.isArray(service.materials) ? service.materials : []).map((m) => ({
            name: m.name,
            colours: (Array.isArray(m.colours) ? m.colours : []).map((c) => ({ name: c, hex: null })),
            ratePerGram: m.pricePerGram,
            note: m.note || '',
        })),
        minimumCharge: Number(service.minimumCharge) > 0 ? Number(service.minimumCharge) : null,
        leadTimeDays: service.leadTimeDays,
        maxSize: build && ['x', 'y', 'z'].every((axis) => Number(build[axis]) > 0) ? `${build.x} × ${build.y} × ${build.z} mm` : '',
        maxWeightKg: null,
        delivery: [],
    }
}

export default function PrintServiceBlock({ settings = {}, creator }) {
    const creatorId = creator?.id ? String(creator.id) : ''
    const accent = creator?.shop?.accentColor || ''
    const [data, setData] = useState(null)

    useEffect(() => {
        if (!creatorId) return undefined
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch(`/api/creators/${encodeURIComponent(creatorId)}/print-service`)
                if (!res.ok) return
                const body = await res.json().catch(() => null)
                if (!cancelled && body && body.enabled && body.service) setData(body)
            } catch {
                // degrade to nothing
            }
        })()
        return () => { cancelled = true }
    }, [creatorId])

    if (!data) return null

    const service = data.service
    const view = printServiceView(data)
    const leadTimeDays = Number(view.leadTimeDays)
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

                {view.materials.length > 0 && (
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
                                {view.materials.map((m, i) => (
                                    <tr key={`${m.name || 'material'}-${i}`} className="border-b border-borderColor last:border-b-0 align-top">
                                        <td className="py-2 pr-4 text-textColor whitespace-nowrap">
                                            {m.name}
                                            {m.note && <div className="text-xs text-lightColor">{m.note}</div>}
                                        </td>
                                        <td className="py-2 pr-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {m.colours.map((c, j) => (
                                                    <span
                                                        key={`${c.name}-${j}`}
                                                        className="inline-flex items-center gap-1 rounded-full border border-borderColor bg-baseColor px-2 py-0.5 text-xs text-lightColor"
                                                    >
                                                        {c.hex && (
                                                            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-borderColor" style={{ backgroundColor: c.hex }} />
                                                        )}
                                                        {c.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-2 text-right text-textColor whitespace-nowrap">{perGram(m.ratePerGram)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-lightColor">
                    {view.minimumCharge != null && (
                        <span>Minimum charge: <span className="text-textColor">{sgd(view.minimumCharge)}</span></span>
                    )}
                    {Number.isFinite(leadTimeDays) && leadTimeDays > 0 && (
                        <span>
                            Lead time: <span className="text-textColor">
                                {leadTimeDays} {leadTimeDays === 1 ? 'day' : 'days'}
                            </span>
                        </span>
                    )}
                    {view.maxSize && <span>Largest part: <span className="text-textColor">{view.maxSize}</span></span>}
                    {view.maxWeightKg != null && <span>Up to <span className="text-textColor">{view.maxWeightKg} kg</span></span>}
                    {view.delivery.length > 0 && (
                        <span>
                            Delivery: <span className="text-textColor">
                                {view.delivery.map((d) => `${d.name} (${d.price > 0 ? sgd(d.price) : 'free'})`).join(', ')}
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
