// A creator print farm's saved estimate (CustomPrintRequest.estimate, set by
// POST /api/custom-print/estimate) as display lines, shared by the creator's
// /dashboard/print-jobs drawer and the customer's /account/prints card.
// Pure; the estimate is informational and never a cart price.

// Mongoose fills an empty estimate shape, so only a numeric total counts.
export const hasEstimate = (request) =>
    request?.estimate?.total != null && Number.isFinite(Number(request.estimate.total))

const LABELS = {
    material: 'Material',
    printTime: 'Printing',
    baseFee: 'Setup',
    postProcessing: 'Sand and finish',
    specialRequest: 'Special request',
    priority: 'Priority',
}

/** Itemised lines as the customer saw them (zero fees left out). */
export function estimateLines(estimate = {}) {
    const lines = (estimate.lines || [])
        .filter((line) => LABELS[line.key] && (line.key === 'material' || Number(line.amount) > 0))
        .map((line) => ({ key: line.key, label: LABELS[line.key], amount: Number(line.amount) || 0 }))
    const inputs = estimate.inputs || {}
    const material = lines.find((line) => line.key === 'material')
    if (material && Number(inputs.weightGrams) > 0) material.label = `Material, ${Math.round(inputs.weightGrams)} g`
    const time = lines.find((line) => line.key === 'printTime')
    if (time && Number(inputs.printHours) > 0) time.label = `Printing, ${Number(inputs.printHours).toFixed(1)} h`
    const rush = Number(estimate.expedite?.amount) || 0
    if (estimate.expedite?.applied && rush > 0) lines.push({ key: 'expedite', label: 'Rush', amount: rush })
    const delivery = Number(estimate.delivery?.price) || 0
    const beforeDelivery = (Number(estimate.total) || 0) - delivery
    const itemised = (Number(estimate.subtotal) || 0) - delivery + rush
    if (beforeDelivery - itemised > 0.004) {
        lines.push({ key: 'minimum', label: 'Minimum order top-up', amount: Math.round((beforeDelivery - itemised) * 100) / 100 })
    }
    if (estimate.delivery?.label) lines.push({ key: 'delivery', label: estimate.delivery.label, amount: delivery })
    return lines
}
