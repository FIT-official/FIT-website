import { describe, it, expect } from 'vitest'
import { verifyCronSecret } from '@/lib/verifyCronSecret'

describe('verifyCronSecret', () => {
  it('returns true for a matching secret', () => {
    expect(verifyCronSecret('Bearer cron-secret', 'Bearer cron-secret')).toBe(true)
  })

  it('returns false for a wrong secret of the same length', () => {
    expect(verifyCronSecret('Bearer cron-secreX', 'Bearer cron-secret')).toBe(false)
  })

  it('returns false without throwing for mismatched lengths', () => {
    expect(() => verifyCronSecret('short', 'a-much-longer-secret-value')).not.toThrow()
    expect(verifyCronSecret('short', 'a-much-longer-secret-value')).toBe(false)
  })

  it('returns false for missing/undefined input', () => {
    expect(verifyCronSecret(undefined, 'Bearer cron-secret')).toBe(false)
    expect(verifyCronSecret('', 'Bearer cron-secret')).toBe(false)
  })
})
