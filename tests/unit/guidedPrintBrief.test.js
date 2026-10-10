import { describe, expect, it } from 'vitest'
import { GUIDED_START, validateGuidedBrief, publicReference, guidedPaymentIssue, guidedSummary } from '@/lib/customPrint/guidedBrief'
const valid = { ...GUIDED_START, purpose: 'Desk cable holder' }
describe('guided print preferences', () => {
  it('accepts an undecided text-only enquiry without fabricating a price, model or rights approval', () => {
    const { value } = validateGuidedBrief(valid)
    expect(value).toMatchObject({ sizeMm: null, quantity: 1, material: 'help', rights: 'unknown' })
    expect(value).not.toHaveProperty('price'); expect(value).not.toHaveProperty('approved')
  })
  it.each([['mm',100,100],['cm',10,100],['in',2,50.8]])('normalises %s without rescaling a model', (unit,size,mm) => {
    expect(validateGuidedBrief({ ...valid, sizeMode:'longest', unit, size }).value.sizeMm).toBe(mm)
  })
  it.each([0,-1,1.1,1001,Infinity,NaN,'2'])('rejects quantity %s', quantity => expect(validateGuidedBrief({ ...valid,quantity }).error).toBeTruthy())
  it.each(['javascript:alert(1)','http://example.com/a','https://u:p@example.com','https://127.0.0.1/a','https://[::1]/a','https://printer.local/a','https://example.com:8443/a'])('rejects unsafe reference %s', url => expect(publicReference(url)).toBeNull())
  it('retains a source only as a reference and requires a bounded human review', () => {
    const value=validateGuidedBrief({ ...valid, sourceUrl:'https://makerworld.com/en/models/123', rights:'noncommercial', reviewedBy:'forged', approved:true }).value
    expect(value).not.toHaveProperty('approved'); expect(guidedSummary(value)).toContainEqual(['Design permissions','noncommercial'])
    const doc={ guidedBrief:value,guidedFingerprint:'a' }
    expect(guidedPaymentIssue(doc)).toBeTruthy()
    doc.guidedReview={ status:'approved',fingerprint:'a',exactFile:'part.stl sha256:fixture',licenceEvidence:'Written permission for this job',reviewedBy:'staff',scopeConfirmed:true }
    expect(guidedPaymentIssue(doc)).toBeNull(); doc.guidedFingerprint='b'; expect(guidedPaymentIssue(doc)).toBeTruthy()
    expect(guidedPaymentIssue({})).toBeNull()
  })
  it.each([{ purpose:'' },{ notes:'x'.repeat(1001) },{ sizeMode:'longest',size:0 },{ sizeMode:'longest',size:99999 },{ sizeMode:'longest',size:'abc' },{ rights:'approved' },{ material:'constructor' },{ unit:'feet' }])('rejects invalid brief %j', patch => expect(validateGuidedBrief({ ...valid,...patch }).error).toBeTruthy())
})

it('rejects a Unicode link whose normalized URL would exceed the persisted limit', () => {
  const sourceUrl = 'https://example.com/' + '界'.repeat(250)
  expect(sourceUrl.length).toBeLessThan(2048)
  expect(validateGuidedBrief({ ...valid, sourceUrl }).error).toBeTruthy()
})
