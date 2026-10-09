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
    const { bulkCatalogue, parseBulkInput, prepareBulkLines, saveBulkRequest } = require(bundle)
    const fixtureBundle = path.join(out, 'fixtures.cjs')
    await esbuild.build({ entryPoints: ['tests/fixtures/bulkFilament.js'], outfile: fixtureBundle, bundle: true, platform: 'node', format: 'cjs' })
    const { fixtureProduct, fixtureInput } = require(fixtureBundle)
    const product = fixtureProduct(), catalogue = bulkCatalogue([product]), body = fixtureInput(catalogue)
    body.lines[0] = { ...body.lines[0], quantity: 8 }; delete body.lines[0].recordedQuantity; delete body.lines[0].extraQuantity
    const white = structuredClone(body.lines[0]); white.options[0].optionId = '444444444444444444444444'; white.quantity = 3
    body.lines.push(white)
    const input = parseBulkInput(body)
    const db = mongoose.connection.db, store = db.collection('bulkFilamentRequests')
    const outcomes = await Promise.all(Array.from({ length: 12 }, () => saveBulkRequest(store,input,async()=>catalogue)))
    assert.equal(outcomes.filter(r=>r.created).length,1); assert.equal(await store.countDocuments(),1)
    receipt.checks.push('12 concurrent submissions persist exactly one request and reference')
    await mongoose.disconnect(); await mongoose.connect(uri,{autoIndex:false,maxPoolSize:4})
    const durable = mongoose.connection.db.collection('bulkFilamentRequests')
    const replay = await saveBulkRequest(durable,input,async()=>{throw Error('inventory should not be re-read for replay')})
    assert.equal(replay.created,false);assert.equal(replay.receipt.requestId,input.clientRequestId)
    receipt.checks.push('replay survives reconnect and later inventory outage')
    const saved = await durable.findOne({ _id: input.clientRequestId })
    assert.deepEqual(saved.lines.map(l => [l.colour, l.quantity]), [['Black', 8], ['White', 3]])
    assert.equal(saved.lines.reduce((n,l) => n + l.recordedQuantity, 0), 6)
    assert.equal(saved.lines.reduce((n,l) => n + l.publicLineTotal.amount, 0), 110)
    assert.equal(replay.receipt.totalRolls, 11)
    receipt.checks.push('two colour quantities, canonical prices and total survive persistence and replay')
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
    const {limitBulkRequest,loadBulkCatalogue}=require(httpBundle)
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
    assert.deepEqual((await durable.findOne({_id:input.clientRequestId})).notifications,{email:{status:'pending',attempts:0},telegram:'not_configured'})
    receipt.checks.push('no inventory writes, notifications, payment or order side effects')
    // Only this explicitly owned empty test database receives synthetic stock edits.
    const products = rateDb.collection('products'), id = new mongoose.Types.ObjectId(product._id)
    await products.insertOne({ ...product, _id: id, hidden: false })
    const initial = await loadBulkCatalogue()
    assert.equal(initial.length, 1)
    const originalRequest = { ...input, lines: [{ ...input.lines[0], version: initial[0].version, quantity: 25 }] }
    for (const stock of [0, 2, 10]) {
      await products.updateOne({ _id: id }, { $set: { 'variantTypes.0.options.0.stock': stock, 'variantTypes.1.options.0.stock': 12 } })
      const refreshed = await loadBulkCatalogue()
      assert.equal(refreshed[0].types[0].options[0].stock, stock)
      assert.throws(() => prepareBulkLines(originalRequest, refreshed), { status: 409 })
      const freshRequest = { ...originalRequest, lines: [{ ...originalRequest.lines[0], version: refreshed[0].version, quantity: stock + 20 }] }
      assert.equal(prepareBulkLines(freshRequest, refreshed)[0].quantity, stock + 20)
      freshRequest.lines[0].quantity++
      assert.throws(() => prepareBulkLines(freshRequest, refreshed), { status: 409 })
    }
    assert.equal((await products.findOne({ _id: id })).variantTypes[0].options[0].stock, 10)
    assert.equal((await products.findOne({ _id: id })).variantTypes[0].options[1].stock, 7)
    receipt.checks.push('canonical Mongo stock edits 0/2/10 propagate on next catalogue read; old snapshots and over-cap totals rejected; other colour unchanged')

    // Canonical price fixture and approved rational tiers, only in the owned disposable database.
    await products.updateOne({ _id: id }, { $set: { name: 'Synthetic Lanbo PLA filament', slug: '1kg-pla-3d-printing-filament-lanbo', 'basePrice.presentmentAmount': 14.9, discount: { percentage: 99 }, discounts: [] } })
    const priced = await loadBulkCatalogue()
    const pricedInput = { ...input, clientRequestId: randomUUID(), lines: input.lines.map((line,i) => ({ ...line, version: priced[0].version, quantity: i ? 6 : 4 })) }
    const estimateResult = await saveBulkRequest(durable, pricedInput, async () => priced)
    assert.deepEqual(estimateResult.receipt.estimatedTotals, { totals: [{ currency: 'SGD', subtotal: 149, discount: 10, total: 139 }], unpricedLines: 0 })
    const pricedSaved = await durable.findOne({ _id: pricedInput.clientRequestId })
    assert.deepEqual(pricedSaved.lines.map(l => [l.publicUnitPrice.amount,l.appliedTier.categoryQuantity,l.estimatedUnitPrice.amount,l.estimatedLineTotal.amount]), [[14.9,10,13.9,55.6],[14.9,10,13.9,83.4]])
    await products.updateOne({ _id: id }, { $set: { 'basePrice.presentmentAmount': 15.9 } })
    const changedPrice = await loadBulkCatalogue()
    assert.throws(() => prepareBulkLines(pricedInput, changedPrice), { status: 409 })
    await mongoose.disconnect(); await mongoose.connect(uri, { autoIndex: false, maxPoolSize: 4 })
    const pricedReplay = await saveBulkRequest(mongoose.connection.db.collection('bulkFilamentRequests'), pricedInput, async () => { throw Error('saved estimate must not be repriced') })
    assert.deepEqual(pricedReplay.receipt, estimateResult.receipt)
    receipt.checks.push('server-derived discount and totals persist in Mongo; changed canonical prices invalidate unsaved snapshots; saved receipt survives reconnect without repricing')

    const emailBundle = path.join(out, 'email.cjs')
    await esbuild.build({ entryPoints: ['lib/bulkFilamentEmail.js'], outfile: emailBundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': process.cwd() } })
    const { notifyBulkOwner, BULK_OWNER_EMAIL } = require(emailBundle)
    const emailStore = mongoose.connection.db.collection('bulkFilamentRequests')
    const stockBefore = await mongoose.connection.db.collection('products').find({}).toArray()
    const mailOptions = { env: { GMAIL_USER: 'synthetic@example.invalid', GMAIL_PASSWORD: 'inert-synthetic' } }
    let providerCalls = 0, captured
    const send = async message => { providerCalls++; captured=message; return { accepted: [BULK_OWNER_EMAIL] } }
    await Promise.all(Array.from({ length: 12 }, () => notifyBulkOwner(emailStore, pricedInput.clientRequestId, { ...mailOptions, send })))
    assert.equal(providerCalls, 1)
    assert.match(captured.text, /SGD public subtotal: 149.00; discount: 10.00; estimated filament total: 139.00/)
    assert.equal((await emailStore.findOne({ _id: pricedInput.clientRequestId })).notifications.email.status, 'accepted')
    receipt.checks.push('12 concurrent durable email claims produce exactly one mocked SMTP send with exact saved 139.00 estimate')
    await mongoose.disconnect(); await mongoose.connect(uri, { autoIndex: false, maxPoolSize: 4 })
    const mailStore = mongoose.connection.db.collection('bulkFilamentRequests')
    assert.equal(await notifyBulkOwner(mailStore, pricedInput.clientRequestId, { ...mailOptions, send, retry: true }), 'accepted')
    assert.equal(providerCalls, 1)
    receipt.checks.push('accepted email status survives Mongo reconnect; public replay and owner retry do not resend')
    const failedId=randomUUID();await saveBulkRequest(mailStore,{...input,clientRequestId:failedId},async()=>catalogue)
    let failedCalls=0
    const reject = async () => { failedCalls++; throw Object.assign(Error('Synthetic SMTP rejection'), { responseCode: 451 }) }
    assert.equal(await notifyBulkOwner(mailStore,failedId,{...mailOptions,send:reject}),'failed')
    assert.equal(await notifyBulkOwner(mailStore,failedId,{...mailOptions,send:reject}),'failed');assert.equal(failedCalls,1)
    assert.equal(await notifyBulkOwner(mailStore,failedId,{...mailOptions,send,retry:true}),'accepted')
    assert.equal((await mailStore.findOne({_id:failedId})).notifications.email.attempts,2)
    receipt.checks.push('explicit SMTP failure is durable; public retry sends nothing; owner retry atomically records second accepted attempt')
    const unknownId=randomUUID();await saveBulkRequest(mailStore,{...input,clientRequestId:unknownId},async()=>catalogue)
    let unknownCalls=0;const unknown=async()=>{unknownCalls++;throw Error('Synthetic lost SMTP acknowledgement')}
    assert.equal(await notifyBulkOwner(mailStore,unknownId,{...mailOptions,send:unknown}),'uncertain')
    assert.equal(await notifyBulkOwner(mailStore,unknownId,{...mailOptions,send:unknown,retry:true}),'uncertain');assert.equal(unknownCalls,1)
    receipt.checks.push('ambiguous SMTP outcome persists and blocks automatic/manual API resend')
    assert.deepEqual(await mongoose.connection.db.collection('products').find({}).toArray(),stockBefore)
    receipt.checks.push('email attempts leave all inventory records exactly unchanged; all transports mocked, no provider sends')
    receipt.mockedEmailCalls = providerCalls + failedCalls + unknownCalls
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
