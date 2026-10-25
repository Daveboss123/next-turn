// Local-only UI screenshots using a fresh headless Edge profile. No user browser
// profile, live bid files, external site or wallet interaction is used.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const parsed = new URL(base);
if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.search) {
  throw new Error('This script only captures a local, non-sensitive prototype.');
}
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const parent = join(tmpdir(), 'opencode');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, 'nextturn-ui-'));
const captures = [];
const checks = [];
const child = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-sync', '--hide-scrollbars',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  `--user-data-dir=${join(output, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timeout = setTimeout(() => reject(new Error('Headless browser startup timed out.')), 15_000);
    child.on('error', reject);
    child.stderr.on('data', (chunk) => {
      log = `${log}${chunk}`.slice(-8000);
      const match = log.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let serial = 0;
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const item = pending.get(data.id); pending.delete(data.id); clearTimeout(item.timeout);
    if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result);
  });
  function command(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15_000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  const target = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await command('Page.enable', {}, sessionId);
  await command('Runtime.enable', {}, sessionId);
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Browser check failed.');
    return result.result.value;
  }
  function assert(condition, message) { if (!condition) throw new Error(message); checks.push(message); }
  async function waitForPage(selector) {
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        return await evaluate(`(async()=>{const until=Date.now()+5000;while(!document.querySelector(${JSON.stringify(selector)})){if(Date.now()>until)throw Error('Page not ready');await new Promise(r=>setTimeout(r,30));}await document.fonts.ready;await new Promise(r=>setTimeout(r,100));return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight};})()`);
      } catch (error) {
        if (attempt === 14) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  for (const [name, width, height, hash] of [
    ['landing-desktop', 1280, 900, ''], ['landing-phone', 390, 844, ''],
    ['landing-tablet', 768, 1024, ''], ['landing-small-phone', 360, 800, ''],
    ['app-desktop', 1280, 1000, '#app'], ['app-phone', 390, 950, '#app'],
    ['app-tablet', 768, 1024, '#app'], ['app-small-phone', 360, 950, '#app'],
  ]) {
    // Real CSS viewport override avoids Edge CLI's 500px minimum layout width.
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await command('Page.navigate', { url: `${base.replace(/#.*$/, '')}${hash}` }, sessionId);
    const metrics = await waitForPage(hash ? '#practice-discount' : '.nextturn-hero');
    assert(metrics.width === width && metrics.scrollWidth === width, `${name}: correct viewport, no horizontal overflow`);
    const path = join(output, `${name}.png`);
    const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    await writeFile(path, Buffer.from(image.data, 'base64'));
    captures.push({ name, width, height, metrics, path });
    if (name === 'landing-desktop' || name === 'landing-phone') {
      const footer = await evaluate(`(async()=>{scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});await new Promise(r=>setTimeout(r,100));const mark=getComputedStyle(document.querySelector('.footer-wordmark'));const grid=getComputedStyle(document.querySelector('.footer-grid'));return {headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom,wordmark:parseFloat(mark.fontSize),opacity:parseFloat(mark.opacity),position:mark.position,markLayer:Number(mark.zIndex),gridLayer:Number(grid.zIndex),running:Array.from(document.querySelectorAll('[data-scroll-entrance]')).flatMap(e=>e.getAnimations({subtree:true})).filter(a=>a.playState==='running').length};})()`);
      assert(footer.headerBottom < 0, `${name}: landing header scrolls away at the footer`);
      assert(footer.wordmark <= (width > 600 ? 146 : 94), `${name}: smaller footer wordmark`);
      assert(footer.opacity <= 0.1 && footer.position === 'absolute' && footer.gridLayer > footer.markLayer, `${name}: faint wordmark sits behind readable footer navigation`);
      assert(footer.running === 0, `${name}: reduced motion disables scroll entrances`);
      const footerPath = join(output, `${name}-footer.png`);
      const footerImage = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      await writeFile(footerPath, Buffer.from(footerImage.data, 'base64'));
      captures.push({ name: `${name}-footer`, width, height, metrics: footer, path: footerPath });
    }
  }

  // Verify repeatable scroll re-entry separately from static screenshots.
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await command('Page.navigate', { url: base.replace(/#.*$/, '') }, sessionId);
  await waitForPage('.nextturn-hero');
  const motion = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const calls=[];const original=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){const host=this.closest('[data-scroll-entrance]');if(host)calls.push({kind:host.dataset.scrollEntrance,section:host.closest('section')?.id??'preview',duration:options.duration,delay:options.delay,from:frames[0],to:frames.at(-1)});return original.call(this,frames,options);};
    const before=document.querySelector('[data-scroll-entrance="offers"]').dataset.entrancePlayed;
    const initialRunning=document.getAnimations().filter(a=>a.playState==='running').length;
    document.getElementById('how-it-works').scrollIntoView({behavior:'instant'});await wait(750);
    document.getElementById('check-results').scrollIntoView({behavior:'instant'});await wait(1100);
    const offersFirst=calls.filter(c=>c.kind==='offers').length;
    const howFirst=calls.filter(c=>c.kind==='copy'&&c.section==='how-it-works').length;
    scrollBy({top:12,behavior:'instant'});await wait(80);scrollBy({top:-12,behavior:'instant'});await wait(100);
    const offersJitter=calls.filter(c=>c.kind==='offers').length;
    document.getElementById('how-it-works').scrollIntoView({behavior:'instant'});await wait(750);
    const howUp=calls.filter(c=>c.kind==='copy'&&c.section==='how-it-works').length;
    scrollTo({top:0,behavior:'instant'});await wait(200);document.getElementById('check-results').scrollIntoView({behavior:'instant'});await wait(1100);
    const offersAgain=calls.filter(c=>c.kind==='offers').length;
    const rings=calls.filter(c=>c.kind==='pot').length;
    const inline=document.querySelectorAll('[data-scroll-entrance][style]').length;
    const external=performance.getEntriesByType('resource').filter(e=>e.name.startsWith('http')&&new URL(e.name).origin!==location.origin).length;
    Element.prototype.animate=original;
    return {before:before??null,initialRunning,offersFirst,offersJitter,offersAgain,howFirst,howUp,rings,inline,external,calls};
  })()`);
  assert(motion.before === null, 'Charts do not animate before entering the viewport');
  assert(motion.initialRunning === 0, 'The initial website view has no page-load fade or autoplay');
  assert(motion.offersFirst === 3 && motion.offersAgain === 6 && motion.rings >= 2, 'Charts repeat after leaving and re-entering the viewport');
  assert(motion.offersJitter === motion.offersFirst, 'Small scroll movements do not cause flicker or restart animations');
  assert(motion.howUp > motion.howFirst, 'Scrolling back upward replays the section entrance');
  assert(motion.calls.filter((call) => call.kind === 'copy').every((call) => call.from.opacity === 0 && call.to.opacity === 1), 'Lower sections actually fade in when reached');
  assert(motion.calls.filter((call) => call.kind === 'offers').every((call) => call.from.transform === 'scaleY(0)' && call.to.transform === 'scaleY(1)'), 'Chart bars grow from zero after viewport entry');
  assert(motion.calls.some((call) => call.kind === 'pot' && call.from.strokeDasharray === '0 100'), 'Pot graph draws its ring instead of fading the chart');
  assert(motion.calls.filter((call) => call.kind === 'copy').every((call) => call.from.transform === 'translateY(20px)' && call.to.transform === 'translateY(0)'), 'Every section entrance uses the same smooth slide-up direction');
  assert(motion.calls.every((call) => call.duration <= 800), 'Desktop fades and chart motion use consistent, unhurried timings');
  assert(motion.inline === 0, 'Motion does not weaken CSP with inline style attributes');
  assert(motion.external === 0, 'Motion uses no external requests');

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command('Page.navigate', { url: base.replace(/#.*$/, '') }, sessionId);
  await waitForPage('.nextturn-hero');
  await evaluate(`document.getElementById('how-it-works').scrollIntoView({behavior:'instant'})`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const mobile = await evaluate(`Array.from(document.querySelectorAll('[data-scroll-entrance]')).flatMap(e=>e.getAnimations({subtree:true})).filter(a=>a.playState==='running').map(a=>a.effect.getTiming().duration)`);
  assert(mobile.length > 0 && mobile.every((duration) => duration <= 600), 'Phone motion uses shorter fade/chart timings');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const active = await evaluate(`Array.from(document.querySelectorAll('[data-scroll-entrance]')).flatMap(e=>e.getAnimations({subtree:true})).filter(a=>a.playState==='running').length`);
  assert(active === 0, 'Changing to reduced motion cancels running entrances');
  await command('Browser.close');
} finally {
  socket?.close();
  child.kill(); // Only this script's isolated, temporary browser process.
}
console.log(JSON.stringify({ output, captures, checks }, null, 2));
