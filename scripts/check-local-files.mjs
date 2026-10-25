// Probe ONLY a harmless canary that this script creates. Never request a key,
// seed, receipt, wallet file, or existing .local file through HTTP.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createServer, preview } from 'vite';

const root = resolve('.');
const parent = join(root, '.local');
await mkdir(parent, { recursive: true });
const folder = await mkdtemp(join(parent, 'nonsecret-http-canary-'));
const path = join(folder, 'harmless-canary.txt');
const marker = 'NEXTTURN-NONSECRET-HTTP-CANARY';
await writeFile(path, marker, { flag: 'wx' });
const route = `/${relative(root, path).replaceAll('\\', '/')}`;
const fileRoute = `/@fs/${path.replaceAll('\\', '/')}`;
let dev;
let production;
try {
  dev = await createServer({ configFile: join(root, 'vite.config.ts'), logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await dev.listen();
  const devAddress = dev.httpServer.address();
  assert(devAddress && typeof devAddress !== 'string');
  const devBase = `http://127.0.0.1:${devAddress.port}`;
  const checks = [];
  for (const url of [route, fileRoute]) {
    const response = await fetch(devBase + url);
    const body = await response.text();
    assert.equal(response.status, 403, 'Development server must deny the .local canary.');
    assert(!body.includes(marker), 'Development server must not return the canary bytes.');
    checks.push({ server: 'development', access: url.startsWith('/@fs') ? 'filesystem route' : 'normal route', status: response.status, returnedCanary: false });
  }
  production = await preview({ configFile: join(root, 'vite.config.ts'), logLevel: 'silent',
    preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const previewAddress = production.httpServer.address();
  assert(previewAddress && typeof previewAddress !== 'string');
  const previewBase = `http://127.0.0.1:${previewAddress.port}`;
  for (const url of [route, fileRoute]) {
    const response = await fetch(previewBase + url);
    const body = await response.text();
    assert(!body.includes(marker), 'Production preview must not serve project-root private files.');
    checks.push({ server: 'production preview', access: url.startsWith('/@fs') ? 'filesystem route' : 'normal route', status: response.status, returnedCanary: false });
  }
  console.log(JSON.stringify({ passed: checks.length, checks, note: 'Only a new, nonsecret canary was probed; no existing private file was opened or requested.' }, null, 2));
} finally {
  await dev?.close();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
  await rm(folder, { recursive: true }); // Only this script's exclusively created, harmless canary folder.
}
