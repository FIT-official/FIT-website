// usage: node scripts/vet-html-sim.mjs <file.html>  -> JSON report; exit 1 on any blocking finding
import fs from 'fs'
import { vetHtmlSim } from '../lib/sims/vetHtmlSim.js'
const r = vetHtmlSim(fs.readFileSync(process.argv[2], 'utf8'))
console.log(JSON.stringify(r, null, 1))
process.exit(r.ok ? 0 : 1)
