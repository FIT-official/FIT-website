// The flip: once an admin has calibrated the layer-stack estimator in
// Admin → Settings → Print Timing, the PRICED print-time comes from the
// shape-aware estimate instead of the volume-only heuristic. Uncalibrated
// installs keep the heuristic, so quoting never depends on calibration having
// happened. Pure end to end: real geometry → real estimator → real quote.
import { describe, it, expect } from 'vitest'
import { calculateInstantQuote } from '@/lib/quoting/quote'
import { buildQuote } from '@/lib/quoting/quoteRequest'
import {
    estimatePrintHoursLayerStack,
    resolveLayerStackModel,
} from '@/lib/quoting/printTime/layerStack'

// Axis-aligned box mesh (12 triangles), size in mm, centred at the origin.
function boxPositions(sx, sy, sz) {
    const x = sx / 2, y = sy / 2, z = sz / 2
    const c = [
        [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
        [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
    ]
    const idx = [
        0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
    ]
    const positions = []
    for (const i of idx) positions.push(...c[i])
    return positions
}

const SETTINGS = {
    materialType: 'PLA',
    infillPercent: 20,
    wallLoops: 2,
    nozzleMm: 0.4,
    layerHeightMm: 0.2,
    enableSupport: false,
}

// A fitted model is what "the admin calibrated" looks like in AppSettings.
const CALIBRATED = { layerStackModel: { flowMm3PerS: 7.5, perLayerOverheadS: 4 } }
const UNCALIBRATED = { layerStackModel: { flowMm3PerS: null, perLayerOverheadS: null } }

// Two shapes, one volume: 40×40×40mm cube vs a 16×16×250mm tower (64000mm³ each).
const CUBE = boxPositions(40, 40, 40)
const TOWER = boxPositions(16, 16, 250)

// The metrics object the server hands the quote composer. volumeCm3 and the
// bounding box come from the geometry pipeline; printHoursShapeAware is what
// recomputeMetricsFromModel adds when it can parse the model.
const metricsFor = (positions, dimensionsCm, pricingConfig) => ({
    volumeCm3: 64,
    dimensionsCm,
    confidence: 'high',
    // Same call the server recompute makes (lib/quoting/serverGeometry).
    printHoursShapeAware: estimatePrintHoursLayerStack(
        { positions, sourceUnit: 'mm', settings: SETTINGS },
        resolveLayerStackModel(pricingConfig?.layerStackModel),
    ),
})

const CUBE_DIMS = { length: 4, width: 4, height: 4 }
const TOWER_DIMS = { length: 1.6, width: 1.6, height: 25 }

const quote = (positions, dimensionsCm, pricingOverrides) =>
    calculateInstantQuote({
        metrics: metricsFor(positions, dimensionsCm, pricingOverrides),
        settings: SETTINGS,
        pricingOverrides,
    })

const printTimeLine = (q) => q.lines.find((l) => l.key === 'printTime').amount

describe('shape-aware pricing (calibrated)', () => {
    it('prices two equal-volume shapes differently — a tower is not a cube', () => {
        const cube = quote(CUBE, CUBE_DIMS, CALIBRATED)
        const tower = quote(TOWER, TOWER_DIMS, CALIBRATED)

        // Same volume, so the volume-only heuristic cannot tell them apart.
        expect(cube.inputs.volumeCm3).toBe(tower.inputs.volumeCm3)
        // The tower is ~1250 layers vs the cube's ~200: far more per-layer
        // overhead, so it must cost more print time.
        expect(tower.inputs.printHours).toBeGreaterThan(cube.inputs.printHours)
        expect(printTimeLine(tower)).toBeGreaterThan(printTimeLine(cube))
    })

    it('prices from the shape-aware hours, not the heuristic', () => {
        const q = quote(TOWER, TOWER_DIMS, CALIBRATED)

        expect(q.inputs.printTimeSource).toBe('shape-aware')
        expect(q.inputs.printHours).toBeCloseTo(
            metricsFor(TOWER, TOWER_DIMS, CALIBRATED).printHoursShapeAware,
            2,
        )
    })

    it('still records the heuristic estimate alongside it for comparison', () => {
        const q = quote(TOWER, TOWER_DIMS, CALIBRATED)

        expect(q.inputs.printHoursHeuristic).toBeGreaterThan(0)
        expect(q.inputs.printHoursHeuristic).not.toBeCloseTo(q.inputs.printHours, 2)
    })
})

describe('shape-aware pricing (not calibrated)', () => {
    it('keeps pricing on the heuristic so a fresh install still quotes', () => {
        const q = quote(TOWER, TOWER_DIMS, UNCALIBRATED)

        expect(q.inputs.printTimeSource).toBe('heuristic')
        expect(q.inputs.printHours).toBe(q.inputs.printHoursHeuristic)
    })

    it('barely separates the tower from the cube — that gap is what calibration buys', () => {
        // The heuristic does read the bounding box (via the fill fraction), so
        // it is not shape-blind; it just badly understates how much slower a
        // 1250-layer tower is than a 200-layer cube.
        const heuristicRatio =
            printTimeLine(quote(TOWER, TOWER_DIMS, UNCALIBRATED)) /
            printTimeLine(quote(CUBE, CUBE_DIMS, UNCALIBRATED))
        const shapeAwareRatio =
            printTimeLine(quote(TOWER, TOWER_DIMS, CALIBRATED)) /
            printTimeLine(quote(CUBE, CUBE_DIMS, CALIBRATED))

        expect(shapeAwareRatio).toBeGreaterThan(heuristicRatio * 1.5)
    })

    it('an entirely absent layerStackModel is treated as uncalibrated', () => {
        const q = quote(TOWER, TOWER_DIMS, {})

        expect(q.inputs.printTimeSource).toBe('heuristic')
    })
})

describe('shape-aware hours are server-derived only', () => {
    const body = {
        volumeCm3: 64,
        dimensionsCm: TOWER_DIMS,
        settings: SETTINGS,
    }

    it('rejects a client that tries to send its own print hours', () => {
        const attempt = buildQuote(
            { ...body, printHoursShapeAware: 0.01 },
            { pricingConfig: CALIBRATED },
        )

        expect(attempt.ok).toBe(false)
        expect(attempt.status).toBe(400)
    })

    it('prices from the server-context value, which the client cannot reach', () => {
        const serverHours = 9.5
        const priced = buildQuote(body, {
            pricingConfig: CALIBRATED,
            printHoursShapeAware: serverHours,
        })

        expect(priced.ok).toBe(true)
        expect(priced.data.quote.inputs.printHours).toBe(serverHours)
        expect(priced.data.quote.inputs.printTimeSource).toBe('shape-aware')
    })

    it('prices from the heuristic when the server supplies nothing', () => {
        const priced = buildQuote(body, { pricingConfig: CALIBRATED })

        expect(priced.data.quote.inputs.printTimeSource).toBe('heuristic')
        expect(priced.data.quote.inputs.printHours).toBeGreaterThan(0)
    })
})

describe('shape-aware pricing fallbacks', () => {
    it('falls back to the heuristic when the format could not be recomputed', () => {
        // recomputeMetricsFromModel returns no shape-aware hours for an
        // unsupported format (e.g. FBX) — pricing must not become zero.
        const q = calculateInstantQuote({
            metrics: { volumeCm3: 64, dimensionsCm: TOWER_DIMS, confidence: 'low' },
            settings: SETTINGS,
            pricingOverrides: CALIBRATED,
        })

        expect(q.inputs.printTimeSource).toBe('heuristic')
        expect(q.inputs.printHours).toBeGreaterThan(0)
        expect(printTimeLine(q)).toBeGreaterThan(0)
    })

    it('ignores a nonsense shape-aware value rather than pricing from it', () => {
        for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, 'lots']) {
            const q = calculateInstantQuote({
                metrics: {
                    volumeCm3: 64,
                    dimensionsCm: TOWER_DIMS,
                    printHoursShapeAware: bad,
                },
                settings: SETTINGS,
                pricingOverrides: CALIBRATED,
            })
            expect(q.inputs.printTimeSource).toBe('heuristic')
            expect(q.inputs.printHours).toBeGreaterThan(0)
        }
    })
})
