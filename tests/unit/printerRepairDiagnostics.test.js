// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FabricationError } from '@/lib/fabrication/serverHttp'
import { repairFailure, reportPhotoReadiness } from '@/lib/printerRepair/diagnostics'
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
describe('bounded repair service diagnostics', () => {
  it('identifies a failed limiter without weakening its status or logging request data', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = repairFailure(new FabricationError('This service is temporarily unavailable.', 503, 'rate_limit_unavailable'), 'staff_queue')
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('rate_limit_unavailable')
    expect(log).toHaveBeenCalledWith('Printer repair unavailable', { operation: 'staff_queue', reason: 'rate_limit_unavailable', errorType: 'FabricationError' })
  })
  it('does not interpolate unknown operation, name, code or message into its new log', () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    repairFailure(Object.assign(new Error('private-message'), { name: 'private-name', code: 'private-code' }), 'private-operation')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-')
  })
  it.each([
    [undefined, 'storage_not_configured'],
    [new FabricationError('Private fabrication storage could not be verified.', 503, 'storage_unavailable'), 'storage_access_unverified'],
    [new FabricationError('Fabrication storage must have all public-access blocks enabled.', 503, 'storage_unavailable'), 'storage_public_access_not_blocked'],
    [new Error('private-bucket-or-credential'), 'storage_verification_failed'],
  ])('records only the bounded photo-readiness reason', (error, reason) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    reportPhotoReadiness(error); reportPhotoReadiness(error)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('Printer repair photo readiness', { reason })
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-bucket-or-credential')
  })
})
