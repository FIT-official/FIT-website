import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tailwindcss from '@tailwindcss/postcss';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
    configFile: false, root: path.join(project, 'scripts', 'preview'),
    resolve: { alias: { '@': project } },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: { host: '127.0.0.1', port: 4317, strictPort: true, fs: { allow: [project] } },
});
await server.listen();
console.log('Print studio preview: http://127.0.0.1:4317');
