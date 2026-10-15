import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../../', import.meta.url)), baseline = JSON.parse(await fs.readFile(new URL('./protected-files.json', import.meta.url), 'utf8')), changed = []
for (const [file, hash] of Object.entries(baseline)) if (createHash('sha256').update(await fs.readFile(repo + file)).digest('hex') !== hash) changed.push(file)
console.log(JSON.stringify({ baseline: '9c455d973d6fd093a24b7cb0b94a4ce7ef347d9b', checked: Object.keys(baseline).length, changed }, null, 2))
if (changed.length) process.exitCode = 1
