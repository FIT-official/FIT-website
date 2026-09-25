// Per-print-farm pricing resolver (lib/quoting/farmProfile.js) and the
// engine's per-material multiplier: inheritance from Fix It Today's
// recommended settings, overrides, legacy derivation, material/colour
// filtering, delivery inherit/replace and the admin-schema bounds.
import { describe, it, expect } from 'vitest'
import {
    resolveFarmPricing, legacyFarmPricing, validateFarmPricing, publicFarmProfile, withFlatDelivery,
    samplePartQuote, materialMultiplierFor, filamentFromName, recommendedPricingPayload, compactOverrides,
} from '@/lib/quoting/farmProfile'
import { calculateInstantQuote } from '@/lib/quoting/quote'
import { FILAMENT_COLOURS } from '@/lib/filamentCatalogue'

const recommended = {
    quotingConfig: { materialRatePerGram: 0.1, printTimeRatePerHour: 3, baseFee: 2, minimumPrice: 5, priorityFee: 4,
        timeModel: { baseFlowCm3PerHour: 10 }, layerStackModel: { flowMm3PerS: 9 } },
    machineLimits: { maxLengthCm: 25.6, maxWidthCm: 25.6, maxHeightCm: 25.6, maxWeightKg: null },
}
const fitDelivery = [{ type: 'pickup', displayName: 'Collect at Sunview', description: '', price: 0, needsAddress: false }]
const farm = (pricing, extra = {}) => ({ creatorUserId: 'c1', enabled: true, leadTimeDays: 5, pricing, ...extra })

describe('resolveFarmPricing', () => {
    it('is Fix It Today itself without a service: every material at the recommended rate', () => {
        const profile = resolveFarmPricing({ recommended, recommendedDelivery: fitDelivery })
        expect(profile.source).toBe('recommended')
        expect(profile.rates).toMatchObject({ materialRatePerGram: 0.1, baseFee: 2, minimumPrice: 5 })
        expect(profile.pricingConfig.layerStackModel).toEqual({ flowMm3PerS: 9 })
        expect(profile.materials.map(m => m.filament)).toEqual(['pla', 'pla_matte', 'petg', 'asa', 'abs', 'tpu'])
        expect(profile.offers).toMatchObject({ priority: true, expedite: true })
        expect(profile.deliveryOptions).toEqual(fitDelivery)
    })

    it('inherits every field a farm does not override, including later recommendation changes', () => {
        const service = farm({ overrides: { printTimeRatePerHour: 2.5 }, materials: [{ filament: 'pla', enabled: true }], version: 3 })
        const before = resolveFarmPricing({ recommended, service })
        expect(before.rates).toMatchObject({ printTimeRatePerHour: 2.5, materialRatePerGram: 0.1, baseFee: 2 })
        const later = resolveFarmPricing({ recommended: { ...recommended, quotingConfig: { ...recommended.quotingConfig, baseFee: 3 } }, service })
        expect(later.rates.baseFee).toBe(3)
        expect(before.version).toBe(3)
        expect(before.source).toBe('farm')
        expect(before.leadTimeDays).toBe(5)
    })

    it('treats null overrides as follow-recommended and merges time model and machine limits per key', () => {
        const service = farm({
            overrides: { minimumPrice: null, baseFee: 0, timeModel: { baseFlowCm3PerHour: 14, minHours: null }, machineLimits: { maxHeightCm: 30 } },
            materials: [{ filament: 'pla' }],
        })
        const profile = resolveFarmPricing({ recommended, service })
        expect(profile.rates.minimumPrice).toBe(5)
        expect(profile.rates.baseFee).toBe(0)
        expect(profile.timeModel.baseFlowCm3PerHour).toBe(14)
        // A farm that sets its own speed is not priced with FIT's calibration.
        expect(profile.pricingConfig.layerStackModel).toBeUndefined()
        expect(profile.machineLimits).toEqual({ maxLengthCm: 25.6, maxWidthCm: 25.6, maxHeightCm: 30, maxWeightKg: null })
    })

    it('offers only enabled materials, drops colours switched off, and applies the multiplier to S$/g', () => {
        const service = farm({ materials: [
            { filament: 'petg', enabled: true, priceMultiplier: 1.5, coloursOff: ['Black'] },
            { filament: 'tpu', enabled: false },
            { filament: 'pla', enabled: true, coloursOff: FILAMENT_COLOURS.filter(c => c.filament === 'pla').map(c => c.name) },
        ] })
        const profile = resolveFarmPricing({ recommended, service })
        expect(profile.materials.map(m => m.filament)).toEqual(['petg'])
        expect(profile.materials[0]).toMatchObject({ multiplier: 1.5, ratePerGram: 0.15, recommendedRatePerGram: 0.1 })
        expect(profile.colours.map(c => c.name)).toEqual(['White'])
        expect(materialMultiplierFor(profile, 'petg')).toBe(1.5)
        expect(materialMultiplierFor(profile, 'tpu')).toBeNull()
    })

    it('replaces the delivery list when the farm has its own, otherwise inherits it', () => {
        const own = resolveFarmPricing({ recommended, recommendedDelivery: fitDelivery,
            service: farm({ materials: [{ filament: 'pla' }], delivery: [{ type: 'courier', label: 'Courier', price: 8, needsAddress: true }] }) })
        expect(own.deliveryOptions).toEqual([{ type: 'courier', displayName: 'Courier', description: '', price: 8, needsAddress: true }])
        const inherit = resolveFarmPricing({ recommended, recommendedDelivery: fitDelivery, service: farm({ materials: [{ filament: 'pla' }], delivery: [] }) })
        expect(inherit.deliveryOptions).toEqual(fitDelivery)
    })

    it('offers rush and priority only when the farm set those fees itself', () => {
        const inherited = resolveFarmPricing({ recommended, service: farm({ materials: [{ filament: 'pla' }] }) })
        expect(inherited.offers).toEqual({ postProcessing: true, specialRequest: true, priority: false, expedite: false })
        const own = resolveFarmPricing({ recommended, service: farm({ overrides: { priorityFee: 6, expediteSurchargePercent: 40 }, materials: [{ filament: 'pla' }] }) })
        expect(own.offers).toMatchObject({ priority: true, expedite: true })
    })
})

