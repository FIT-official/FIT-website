// AppSettings.quotingConfig numeric fields must be bounded at the schema
// layer (defense-in-depth), independent of the admin API's zod validation —
// any other write path (migration script, mongosh, a future endpoint) must
// not be able to persist a negative rate/fee/minimum price.
import { describe, it, expect } from 'vitest'
import AppSettings from '@/models/AppSettings'

describe('AppSettings.quotingConfig schema bounds', () => {
    it('rejects a negative materialRatePerGram', () => {
        const doc = new AppSettings({ quotingConfig: { materialRatePerGram: -1 } })
        const err = doc.validateSync()
        expect(err).toBeTruthy()
        expect(err.errors['quotingConfig.materialRatePerGram']).toBeTruthy()
    })

    it('rejects a negative minimumPrice', () => {
        const doc = new AppSettings({ quotingConfig: { minimumPrice: -5 } })
        const err = doc.validateSync()
        expect(err).toBeTruthy()
        expect(err.errors['quotingConfig.minimumPrice']).toBeTruthy()
    })

    it('rejects a negative fee field', () => {
        const doc = new AppSettings({ quotingConfig: { baseFee: -0.01 } })
        const err = doc.validateSync()
        expect(err).toBeTruthy()
        expect(err.errors['quotingConfig.baseFee']).toBeTruthy()
    })

    it('accepts valid non-negative values and leaves unset timeModel fields null', () => {
        const doc = new AppSettings({ quotingConfig: { materialRatePerGram: 0.02, minimumPrice: 5 } })
        const err = doc.validateSync()
        expect(err).toBeUndefined()
        expect(doc.quotingConfig.timeModel.baseFlowCm3PerHour).toBeNull()
    })
})
