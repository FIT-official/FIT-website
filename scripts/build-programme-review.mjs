import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve('output/programme-review')
await mkdir(output, { recursive: true })
await mkdir(resolve('output/playwright'), { recursive: true })
const names = ['escape-room-electronics', 'escape-room-sensor-wiring', 'escape-room-button-lights', 'nygh-room-models', 'nygh-printed-mechanism']
const images = {}
for (const name of names) images[`/images/collaborations/${name}.jpg`] = 'data:image/jpeg;base64,' + (await readFile(`public/images/collaborations/${name}.jpg`)).toString('base64')
for (const [name, source] of [['school', 'school-programmes'], ['company', 'company-workshops']]) {
  const result = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './app/${source}/page.jsx'; createRoot(document.getElementById('root')).render(<Page />);`, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, outfile: resolve(output, `${name}.js`), jsx: 'automatic', alias: { '@': process.cwd() }, minify: true, plugins: [{ name: 'local-next-view', setup(builder) {
    builder.onResolve({ filter: /^next\/(image|link)$/ }, args => ({ path: args.path, namespace: 'review' }))
    builder.onLoad({ filter: /.*/, namespace: 'review' }, args => ({ contents: args.path === 'next/image' ? `import React from 'react'; const images=${JSON.stringify(images)}; export default function Image({priority,unoptimized,sizes,...props}) { return <img {...props} src={images[props.src] || props.src} loading={priority?'eager':'lazy'} /> }` : `import React from 'react'; export default function Link(props){return <a {...props}/>} `, loader: 'jsx', resolveDir: process.cwd() }))
  } }] })
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script')
  const css = result.outputFiles.find(file => file.path.endsWith('.css')).text
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FIT ${name} programme review</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}h1,h2,h3,h4,p,figure{margin:0}a{color:inherit;text-decoration:none}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`
  await writeFile(resolve(output, `${name}.html`), html)
  await writeFile(resolve('output/playwright', `render-${name}.js`), `async (page) => { await page.setContent(${JSON.stringify(html)}); await page.waitForSelector('article'); }`)
  console.log(`${name} review compiled`)
}
