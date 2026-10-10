// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({limit:vi.fn(),fromEnv:vi.fn(),constructed:vi.fn()}))
vi.mock('@upstash/redis',()=>({Redis:{fromEnv:mocks.fromEnv}}))
vi.mock('@upstash/ratelimit',()=>({Ratelimit:class { constructor(options){mocks.constructed(options);this.limit=mocks.limit} static slidingWindow(limit,window){return {limit,window}} }}))
const request=()=>new Request('https://fixture.invalid/api/community',{headers:{'x-forwarded-for':'192.0.2.1'}})
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('NODE_ENV','production');for(const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN'])vi.stubEnv(key,'');mocks.limit.mockResolvedValue({success:true});mocks.fromEnv.mockReturnValue({})})
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers()})
async function rate(){return (await import('@/lib/community/rateLimit')).communityRate}
function credentials(){vi.stubEnv('UPSTASH_REDIS_REST_URL','https://fixture.invalid');vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','inert-test-only')}
describe('community anti-spam limits',()=>{
  it('fails closed without a complete production credential pair',async()=>{await expect((await rate())(request(),'submit','member')).rejects.toMatchObject({status:503});expect(mocks.fromEnv).not.toHaveBeenCalled()})
  it('does not mix a partial Upstash pair with a complete KV pair',async()=>{vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','partial');vi.stubEnv('KV_REST_API_URL','https://fixture.invalid');vi.stubEnv('KV_REST_API_TOKEN','inert');await expect((await rate())(request(),'submit','member')).rejects.toMatchObject({status:503})})
  it('uses independent bounded minute/hour submit and report limits with hashed identities',async()=>{credentials();await (await rate())(request(),'submit','private-account-id');expect(mocks.constructed.mock.calls.map(x=>x[0].limiter)).toEqual([{limit:5,window:'1 m'},{limit:30,window:'1 h'}]);expect(mocks.limit.mock.calls[0][0]).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(mocks.constructed.mock.calls)).not.toContain('private-account-id')})
  it.each([{success:false},{success:true,reason:'timeout'},{},{success:'true'}])('rejects denial or uncertain provider result %j',async result=>{credentials();mocks.limit.mockResolvedValue(result);await expect((await rate())(request(),'report','member')).rejects.toMatchObject({status:result.success===false?429:503})})
  it('does not leak provider credential text on failure',async()=>{credentials();mocks.limit.mockRejectedValue(new Error('secret-token URL'));await expect((await rate())(request(),'edit','member')).rejects.toMatchObject({status:503,message:'Community is temporarily unavailable. Please try later.'})})
  it('limits local development requests and expires windows',async()=>{vi.stubEnv('NODE_ENV','test');vi.useFakeTimers();const enforce=await rate();for(let i=0;i<3;i++)await enforce(request(),'report','member');await expect(enforce(request(),'report','member')).rejects.toMatchObject({status:429});vi.advanceTimersByTime(60001);await expect(enforce(request(),'report','member')).resolves.toBeUndefined()})
})
