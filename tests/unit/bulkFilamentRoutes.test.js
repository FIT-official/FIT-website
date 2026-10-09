// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureCatalogue, fixtureInput } from '../fixtures/bulkFilament'
const mock=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),db:vi.fn(),catalogue:vi.fn(),rate:vi.fn(),notify:vi.fn(),store:{findOne:vi.fn(),insertOne:vi.fn(),findOneAndUpdate:vi.fn(),find:vi.fn()}}))
vi.mock('@/lib/bulkFilamentEmail',()=>({notifyBulkOwner:mock.notify,bulkEmailStatus:d=>d?.notifications?.email?.status || 'not_configured'}))
vi.mock('@clerk/nextjs/server',()=>({auth:mock.auth}))
vi.mock('@/lib/checkPrivileges',()=>({checkAdminPrivileges:mock.admin}))
vi.mock('@/lib/bulkFilamentHttp',async()=>{
  const {NextResponse}=await import('next/server')
  const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
  return {bulkDb:mock.db,loadBulkCatalogue:mock.catalogue,limitBulkRequest:mock.rate,readBulkJson:r=>r.json(),bulkJson:json,
    bulkSameOrigin:r=>{if(r.headers.get('origin')!==new URL(r.url).origin)throw Object.assign(Error('Origin'),{status:403})},
    bulkFailure:e=>json({error:e.message,code:e.code},e.status||503)}
})
import { POST } from '@/app/api/bulk-filament/requests/route'
import { GET as catalogueGET } from '@/app/api/bulk-filament/catalogue/route'
import { GET, PATCH, POST as retryPOST } from '@/app/api/admin/bulk-filament/route'
const request=(body,origin='https://fit.test',method='POST')=>new Request('https://fit.test/api/bulk-filament/requests',{method,headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{
  vi.clearAllMocks();mock.notify.mockResolvedValue('not_configured');mock.auth.mockResolvedValue({userId:'admin'});mock.admin.mockResolvedValue(true)
  mock.db.mockResolvedValue({collection:()=>mock.store});mock.catalogue.mockResolvedValue(fixtureCatalogue())
  mock.rate.mockResolvedValue();mock.store.findOne.mockResolvedValue(null);mock.store.insertOne.mockResolvedValue({acknowledged:true})
})
describe('bulk API security and responses',()=>{
  it('exposes safe canonical catalogue with no-store',async()=>{const r=await catalogueGET();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(await r.json()).not.toHaveProperty('maxExtraPerColour')})
  it('rejects foreign origin before persistence',async()=>{const r=await POST(request({},'https://foreign.test'));expect(r.status).toBe(403);expect(mock.db).not.toHaveBeenCalled()})
  it('rejects missing origin',async()=>{const r=await POST(new Request('https://fit.test/api',{method:'POST',body:'{}'}));expect(r.status).toBe(403)})
  it('persists guest request without calling authentication or payments',async()=>{
    const r=await POST(request(fixtureInput(fixtureCatalogue())))
    expect(r.status).toBe(201);expect(mock.store.insertOne).toHaveBeenCalledOnce();expect(mock.auth).not.toHaveBeenCalled()
    expect(await r.json()).toMatchObject({notificationCoverage:'owner_dashboard_only',status:'new'})
  })
  it('rejects invalid extras server-side',async()=>{const b=fixtureInput(fixtureCatalogue());b.lines[0].extraQuantity=21;expect((await POST(request(b))).status).toBe(400);expect(mock.db).not.toHaveBeenCalled()})
  it('fails closed when rate gate is unavailable',async()=>{mock.rate.mockRejectedValue(Error('db unavailable'));const r=await POST(request(fixtureInput(fixtureCatalogue())));expect(r.status).toBe(503);expect(mock.store.insertOne).not.toHaveBeenCalled()})
  it('rejects stale stock with a refreshable conflict',async()=>{const b=fixtureInput(fixtureCatalogue());const c=fixtureCatalogue();c[0].version='a'.repeat(64);mock.catalogue.mockResolvedValue(c);const r=await POST(request(b));expect(r.status).toBe(409);expect((await r.json()).code).toBe('inventory_changed')})
  it.each([null,'customer'])('requires authenticated admin for all owner reads (%s)',async user=>{
    mock.auth.mockResolvedValue({userId:user});mock.admin.mockResolvedValue(false)
    expect((await GET(new Request('https://fit.test/api/admin/bulk-filament'))).status).toBe(user?403:401)
    expect(mock.db).not.toHaveBeenCalled()
  })
  it('denies customer owner updates',async()=>{mock.admin.mockResolvedValue(false);expect((await PATCH(request({},'https://fit.test','PATCH'))).status).toBe(403);expect(mock.db).not.toHaveBeenCalled()})
  it('detects concurrent stale admin edits',async()=>{
    mock.store.findOneAndUpdate.mockResolvedValue(null)
    const r=await PATCH(request({requestId:'12345678-1234-4234-8234-123456789abc',revision:0,status:'reviewing',ownerNote:'Check actual rolls'},'https://fit.test','PATCH'))
    expect(r.status).toBe(409);expect(mock.store.findOneAndUpdate.mock.calls[0][0].revision).toBe(0)
  })
})

it.each(['accepted','failed','uncertain','sending'])('returns a saved enquiry receipt with truthful provider outcome %s',async status=>{
  mock.notify.mockResolvedValue(status)
  const r=await POST(request(fixtureInput(fixtureCatalogue())))
  expect(r.status).toBe(201);expect(await r.json()).toMatchObject({status:'new',ownerEmailStatus:status,notificationCoverage:status==='accepted'?'owner_dashboard_and_email_provider':'owner_dashboard_only'})
  expect(mock.store.insertOne).toHaveBeenCalledOnce()
})
it.each([null,'customer'])('protects owner email retries from non-admin %s',async user=>{
  mock.auth.mockResolvedValue({userId:user});mock.admin.mockResolvedValue(false)
  expect((await retryPOST(request({action:'retry_owner_email',requestId:'12345678-1234-4234-8234-123456789abc'}))).status).toBe(user?403:401)
  expect(mock.notify).not.toHaveBeenCalled()
})
it('blocks cross-origin owner retries before auth or sending',async()=>{
  expect((await retryPOST(request({},'https://foreign.test'))).status).toBe(403);expect(mock.notify).not.toHaveBeenCalled()
})
it('requires the explicit retry action and an existing enquiry',async()=>{
  expect((await retryPOST(request({}))).status).toBe(400)
  expect((await retryPOST(request({action:'retry_owner_email',requestId:'12345678-1234-4234-8234-123456789abc'}))).status).toBe(404)
  expect(mock.notify).not.toHaveBeenCalled()
})
it('lets the authenticated owner retry without changing enquiry content or sending customer communications',async()=>{
  const doc={_id:'12345678-1234-4234-8234-123456789abc',status:'new',revision:0,notifications:{email:{status:'failed',attempts:1}}}
  mock.store.findOne.mockResolvedValue(doc);mock.notify.mockResolvedValue('accepted')
  const r=await retryPOST(request({action:'retry_owner_email',requestId:doc._id}))
  expect(r.status).toBe(200);expect((await r.json()).request.ownerEmailStatus).toBe('accepted')
  expect(mock.notify).toHaveBeenCalledWith(mock.store,doc._id,{retry:true});expect(mock.store.insertOne).not.toHaveBeenCalled();expect(mock.store.findOneAndUpdate).not.toHaveBeenCalled()
})

it('never emails when persistence fails', async () => {
  mock.store.insertOne.mockRejectedValueOnce(Error('storage unavailable'))
  expect((await POST(request(fixtureInput()))).status).toBe(503)
  expect(mock.notify).not.toHaveBeenCalled()
})
it('persists before attempting the owner email', async () => {
  await POST(request(fixtureInput()))
  expect(mock.store.insertOne.mock.invocationCallOrder[0]).toBeLessThan(mock.notify.mock.invocationCallOrder[0])
})
