import { describe, it, expect } from 'vitest'
import { summarisePricingImpact } from '@/lib/quoting/printTime/pricingImpact'

const quote = (source, heuristic, shape, extra = {}) => ({
    requestId: extra.requestId || `req-${source}-${heuristic}-${shape}`,
    quote: {
        total: extra.total ?? 10,
        currency: 'sgd',
        inputs: {
            printTimeSource: source,
            printHours: source === 'shape-aware' ? shape : heuristic,
            printHoursHeuristic: heuristic,
            ...(shape != null ? { printHoursShapeAware: shape } : {}),
        },
    },
})

describe('summarisePricingImpact', () => {
    it('counts which model priced each quote', () => {
        const s = summarisePricingImpact([
            quote('shape-aware', 2, 3),
            quote('shape-aware', 2, 1),
            quote('heuristic', 2, null),
        ])

        expect(s.total).toBe(3)
        expect(s.shapeAwarePriced).toBe(2)
        expect(s.heuristicPriced).toBe(1)
    })

    it('reports the median shape/heuristic ratio over comparable quotes only', () => {
        const s = summarisePricingImpact([
            quote('shape-aware', 2, 1), // 0.5
            quote('shape-aware', 2, 2), // 1.0
            quote('shape-aware', 2, 4), // 2.0
            quote('heuristic', 2, null), // not comparable
        ])

        expect(s.comparable).toBe(3)
        expect(s.medianRatio).toBe(1)
    })

    it('averages the middle pair for an even number of ratios', () => {
        const s = summarisePricingImpact([quote('shape-aware', 2, 1), quote('shape-aware', 2, 3)])

        expect(s.medianRatio).toBeCloseTo((0.5 + 1.5) / 2, 5)
    })

    it('surfaces the biggest movers in either direction', () => {
        const s = summarisePricingImpact(
            [
                quote('shape-aware', 2, 2.1, { requestId: 'barely' }),
                quote('shape-aware', 2, 6, { requestId: 'much-slower' }),
                quote('shape-aware', 2, 0.4, { requestId: 'much-faster' }),
            ],
            2,
        )

        expect(s.movers.map((m) => m.requestId)).toEqual(['much-slower', 'much-faster'])
    })

    it('ignores quotes with no usable comparison instead of skewing the median', () => {
        const s = summarisePricingImpact([
            quote('heuristic', 2, 0),
            quote('heuristic', 2, -1),
            quote('heuristic', 2, Number.NaN),
            quote('heuristic', 0, 3),
            { requestId: 'legacy', quote: { total: 5 } }, // pre-flip quote, no inputs
        ])

        expect(s.comparable).toBe(0)
        expect(s.medianRatio).toBeNull()
        expect(s.movers).toEqual([])
        expect(s.total).toBe(4) // the legacy row has no inputs at all
    })

    it('handles an empty history', () => {
        expect(summarisePricingImpact([])).toMatchObject({
            total: 0,
            comparable: 0,
            medianRatio: null,
            movers: [],
        })
    })
})
