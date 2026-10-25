// Developer-only asset import. Nothing in this script runs in the browser.
// Only the licensed free SVG assets are used, never Illos preview images/video.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const illustrations = new URL('../src/assets/illustrations/', import.meta.url);
const fonts = new URL('../src/assets/fonts/', import.meta.url);

function removeLabelGroups(svg) {
  const tags = /<g\b[^>]*>|<\/g>/g;
  let result = ''; let last = 0; let depth = 0;
  for (const match of svg.matchAll(tags)) {
    if (depth > 0) {
      depth += match[0].startsWith('</') ? -1 : 1;
      if (depth === 0) last = match.index + match[0].length;
    } else if (/\bclass="(?:lab|labb)"/.test(match[0])) {
      result += svg.slice(last, match.index); depth = 1;
    }
  }
  if (depth !== 0) throw new Error('Unbalanced SVG label groups.');
  return result + svg.slice(last);
}

function validate(svg, css) {
  if (/<(?:script|foreignObject|iframe|image|a|use|animate|set)\b/i.test(svg)
    || /\bon\w+\s*=|\b(?:href|src)\s*=/i.test(svg)) throw new Error('Active or externally linked SVG content refused.');
  if (/@import|@font-face|https?:/i.test(css)) throw new Error('External CSS resources refused.');
  for (const match of `${svg}\n${css}`.matchAll(/url\(([^)]+)\)/g)) {
    if (!match[1].trim().replace(/^['"]|['"]$/g, '').startsWith('#')) throw new Error('External SVG URL refused.');
  }
  const allowed = new Set(['svg', 'title', 'desc', 'defs', 'g', 'path', 'polygon', 'polyline', 'circle', 'ellipse', 'rect', 'line', 'text', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern']);
  for (const match of svg.matchAll(/<(?![!?/])([A-Za-z][\w:-]*)\b/g)) {
    if (!allowed.has(match[1])) throw new Error(`Unsupported SVG element: ${match[1]}`);
  }
}

await mkdir(illustrations, { recursive: true });
await mkdir(fonts, { recursive: true });
for (const name of ['email', 'queue']) {
  const url = `https://illos.dev/assets/styles/line-iso/${name}.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${name}: ${response.status}`);
  let svg = await response.text();
  const styles = [...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  if (styles.length !== 1) throw new Error('Expected exactly one illustration stylesheet.');
  const css = styles[0][1];
  svg = removeLabelGroups(svg.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ''));
  svg = svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(?:width|height)="\d+"/g, ''));
  if (name === 'email') svg = svg.replace('viewBox="0 0 720 460"', 'viewBox="140 28 365 405"');
  svg = svg.replace(/(<title[^>]*>)[\s\S]*?<\/title>/, '$1Decorative illustration of sealed offer records</title>');
  validate(svg, css);
  const heading = `// Adapted from ${url}. Illos free licence; see docs/ASSET-CREDITS.md.\n`;
  await writeFile(new URL(`illos-${name}.ts`, illustrations), `${heading}export const ILLUSTRATION = ${JSON.stringify(svg)};\n`);
  await writeFile(new URL(`illos-${name}.css`, illustrations), `/* Illos free illustration. CSS is external to preserve production CSP. */\n${css}\n`);
  console.log(`Vendored ${name}: static SVG with external CSS, no runtime download.`);
}

// Download just the Latin WOFF2 subset. The application hosts it itself.
const cssResponse = await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&display=swap', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
});
if (!cssResponse.ok) throw new Error('Could not find the Manrope font.');
const fontCss = await cssResponse.text();
const candidates = [...fontCss.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)];
if (candidates.length === 0) throw new Error('No WOFF2 font found.');
const fontResponse = await fetch(candidates.at(-1)[1]);
if (!fontResponse.ok) throw new Error('Could not download the font.');
const bytes = new Uint8Array(await fontResponse.arrayBuffer());
if (bytes.length > 250_000 || String.fromCharCode(...bytes.slice(0, 4)) !== 'wOF2') throw new Error('Unexpected font file.');
await writeFile(new URL('manrope-latin.woff2', fonts), bytes);
const licence = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt');
if (!licence.ok) throw new Error('Could not retrieve the font licence.');
await writeFile(new URL('OFL-Manrope.txt', fonts), await licence.text());
console.log(`Vendored Manrope (${bytes.length} bytes) and its OFL licence.`);
console.log(`Assets written under ${fileURLToPath(new URL('../src/assets/', import.meta.url))}`);
