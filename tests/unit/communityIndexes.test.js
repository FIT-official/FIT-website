// @vitest-environment node
import { expect, it } from 'vitest'
import CommunityEntry from '@/models/CommunityEntry'
import CommunityReport from '@/models/CommunityReport'
it('enforces one review per completed request and unique submission/reply/report identities in the database', () => {
  expect(CommunityEntry.schema.indexes()).toEqual(expect.arrayContaining([
    [ { authorUserId: 1, clientRequestId: 1 }, expect.objectContaining({ unique: true }) ],
    [ { verifiedOrderKey: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { kind: 'shop_review' } }) ],
    [ { replyTo: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { kind: 'shop_reply' } }) ],
  ]))
  expect(CommunityReport.schema.indexes()).toEqual(expect.arrayContaining([
    [ { entryId: 1, reporterUserId: 1 }, expect.objectContaining({ unique: true }) ],
  ]))
})
