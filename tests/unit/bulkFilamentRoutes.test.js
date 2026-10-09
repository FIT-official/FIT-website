// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureProduct, fixtureInput } from '../fixtures/bulkFilament'
import { bulkCatalogue } from '@/lib/bulkFilament'
const mock=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),db:vi.fn(),catalogue:vi.fn(),rate:vi.fn(),store:{findOne:vi.fn(),insertOne:vi.fn(),findOneAndUpdate:vi.fn(),find:vi.fn()}}))
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
import { GET, PATCH } from '@/app/api/admin/bulk-filament/route'
const request=(body,origin='https://fit.test',method='POST')=>new Request('https://fit.test/api/bulk-filament/requests',{method,headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{
  vi.clearAllMocks();mock.auth.mockResolvedValue({userId:'admin'});mock.admin.mockResolvedValue(true)
  mock.db.mockResolvedValue({collection:()=>mock.store});mock.catalogue.mockResolvedValue(bulkCatalogue([fixtureProduct()]))
  mock.rate.mockResolvedValue();mock.store.findOne.mockResolvedValue(null);mock.store.insertOne.mockResolvedValue({acknowledged:true})
})
describe('bulk API security and responses',()=>{
  it('exposes safe canonical catalogue with no-store',async()=>{const r=await catalogueGET();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect((await r.json()).maxExtraPerColour).toBe(20)})
  it('rejects foreign origin before persistence',async()=>{const r=await POST(request({},'https://foreign.test'));expect(r.status).toBe(403);expect(mock.db).not.toHaveBeenCalled()})
  it('rejects missing origin',async()=>{const r=await POST(new Request('https://fit.test/api',{method:'POST',body:'{}'}));expect(r.status).toBe(403)})
  it('persists guest request without calling authentication or payments',async()=>{
    const r=await POST(request(fixtureInput(bulkCatalogue([fixtureProduct()]))))
    expect(r.status).toBe(201);expect(mock.store.insertOne).toHaveBeenCalledOnce();expect(mock.auth).not.toHaveBeenCalled()
    expect(await r.json()).toMatchObject({notificationCoverage:'owner_dashboard_only',status:'new'})
  })
  it('rejects invalid extras server-side',async()=>{const b=fixtureInput(bulkCatalogue([fixtureProduct()]));b.lines[0].extraQuantity=21;expect((await POST(request(b))).status).toBe(400);expect(mock.db).not.toHaveBeenCalled()})
  it('fails closed when rate gate is unavailable',async()=>{mock.rate.mockRejectedValue(Error('db unavailable'));const r=await POST(request(fixtureInput(bulkCatalogue([fixtureProduct()]))));expect(r.status).toBe(503);expect(mock.store.insertOne).not.toHaveBeenCalled()})
  it('rejects stale stock with a refreshable conflict',async()=>{const b=fixtureInput(bulkCatalogue([fixtureProduct()]));const p=fixtureProduct();p.stock=1;mock.catalogue.mockResolvedValue(bulkCatalogue([p]));const r=await POST(request(b));expect(r.status).toBe(409);expect((await r.json()).code).toBe('inventory_changed')})
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
