import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const repo = fileURLToPath(new URL('../../', import.meta.url)), out = fileURLToPath(new URL('../../../friday-current-build-evidence/', import.meta.url)); fs.mkdirSync(out, { recursive: true })
if (fs.readdirSync(repo).some(n => n.startsWith('.env') && n !== '.env.example')) throw Error('Build refuses local environment files')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PATHEXT'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
const existingReview = 'C:/Users/ww/Documents/Codex/2026-10-09/task/fit-lms-v2-review-20261013'
Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: existingReview + '/font-mock.cjs', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('synthetic-classroom.clerk.accounts.dev$').toString('base64'), CLERK_SECRET_KEY: 'sk_test_synthetic_no_credentials', STRIPE_SECRET_KEY: 'sk_test_synthetic_no_credentials', MONGODB_URI: 'mongodb://127.0.0.1:9/synthetic_build', NEXT_PUBLIC_BASE_URL: 'http://127.0.0.1:9', NODE_OPTIONS: '--require="C:/Users/ww/Documents/Codex/2026-10-09/task/fit-teacher-overview-20261012/repo/scripts/shipping/loopback-only.cjs"' })
const log = fs.createWriteStream(path.join(out, 'next-build.log')), startedAt = Date.now()
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.pipe(log); child.stderr.pipe(log)
const timeout = setTimeout(() => child.kill(), 360000)
const exitCode = await new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject) }); clearTimeout(timeout); log.end()
const receipt = { exitCode, seconds: (Date.now() - startedAt) / 1000, syntheticConfig: true, network: 'loopback only', productionAuth: 'not exercised', artifact: path.join(out, 'next-build.log') }
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2)); console.log(receipt); process.exitCode = exitCode || 0
