// @vitest-environment node
import { afterEach,expect,it,vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const {exportRecords}=createRequire(import.meta.url)('../../scripts/export-business-records.cjs')
const dirs=[];const temp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'fit-business-export-'));dirs.push(d);return d}
const period={key:'daily:2026-10-10',until:'2026-10-10T16:00:00Z'}
const response=data=>({ok:true,json:async()=>data})
afterEach(()=>{for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true})})
it('exports every page to a fresh directory, strips private fields and records checksums',async()=>{
  const directory=temp(),fetchImpl=vi.fn().mockResolvedValueOnce(response({period,events:[{_id:'id1',kind:'enquiry.submitted',reference:'=FORMULA',email:'private@example.invalid',text:'PRIVATE BODY'}],next:'page-2'})).mockResolvedValueOnce(response({period,events:[{_id:'id2',kind:'order.paid',amountMinor:100}],next:null}))
  const result=await exportRecords({directory,token:'SYNTHETIC-SECRET',fetchImpl})
  expect(result).toMatchObject({events:2,pages:2,complete:true});expect(result.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256))).toBe(true)
  const json=fs.readFileSync(path.join(result.directory,'events.json'),'utf8'),csv=fs.readFileSync(path.join(result.directory,'events.csv'),'utf8')
  expect(json).not.toMatch(/private@example|PRIVATE BODY|SYNTHETIC-SECRET/);expect(csv).toContain("'=FORMULA");expect(csv.startsWith('\uFEFF')).toBe(true)
  expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');expect(fetchImpl.mock.calls[1][0].searchParams.get('after')).toBe('page-2')
  expect(fetchImpl.mock.calls[1][0].searchParams.get('at')).toBe(fetchImpl.mock.calls[0][0].searchParams.get('at'))
})
it.each(['provider','duplicate','period-change','invalid-shape'])('publishes no partial file after %s failure',async failure=>{
  const directory=temp(),fetchImpl=vi.fn().mockResolvedValueOnce(response({period,events:[{_id:'id1'}],next:'next'}))
  fetchImpl.mockResolvedValueOnce(failure==='provider'?{ok:false,status:503}:response(failure==='duplicate'?{period,events:[{_id:'id1'}]}:failure==='period-change'?{period:{...period,key:'changed'},events:[]}:{}))
  await expect(exportRecords({directory,token:'SYNTHETIC',fetchImpl})).rejects.toThrow();expect(fs.readdirSync(directory)).toEqual([])
})
it('does not fetch without the existing export credential',async()=>{const fetchImpl=vi.fn();await expect(exportRecords({token:'',fetchImpl})).rejects.toThrow();expect(fetchImpl).not.toHaveBeenCalled()})
