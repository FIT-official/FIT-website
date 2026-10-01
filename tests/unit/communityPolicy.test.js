import { describe, expect, it } from 'vitest'
import { COMMUNITY_POLICY, classifyContent, completedOrderEligibility, publicEntry, validateEntry, validateModeration } from '@/lib/community/policy'
import { readCommunityPending, saveCommunityPending } from '@/lib/community/clientDraft'
const id = '56e1fe9c-33e5-4ae3-8e70-dbc6b0c97b34'
const comment = { clientRequestId: id, kind: 'blog_comment', subject: 'first-print', displayName: 'Demo reader', body: 'This helped me check the first layer.' }
describe('community safety and eligibility contracts', () => {
  it('publishes normal comments immediately without an automatic punishment policy', () => {
    expect(validateEntry(comment).value.body).toBe(comment.body)
    expect(COMMUNITY_POLICY).toMatchObject({ immediatePublication: true, repeatConfirmedAbuseThreshold: null, temporaryRestrictionHours: null })
  })
  it.each(['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'Call me at +65 12345678', 'Email demo@example.invalid', 'Email demo@exam\u200bple.invalid', 'My personal ID is S1234567A', 'My access key is sk_live_abcdefghijklmnop'])('rejects executable markup or private information: %s', body => {
    expect(validateEntry({ ...comment, body }).error).toBeTruthy()
  })
  it('rejects impersonation and forged badges, aggregate scores, author IDs and visibility', () => {
    expect(validateEntry({ ...comment, displayName: 'FIT admin' }).error).toBeTruthy()
    for (const key of ['completedRequestLinked', 'average', 'authorUserId', 'visibility', 'abuseConfirmed']) expect(validateEntry({ ...comment, [key]: true }).error).toBeTruthy()
  })
  it('flags criticism and low stars separately from potential abuse', () => {
    expect(classifyContent('The finish was disappointing.', 1)).toEqual(['negative_feedback'])
    expect(classifyContent('You are an idiot.', 4)).toEqual(['potential_abuse'])
    expect(classifyContent('https://one.invalid https://two.invalid https://three.invalid', null)).toEqual(['potential_spam'])
  })
  it.each(['pending', 'quoted', 'paid', 'printed', 'shipped', 'cancelled'])('does not treat an unfinished print request as a completed order: %s', status => {
    expect(completedOrderEligibility({ userId: 'buyer', creatorUserId: 'shop', status }, 'buyer', 'shop', 'print_request')).toBe(false)
  })
  it('requires the right buyer, provider, source and actual completion state', () => {
    const record = { userId: 'buyer', creatorUserId: 'shop', status: 'delivered' }
    expect(completedOrderEligibility(record, 'buyer', 'shop', 'print_request')).toBe(true)
    expect(completedOrderEligibility(record, 'foreign-buyer', 'shop', 'print_request')).toBe(false)
    expect(completedOrderEligibility(record, 'buyer', 'other-shop', 'print_request')).toBe(false)
    expect(completedOrderEligibility({ ...record, userId: 'shop' }, 'shop', 'shop', 'print_request')).toBe(false)
    expect(completedOrderEligibility({ customerUserId: 'buyer', creatorUserId: 'shop', status: 'completed' }, 'buyer', 'shop', 'fabrication_request')).toBe(true)
  })
  it('public responses expose no order references, identity, contact, internal flags or audit', () => {
    const row = publicEntry({ ...comment, entryId: id, publicName: 'Demo reader', authorUserId: 'private-user', email: 'private@example.invalid', verifiedOrderKey: 'print_request:private-order', kind: 'shop_review', flags: ['negative_feedback'], audit: [{ actorUserId: 'private-admin' }], rating: 1 })
    expect(row.completedRequestLinked).toBe(true)
    expect(JSON.stringify(row)).not.toMatch(/private-|example.invalid|negative_feedback|audit/)
  })
  it('requires an explicit abuse category and documented admin reason; criticism is not a category', () => {
    const moderation = { operationId: id, expectedRevision: 0, action: 'confirm_abuse', reason: 'Reviewed the evidence.', abuseReason: 'negative_feedback' }
    expect(validateModeration(moderation).error).toBeTruthy()
    expect(validateModeration({ ...moderation, abuseReason: 'harassment' }).value).toBeTruthy()
    expect(validateModeration({ ...moderation, action: 'hide', reason: '' }).error).toBeTruthy()
  })
  it('restores an uncertain post only for the original account, subject and short session window', () => {
    const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
    saveCommunityPending(storage, 'blog_comment', comment.subject, 'buyer', comment, 1000)
    expect(readCommunityPending(storage, 'blog_comment', comment.subject, 'buyer', 2000)).toEqual(comment)
    expect(readCommunityPending(storage, 'blog_comment', comment.subject, 'other', 2000)).toBeNull()
    expect(readCommunityPending(storage, 'blog_comment', 'other-post', 'buyer', 2000)).toBeNull()
    expect(readCommunityPending(storage, 'blog_comment', comment.subject, 'buyer', 3601001)).toBeNull()
  })
})
