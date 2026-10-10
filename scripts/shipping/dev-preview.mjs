import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, symlinkSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const preview = resolve(root, 'scripts/shipping/preview');
// Never read environment files; refuse to launch if one was added to the app.
if (readdirSync(preview).some(name => name.startsWith('.env'))) throw new Error('Remove environment files from the isolated preview directory');
if (!existsSync(resolve(preview, 'public'))) symlinkSync(resolve(root, 'public'), resolve(preview, 'public'), 'junction');
const env = {};
for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PATHEXT', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'HOMEDRIVE', 'HOMEPATH']) {
    if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, { NODE_ENV: 'development', SHIPPING_FIXTURES: '1', NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: `--require="${resolve(root, 'scripts/shipping/loopback-only.cjs').replaceAll('\\', '/')}"` });
const child = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'dev', preview, '--webpack', '--hostname', '127.0.0.1', '--port', '3112'], {
    cwd: preview, env, stdio: 'inherit', windowsHide: true,
});
console.log(`Shipping preview PID ${child.pid}; environment names: ${Object.keys(env).join(', ')}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code || 0; });
