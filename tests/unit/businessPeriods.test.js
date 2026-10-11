// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { reportPeriod, duePeriods, parseReportRange } from '@/lib/business/periods'

describe('Singapore reporting periods',()=>{
  it.each([
    ['daily','2026-10-11T00:00:00Z','2026-10-09T16:00:00.000Z','2026-10-10T16:00:00.000Z'],
    ['weekly','2026-10-12T00:00:00Z','2026-10-04T16:00:00.000Z','2026-10-11T16:00:00.000Z'],
    ['weekly','2026-10-11T12:00:00Z','2026-09-27T16:00:00.000Z','2026-10-04T16:00:00.000Z'],
    ['monthly','2028-03-01T00:00:00Z','2028-01-31T16:00:00.000Z','2028-02-29T16:00:00.000Z'],
    ['monthly','2027-01-01T00:00:00Z','2026-11-30T16:00:00.000Z','2026-12-31T16:00:00.000Z'],
    ['daily','2027-01-01T00:00:00Z','2026-12-30T16:00:00.000Z','2026-12-31T16:00:00.000Z'],
  ])('%s at %s has exact half-open boundaries',(kind,now,since,until)=>{
    const p=reportPeriod(kind,new Date(now));expect(p.since.toISOString()).toBe(since);expect(p.until.toISOString()).toBe(until);expect(p.timeZone).toBe('Asia/Singapore')
  })
  it('does not send the new daily period before 8am Singapore',()=>{
    expect(duePeriods(new Date('2026-10-10T23:59:59Z')).map(p=>p.kind)).not.toContain('daily')
    expect(duePeriods(new Date('2026-10-11T00:00:00Z')).map(p=>p.kind)).toContain('daily')
  })
  it('keeps the same key across hourly retries and advances at calendar boundaries',()=>{
    expect(reportPeriod('daily',new Date('2026-10-11T00:00:00Z')).key).toBe(reportPeriod('daily',new Date('2026-10-11T15:59:59Z')).key)
    expect(reportPeriod('daily',new Date('2026-10-11T16:00:00Z')).key).not.toBe(reportPeriod('daily',new Date('2026-10-11T15:59:59Z')).key)
  })
  it.each(['annual','',null])('rejects unsupported cadence %s',kind=>expect(()=>reportPeriod(kind)).toThrow())
  it('rejects invalid/future export dates',()=>{
    expect(()=>parseReportRange(new URLSearchParams('at=not-a-date'))).toThrow()
    expect(()=>parseReportRange(new URLSearchParams('at=2099-01-01T00:00:00Z'))).toThrow()
  })
})