describe('legacy print services (no pricing saved)', () => {
    const legacy = {
        creatorUserId: 'c1', enabled: true, leadTimeDays: 4, minimumCharge: 8,
        maxBuildMm: { x: 220, y: 200, z: 180 },
        materials: [
            { name: 'PLA+', pricePerGram: 0.15, colours: ['Black', 'Red', 'Glow'] },
            { name: 'PETG', pricePerGram: 0.2, colours: ['Clear'] },
            { name: 'Resin', pricePerGram: 0.5, colours: [] },
        ],
    }

    it('derives multipliers, minimum, machine limits and lead time from the legacy fields', () => {
        const profile = resolveFarmPricing({ recommended, service: legacy, recommendedDelivery: fitDelivery })
        expect(profile.source).toBe('legacy')
        expect(profile.materials.map(m => [m.filament, m.ratePerGram])).toEqual([['pla', 0.15], ['petg', 0.2]])
        expect(profile.colours.filter(c => c.filament === 'pla').map(c => c.name)).toEqual(['Black', 'Red'])
        // No PETG colour name matched: every catalogue colour stays on.
        expect(profile.colours.filter(c => c.filament === 'petg')).toHaveLength(2)
        expect(profile.rates.minimumPrice).toBe(8)
        expect(profile.machineLimits).toMatchObject({ maxLengthCm: 22, maxWidthCm: 20, maxHeightCm: 18 })
        expect(profile.leadTimeDays).toBe(4)
        expect(profile.deliveryOptions).toEqual(fitDelivery)
    })

    it('keeps exact legacy S$/g when a rate falls outside the multiplier bounds', () => {
        const derived = legacyFarmPricing({ materials: [{ name: 'PLA', pricePerGram: 0.5 }, { name: 'TPU', pricePerGram: 0.9 }] }, 0.02)
        expect(derived.overrides.materialRatePerGram).toBe(0.5)
        expect(derived.materials).toEqual([
            { filament: 'pla', enabled: true, priceMultiplier: 1, coloursOff: [] },
            { filament: 'tpu', enabled: true, priceMultiplier: 1.8, coloursOff: [] },
        ])
    })

    it('leaves a zero minimum charge to follow the recommendation', () => {
        expect(legacyFarmPricing({ minimumCharge: 0, materials: [] }).overrides).not.toHaveProperty('minimumPrice')
    })

    it('matches free-text material names to catalogue filaments', () => {
        expect(filamentFromName('Matte PLA')).toBe('pla_matte')
        expect(filamentFromName('PETG-HF')).toBe('petg')
        expect(filamentFromName('Nylon')).toBeNull()
    })
})

describe('validateFarmPricing (admin-schema bounds)', () => {
    it('accepts a full profile, compacts nulls and drops unknown colours and the client version', () => {
        const result = validateFarmPricing({
            overrides: { materialRatePerGram: 0.12, baseFee: null, expediteMode: 'percent', timeModel: { baseFlowCm3PerHour: 12 }, machineLimits: { maxWeightKg: 2 } },
            materials: [{ filament: 'pla', enabled: true, priceMultiplier: 1.2, coloursOff: ['Black', 'Not a colour'] }],
            delivery: [{ type: 'pickup', label: 'Collect <Jurong>', price: 0 }],
            version: 99,
        })
        expect(result.ok).toBe(true)
        expect(result.value.overrides).toEqual({ materialRatePerGram: 0.12, expediteMode: 'percent', timeModel: { baseFlowCm3PerHour: 12 }, machineLimits: { maxWeightKg: 2 } })
        expect(result.value.materials[0].coloursOff).toEqual(['Black'])
        expect(result.value.delivery[0]).toEqual({ type: 'pickup', label: 'Collect Jurong', price: 0, description: '', needsAddress: false })
        expect(result.value).not.toHaveProperty('version')
    })

    it.each([
        ['a negative rate', { overrides: { baseFee: -1 } }],
        ['an unknown override key', { overrides: { markup: 2 } }],
        ['a time factor under the admin minimum', { overrides: { timeModel: { supportTimeFactor: 0.5 } } }],
        ['a multiplier above 10', { materials: [{ filament: 'pla', priceMultiplier: 11 }] }],
        ['a multiplier below 0.2', { materials: [{ filament: 'pla', priceMultiplier: 0.1 }] }],
        ['an unknown filament', { materials: [{ filament: 'resin' }] }],
        ['a duplicated material', { materials: [{ filament: 'pla' }, { filament: 'pla' }] }],
        ['a duplicated delivery option', { delivery: [{ type: 'a', label: 'A', price: 0 }, { type: 'A', label: 'B', price: 1 }] }],
        ['a bad expedite mode', { overrides: { expediteMode: 'double' } }],
    ])('rejects %s', (_label, input) => {
        expect(validateFarmPricing(input).ok).toBe(false)
    })

    it('compactOverrides keeps only set fields', () => {
        expect(compactOverrides({ baseFee: 0, minimumPrice: null, timeModel: { minHours: null }, machineLimits: {} })).toEqual({ baseFee: 0 })
    })
})

