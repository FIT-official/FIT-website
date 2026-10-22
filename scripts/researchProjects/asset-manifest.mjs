// Regenerates lib/researchProjects/assets.js (the strict asset manifest with SHA-256 hashes) from the files in
// content/researchProjects/assets. Run from the repository root after adding or editing a lesson asset:
//   node scripts/researchProjects/asset-manifest.mjs
// Teacher-only files are the ones whose names contain "-teacher-". Nothing is read from outside the asset folder.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const base = path.join(root, 'content', 'researchProjects', 'assets')
const FOLDERS = ['diagrams', 'projects-08-10']

const rows = []
for (const dir of FOLDERS) {
  for (const name of readdirSync(path.join(base, dir)).sort()) {
    const buf = readFileSync(path.join(base, dir, name))
    const kind = name.endsWith('.svg') ? 'svg' : name.endsWith('.csv') ? 'csv' : null
    if (!kind) throw new Error('Unsupported asset type: ' + name)
    const stem = name.replace(/\.(svg|csv)$/, '')
    const id = kind === 'csv' ? stem + '-csv' : stem
    const filename = dir === 'projects-08-10' ? stem.replace(/^(seismometer|spectrometer|tomography)-/, '').replaceAll('-', '_') + '.' + kind : name
    rows.push({
      id, file: dir + '/' + name, kind, role: stem.includes('-teacher-') ? 'teacher' : 'student', filename,
      bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'),
    })
  }
}

const lines = rows.map(r => `  { id: '${r.id}', file: '${r.file}', kind: '${r.kind}', role: '${r.role}', filename: '${r.filename}', bytes: ${r.bytes}, sha256: '${r.sha256}' },`).join('\n')
const target = path.join(root, 'lib', 'researchProjects', 'assets.js')
const source = readFileSync(target, 'utf8')
const start = source.indexOf('export const ASSETS = Object.freeze([')
const end = source.indexOf('])', start) + 2
if (start < 0 || end < 2) throw new Error('Could not find the ASSETS list in assets.js')
writeFileSync(target, source.slice(0, start) + 'export const ASSETS = Object.freeze([\n' + lines + '\n])' + source.slice(end))
console.log('manifest written:', rows.length, 'assets')
