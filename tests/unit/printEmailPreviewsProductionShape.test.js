// @vitest-environment node
// The reminder preview must work with the request fields the production model actually stores today (single legacy file, or one guided asset via guidedAssetId).
import { describe, expect, it } from 'vitest'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { buildIdleNudgeEmail } from '@/lib/email/templates/customPrint'
import { prepareNudgePreviews } from '@/lib/email/printPreviews'
import { assetsFor, byteSource, guidedRequest, legacyRequest } from '../helpers/emailFixtures'

describe('production request shape', () => {
  it('the fields the preview reads exist on the stored model (no schema change is needed)', () => {
    for (const path of ['requestId', 'userId', 'userEmail', 'userName', 'status', 'modelFile.originalName', 'modelFile.s3Key', 'guidedAssetId', 'guidedBrief', 'idleNudgeSentAt']) expect(CustomPrintRequest.schema.path(path), path).toBeTruthy()
  })
  it('a single guided file (guidedAssetId + brief quantity) is drawn, owner-checked, and shows its saved facts', async () => {
    const { guidedAssets, ...rest } = guidedRequest({ requestId: 'FIT-SYN-0301', guidedAssetId: 'asset-box', guidedBrief: { version: 1, material: 'petg', colour: 'Orange', quantity: 3 }, status: 'configured' })
    const source = byteSource()
    const prepared = await prepareNudgePreviews(rest, { loadAssets: async () => assetsFor(), loadBytes: source.loadBytes })
    expect(prepared.attachments).toHaveLength(1)
    expect(source.calls.map(c => c.key)).toEqual(['synthetic/private/box.stl'])
    const html = buildIdleNudgeEmail({ request: rest, models: prepared.models, previews: prepared.previews }).html
    expect(html).toContain('box-part.stl'); expect(html).toContain('<img src="cid:'); expect(html).toMatch(/Quantity<\/td>\s*<td[^>]*>3</); expect(html).toContain('PETG'); expect(html).toContain('Orange')
    expect(html).toContain('Get my quote')
  })
  it('a single guided file owned by someone else is not read', async () => {
    const { guidedAssets, ...rest } = guidedRequest({ guidedAssetId: 'asset-box' })
    const source = byteSource()
    const prepared = await prepareNudgePreviews(rest, { loadAssets: async () => assetsFor('user_syn_other'), loadBytes: source.loadBytes })
    expect(source.calls).toHaveLength(0); expect(prepared.attachments).toEqual([])
    expect(buildIdleNudgeEmail({ request: rest, models: prepared.models, previews: prepared.previews }).html).not.toContain('<img src="cid:')
  })
  it('a legacy upload with no readable preview keeps the original email wording and call to action', async () => {
    const request = legacyRequest({ status: 'quoted', quoteMode: 'instant', quote: { total: 12, currency: 'sgd' } })
    const prepared = await prepareNudgePreviews(request, { loadAssets: async () => ({}), loadBytes: async () => { throw new Error('unavailable') } })
    const html = buildIdleNudgeEmail({ request, models: prepared.models, previews: prepared.previews }).html
    expect(html).toContain('Still interested in your print?'); expect(html).toContain('Your quote is ready and waiting'); expect(html).toContain('Review &amp; pay')
    expect(html).toContain('Model preview unavailable'); expect(html).not.toContain('<img src="cid:')
  })
})
