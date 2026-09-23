// Local UI verification harness. Mock providers are only aliased in this Vite process.
import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import tailwindcss from '@tailwindcss/postcss'
import { importPublicModel } from '../lib/modelImport/index.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mock = path.join(root, 'scripts/preview/flow-mocks.jsx')
await build({ entryPoints: [path.join(root, 'lib/quoting/quoteRequest.js')], outfile: path.join(root, '.next/preview-quote.mjs'), bundle: true, platform: 'node', format: 'esm', alias: { '@': root } })
const { buildQuote } = await import('../.next/preview-quote.mjs')
let request = null
let uploaded = null
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)) }
const body = async req => { const parts = []; for await (const part of req) parts.push(part); return Buffer.concat(parts) }
const server = await createServer({ configFile: false, root: path.join(root, 'scripts/preview'),
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [
    { find: '@clerk/nextjs', replacement: mock }, { find: 'next/navigation', replacement: mock },
    { find: 'next/dynamic', replacement: path.join(root, 'scripts/preview/flow-dynamic.js') },
    { find: 'next/link', replacement: path.join(root, 'scripts/preview/flow-link.js') },
    { find: '@/components/General/ToastProvider', replacement: mock },
    { find: 'posthog-js', replacement: path.join(root, 'scripts/preview/flow-telemetry.js') },
    { find: '@', replacement: root },
  ] }, css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '127.0.0.1', port: 4318, strictPort: true, fs: { allow: [root] } },
  plugins: [{ name: 'local-preview-provider', configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/api/') && req.url !== '/mock-upload') return next()
    try {
      if (req.url === '/api/quote/config') return json(res, 200, {})
      if (req.url === '/api/quote') { const input = JSON.parse(await body(req)); const result = buildQuote(input); return json(res, result.status, result.ok ? result.data : { error: result.error }) }
      if (req.url === '/api/custom-print' && req.method === 'POST') { request = { requestId: '11111111-2222-4333-8444-555555555555', userId: 'preview-user' }; return json(res, 200, request) }
      if (req.url === '/api/custom-print' && req.method === 'PUT') { request = { ...request, ...JSON.parse(await body(req)), status: 'configured' }; return json(res, 200, { request }) }
      if (req.url.startsWith('/api/custom-print?')) return json(res, 200, { request })
      if (req.url === '/api/custom-print/config') { request.printConfiguration = { ...request.printConfiguration, ...JSON.parse(await body(req)) }; return json(res, 200, { request }) }
      if (req.url === '/api/upload/models') return json(res, 200, { key: 'models/preview-user/model.stl', url: 'http://127.0.0.1:4318/mock-upload' })
      if (req.url === '/mock-upload') { uploaded = await body(req); return json(res, 200, { ok: true }) }
      if (req.url.startsWith('/api/proxy')) { res.writeHead(200, { 'content-type': 'model/stl' }); return res.end(uploaded) }
      if (req.url === '/api/models/import') {
        try {
          const result = await importPublicModel(JSON.parse(await body(req)))
          if (result.status === 'select_file') return json(res, 200, result)
          res.writeHead(200, { 'Content-Type': result.file.contentType,
            'X-Model-Filename': encodeURIComponent(result.file.name), 'X-Model-Source-Url': encodeURIComponent(result.source.url),
            'X-Model-Attribution': encodeURIComponent(result.source.attribution || '') })
          return res.end(result.file.body)
        } catch (error) { return json(res, error.status || 503, { status: 'upload_required', message: error.message + ' Download the model and upload its file below.' }) }
      }
      return json(res, 404, { error: 'This provider action is not simulated in the preview.' })
    } catch (error) { json(res, 500, { error: error.message }) }
  }) } }],
})
await fs.writeFile(path.join(root, 'scripts/preview/flow-dynamic.js'), "export { dynamic as default } from './flow-mocks'\n")
await fs.writeFile(path.join(root, 'scripts/preview/flow-link.js'), "export { Link as default } from './flow-mocks'\n")
await fs.writeFile(path.join(root, 'scripts/preview/flow-telemetry.js'), "export { telemetry as default } from './flow-mocks'\n")
await server.listen()
console.log('Print flow preview: http://127.0.0.1:4318/flow.html')
