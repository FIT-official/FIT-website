// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ prior: null, entry: null, order: null, account: null, confirmed: 0, published: true }))
const mocks = vi.hoisted(() => ({
  startSession: vi.fn(), entryFind: vi.fn(), entryCreate: vi.fn(), entryUpdate: vi.fn(), count: vi.fn(),
  reportUpdate: vi.fn(), accountFind: vi.fn(), accountUpdate: vi.fn(), orderFind: vi.fn(),
  userFind: vi.fn(), blogFind: vi.fn(), serviceFind: vi.fn(), indexes: vi.fn(),
}))
vi.mock('mongoose', () => ({ default: { startSession: mocks.startSession } }))
vi.mock('@/models/CommunityEntry', () => ({ default: { createIndexes: mocks.indexes, findOne: mocks.entryFind, create: mocks.entryCreate, updateOne: mocks.entryUpdate, countDocuments: mocks.count } }))
vi.mock('@/models/CommunityReport', () => ({ default: { createIndexes: mocks.indexes, updateOne: mocks.reportUpdate } }))
vi.mock('@/models/CommunityAccountState', () => ({ default: { createIndexes: mocks.indexes, findOne: mocks.accountFind, updateOne: mocks.accountUpdate } }))
vi.mock('@/models/BlogPost', () => ({ default: { findOne: mocks.blogFind } }))
vi.mock('@/models/User', () => ({ default: { findOne: mocks.userFind } }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: mocks.orderFind } }))
vi.mock('@/models/FabricationRequest', () => ({ default: { findOne: mocks.orderFind } }))
vi.mock('@/models/CreatorPrintService', () => ({ default: { findOne: mocks.serviceFind } }))
vi.mock('@/models/CreatorFabricationService', () => ({ default: { findOne: () => chain(null) } }))
import { createEntry, moderateEntry, reportEntry, restrictAuthor } from '@/lib/community/server'
const id = '56e1fe9c-33e5-4ae3-8e70-dbc6b0c97b34'
const operationId = '46e1fe9c-33e5-4ae3-8e70-dbc6b0c97b35'
const review = { clientRequestId: id, kind: 'shop_review', subject: 'service-shop', displayName: 'A customer', body: 'The finish was disappointing.', rating: 1, orderType: 'print_request', orderId: 'completed-request' }
function chain(row) { return { session() { return this }, select() { return this }, async lean() { return row } } }
const moderation = patch => ({ operationId, expectedRevision: 0, action: 'hide', reason: 'Reviewed this report and its evidence.', ...patch })
const restriction = patch => ({ operationId, expectedRevision: 0, expectedAccountRevision: 0, action: 'suspend_posting', reason: 'Reviewed the substantiated abuse history.', ...patch })
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(state, { prior: null, entry: { entryId: id, authorUserId: 'customer', revision: 0, visibility: 'visible', flags: ['negative_feedback'], audit: [] }, order: { requestId: 'completed-request', creatorUserId: 'service-shop', userId: 'customer', status: 'delivered' }, account: { revision: 0, postingSuspended: false, audit: [] }, confirmed: 0, published: true })
  mocks.indexes.mockResolvedValue(undefined)
  mocks.startSession.mockResolvedValue({ withTransaction: async work => work(), endSession: vi.fn() })
  mocks.entryFind.mockImplementation(filter => chain(filter.entryId ? state.entry : state.prior))
  mocks.entryCreate.mockImplementation(async rows => { state.prior = rows[0]; return rows })
  mocks.entryUpdate.mockResolvedValue({ matchedCount: 1 })
  mocks.reportUpdate.mockResolvedValue({ upsertedCount: 1 })
  mocks.accountFind.mockImplementation(() => chain(state.account))
  mocks.accountUpdate.mockImplementation(async (_filter, update) => { if (update.$inc) state.account.revision++; if (update.$set) Object.assign(state.account, update.$set); if (update.$push?.audit) state.account.audit.push(update.$push.audit); return { matchedCount: 1 } })
  mocks.count.mockImplementation(() => ({ session() { return this }, then(resolve) { return Promise.resolve(state.confirmed).then(resolve) } }))
  mocks.orderFind.mockImplementation(() => chain(state.order))
  mocks.userFind.mockImplementation(() => chain({ userId: 'service-shop', shop: { published: state.published } }))
  mocks.blogFind.mockImplementation(() => chain({ status: 'published' }))
  mocks.serviceFind.mockImplementation(() => chain({ enabled: true }))
})
describe('community writes with fixture-only transactions', () => {
  it('posts a low-rating completed-order review immediately and keeps concerns internal', async () => {
    const result = await createEntry(review, 'customer')
    expect(result.entry).toMatchObject({ body: review.body, rating: 1, completedRequestLinked: true })
    expect(state.prior).toMatchObject({ visibility: 'visible', verifiedOrderKey: 'print_request:completed-request', flags: ['negative_feedback'] })
    expect(JSON.stringify(result)).not.toMatch(/authorUserId|verifiedOrderKey|negative_feedback/)
    expect(mocks.accountUpdate).toHaveBeenCalledWith({ userId: 'customer' }, { $inc: { revision: 1 } }, expect.objectContaining({ session: expect.any(Object) }))
    expect(mocks.accountUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.accountFind.mock.invocationCallOrder[0])
  })
  it.each([
    ['another buyer', { userId: 'someone-else' }, 'customer'],
    ['another shop', { creatorUserId: 'another-shop' }, 'customer'],
    ['an unfinished order', { status: 'shipped' }, 'customer'],
    ['the shop owner', { userId: 'service-shop' }, 'service-shop'],
  ])('rejects %s before creating a review', async (_label, change, actor) => {
    Object.assign(state.order, change)
    await expect(createEntry(review, actor)).rejects.toMatchObject({ status: 403 })
    expect(mocks.entryCreate).not.toHaveBeenCalled()
  })
  it('rejects public posting for an unpublished service shop', async () => {
    state.published = false
    await expect(createEntry(review, 'customer')).rejects.toMatchObject({ status: 404 })
    expect(mocks.entryCreate).not.toHaveBeenCalled()
  })
  it('recovers the same submission without creating another review and rejects a changed retry', async () => {
    const first = await createEntry(review, 'customer')
    const retry = await createEntry(review, 'customer')
    expect(retry).toMatchObject({ replayed: true, entry: { entryId: first.entry.entryId } })
    expect(mocks.entryCreate).toHaveBeenCalledTimes(1)
    await expect(createEntry({ ...review, body: 'Different details for this reference.' }, 'customer')).rejects.toMatchObject({ status: 409 })
  })
  it('turns a concurrent one-per-order unique-key conflict into a bounded conflict response', async () => {
    mocks.entryCreate.mockRejectedValueOnce(Object.assign(new Error('fixture duplicate'), { code: 11000 }))
    await expect(createEntry(review, 'customer')).rejects.toMatchObject({ status: 409 })
  })
  it('honours a posting suspension after acquiring the account transaction lock', async () => {
    state.account.postingSuspended = true
    await expect(createEntry(review, 'customer')).rejects.toMatchObject({ status: 403, code: 'posting_restricted' })
    expect(mocks.entryCreate).not.toHaveBeenCalled()
  })
  it('invalidates an admin snapshot for a new report; duplicate reports do not inflate revisions', async () => {
    await reportEntry(id, { reason: 'spam', detail: 'Repeated unrelated advertising.' }, 'reporter')
    expect(mocks.entryUpdate).toHaveBeenCalledWith({ entryId: id }, { $addToSet: { flags: 'reported' }, $inc: { revision: 1 } }, expect.any(Object))
    mocks.entryUpdate.mockClear(); mocks.reportUpdate.mockResolvedValue({ upsertedCount: 0 })
    await reportEntry(id, { reason: 'spam' }, 'reporter')
    expect(mocks.entryUpdate).not.toHaveBeenCalled()
    state.entry.revision = 1
    await expect(moderateEntry(id, moderation({ action: 'mark_reviewed' }), 'fixture-admin')).rejects.toMatchObject({ status: 409 })
  })
  it('keeps reporting available when community posting is suspended', async () => {
    state.account.postingSuspended = true
    expect(await reportEntry(id, { reason: 'privacy' }, 'customer')).toEqual({ reported: true })
    expect(mocks.accountFind).not.toHaveBeenCalled()
  })
  it('retains a reversible visibility decision with the server admin identity, reason and audit', async () => {
    await moderateEntry(id, moderation(), 'fixture-platform-admin')
    expect(mocks.entryUpdate).toHaveBeenCalledWith({ entryId: id, revision: 0 }, expect.objectContaining({ $set: { visibility: 'hidden' }, $push: { audit: expect.objectContaining({ action: 'hide', actorUserId: 'fixture-platform-admin', reason: moderation().reason }) } }), expect.any(Object))
    mocks.entryUpdate.mockClear()
    await moderateEntry(id, moderation({ operationId: id, action: 'restore' }), 'fixture-platform-admin')
    expect(mocks.entryUpdate.mock.calls[0][1].$set).toEqual({ visibility: 'visible' })
  })
  it('denies posting restrictions based only on criticism or reports', async () => {
    await expect(restrictAuthor(id, restriction(), 'fixture-admin')).rejects.toMatchObject({ status: 409 })
    expect(mocks.accountUpdate.mock.calls.every(([, update]) => !update.$set)).toBe(true)
  })
  it('rejects a stale account decision and records an explicit admin-reviewed restriction only in fixtures', async () => {
    state.confirmed = 2; state.account.revision = 5
    await expect(restrictAuthor(id, restriction(), 'fixture-admin')).rejects.toMatchObject({ status: 409 })
    expect(mocks.accountUpdate.mock.calls.every(([, update]) => !update.$set)).toBe(true)
    mocks.accountUpdate.mockClear(); state.account.revision = 0
    const result = await restrictAuthor(id, restriction(), 'fixture-admin')
    expect(result.scope).toBe('comments_and_shop_reviews_only')
    expect(mocks.accountUpdate.mock.calls[1][1]).toMatchObject({ $set: { postingSuspended: true }, $push: { audit: { actorUserId: 'fixture-admin', sourceEntryId: id, reason: restriction().reason } } })
    const savedRevision = state.account.revision
    mocks.accountUpdate.mockClear()
    expect(await restrictAuthor(id, restriction(), 'fixture-admin')).toMatchObject({ replayed: true })
    expect(mocks.accountUpdate).not.toHaveBeenCalled()
    expect(state.account.revision).toBe(savedRevision)
  })
})
