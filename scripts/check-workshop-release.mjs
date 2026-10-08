import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const groups = read('content/designThinkingWorkshop.json'), sheets = read('content/designThinkingWorksheets.json'), images = read('content/designThinkingWorkshopImages.json')
if (groups.length !== 10 || sheets.length !== 10) throw Error('Require ten reviewed groups and worksheets.')
const expected = sheets.flatMap(sheet => sheet.imageKeys)
if (new Set(expected).size !== 20) throw Error('Require two distinct reviewed model illustrations per group.')
const missing = []
for (const key of expected) {
    const image = images[key]
    if (!image) { missing.push(key); continue }
    if (!/^\/workshop\/models\/[a-z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(image.src) || /nygh-printed-mechanism/i.test(image.src) || !image.alt || !image.caption || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 100 || image.height < 100) throw Error('Invalid reviewed image metadata: ' + key)
    if (!fs.existsSync(path.join(root, 'public', image.src))) missing.push(key)
    if (/BLGPS|Boon Lay|Bartley|Nanyang|NYGH|class.?code|user_|@/i.test(image.alt + ' ' + image.caption)) throw Error('Private identity or school name in image metadata: ' + key)
}
for (const group of groups) {
    const sheet = sheets.find(sheet => sheet.group === group.id)
    if (!sheet || group.ideas.length !== 2 || group.activities.reduce((sum, activity) => sum + activity.minutes, 0) !== 30 || sheet.fields.length !== 10) throw Error('Incomplete reviewed group: ' + group.id)
}
if (missing.length) { console.error('WORKSHOP PUBLICATION BLOCKED: missing reviewed images: ' + missing.join(', ')); process.exitCode = 1 }
else console.log('Workshop publication prerequisites passed: ten groups, twenty reviewed local images and isolated worksheets.')
