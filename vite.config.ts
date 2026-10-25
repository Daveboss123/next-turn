import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertCurrentLicenceInventory, assertReviewedPublicAssets, assertSafeBuildOutput } from './scripts/release-policy.ts';

export default defineConfig(({ command }) => {
  let projectRoot = '';
  return {
  server: {
    host: '127.0.0.1',
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.local/**'] },
  },
  preview: { host: '127.0.0.1' },
  plugins: [react(), {
    name: 'sealed-tender-privacy-policy',
    configResolved(config) {
      // public/ bypasses fs.deny and is copied as-is. Check only filenames and
      // link metadata so a misplaced secret is rejected without opening it.
      assertReviewedPublicAssets(config.publicDir);
      assertSafeBuildOutput(config.root, config.build.outDir);
      assertCurrentLicenceInventory(config.root);
      projectRoot = config.root;
    },
    generateBundle() {
      for (const [source, fileName] of [
        ['LICENSE', 'LICENSE.txt'],
        ['THIRD_PARTY_NOTICES.md', 'licences/THIRD_PARTY_NOTICES.md'],
        ['src/assets/fonts/OFL-Manrope.txt', 'licences/Manrope-OFL.txt'],
        ['docs/licences/reviewed/npm-licences.txt', 'licences/npm-licences.txt'],
      ]) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(join(projectRoot, source), 'utf8') });
      }
    },
    transformIndexHtml() {
      // Dev-only exceptions let Vite inject CSS and connect its local HMR
      // websocket. Production application code has no network-connect access.
      const policy = ["default-src 'none'", command === 'serve' ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        command === 'serve' ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
        "img-src 'self' data: blob:", "font-src 'self'",
        command === 'serve' ? "connect-src 'self' ws://127.0.0.1:* ws://localhost:*" : "connect-src 'none'",
        "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"].join('; ');
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
    },
  }],
  };
});
