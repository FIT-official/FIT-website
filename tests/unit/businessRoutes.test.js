// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {memoryDb} from '../fixtures/businessStore'
const m=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),db:vi.fn(),config:vi.fn(),health:vi.fn(),load:vi.fn(),recover:vi.fn(),prepare:vi.fn(),drain:vi.fn(),retry:vi.fn()}))
vi.mock('@/lib/authenticate',()=>({authenticate:m.auth,unauthorizedResponse:()=>Response.json({error:'Unauthorized'},{status:401})}))
vi.mock('@/lib/checkPrivileges',()=>({checkAdminPrivileges:m.admin}))
vi.mock('@/lib/business/server',()=>({businessDb:m.db,notificationConfiguration:m.config,notificationHealth:m.health,loadReport:m.load,reconcileSources:m.recover,prepareSummaries:m.prepare,drainNotifications:m.drain,retryKnownFailure:m.retry}))
import {GET,POST} from '@/app/api/admin/business-reports/route'
import {GET as cron} from '@/app/api/cron/business-notifications/route'
const anchor='2026-10-11T02:00:00Z',at=new Date('2026-10-10T02:00:00Z')
const event=i=>({_id:i.toString(16).padStart(64,'0'),occurredAt:at,kind:'order.paid',source:'order',reference:'synthetic',status:'paid',amountMinor:100,currency:'SGD',itemCount:1,customerEmail:'PRIVATE',text:'PRIVATE',credentials:'PRIVATE'})
const request=(q='',token='')=>new Request('http://localhost/api/admin/business-reports?at='+anchor+'&'+q,{headers:token?{authorization:'Bearer '+token}:{}})
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('CRON_SECRET','SYNTHETIC-CRON');m.auth.mockResolvedValue({userId:'admin'});m.admin.mockResolvedValue(true);m.config.mockReturnValue({enabled:true});m.db.mockResolvedValue(memoryDb({businessEvents:[event(1)]}));m.health.mockResolvedValue({counts:{}});m.load.mockResolvedValue({report:{events:1}});m.recover.mockResolvedValue([]);m.prepare.mockResolvedValue([]);m.drain.mockResolvedValue({attempted:0})})
afterEach(()=>vi.unstubAllEnvs())
it('requires an admin session for summary data',async()=>{m.auth.mockRejectedValue(Error('signed out'));expect((await GET(request())).status).toBe(401);expect(m.db).not.toHaveBeenCalled()})
it('rejects a signed-in non-admin before accessing records',async()=>{m.admin.mockResolvedValue(false);expect((await GET(request())).status).toBe(403);expect(m.db).not.toHaveBeenCalled()})
it('limits scheduler credentials to the redacted paginated export',async()=>{
  m.auth.mockRejectedValue(Error('signed out'));expect((await GET(request('download=summary.json','SYNTHETIC-CRON'))).status).toBe(401)
  const result=await GET(request('download=page.json','SYNTHETIC-CRON'));expect(result.status).toBe(200)
  const body=await result.json();expect(body.events[0]).not.toHaveProperty('customerEmail');expect(JSON.stringify(body)).not.toContain('PRIVATE');expect(result.headers.get('cache-control')).toContain('no-store')
})
it('rejects incorrect export credentials',async()=>{m.auth.mockRejectedValue(Error('signed out'));expect((await GET(request('download=page.json','wrong'))).status).toBe(401)})
it.each(['period=hourly','period=daily&at=bad','period=daily&at=2099-01-01T00:00:00Z'])('rejects bad report range %s',async q=>{
  const req=new Request('http://localhost/api/admin/business-reports?'+q);expect((await GET(req)).status).toBe(400);expect(m.db).not.toHaveBeenCalled()
})
it.each(['not-json',Buffer.from(JSON.stringify({id:'bad',at:'bad'})).toString('base64url')])('rejects malformed export cursor %s',async cursor=>{expect((await GET(request('download=page.json&after='+cursor))).status).toBe(400)})
it('paginates 2001 records with a stable timestamp-and-ID cursor',async()=>{
  m.db.mockResolvedValue(memoryDb({businessEvents:Array.from({length:2001},(_,i)=>event(i+1))}))
  const first=await (await GET(request('download=page.json'))).json();expect(first.events).toHaveLength(2000);expect(first.next).toBeTruthy()
  const last=await (await GET(request('download=page.json&after='+first.next))).json();expect(last.events).toHaveLength(1);expect(last.next).toBeNull()
  expect(last.events[0]._id).not.toBe(first.events.at(-1)._id)
})
it('does not silently truncate browser CSV',async()=>{m.db.mockResolvedValue(memoryDb({businessEvents:Array.from({length:2001},(_,i)=>event(i+1))}));expect((await GET(request('download=events.csv'))).status).toBe(413)})
it('returns an authenticated CSV attachment with fixed columns',async()=>{const r=await GET(request('download=events.csv'));expect(r.status).toBe(200);expect(r.headers.get('content-disposition')).toContain('attachment');expect(await r.text()).not.toContain('PRIVATE')})
it('never reports an unavailable database as zero activity',async()=>{m.db.mockRejectedValue(Error('synthetic outage'));const r=await GET(request());expect(r.status).toBe(503);expect((await r.json()).error).toContain('No missing data')})
it('cron rejects missing configuration and invalid bearer token',async()=>{expect((await cron(request())).status).toBe(401);vi.stubEnv('CRON_SECRET','');expect((await cron(request())).status).toBe(503);expect(m.db).not.toHaveBeenCalled()})
it('cron remains inert until activation',async()=>{m.config.mockReturnValue({enabled:false});expect(await (await cron(request('','SYNTHETIC-CRON'))).json()).toEqual({enabled:false,attempted:0});expect(m.db).not.toHaveBeenCalled()})
it('defers report snapshot while recovery has a backlog but still drains saved notifications',async()=>{
  m.recover.mockResolvedValue([{source:'order',morePossible:true}]);const r=await cron(request('','SYNTHETIC-CRON'));expect(r.status).toBe(200)
  expect(m.prepare).not.toHaveBeenCalled();expect(m.drain).toHaveBeenCalled();expect((await r.json()).summaries.status).toBe('waiting_for_source_recovery')
})
it('cron preserves retryable failure status and hides raw errors',async()=>{m.recover.mockRejectedValue(Error('PRIVATE'));const r=await cron(request('','SYNTHETIC-CRON'));expect(r.status).toBe(503);expect(await r.text()).not.toContain('PRIVATE')})
const post=(origin='http://localhost',body={action:'retry_known_failure',id:'a'.repeat(64)})=>new Request('http://localhost/api/admin/business-reports',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
it.each(['','https://foreign.invalid'])('rejects cross-site retries %s before any effect',async origin=>{expect((await POST(post(origin))).status).toBe(403);expect(m.retry).not.toHaveBeenCalled()})
it('only allows an authenticated administrator to retry',async()=>{m.admin.mockResolvedValue(false);expect((await POST(post())).status).toBe(403);expect(m.retry).not.toHaveBeenCalled()})
it('accepts only a validated known-failure action and returns its actual outcome',async()=>{
  expect((await POST(post('http://localhost',{action:'resend_all',id:'bad'}))).status).toBe(400)
  m.retry.mockResolvedValue({status:'accepted'});expect(await (await POST(post())).json()).toEqual({status:'accepted'})
  m.retry.mockResolvedValue({status:'not_retryable'});expect((await POST(post())).status).toBe(409)
})
