// @vitest-environment node
import { describe, expect, it } from 'vitest'
import CustomPrintRequest from '@/models/CustomPrintRequest'

describe('custom print request database indexes', () => {
  it('declares one unique request identity index without a conflicting duplicate', () => {
    const indexes = CustomPrintRequest.schema.indexes()
      .filter(([keys]) => Object.keys(keys).length === 1 && keys.requestId === 1)
    expect(indexes).toHaveLength(1)
    expect(indexes[0][1].unique).toBe(true)
  })
})
