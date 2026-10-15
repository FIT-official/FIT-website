import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const repo=fileURLToPath(new URL('../../',import.meta.url)),baseline=JSON.parse(await fs.readFile(new URL('./protected-files.json',import.meta.url),'utf8')),changed=[]
for(const [file,hash] of Object.entries(baseline))if(createHash('sha256').update(await fs.readFile(repo+file)).digest('hex')!==hash)changed.push(file)
console.log(JSON.stringify({baseline:'f4919fff6a0d5c857b17d73c6ab1d4e2baf6b422',checked:Object.keys(baseline).length,changed},null,2));if(changed.length)process.exitCode=1
