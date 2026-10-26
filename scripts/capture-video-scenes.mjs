// Fresh practice-only footage. No wallet, real bid, key viewer or file contents
// are captured. Generated practice downloads stay in this script's memory.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const base = process.argv[2] ?? 'https://nextturn-pro.vercel.app/';
if (!['https://nextturn-pro.vercel.app/', 'http://127.0.0.1:4173/'].includes(base)) throw new Error('Use the approved public demo or local preview only.');
const parent = join(tmpdir(), 'opencode'); await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, 'nextturn-video-'));
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const child = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--hide-scrollbars', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${join(output, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const scenes = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = ''; const timeout = setTimeout(() => reject(Error('Video browser startup timed out.')), 15_000);
    child.on('error', reject); child.stderr.on('data', chunk => { log = `${log}${chunk}`.slice(-8000); const match = log.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let serial = 0;
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); const item = pending.get(data.id); if (!item) return; pending.delete(data.id); clearTimeout(item.timer); if (data.error) item.reject(Error('Video browser command failed.')); else item.resolve(data.result); });
  function command(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timed out.`)); }, 15_000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
  const target = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await command('Page.enable', {}, sessionId); await command('Runtime.enable', {}, sessionId);
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__videoBlobs=new Map();const create=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{const u=create(b);__videoBlobs.set(u,b);return u;};
    const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&__videoBlobs.has(this.href))return;return click.call(this);};
    // This is an explicitly simulated walkthrough, not a claim of a real file
    // write. The Save As confirmation is labelled as simulated in the video.
    window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{},abort:async()=>{}})});
  ` }, sessionId);
  async function evaluate(expression) { const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId); if (r.exceptionDetails) throw Error('Video operation failed; no fixture/private data printed.'); return r.result.value; }
  async function wait(expression) { const ready = await evaluate(`(async()=>{const until=Date.now()+12000;while(!(${expression})){if(Date.now()>until)return false;await new Promise(r=>setTimeout(r,30));}await document.fonts.ready;return true;})()`); if (!ready) throw Error('Video scene was not ready.'); }
  async function click(text) { await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('button,a')).find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)throw Error('Video action unavailable');button.click();})()`); }
  async function capture(name, seconds, caption, selector) {
    if (selector) await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'start'})`);
    await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    const file = join(output, `${name}.png`); await writeFile(file, Buffer.from(image.data, 'base64'));
    scenes.push({ file, seconds, caption });
  }
  await command('Page.navigate', { url: base }, sessionId); await wait(`document.querySelector('.nextturn-hero')`);
  await capture('01-landing', 15, 'NextTurn: private bidding for savings groups.\nThe group still handles membership and payouts.');
  await evaluate(`location.hash='app/practice'`); await wait(`document.querySelector('#practice-discount')`);
  await capture('02-practice', 20, 'PRACTICE SIMULATION: fictional pot and offers.\nNo wallet, account or payment is needed.', '#practice-round');
  await click('Place practice offer'); await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='download my bid file')`);
  await capture('03-private-file', 20, 'A bid file holds the amount, salt and one-off proof key.\nKeep it private. Demo save acknowledgement is simulated.', '.private-receipt');
  await click('download my bid file'); await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Close bidding'&&!e.disabled)`);
  await click('Close bidding'); await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Open my offer')`);
  await click('Open my offer'); await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Show the result')`);
  await click('Show the result'); await wait(`document.querySelector('.outcome-pass')`);
  await capture('04-result', 20, 'The highest valid discount wins under fixed rules.\nOpened losing values and salts intentionally become public.', '.results-card');
  await click('Ownership check'); await wait(`document.querySelector('.winner-claim-panel .notice-success')`);
  await capture('05-ownership', 15, 'Local challenge-response proves the winning bid key.\nIt does not prove identity, membership or payout entitlement.', '.winner-claim-panel');
  await click('Try the wrong winner'); await wait(`document.querySelector('.tamper-demo .outcome-fail')`);
  await capture('06-wrong-winner', 15, 'A deliberately wrong declared winner is rejected.\nThis checks supplied practice records, not chain completeness.', '.tamper-demo');
  await evaluate(`location.hash='app/privacy'`); await wait(`document.querySelector('.privacy-grid')`);
  await capture('07-limits', 15, 'LIVE STATUS: one real testnet rules anchor checked.\nFull live round not completed. Server/network/frontend risks remain.', '.page-heading');
  await writeFile(join(output, 'scenes.json'), JSON.stringify({ base, simulated: true, durationSeconds: scenes.reduce((sum, s) => sum + s.seconds, 0), scenes }, null, 2));
  await command('Browser.close');
} finally { socket?.close(); child.kill(); }
console.log(JSON.stringify({ output, durationSeconds: scenes.reduce((sum, s) => sum + s.seconds, 0), sceneCount: scenes.length, onlyFreshPracticeUiCaptured: true, noWalletOrPrivateFileContentsCaptured: true }, null, 2));
