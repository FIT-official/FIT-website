// Synthetic local acceptance. No production auth, database or external HTTP.
// node scripts/check-maker-tools.cjs <existing-mongod.exe> [--browser]
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), http = require('node:http')
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto'), { spawn } = require('node:child_process')
const allowed = /^(PATH|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|TEMP|TMP)$/i
for (const key of Object.keys(process.env)) if (!allowed.test(key)) delete process.env[key]
process.env.NODE_ENV = 'test'
const mongoose = require('mongoose'), esbuild = require('esbuild')
async function main() {
  const repo = path.resolve(__dirname, '..'), binary = path.resolve(process.argv[2] || '')
  process.chdir(repo)
  assert.equal(path.basename(binary).toLowerCase(), 'mongod.exe'); assert.ok(fs.statSync(binary).isFile())
  const root = path.resolve('..', 'receipts', 'maker-acceptance-' + randomUUID()), data = path.join(root, 'data')
  fs.mkdirSync(data, { recursive: true })
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve))
  const database = 'fit_maker_acceptance_' + randomUUID().replaceAll('-', ''), uri = `mongodb://127.0.0.1:${port}/${database}`
  const child = spawn(binary, ['--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', data, '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const closed = new Promise(resolve => child.once('exit', resolve))
  const log = fs.createWriteStream(path.join(root, 'mongod.log')); child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
  const receipt = { startedAt: new Date().toISOString(), scope: 'Actual inventory routes and validation with synthetic Clerk boundary and owned loopback Mongo; optional actual React component in isolated browser fixture.', root, database, externalRequests: [], checks: [], success: false }
  const mark = name => receipt.checks.push(name)
  let server, browser
  globalThis.__makerActor = 'fixture-alice'
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Mongo readiness timed out')), 30000)
      let tail = ''; child.stdout.on('data', bytes => { tail = (tail + bytes).slice(-16000); if (tail.includes('Waiting for connections')) { clearTimeout(timer); resolve() } })
      child.once('error', reject); child.once('exit', code => { clearTimeout(timer); reject(Error('Mongo exited ' + code)) })
    })
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false })
    const opts = await mongoose.connection.db.admin().command({ getCmdLineOpts: 1 })
    assert.equal(path.resolve(opts.parsed.storage.dbPath), data); assert.equal(opts.parsed.net.port, port)
    const edge = {
      '@clerk/nextjs/server': 'export const auth=async()=>({userId:globalThis.__makerActor});',
      '@/lib/db': "import mongoose from 'mongoose';export async function connectToDatabase(){if(mongoose.connection.host!=='127.0.0.1')throw Error('Loopback Mongo required');return mongoose}",
    }
    const bundle = path.join(repo, 'output/readiness/maker-server.cjs'); fs.mkdirSync(path.dirname(bundle), { recursive: true })
    const plugins = [{ name: 'synthetic-boundaries', setup(build) {
      build.onResolve({ filter: /^(@clerk\/nextjs\/server|@\/lib\/db)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: edge[args.path], loader: 'js', resolveDir: repo }))
    } }]
    await esbuild.build({ stdin: { contents: "export {GET,PUT} from './app/api/maker-tools/inventory/route';export {makerCatalogue} from './lib/makerTools/catalogue';export {COLOURS} from './lib/makerTools/colours';", resolveDir: repo }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': repo }, plugins })
    const api = require(bundle), ref = api.COLOURS[0]
    const body = (label, revision = 0) => ({ revision, spools: [{ id: randomUUID(), label, brand: ref.brand, material: ref.material, referenceId: ref.id, hex: ref.hex, remainingGrams: 400, diameter: 1.75, format: 'spool' }] })
    const req = (input, origin = 'http://fixture.invalid') => new Request('http://fixture.invalid/api/maker-tools/inventory', { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    const get = () => api.GET(new Request('http://fixture.invalid/api/maker-tools/inventory?userId=fixture-alice'))
    globalThis.__makerActor = null; assert.equal((await get()).status, 401); assert.equal((await api.PUT(req(body('Anonymous')))).status, 401)
    globalThis.__makerActor = 'fixture-alice'; assert.equal((await api.PUT(req(body('Foreign'), 'https://evil.invalid'))).status, 403)
    assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0)
    mark('Anonymous and cross-origin requests reject before storage')
    const writes = await Promise.all(Array.from({ length: 8 }, (_, i) => api.PUT(req(body('First ' + i)))))
    assert.equal(writes.filter(r => r.status === 200).length, 1); assert.equal(writes.filter(r => r.status === 409).length, 7)
    assert.equal(await mongoose.connection.db.collection('makerInventories').countDocuments(), 1)
    mark('Eight concurrent first saves create one record; seven receive conflict, not overwrite')
    let alice = await (await get()).json(); assert.equal(alice.revision, 1); assert.equal(alice.spools.length, 1); assert.ok(!('_id' in alice))
    globalThis.__makerActor = 'fixture-bob'; assert.deepEqual(await (await get()).json(), { revision: 0, spools: [] })
    assert.equal((await api.PUT(req(body('Bob secret')))).status, 200)
    globalThis.__makerActor = 'fixture-alice'; assert.equal((await (await get()).json()).spools[0].label, alice.spools[0].label)
    mark('Different signed-in users cannot read or overwrite each other, including spoofed query IDs')
    assert.equal((await api.PUT(req(body('Updated', 1)))).status, 200); assert.equal((await api.PUT(req(body('Stale', 1)))).status, 409)
    await mongoose.disconnect(); await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false })
    assert.equal((await (await get()).json()).spools[0].label, 'Updated')
    assert.equal((await api.PUT(req({ revision: 2, spools: [] }))).status, 200)
    mark('Edits survive reconnect; stale edits conflict; clearing the inventory persists')
    if (process.argv.includes('--browser')) {
      const { chromium } = require('@playwright/test')
      const publicCatalogue = JSON.parse(fs.readFileSync(path.resolve('..', 'receipts/public-catalogue.json'), 'utf8').replace(/^\uFEFF/, ''))
      // Public snapshot supplies exact real product identities. Relabel stock as
      // historical, so screenshots cannot imply this fixture has live availability.
      const offers = api.makerCatalogue(publicCatalogue.products.map(p => ({ ...p, stockSource: 'snapshot' })))
      const browserEdge = {
        '@clerk/nextjs': "export const useUser=()=>({isLoaded:true,isSignedIn:!location.search.includes('guest'),user:location.search.includes('guest')?null:{id:'fixture-alice'}});export const SignInButton=({children})=>children;export const SignOutButton=({children})=>children;",
        'next/link': "import React from 'react';export default function Link({children,...p}){return React.createElement('a',p,children)}",
        'next/image': "import React from 'react';export default function Image({unoptimized,...p}){return React.createElement('img',p)}",
        'next/navigation': "const params=new URLSearchParams();export const usePathname=()=>'/maker-tools';export const useSearchParams=()=>params;export const useRouter=()=>({push:()=>{},replace:()=>{}});",
        '@/utils/useEntitlements': 'export default()=>({loading:false,canUseMessaging:false,canAccessDashboard:false});',
        '@/utils/useContent': 'export const useContent=()=>({content:{},isLoading:false});',
        '@/utils/useAccess': 'export default()=>({loading:false,canAccess:false,isAdmin:false});',
        './AccountDropdown': "import React from 'react';export default()=>React.createElement('span',null,'Test account');",
      }
      const client = path.join(root, 'browser.js')
      await esbuild.build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import MakerTools from './components/MakerTools/MakerTools';import Navbar from './components/General/Navbar';createRoot(document.getElementById('app')).render(<><Navbar/><div className='h-14 lg:hidden'/><MakerTools/></>);", loader: 'jsx', resolveDir: repo }, outfile: client, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': repo }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'browser-fixture', setup(build) {
        build.onResolve({ filter: /^(?:@clerk\/nextjs|next\/(?:link|image|navigation)|@\/utils\/(?:useEntitlements|useContent|useAccess)|\.\/AccountDropdown)$/ }, args => ({ path: args.path, namespace: 'browser-fixture' }))
        build.onLoad({ filter: /.*/, namespace: 'browser-fixture' }, args => ({ contents: browserEdge[args.path], loader: 'js', resolveDir: repo }))
      } }] })
      const cssFiles = fs.readdirSync(path.join(repo, '.next/static/chunks')).filter(n => n.endsWith('.css'))
      const globalCss = cssFiles.map(n => fs.readFileSync(path.join(repo, '.next/static/chunks', n), 'utf8')).join('\n')
      server = http.createServer(async (incoming, outgoing) => {
        try {
          const url = new URL(incoming.url, 'http://127.0.0.1')
          if (['/api/categories', '/api/blog', '/api/chat/inbox'].includes(url.pathname)) { outgoing.setHeader('Content-Type', 'application/json'); outgoing.end(JSON.stringify({ categories: [], posts: [], channels: [] })); return }
          if (url.pathname === '/api/maker-tools/catalogue') { outgoing.setHeader('Content-Type', 'application/json'); outgoing.end(JSON.stringify({ offers })); return }
          if (url.pathname === '/api/maker-tools/inventory') {
            globalThis.__makerActor = 'fixture-alice'
            const chunks = []; for await (const chunk of incoming) chunks.push(chunk)
            const origin = 'http://' + incoming.headers.host
            const request = new Request(origin + incoming.url, { method: incoming.method, headers: incoming.headers, ...(incoming.method === 'PUT' ? { body: Buffer.concat(chunks) } : {}) })
            const result = await (incoming.method === 'PUT' ? api.PUT(request) : api.GET(request))
            outgoing.writeHead(result.status, Object.fromEntries(result.headers)); outgoing.end(await result.text()); return
          }
          if (url.pathname === '/browser.js' || url.pathname === '/browser.css') { outgoing.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); outgoing.end(fs.readFileSync(path.join(root, url.pathname.slice(1)))); return }
          if (url.pathname === '/global.css') { outgoing.setHeader('Content-Type', 'text/css'); outgoing.end(globalCss); return }
          if (url.pathname.startsWith('/images/filament/bambu/') && /^\/images\/filament\/bambu\/[a-f0-9]+\.webp$/.test(url.pathname)) { outgoing.setHeader('Content-Type', 'image/webp'); outgoing.end(fs.readFileSync(path.join(repo, 'public', url.pathname))); return }
          if (url.pathname === '/') { outgoing.setHeader('Content-Type', 'text/html'); outgoing.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/browser.css"><style>body{margin:0;font-family:Arial,sans-serif}#app{max-width:1200px;margin:auto}.fixture{padding:10px;background:#e8eedc;font:11px Arial;text-align:center}</style></head><body><div class="fixture">LOCAL ACCEPTANCE FIXTURE · synthetic account · recorded catalogue · no purchases</div><div id="app"></div><script src="/browser.js"></script></body></html>'); return }
          outgoing.writeHead(404); outgoing.end('Fixture route unavailable')
        } catch (e) { outgoing.writeHead(500); outgoing.end('Fixture error'); receipt.serverError = e.stack }
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port
      browser = await chromium.launch({ headless: true })
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true })
      await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== base && !url.href.startsWith('blob:')) { receipt.externalRequests.push(url.origin); return route.abort() } return route.continue() })
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message))
      async function screenshot(name, fullPage = true) {
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
        await page.screenshot({ path: path.join(root, name), fullPage })
      }
      await page.goto(base, { waitUntil: 'networkidle' }); await page.getByText(/Catalogue loaded/).waitFor()
      await screenshot('01-mobile-colour.png')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.getByRole('button', { name: /Material estimator/ }).click()
      await page.getByLabel('Known input').selectOption('length'); await page.getByLabel('Amount per copy (m)').fill('100')
      await page.getByText('328.08 g', { exact: true }).waitFor()
      await screenshot('02-mobile-estimator.png')
      await page.getByRole('button', { name: /My filament/ }).click()
      await page.getByLabel('My spool label', { exact: false }).fill('Test white spool')
      await page.getByLabel('Remaining net filament', { exact: true }).fill('0.4'); await page.getByLabel('Quantity unit').selectOption('kg')
      await page.getByRole('button', { name: 'Add to inventory edits' }).click(); await page.getByRole('button', { name: 'Save inventory' }).click()
      await page.getByText('Inventory saved to your account.').waitFor()
      await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: /My filament/ }).click(); await page.getByText('Test white spool', { exact: true }).waitFor()
      assert.equal(await page.getByLabel('Remaining grams for Test white spool').inputValue(), '400')
      const pendingDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export my filament' }).click()
      const downloaded = await pendingDownload; const downloadPath = path.join(root, 'inventory-export.json'); await downloaded.saveAs(downloadPath)
      const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8')); assert.equal(exported.spools[0].remainingGrams, 400); assert.ok(!JSON.stringify(exported).includes('fixture-alice'))
      await screenshot('03-mobile-inventory.png')
      await page.getByRole('button', { name: /Project planner/ }).click(); await page.getByLabel('Required grams for colour 1').fill('600')
      await page.getByText('260 g', { exact: true }).waitFor()
      await page.getByRole('button', { name: '+ Add colour' }).click(); await page.getByLabel('Required grams for colour 2').fill('100')
      await page.getByText('370 g', { exact: true }).waitFor()
      assert.equal(await page.getByRole('heading', { name: 'Jade White', exact: true }).count(), 1)
      await screenshot('04-mobile-plan.png')
      const link = page.getByRole('link', { name: /View product & select Jade White/ }).first()
      assert.equal(await link.getAttribute('href'), '/products/bambu-lab-3d-printing-filament-1kg-pla-basic')
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.getByRole('button', { name: /Colour matcher/ }).click()
      await screenshot('05-desktop-colour.png')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.setViewportSize({ width: 1024, height: 900 }); await page.goto(base + '/?guest=1', { waitUntil: 'networkidle' })
      const boxes = await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link').evaluateAll(links => links.filter(a => a.getBoundingClientRect().width).map(a => { const r = a.getBoundingClientRect(); return { text: a.textContent, left: r.left, right: r.right } }).sort((a, b) => a.left - b.left))
      for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].left >= boxes[i - 1].right, 'Desktop nav overlap: ' + boxes[i].text)
      await screenshot('06-desktop-1024-navigation.png', false)
      await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Open menu' }).click()
      await page.getByRole('dialog').getByRole('link', { name: 'Community', exact: true }).waitFor()
      assert.equal(await page.getByRole('dialog').getByRole('link', { name: 'Maker Tools', exact: true }).getAttribute('href'), '/maker-tools')
      await page.waitForFunction(() => {
        const dialog = document.querySelector('[role="dialog"]')?.getBoundingClientRect()
        return dialog && Math.abs(dialog.right - innerWidth) < 1
      })
      await screenshot('07-mobile-navigation.png', false)
      assert.deepEqual(errors, []); assert.deepEqual(receipt.externalRequests, [])
      mark('390px and 1440px browser layouts fit viewport, with no uncaught page errors or external HTTP')
      mark('Browser metre conversion, kg inventory save/reload/export and repeated-colour shortage planning pass against actual local API/Mongo')
      mark('Actual FIT desktop navigation has no overlapping links at 1024px; mobile menu exposes Maker Tools and Community')
      receipt.browser = { base, screenshots: fs.readdirSync(root).filter(n => n.endsWith('.png')), errors }
    }
    receipt.success = true
  } catch (error) { receipt.error = error.stack; throw error }
  finally {
    if (browser) await browser.close()
    if (server) await new Promise(resolve => server.close(resolve))
    await mongoose.disconnect()
    child.kill(); await closed; log.end()
    receipt.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(receipt, null, 2))
    console.log(JSON.stringify(receipt, null, 2))
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
