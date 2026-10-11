#!/usr/bin/env node
// Uses an existing scheduler credential from the environment. Never prints it,
// forwards it across redirects, or writes it to exported records.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { csvCell } = { csvCell: v => { let s = v == null ? '' : String(v); if (/^[\s]*[=+@\-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g,'""') + '"' } }
async function exportRecords({ period = 'daily', at = new Date().toISOString(), directory = 'E:/FIT-business-records', token = process.env.CRON_SECRET, fetchImpl = fetch } = {}) {
  if (!['daily','weekly','monthly'].includes(period) || !token) throw Error('Choose a period and provide the existing CRON_SECRET through the environment')
  if (at && !Number.isFinite(Date.parse(at))) throw Error('Invalid report date')
  const root = path.resolve(directory), batch = path.join(root, `${period}-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`)
  const events = []; let next = null, reportPeriod, pages = 0
  const seen = new Set()
  do {
    const url = new URL('https://www.fixitoday.com/api/admin/business-reports')
    url.searchParams.set('download','page.json'); url.searchParams.set('period',period)
    if (at) url.searchParams.set('at',at)
    if (next) url.searchParams.set('after',next)
    const response = await fetchImpl(url, { redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error(`Export unavailable (HTTP ${response.status}); no partial export marked complete`)
    const data = await response.json()
    if (!Array.isArray(data.events) || !data.period?.key) throw Error('Invalid export response')
    if (reportPeriod && (reportPeriod.key !== data.period.key || reportPeriod.until !== data.period.until)) throw Error('Period changed during export; retry with explicit at date')
    reportPeriod = data.period
    for (const e of data.events) { if (seen.has(e._id)) throw Error('Duplicate export event'); seen.add(e._id); events.push(e) }
    next = data.next; pages++
    if (next && pages >= 500) throw Error('Export page limit reached; no incomplete file published')
  } while (next)
  const keys=['_id','occurredAt','kind','source','reference','status','currency','amountMinor','itemCount']
  const safe = events.map(e => Object.fromEntries(keys.filter(k => e[k] !== undefined).map(k => [k,e[k]])))
  fs.mkdirSync(batch,{recursive:true})
  fs.writeFileSync(path.join(batch,'events.json'),JSON.stringify({period:reportPeriod,events:safe},null,2))
  fs.writeFileSync(path.join(batch,'events.csv'),'\uFEFF'+[keys,...safe.map(e=>keys.map(k=>e[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n')
  const receipt={completedAt:new Date().toISOString(),period:reportPeriod,events:safe.length,pages,complete:true,files:['events.json','events.csv'].map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(batch,name))).digest('hex')})),includesCustomerContacts:false,includesMessageBodies:false,includesCardOrCredentialData:false}
  fs.writeFileSync(path.join(batch,'receipt.json'),JSON.stringify(receipt,null,2));return{directory:batch,...receipt}
}
module.exports={exportRecords}
if(require.main===module) exportRecords({period:process.argv[2]||'daily',directory:process.argv[3]||'E:/FIT-business-records',at:process.argv[4]}).then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Export failed; no complete export was claimed. Check configuration and endpoint access.');process.exitCode=1})