describe('engine materialMultiplier', () => {
    const metrics = { volumeCm3: 24, dimensionsCm: { length: 8, width: 4.2, height: 1.8 }, confidence: 'high' }
    const settings = { materialType: 'pla', infillPercent: 20, wallLoops: 2, nozzleMm: 0.4, layerHeightMm: 0.2 }
    it('defaults to 1 and scales only the material line', () => {
        const base = calculateInstantQuote({ metrics, settings, pricingOverrides: { minimumPrice: 0 } })
        const doubled = calculateInstantQuote({ metrics, settings, pricingOverrides: { minimumPrice: 0 }, materialMultiplier: 2 })
        const line = (q, key) => q.lines.find(l => l.key === key).amount
        expect(line(doubled, 'material')).toBeCloseTo(line(base, 'material') * 2, 1)
        expect(line(doubled, 'printTime')).toBe(line(base, 'printTime'))
        expect(base.inputs).not.toHaveProperty('materialMultiplier')
        expect(doubled.inputs.materialMultiplier).toBe(2)
    })
    it('ignores a non-positive or non-finite multiplier', () => {
        const base = calculateInstantQuote({ metrics, settings })
        expect(calculateInstantQuote({ metrics, settings, materialMultiplier: 0 }).total).toBe(base.total)
        expect(calculateInstantQuote({ metrics, settings, materialMultiplier: Number.NaN }).total).toBe(base.total)
    })
})

describe('public profile, delivery and sample', () => {
    const profile = resolveFarmPricing({ recommended, recommendedDelivery: fitDelivery,
        service: farm({ overrides: { materialRatePerGram: 0.12, priorityFee: 3 }, materials: [{ filament: 'pla', priceMultiplier: 1.25 }] }) })

    it('publishes materials, colours, S$/g, delivery, lead time and limits without override internals', () => {
        const pub = publicFarmProfile(profile)
        expect(Object.keys(pub).sort()).toEqual(['deliveryOptions', 'leadTimeDays', 'machineLimits', 'materials', 'offers'])
        expect(pub.materials[0]).toMatchObject({ filament: 'pla', label: 'PLA', ratePerGram: 0.15 })
        expect(pub.materials[0]).not.toHaveProperty('multiplier')
        expect(JSON.stringify(pub)).not.toContain('printTimeRatePerHour')
    })

    it('adds a flat delivery fee to the delivery line, subtotal and total', () => {
        const quote = { lines: [{ key: 'material', amount: 3 }, { key: 'delivery', amount: 0 }], subtotal: 3, total: 5 }
        expect(withFlatDelivery(quote, { type: 'courier', displayName: 'Courier', price: 8 })).toMatchObject({
            lines: [{ key: 'material', amount: 3 }, { key: 'delivery', amount: 8 }], subtotal: 11, total: 13,
            delivery: { type: 'courier', label: 'Courier', price: 8 },
        })
        expect(withFlatDelivery(quote, null)).toBe(quote)
    })

    it('prices the dashboard sample part with the farm profile and with Fix It Today', () => {
        const farmSample = samplePartQuote(profile, 'pla')
        const fitSample = samplePartQuote(resolveFarmPricing({ recommended }), 'pla')
        expect(farmSample.inputs.materialMultiplier).toBe(1.25)
        expect(farmSample.lines.find(l => l.key === 'material').amount)
            .toBeGreaterThan(fitSample.lines.find(l => l.key === 'material').amount)
        expect(samplePartQuote(profile, 'tpu')).toBeNull()
    })

    it('builds the recommended payload the dashboard resolves locally', () => {
        const payload = recommendedPricingPayload({ appSettings: recommended, recommendedDelivery: fitDelivery })
        expect(payload.quotingConfig).toMatchObject({ materialRatePerGram: 0.1, baseFee: 2 })
        expect(payload.quotingConfig).not.toHaveProperty('layerStackModel')
        expect(payload.materials).toHaveLength(6)
        expect(resolveFarmPricing({ recommended: payload }).rates).toEqual(resolveFarmPricing({ recommended }).rates)
    })
})
