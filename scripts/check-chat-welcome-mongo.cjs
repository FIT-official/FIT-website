// Explicit local-only check: node scripts/check-chat-welcome-mongo.cjs <existing mongod.exe>
// Own process, random loopback port and fresh database; no provider transports.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const mongoose = require('mongoose')
const esbuild = require('esbuild')

async function main() {
  const binary = path.resolve(process.argv[2] || '')
  assert.equal(path.basename(binary).toLowerCase(), 'mongod.exe')
  assert.ok(fs.statSync(binary).isFile())
  const run = randomUUID().replaceAll('-', '')
  const out = path.resolve('output', `welcome-mongo-${run}`)
  const data = path.join(out, 'data')
  fs.mkdirSync(data, { recursive: true })
  const socket = net.createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const database = `fit_welcome_qa_${run}`
  const uri = `mongodb://127.0.0.1:${port}/${database}?directConnection=true`
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/fit_welcome_qa_[a-f0-9]+\?directConnection=true$/)
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
    const bundle = path.join(out, 'welcome.mjs')
    await esbuild.build({ entryPoints: ['lib/chat/welcome.js'], outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: { '@': process.cwd() } })
    const { sendWelcomeOnce, welcomeId } = await import(pathToFileURL(bundle))
    const model = mongoose.model('ChatAutoReply')
    let sends = 0
    const send = async () => { sends++ }
    const outcomes = await Promise.all(Array.from({ length: 12 }, () => sendWelcomeOnce({ channelId: 'synthetic-concurrent', responderId: 'synthetic-creator', send })))
    assert.equal(sends, 1); assert.equal(outcomes.filter(result => result.sent).length, 1); assert.equal(await model.countDocuments(), 1)
    receipt.checks.push('12 concurrent actual Mongo claims allow one send')
    await mongoose.disconnect(); await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false, maxPoolSize: 4 })
    await sendWelcomeOnce({ channelId: 'synthetic-concurrent', responderId: 'synthetic-creator', send }); assert.equal(sends, 1)
    receipt.checks.push('durable claim survives disconnect/reconnect')
    let attempted = 0
    const uncertain = { channelId: 'synthetic-accepted-timeout', responderId: 'synthetic-creator', send: async () => { attempted++; throw new Error('synthetic timeout after acceptance') } }
    await assert.rejects(sendWelcomeOnce(uncertain)); await sendWelcomeOnce(uncertain); assert.equal(attempted, 1)
    assert.equal((await model.findById(welcomeId(uncertain.channelId, uncertain.responderId)).lean()).status, 'uncertain')
    receipt.checks.push('ambiguous transport outcome remains quarantined across retry')
    let failAck = true, acknowledgedSends = 0
    const ackModel = { create: row => model.create(row), updateOne: (...args) => { if (failAck) { failAck = false; return Promise.reject(new Error('synthetic lost sent acknowledgement')) } return model.updateOne(...args) } }
    const ack = { channelId: 'synthetic-db-ack', responderId: 'synthetic-creator', send: async () => { acknowledgedSends++ }, model: ackModel }
    await assert.rejects(sendWelcomeOnce(ack)); await sendWelcomeOnce(ack); assert.equal(acknowledgedSends, 1)
    receipt.checks.push('lost sent acknowledgement cannot trigger a duplicate')
    let failInsertAck = true, suppressedSends = 0
    const insertModel = { create: async row => { const result = await model.create(row); if (failInsertAck) { failInsertAck = false; throw new Error('synthetic lost claim acknowledgement') } return result }, updateOne: (...args) => model.updateOne(...args) }
    const insert = { channelId: 'synthetic-insert-ack', responderId: 'synthetic-creator', send: async () => { suppressedSends++ }, model: insertModel }
    await assert.rejects(sendWelcomeOnce(insert)); await sendWelcomeOnce(insert); assert.equal(suppressedSends, 0)
    receipt.checks.push('uncertain insert acknowledgement fails closed without sending')
    const indexes = await model.collection.indexes()
    assert.ok(indexes.some(index => index.name === '_id_'))
    receipt.checks.push('built-in unique _id index is present with autoIndex disabled')
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
