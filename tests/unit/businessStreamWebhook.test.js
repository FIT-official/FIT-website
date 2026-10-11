// @vitest-environment node
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({verify:vi.fn(),connect:vi.fn(),save:vi.fn(),capture:vi.fn(),clerk:vi.fn(),email:vi.fn()}))
vi.mock('@/lib/streamChat',()=>({getStreamServerClient:()=>({verifyWebhook:mocks.verify})}))
vi.mock('@/lib/db',()=>({connectToDatabase:mocks.connect}))
vi.mock('@/models/ChannelSummary',()=>({default:{findOneAndUpdate:mocks.save}}))
vi.mock('@/lib/business/server',()=>({captureChat:mocks.capture,notificationConfiguration:()=>({enabled:true,ownerEmail:'fixittoday.contact@gmail.com'})}))
vi.mock('@clerk/nextjs/server',()=>({clerkClient:mocks.clerk}))
vi.mock('@/lib/email',()=>({sendEmail:mocks.email}))
import { POST } from '@/app/api/webhook/stream/route'
const event={type:'message.new',channel:{id:'synthetic-channel',members:[]},message:{id:'m1',text:'private',created_at:'2026-10-10T00:00:00Z'}}
const req=(body=event,signature='synthetic-valid')=>new Request('http://localhost/api/webhook/stream',{method:'POST',headers:signature?{'x-signature':signature}:{},body:JSON.stringify(body)})
beforeEach(()=>{vi.resetAllMocks();mocks.verify.mockReturnValue(true);vi.spyOn(console,'error').mockImplementation(()=>{})})
afterEach(()=>vi.restoreAllMocks())
it.each([false,undefined,null,0])('rejects a non-true signature result %s before persistence or email',async value=>{
  mocks.verify.mockReturnValue(value);expect((await POST(req())).status).toBe(401)
  expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.capture).not.toHaveBeenCalled();expect(mocks.email).not.toHaveBeenCalled()
})
it('rejects a missing signature even when a permissive verifier stub exists',async()=>{expect((await POST(req(event,''))).status).toBe(401);expect(mocks.verify).not.toHaveBeenCalled()})
it('rejects thrown verification errors',async()=>{mocks.verify.mockImplementation(()=>{throw Error('synthetic invalid')});expect((await POST(req())).status).toBe(401)})
it('captures valid accepted messages only after the channel summary is saved',async()=>{
  expect((await POST(req())).status).toBe(200);expect(mocks.save).toHaveBeenCalledTimes(1);expect(mocks.capture).toHaveBeenCalledWith(event)
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.capture.mock.invocationCallOrder[0])
})
it('returns retryable failure if durable owner capture fails',async()=>{mocks.capture.mockRejectedValue(Error('synthetic storage outage'));expect((await POST(req())).status).toBe(500);expect(mocks.email).not.toHaveBeenCalled()})
it('does not email the owner twice through the older participant courtesy path',async()=>{
  mocks.clerk.mockResolvedValue({users:{getUser:vi.fn(async()=>({emailAddresses:[{emailAddress:'fixittoday.contact@gmail.com'}]}))}})
  expect((await POST(req({...event,channel:{...event.channel,members:[{user_id:'owner'}]}}))).status).toBe(200)
  expect(mocks.capture).toHaveBeenCalled();expect(mocks.email).not.toHaveBeenCalled()
})
it('ignores unrelated provider events',async()=>{expect((await POST(req({type:'user.updated'}))).status).toBe(200);expect(mocks.connect).not.toHaveBeenCalled()})
