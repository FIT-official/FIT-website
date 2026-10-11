// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { visitorSummary, safePagePath } from '@/lib/business/visitors'
import { reportPeriod } from '@/lib/business/periods'
const period=reportPeriod('daily',new Date('2026-10-11T00:00:00Z'))
const env={POSTHOG_PROJECT_ID:'synthetic',POSTHOG_PERSONAL_API_KEY:'inert',NEXT_PUBLIC_POSTHOG_HOST:'https://analytics.example.invalid'}
const row=(id,timestamp='2026-10-10T01:00:00Z')=>({id,distinct_id:'private-visitor',timestamp,event:'$pageview',properties:{$pathname:'/shop?email=PRIVATE',$referring_domain:'example.com',$device_type:'Mobile',$geoip_country_code:'SG',ip:'PRIVATE'}})
const response=data=>({ok:true,json:async()=>data})
it('aggregates only the half-open period, deduplicates pages, and discards raw identity/properties',async()=>{
  const fetchImpl=vi.fn(async()=>response({results:[row('a'),row('a'),row('outside',period.until.toISOString())],next:null}))
  const r=await visitorSummary(period,{env,fetchImpl});expect(r.pageViews).toBe(1);expect(r.uniqueVisitors).toBe(1);expect(r.complete).toBe(true)
  expect(r.paths).toEqual({'/shop':1});expect(JSON.stringify(r)).not.toMatch(/private-visitor|PRIVATE|ip/)
})
it('refuses cross-origin pagination without forwarding the analytics credential',async()=>{
  const fetchImpl=vi.fn(async()=>response({results:[row('a')],next:'https://evil.example.invalid/steal'}))
  const r=await visitorSummary(period,{env,fetchImpl});expect(r.available).toBe(false);expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it('labels provider page limits as partial',async()=>{
  const fetchImpl=vi.fn(async()=>response({results:[row('a')],next:'https://analytics.example.invalid/api/projects/synthetic/events/?page=2'}))
  const r=await visitorSummary(period,{env,fetchImpl,maxPages:1});expect(r.available).toBe(true);expect(r.complete).toBe(false)
})
it('does not fabricate zero when unconfigured or the provider fails',async()=>{
  expect((await visitorSummary(period,{env:{}})).available).toBe(false)
  expect((await visitorSummary(period,{env,fetchImpl:async()=>{throw Error('failure')}})).available).toBe(false)
})
it.each(['/account/user-secret','/admin?token=secret','/workshop/class-secret','/api/private'])('hides private paths %s',p=>expect(safePagePath({$pathname:p})).toBe('(account or private area)'))
