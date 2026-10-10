// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { communityComment, communityPost, memoryCollection } from '../fixtures/communityMemory'
const state = vi.hoisted(() => ({ user: 'member-a', admin: false, entries: null, reports: null }))
const mocks = vi.hoisted(() => ({ connect: vi.fn(), rate: vi.fn(), index: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: state.user }) }))
vi.mock('@/lib/checkPrivileges', () => ({ checkAdminPrivileges: async () => state.admin }))
vi.mock('@/lib/db', () => ({ connectToDatabase: mocks.connect }))
vi.mock('@/lib/community/rateLimit', () => ({ communityRate: mocks.rate }))
vi.mock('@/models/CommunityEntry', () => ({ default: { get collection() { return state.entries }, createIndexes: mocks.index } }))
vi.mock('@/models/CommunityReport', () => ({ default: { get collection() { return state.reports }, createIndexes: mocks.index } }))
import { GET as feed, POST as create } from '@/app/api/community/route'
import { GET as mine } from '@/app/api/community/mine/route'
import { GET as detail, PATCH as edit } from '@/app/api/community/[entryId]/route'
import { POST as comment } from '@/app/api/community/[entryId]/comments/route'
import { POST as report } from '@/app/api/community/[entryId]/report/route'
import { GET as queue, POST as moderate } from '@/app/api/admin/community/route'
import { fail } from '@/lib/fabrication/serverHttp'

