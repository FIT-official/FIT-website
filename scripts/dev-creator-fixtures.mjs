// One Next development server, using the same worker entrypoint as `next dev`.
// Its environment is built from an OS-only allowlist, never copied wholesale.
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const dir = process.cwd(), port = Number(process.argv[2] || 3107);
const manifestPath = process.argv[3];
if (!manifestPath || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Usage: node scripts/dev-creator-fixtures.mjs PORT MANIFEST');
// Check filenames only. Next must never discover a real .env file in this run.
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']) {
    if (existsSync(resolve(dir, name))) throw new Error(`Refusing fixture server: ${name} exists. Its contents were not read.`);
}
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'PROGRAMDATA', 'ProgramFiles']) {
    if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
    NODE_ENV: 'development', CREATOR_DASHBOARD_ENABLED: 'true', CREATOR_DASHBOARD_FIXTURES: 'true',
    NEXT_TELEMETRY_DISABLED: '1', NEXT_PRIVATE_WORKER: '1', NODE_OPTIONS: '--max-old-space-size=4096',
});
const child = fork(require.resolve('next/dist/server/lib/start-server'), [], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
const manifest = { at: new Date().toISOString(), launcherPid: process.pid, serverPid: child.pid, port, directory: dir,
    environmentNames: Object.keys(env).sort(), environmentFiles: 'No Next .env files exist; filenames checked only', ready: false };
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
save();
child.on('message', message => {
    if (message?.nextWorkerReady) child.send({ nextWorkerOptions: { dir, port, hostname: '127.0.0.1', isDev: true, allowRetry: false } });
    if (message?.nextServerReady) { manifest.ready = true; save(); console.log(`Fixture server ready at http://127.0.0.1:${port}; PID ${child.pid}`); }
});
child.on('exit', code => { manifest.stoppedAt = new Date().toISOString(); manifest.exitCode = code; save(); process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
