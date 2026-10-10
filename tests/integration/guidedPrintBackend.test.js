// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(() => ({ userId:'buyer',admin:false,rows:[] }))
const mocks=vi.hoisted(() => ({ find:vi.fn(),create:vi.fn(),asset:vi.fn(),shape:vi.fn(),private:vi.fn(),rate:vi.fn(),connect:vi.fn() }))
vi.mock('@clerk/nextjs/server',()=>({ auth:async()=>({userId:state.userId}),clerkClient:async()=>({users:{getUser:async()=>({firstName:'Test',primaryEmailAddressId:'email-1',emailAddresses:[{id:'email-1',emailAddress:'synthetic@example.invalid'}]})}}) }))
vi.mock('@/lib/db',()=>({connectToDatabase:mocks.connect}))
vi.mock('@/lib/checkPrivileges',()=>({checkAdminPrivileges:async()=>state.admin}))
vi.mock('@/lib/fabrication/serverRateLimit',()=>({enforceFabricationRate:mocks.rate}))
vi.mock('@/lib/fabrication/serverAssets',()=>({findOwnedAsset:mocks.asset,shapeFabricationAsset:mocks.shape,privateFabricationBucket:mocks.private}))
vi.mock('@/models/CustomPrintRequest',()=>({default:{createIndexes:async()=>{},findOne:mocks.find,create:mocks.create}}))
import { POST,GET } from '@/app/api/custom-print/guided/route'
import { fail } from '@/lib/fabrication/serverHttp'
import { GUIDED_START } from '@/lib/customPrint/guidedBrief'
const body={ clientRequestId:'7703693c-a909-4d1f-a529-a78d45b10545',brief:{...GUIDED_START,purpose:'Desk organiser',sizeMode:'longest',size:10,unit:'cm',quantity:3} }
const req=(body,origin='https://fit.example.com')=>new Request('https://fit.example.com/api/custom-print/guided',{method:'POST',headers:{origin,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)})
beforeEach(()=>{
  vi.clearAllMocks();state.userId='buyer';state.admin=false;state.rows=[]
  mocks.find.mockImplementation(query=>({lean:async()=>state.rows.find(r=>r.requestId===query.requestId)||null}))
  mocks.create.mockImplementation(async data=>{if(state.rows.some(r=>r.requestId===data.requestId))throw Error('duplicate');state.rows.push(data);return data})
  mocks.asset.mockImplementation(async(id,owner,kind)=>{if(id!=='owned-model'||owner!=='buyer'||kind!=='reference')fail('Foreign attachment');return{assetId:id,originalName:'box.stl',byteLength:100}})
  mocks.shape.mockResolvedValue({fileUrl:'https://private.example.invalid/signed',originalName:'box.stl'});mocks.private.mockResolvedValue('private');mocks.rate.mockResolvedValue()
})
describe('guided enquiries reuse the private custom-print queue',()=>{
  it('requires auth and same-origin before persistence',async()=>{
    state.userId=null;expect((await POST(req(body))).status).toBe(401);state.userId='buyer'
    expect((await POST(req(body,'https://other.example.com'))).status).toBe(403);expect(mocks.create).not.toHaveBeenCalled()
  })
  it('fails closed on rate enforcement and bounded input',async()=>{
    mocks.rate.mockImplementationOnce(()=>fail('Unavailable',503));expect((await POST(req(body))).status).toBe(503)
    expect((await POST(req('x'.repeat(20000)))).status).toBe(413);expect((await POST(req('{'))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('stores preferences, pending staff review and no client price or approval',async()=>{
    const res=await POST(req({...body,price:1,guidedReview:{status:'approved'}}));expect(res.status).toBe(201)
    expect(state.rows[0]).toMatchObject({userId:'buyer',status:'configured',quoteMode:'manual',guidedReview:{status:'pending'},guidedBrief:{quantity:3,sizeMm:100,rights:'unknown'}})
    expect(state.rows[0]).not.toHaveProperty('quote');expect(state.rows[0]).not.toHaveProperty('printFee')
    expect(await res.json()).not.toHaveProperty('userEmail')
  })
  it('keeps one record on concurrent exact retries and refuses changed replay',async()=>{
    const responses=await Promise.all([POST(req(body)),POST(req(body)),POST(req(body))]);expect(responses.map(r=>r.status).sort()).toEqual([200,200,201]);expect(state.rows).toHaveLength(1)
    expect((await POST(req({...body,brief:{...body.brief,quantity:4}}))).status).toBe(409)
  })
  it('recovers an uncertain committed write',async()=>{
    mocks.create.mockImplementationOnce(async data=>{state.rows.push(data);throw Error('lost response')})
    expect((await POST(req(body))).status).toBe(200);expect(state.rows).toHaveLength(1)
  })
  it('separates two users with the same submission ID',async()=>{
    await POST(req(body));state.userId='buyer-two';await POST(req(body));expect(state.rows).toHaveLength(2);expect(state.rows[0].requestId).not.toBe(state.rows[1].requestId)
  })
  it('checks attachment ownership and format before accepting',async()=>{
    expect((await POST(req({...body,assetId:'foreign'}))).status).toBe(400)
    mocks.asset.mockResolvedValueOnce({originalName:'unsafe.gcode',byteLength:100});expect((await POST(req({...body,assetId:'owned-model'}))).status).toBe(400)
    expect((await POST(req({...body,assetId:'owned-model'}))).status).toBe(201)
    expect(mocks.asset).toHaveBeenCalledWith('owned-model','buyer','reference')
  })
  it('requires ownership or staff privilege for a private file link',async()=>{
    await POST(req({...body,assetId:'owned-model'}));const url=new Request('https://fit.example.com/api/custom-print/guided?requestId='+state.rows[0].requestId)
    state.userId='other';expect((await GET(url)).status).toBe(404);expect(mocks.shape).not.toHaveBeenCalled()
    state.admin=true;expect((await GET(url)).status).toBe(200);expect(mocks.asset).toHaveBeenLastCalledWith('owned-model','buyer','reference')
  })
  it('offers text fallback when private storage is unavailable',async()=>{
    mocks.private.mockRejectedValueOnce(Error('not configured'));const res=await GET(new Request('https://fit.example.com/api/custom-print/guided'))
    expect(await res.json()).toMatchObject({uploadsAvailable:false,maxBytes:3145728});expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