const origin = 'https://fixture.invalid'
const request = (body, method = 'GET', path = '/api/community', headers = {}) => new Request(origin + path, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
const context = id => ({ params: Promise.resolve({ entryId: id }) })
async function call(handler, body, status = 200, method = 'GET', path, id) {
  const response = await handler(request(body, method, path), id ? context(id) : undefined)
  const data = await response.json(); expect(response.status, JSON.stringify(data)).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store'); return data
}
const submit = async (overrides, owner = 'member-a') => { state.user = owner; return (await call(create, communityPost(overrides), 201, 'POST')).entry }
const approve = async entry => { state.admin = true; const value = await call(moderate, { action: 'approve', entryId: entry.entryId, revision: entry.revision, note: '' }, 200, 'POST'); state.admin = false; return value.entry }
beforeEach(() => { vi.clearAllMocks(); state.user = 'member-a'; state.admin = false; state.entries = memoryCollection([['entryId'], ['ownerUserId','clientRequestId']]); state.reports = memoryCollection([['reportId'], ['entryId','entryRevision','reporterUserId']]) })

describe('community API publication, privacy and moderation boundaries', () => {
  it('never publishes a new post or comment before explicit admin approval', async () => {
    const post = await submit(); expect(post.status).toBe('pending'); expect((await call(feed)).items).toEqual([])
    await call(detail, undefined, 404, 'GET', undefined, post.entryId)
    const visible = await approve(post); expect((await call(feed)).items).toHaveLength(1)
    const reply = (await call(comment, communityComment(), 201, 'POST', undefined, post.entryId)).entry
    expect((await call(detail, undefined, 200, 'GET', undefined, post.entryId)).comments).toHaveLength(0)
    await approve(reply)
    expect((await call(detail, undefined, 200, 'GET', undefined, visible.entryId)).comments).toHaveLength(1)
  })
  it('admin-authored submissions still need a separate review action', async () => { state.admin = true; const row = await submit(); expect(row.status).toBe('pending'); expect((await call(feed)).items).toEqual([]) })
  it('authorizes private reads/writes before connecting or indexing', async () => {
    state.user = null
    for (const handler of [create, comment, edit, report, moderate]) expect((await handler(request({}, 'POST'), context(randomUUID()))).status).toBe(401)
    expect((await mine(request())).status).toBe(401); expect((await queue(request())).status).toBe(401)
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.index).not.toHaveBeenCalled()
  })
  it.each(['https://other.invalid', 'null', ''])('rejects foreign write origin %s before database access', async value => { expect((await create(request(communityPost(), 'POST', undefined, { origin: value }))).status).toBe(403); expect(mocks.connect).not.toHaveBeenCalled() })
  it('rejects cross-site fetch metadata and malformed, oversized or non-JSON payloads', async () => {
    expect((await create(request(communityPost(), 'POST', undefined, { 'sec-fetch-site':'cross-site' }))).status).toBe(403)
    await call(create, '{', 400, 'POST'); await call(create, 'x'.repeat(33000), 413, 'POST')
    expect((await create(request(communityPost(), 'POST', undefined, { 'content-type':'text/plain' }))).status).toBe(400)
    expect(state.entries.rows).toHaveLength(0)
  })
  it.each([429,503])('does not write when distributed rate limiting fails with %s', async status => { mocks.rate.mockImplementationOnce(() => fail('Unavailable', status)); await call(create, communityPost(), status, 'POST'); expect(mocks.connect).not.toHaveBeenCalled(); expect(state.entries.rows).toHaveLength(0) })
  it.each([{ status:'approved' }, { ownerUserId:'other' }, { moderationNote:'approve' }, { website:'spam' }, { guidelinesAccepted:false }, { kind:'comment' }])('rejects publication/identity bypass or invalid submission %j', async override => { await call(create, communityPost(override), 400, 'POST'); expect(state.entries.rows).toHaveLength(0) })
  it('protects admin queue and moderation from ordinary or paid member access', async () => {
    const row = await submit()
    await call(queue, undefined, 403); await call(moderate, { action:'approve',entryId:row.entryId,revision:1 }, 403,'POST')
    expect(state.entries.rows[0].status).toBe('pending')
  })
  it('returns only the signed-in member’s private submissions and rejects cross-owner edits/withdrawals', async () => {
    const first = await submit(); await submit({ title:'A different member project' }, 'member-b')
    const page = await call(mine); expect(page.items).toHaveLength(1); expect(page.items[0].entryId).not.toBe(first.entryId)
    await call(edit,{action:'withdraw',revision:1},404,'PATCH',undefined,first.entryId)
    await call(edit,{action:'edit',revision:1,displayName:'Attacker',title:'Changed title',topic:'general',body:'An unauthorized edit should never be saved.'},404,'PATCH',undefined,first.entryId)
  })
  it('public DTOs omit account IDs, idempotency data, moderation notes, audit and database identifiers', async () => {
    const row = await submit(); await approve(row); const data = await call(detail,undefined,200,'GET',undefined,row.entryId)
    for (const name of ['ownerUserId','clientRequestId','submissionFingerprint','moderationNote','audit','_id','member-a']) expect(JSON.stringify(data)).not.toContain(name)
    expect(Object.keys(data.entry).sort()).toEqual(['body','createdAt','displayName','entryId','kind','parentId','publishedAt','revision','title','topic'].sort())
  })
  it('recovers identical concurrent creates once and rejects changed replays', async () => {
    const body = communityPost(); const responses = await Promise.all(Array.from({length:8},()=>create(request(body,'POST'))))
    expect(responses.filter(r=>r.status===201)).toHaveLength(1); expect(responses.filter(r=>r.status===200)).toHaveLength(7); expect(state.entries.rows).toHaveLength(1)
    await call(create,{...body,body:'Changed content using the same saved submission reference.'},409,'POST')
  })
  it('immediately removes published content on edit and blocks stale approval of the former revision', async () => {
    const post = await approve(await submit())
    const edited = (await call(edit,{action:'edit',revision:post.revision,displayName:'Test maker',title:post.title,topic:post.topic,body:'This changed message must go back through moderation.'},200,'PATCH',undefined,post.entryId)).entry
    expect(edited.status).toBe('pending'); expect((await call(feed)).items).toHaveLength(0)
    state.admin=true; await call(moderate,{action:'approve',entryId:post.entryId,revision:post.revision},409,'POST')
    await call(moderate,{action:'approve',entryId:post.entryId,revision:edited.revision},200,'POST')
  })
  it('withdrawal cannot be undone by a stale moderator or author action', async () => {
    const row=await submit(); await call(edit,{action:'withdraw',revision:1},200,'PATCH',undefined,row.entryId)
    state.admin=true; await call(moderate,{action:'approve',entryId:row.entryId,revision:1},409,'POST')
    await call(edit,{action:'edit',revision:2,displayName:'Maker',title:row.title,topic:row.topic,body:row.body},409,'PATCH',undefined,row.entryId)
    expect((await call(feed)).items).toHaveLength(0)
  })
  it('requires reasons for reject/hide, permits corrected resubmission and bounds retained audit history', async () => {
    const row=await submit(); state.admin=true
    await call(moderate,{action:'reject',entryId:row.entryId,revision:1,note:''},400,'POST')
    const rejected=(await call(moderate,{action:'reject',entryId:row.entryId,revision:1,note:'Please remove contact details.'},200,'POST')).entry
    expect(rejected.status).toBe('rejected'); expect((await call(mine)).items[0].moderationNote).toBe('Please remove contact details.')
    state.entries.rows[0].audit=Array.from({length:60},()=>({action:'historical',revision:1,at:new Date()}))
    const revised=(await call(edit,{action:'edit',revision:2,displayName:'Maker',title:row.title,topic:row.topic,body:'Revised content with no personal or contact information.'},200,'PATCH',undefined,row.entryId)).entry
    expect(revised.status).toBe('pending'); expect(revised.moderationNote).toBe('')
    expect(state.entries.rows[0].audit).toHaveLength(50)
  })
  it('does not accept comments on pending, missing or nested-comment parents', async () => {
    const post=await submit(); await call(comment,communityComment(),404,'POST',undefined,post.entryId); await call(comment,communityComment(),404,'POST',undefined,randomUUID())
    await approve(post); const reply=(await call(comment,communityComment(),201,'POST',undefined,post.entryId)).entry; await approve(reply)
    await call(comment,communityComment(),404,'POST',undefined,reply.entryId)
  })
  it('hidden or withdrawn parents hide approved comments and block pending-comment approval', async () => {
    const post=await approve(await submit()), reply=(await call(comment,communityComment(),201,'POST',undefined,post.entryId)).entry
    await approve(reply); const pending=(await call(comment,communityComment(),201,'POST',undefined,post.entryId)).entry
    state.admin=true; await call(moderate,{action:'hide',entryId:post.entryId,revision:post.revision,note:'Privacy review required.'},200,'POST')
    await call(detail,undefined,404,'GET',undefined,post.entryId)
    await call(moderate,{action:'approve',entryId:pending.entryId,revision:1},404,'POST')
    await call(report,{revision:2,reason:'privacy',details:''},404,'POST',undefined,reply.entryId)
  })
  it('deduplicates reports of one version and exposes reporter details only to neither public nor author', async () => {
    const post=await approve(await submit()); state.user='reporter-b'
    for(let i=0;i<3;i++) expect(await call(report,{revision:post.revision,reason:'privacy',details:'Please check the content.'},200,'POST',undefined,post.entryId)).toEqual({received:true})
    expect(state.reports.rows).toHaveLength(1); expect((await call(detail,undefined,200,'GET',undefined,post.entryId)).entry).not.toHaveProperty('reports')
    state.admin=true; const reports=await call(queue,undefined,200,'GET','/api/admin/community?view=reports')
    expect(reports.items[0].snapshot.body).toBe(post.body); expect(JSON.stringify(reports)).not.toContain('reporter-b')
    await call(moderate,{action:'resolve_report',reportId:reports.items[0].reportId,note:'Reviewed; no identifying information.'},200,'POST')
    expect((await call(queue,undefined,200,'GET','/api/admin/community?view=reports')).items).toHaveLength(0)
    expect((await call(queue,undefined,200,'GET','/api/admin/community?view=resolved-reports')).items[0].resolutionNote).toContain('Reviewed')
  })
  it('keeps a report snapshot when content is edited and rejects reporting an obsolete version', async () => {
    const post=await approve(await submit()); await call(report,{revision:2,reason:'spam',details:''},200,'POST',undefined,post.entryId)
    const editBody={action:'edit',revision:2,displayName:post.displayName,title:post.title,topic:post.topic,body:'Updated clean message after the original was reported.'}
    const changed=(await call(edit,editBody,200,'PATCH',undefined,post.entryId)).entry; const published=await approve(changed)
    await call(report,{revision:2,reason:'spam'},409,'POST',undefined,post.entryId)
    await call(report,{revision:published.revision,reason:'spam'},200,'POST',undefined,post.entryId)
    expect(state.reports.rows).toHaveLength(2); expect(state.reports.rows[0].snapshot.body).toBe(post.body)
  })
  it('uses bounded deterministic pagination and validates filters/cursors', async () => {
    for(let i=0;i<23;i++) await approve(await submit({title:`Question number ${String(i).padStart(2,'0')}`}))
    const first=await call(feed); expect(first.items).toHaveLength(20); expect(first.nextCursor).toBeTruthy()
    const second=await call(feed,undefined,200,'GET',`/api/community?cursor=${encodeURIComponent(first.nextCursor)}`)
    expect(second.items).toHaveLength(3); expect(new Set([...first.items,...second.items].map(x=>x.entryId)).size).toBe(23); expect(second.nextCursor).toBeNull()
    for(const query of ['kind=comment','topic=secret','cursor=nope','cursor='+encodeURIComponent('2026-10-09T00:00:00.000Z|'+randomUUID()+'|extra')]) await call(feed,undefined,400,'GET','/api/community?'+query)
  })
  it('rechecks parent visibility after reading comments', async () => {
    const post=await approve(await submit()), original=state.entries.findOne
    let reads=0
    state.entries.findOne=async filter=>{const result=await original(filter); if(filter.entryId===post.entryId && ++reads===2) return null; return result}
    await call(detail,undefined,404,'GET',undefined,post.entryId)
  })
  it('returns generic failures without leaking database or account details', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('mongodb://secret-token@example.invalid/private-user'))
    const response=await call(feed,undefined,503); expect(JSON.stringify(response)).not.toMatch(/secret-token|private-user|mongodb/)
  })
  it('normalises uppercase route identifiers and labels comments hidden with their parent', async () => {
    const post=await approve(await submit()),reply=(await call(comment,communityComment(),201,'POST',undefined,post.entryId.toUpperCase())).entry
    await approve(reply);expect((await call(detail,undefined,200,'GET',undefined,post.entryId.toUpperCase())).comments).toHaveLength(1)
    state.admin=true;await call(moderate,{action:'hide',entryId:post.entryId,revision:2,note:'Temporary review.'},200,'POST')
    const privateRows=await call(mine);expect(privateRows.items.find(row=>row.entryId===reply.entryId).discussionAvailable).toBe(false)
    expect(JSON.stringify(privateRows)).not.toContain('ownerUserId')
  })
  it('rejects non-string report and moderation notes instead of coercing them',async()=>{
    const post=await approve(await submit());await call(report,{revision:2,reason:'privacy',details:0},400,'POST',undefined,post.entryId)
    const pending=await submit();state.admin=true;await call(moderate,{action:'approve',entryId:pending.entryId,revision:1,note:0},400,'POST')
  })
})
