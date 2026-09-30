import { describe, expect, it } from 'vitest'
import { repairFixture } from '../fixtures/printerRepair'
import { REPAIR_PHOTO_BYTES, repairPhotoError, singaporeToday, validateRepairBrief, validateRepairSubmission } from '@/lib/printerRepair/validate'
describe('repair assessment validation', () => {
  it('normalises an allowed brief without creating a price or appointment', () => {
    const checked = validateRepairSubmission({ ...repairFixture, brief: { ...repairFixture.brief, brand: ' Bambu Lab ' } })
    expect(checked.ok).toBe(true); expect(checked.value.brief.brand).toBe('Bambu Lab')
    expect(checked.value).not.toHaveProperty('price'); expect(checked.value).not.toHaveProperty('appointment')
  })
  it.each([{ price: 0 }, { status: 'booked' }, { customerUserId: 'victim' }, { photoUrl: 'https://evil.invalid/a.jpg' }])('rejects additional submission fields %j', extra => expect(validateRepairSubmission({ ...repairFixture, ...extra }).ok).toBe(false))
  it.each(['constructor', '__proto__', 'toString', 'price'])('rejects inherited and injected brief fields %s', field => {
    const brief = JSON.parse(JSON.stringify(repairFixture.brief)); Object.defineProperty(brief, field, { value: 'injected', enumerable: true })
    expect(validateRepairSubmission({ ...repairFixture, brief }).ok).toBe(false)
  })
  it.each([{ brandChoice: '' }, { modelChoice: 'other', model: '' }, { issue: 'confirmed_repair' }, { details: 'short' }, { details: '<script>test</script>' }, { details: 'x'.repeat(2001) }, { email: 'not-an-email' }, { phone: 'abc123' }, { preferredDate: '2099-02-30' }, { preferredDate: 'tomorrow' }, { handover: 'guaranteed_pickup' }, { audience: 'unlisted' }])('rejects invalid brief %j', patch => expect(validateRepairBrief({ ...repairFixture.brief, ...patch }).ok).toBe(false))
  it('validates each step without demanding later contact fields', () => {
    expect(validateRepairBrief({ ...repairFixture.brief, email: '' }, { step: 0 }).ok).toBe(true)
    expect(validateRepairBrief({ ...repairFixture.brief, email: '' }, { step: 2 }).errors.email).toBeTruthy()
  })
  it('uses Singapore date boundaries and rejects past dates in new customer drafts', () => {
    expect(singaporeToday(new Date('2026-09-30T16:30:00Z'))).toBe('2026-10-01')
    expect(validateRepairBrief({ ...repairFixture.brief, preferredDate: '2026-09-30' }, { today: '2026-10-01' }).errors.preferredDate).toBeTruthy()
    expect(validateRepairBrief({ ...repairFixture.brief, preferredDate: '' }, { today: '2026-10-01' }).ok).toBe(true)
  })
  it('rejects too many, duplicate or malformed attachment identities', () => {
    const id = 'c4cda36f-cfd0-45e0-8518-03b9b9321ba5'
    for (const ids of [[id, id.toUpperCase()], [id, id, id, id], ['foreign-url'], 'not-array']) expect(validateRepairSubmission({ ...repairFixture, photoAssetIds: ids }).ok).toBe(false)
  })
  it('rejects empty, oversized, mismatched and unsupported uploads', () => {
    expect(repairPhotoError({ size: 100, name: 'printer.jpg', type: 'image/jpeg' })).toBe('')
    for (const file of [{ size: 0, name: 'a.jpg', type: 'image/jpeg' }, { size: REPAIR_PHOTO_BYTES + 1, name: 'a.jpg', type: 'image/jpeg' }, { size: 100, name: 'payload.svg', type: 'image/jpeg' }, { size: 100, name: 'private.pdf', type: 'application/pdf' }]) expect(repairPhotoError(file)).toBeTruthy()
  })
})
