// Explicit local-only check: node scripts/check-bulk-filament-mongo.cjs <existing mongod.exe>
// Own process, random loopback port and fresh database; no provider transports.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')

const mongoose = require('mongoose')
const esbuild = require('esbuild')

async function main() {
  const binary = path.resolve(process.argv[2] || '')
  assert.equal(path.basename(binary).toLowerCase(), 'mongod.exe')
  assert.ok(fs.statSync(binary).isFile())
  const run = randomUUID().replaceAll('-', '')
  const out = path.resolve('output', `bulk-mongo-${run}`)
  const data = path.join(out, 'data')
  fs.mkdirSync(data, { recursive: true })
  const socket = net.createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const database = `fit_bulk_qa_${run}`
  const uri = `mongodb://127.0.0.1:${port}/${database}?directConnection=true`
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/fit_bulk_qa_[a-f0-9]+\?directConnection=true$/)
  const child = spawn(binary, ['--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', data, '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const closed = new Promise(resolve => child.once('close', resolve))
  const log = fs.createWriteStream(path.join(out, 'mongod.log'))
  child.stdout.pipe(log); child.stderr.pipe(log, { end: false })
  const receipt = { run, database, port, data, pid: child.pid, checks: [], providerSends: 0 }
  let owned = false
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned Mongo readiness timed out')), 30000)
      const finish = fn => value => { clearTimeout(timer); fn(value) }
      let text = ''
      child.stdout.on('data', chunk => { text = (text + chunk.toString()).slice(-10000); if (/Waiting for connections/.test(text)) finish(resolve)() })
      child.once('error', finish(reject)); child.once('exit', code => finish(reject)(new Error(`Owned Mongo exited ${code}`)))
    })
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false, maxPoolSize: 4 })
    const options = await mongoose.connection.db.admin().command({ getCmdLineOpts: 1 })
    assert.equal(path.resolve(options.parsed.storage.dbPath).toLowerCase(), data.toLowerCase())
    assert.equal(options.parsed.net.port, port)
    assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0)
    owned = true
    const bundle = path.join(out, 'bulk.cjs')
    await esbuild.build({ entryPoints: ['lib/bulkFilament.js'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': process.cwd() } })
    const { bulkCatalogue, parseBulkInput, saveBulkRequest } = require(bundle)
    const fixtureBundle = path.join(out, 'fixtures.cjs')
    await esbuild.build({ entryPoints: ['tests/fixtures/bulkFilament.js'], outfile: fixtureBundle, bundle: true, platform: 'node', format: 'cjs' })
    const { fixtureProduct, fixtureInput } = require(fixtureBundle)
    const product = fixtureProduct(), catalogue = bulkCatalogue([product]), input = parseBulkInput(fixtureInput(catalogue))
    const db = mongoose.connection.db, store = db.collection('bulkFilamentRequests')
    const outcomes = await Promise.all(Array.from({ length: 12 }, () => saveBulkRequest(store,input,async()=>catalogue)))
    assert.equal(outcomes.filter(r=>r.created).length,1); assert.equal(await store.countDocuments(),1)
    receipt.checks.push('12 concurrent submissions persist exactly one request and reference')
    await mongoose.disconnect(); await mongoose.connect(uri,{autoIndex:false,maxPoolSize:4})
    const durable = mongoose.connection.db.collection('bulkFilamentRequests')
    const replay = await saveBulkRequest(durable,input,async()=>{throw Error('inventory should not be re-read for replay')})
    assert.equal(replay.created,false);assert.equal(replay.receipt.requestId,input.clientRequestId)
    receipt.checks.push('replay survives reconnect and later inventory outage')
    await assert.rejects(saveBulkRequest(durable,{...input,notes:'changed'},async()=>catalogue),{status:409})
    receipt.checks.push('same reference with changed content cannot overwrite the original')
    const uncertain={...input,clientRequestId:randomUUID()}
    const lostAck={findOne:q=>durable.findOne(q),insertOne:async d=>{await durable.insertOne(d);throw Error('synthetic lost ack')}}
    const recovered=await saveBulkRequest(lostAck,uncertain,async()=>catalogue)
    assert.equal(recovered.created,false);assert.equal(await durable.countDocuments({_id:uncertain.clientRequestId}),1)
    receipt.checks.push('lost insert acknowledgement is recovered without duplicate')
    const changes=await Promise.all(Array.from({length:2},()=>durable.findOneAndUpdate({_id:input.clientRequestId,revision:0},{$set:{status:'reviewing'},$inc:{revision:1}},{returnDocument:'after'})))
    assert.equal(changes.filter(Boolean).length,1)
    receipt.checks.push('concurrent owner edits accept one matching revision')
    process.env.MONGODB_URI=uri
    const httpBundle=path.join(out,'bulk-http.cjs')
    await esbuild.build({entryPoints:['lib/bulkFilamentHttp.js'],outfile:httpBundle,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':process.cwd()}})
    const {limitBulkRequest}=require(httpBundle)
    const rateDb=mongoose.connection.db
    const now=Date.now(),headers=new Headers()
    const rates=await Promise.allSettled(Array.from({length:35},()=>limitBulkRequest(rateDb,headers,now)))
    assert.equal(rates.filter(r=>r.status==='fulfilled').length,30)
    assert.equal(rates.filter(r=>r.status==='rejected'&&r.reason.status===429).length,5)
    await limitBulkRequest(rateDb,headers,now+60001)
    assert.equal(await rateDb.collection('bulkFilamentRateLimits').countDocuments(),1)
    receipt.checks.push('atomic rate limit accepts 30, rejects 5 and resets in the same document')
    assert.deepEqual(product,fixtureProduct())
    assert.equal(await rateDb.collection('products').countDocuments(),0)
    assert.deepEqual((await durable.findOne({_id:input.clientRequestId})).notifications,{email:'not_configured',telegram:'not_configured'})
    receipt.checks.push('no inventory writes, notifications, payment or order side effects')
    receipt.status = 'passed'

  } catch (error) { receipt.status = 'failed'; receipt.error = error.message; process.exitCode = 1 }
  finally {
    try {
      if (owned && mongoose.connection.readyState === 1) { await mongoose.connection.dropDatabase(); receipt.ownedDatabaseDropped = true }
    } catch (error) { receipt.cleanupError = error.message; process.exitCode = 1 }
    finally {
      await mongoose.disconnect().catch(() => {})
      if (child.pid && child.exitCode == null) child.kill()
      await closed
    }
    receipt.ownedProcessStopped = child.exitCode != null || child.signalCode != null
    receipt.completedAt = new Date().toISOString()
    log.end()
    fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2))
    console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, receipt: path.join(out, 'receipt.json'), ownedProcessStopped: receipt.ownedProcessStopped }))
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
