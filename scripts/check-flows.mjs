// Production-browser checks with generated fixtures only. Downloads stay in
// browser memory: no private bid files, normal browser profile or wallet sends.
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createManifest } from '../src/lib/round.ts';
import { createPracticeRound, sealPracticeBid, closePracticeBidding, revealPracticeBid, finishPracticeRound, practiceBundle } from '../src/lib/practice.ts';
import { TEST_ADDRESS } from '../tests/fixtures.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const parsed = new URL(base);
if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
  throw new Error('Use the local production preview URL without query strings or fragments.');
}
const manifest = { ...await createManifest({ version: 2, tenderId: 'a'.repeat(16), network: 'test',
  address: TEST_ADDRESS, title: 'Generated browser-check round', currency: 'NGN', potMinor: '60000000',
  memberCount: 8, discountCapBps: 2500, startHeight: 1000, commitDeadlineHeight: 1100,
  revealDeadlineHeight: 1200, submissionZatoshis: '100000', tieBreak: 'earliest-block-then-commitment' }), anchorTxid: 'b'.repeat(64) };
let legacy = await sealPracticeBid(await createPracticeRound(), '6500000');
legacy = await closePracticeBidding(legacy);
legacy = await revealPracticeBid(legacy);
const legacyBundle = practiceBundle(finishPracticeRound(legacy));

const parent = join(tmpdir(), 'opencode');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, 'nextturn-flows-'));
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const child = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-sync', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', `--user-data-dir=${join(output, 'profile')}`, 'about:blank'],
{ windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const checks = [];
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timeout = setTimeout(() => reject(new Error('Isolated browser startup timed out.')), 15_000);
    child.on('error', reject);
    child.stderr.on('data', (chunk) => {
      log = `${log}${chunk}`.slice(-8000);
      const match = log.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let serial = 0; let runtimeErrors = 0;
  let completedPublicDownload;
  const publicDownloadFinished = new Promise(resolve => { completedPublicDownload = resolve; });
  const requests = [];
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Network.requestWillBeSent') requests.push({ url: data.params.request.url, type: data.params.type });
    if (data.method === 'Runtime.exceptionThrown') runtimeErrors++;
    if (data.method === 'Browser.downloadProgress' && data.params.state === 'completed') completedPublicDownload();
    if (!data.id || !pending.has(data.id)) return;
    const item = pending.get(data.id); pending.delete(data.id); clearTimeout(item.timeout);
    if (data.error) item.reject(new Error(`Browser command ${item.method} failed.`)); else item.resolve(data.result);
  });
  function command(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 15_000);
      pending.set(id, { method, resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  const target = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  for (const domain of ['Page', 'Runtime', 'Network']) await command(`${domain}.enable`, {}, sessionId);
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    const check = window.__nextturnCheck = { downloads: [], blobs: new Map(), memory: {}, storageWrites: 0, dbOpens: 0, realNow: Date.now, offset: 0 };
    check.pickerMode = 'cancel'; check.saveBlob = null;
    window.showSaveFilePicker = async () => {
      if (check.pickerMode === 'cancel') throw new DOMException('Generated picker cancellation', 'AbortError');
      if (check.pickerMode === 'unavailable') throw new DOMException('Generated blocked picker', 'SecurityError');
      return { createWritable: async () => ({
        write: async blob => { check.saveBlob = blob; },
        close: async () => { if (check.pickerMode === 'fail') throw new DOMException('Generated write failure', 'AbortError'); },
        abort: async () => {},
      }) };
    };
    Date.now = () => check.realNow() + check.offset;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); check.blobs.set(url, blob); return url; };
    URL.revokeObjectURL = url => { check.blobs.delete(url); revoke(url); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (check.allowPublicRoundDownload && this.download === 'nextturn-round-aaaaaaaaaaaaaaaa.json') {
        check.realPublicDownloadConnected = this.isConnected;
        return click.call(this);
      }
      if (this.download && check.blobs.has(this.href)) { check.downloads.push({ name: this.download, blob: check.blobs.get(this.href) }); return; }
      return click.call(this);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(...args) { check.storageWrites++; return setItem.apply(this, args); };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => { check.dbOpens++; return open(...args); };
    check.upload = (selector, value, delay = 0, force = false) => {
      const input = document.querySelector(selector);
      if (!input || (input.disabled && !force)) throw Error('The expected file input is not available.');
      const files = new DataTransfer();
      const file = new File([JSON.stringify(value)], 'generated-local-check.json', { type: 'application/json' });
      files.items.add(file);
      input.files = files.files;
      if (delay) { const imported = input.files[0], text = imported.text.bind(imported); imported.text = async () => { await new Promise(r => setTimeout(r, delay)); return text(); }; }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    check.tip = height => ({ format: 'nextturn-chain-tip-v1', network: 'test', source: 'https://testnet.zec.rocks:443',
      height, blockHash: 'c'.repeat(64), fetchedAtUnixSeconds: Math.floor(Date.now() / 1000) });
  ` }, sessionId);
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    // Never include an evaluated object or private fixture in failure output.
    if (result.exceptionDetails) throw new Error('A browser-flow operation failed. No fixture data was printed.');
    return result.result.value;
  }
  async function wait(expression) {
    const ready = await evaluate(`(async()=>{const until=__nextturnCheck.realNow()+7000;while(!(${expression})){if(__nextturnCheck.realNow()>until)return false;await new Promise(r=>setTimeout(r,25));}return true;})()`);
    if (!ready) throw new Error('The expected browser-flow state did not appear.');
  }
  function assert(condition, message) { if (!condition) throw new Error(message); checks.push(message); }
  async function check(expression, message) { assert(await evaluate(expression), message); }
  async function click(text, selector = 'button') {
    await evaluate(`(()=>{const button=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim().includes(${JSON.stringify(text)}));if(!button||button.disabled)throw Error('Action unavailable');button.click();})()`);
  }
  async function route(hash, selector) {
    await evaluate(`location.hash=${JSON.stringify(hash)}`);
    await wait(`document.querySelector(${JSON.stringify(selector)})`);
  }
  async function upload(selector, expression) { await evaluate(`__nextturnCheck.upload(${JSON.stringify(selector)}, ${expression})`); }
  async function download(text, key) {
    const before = await evaluate(`__nextturnCheck.downloads.length`);
    await click(text);
    await wait(`__nextturnCheck.downloads.length>${before}`);
    await evaluate(`(async()=>{__nextturnCheck.memory[${JSON.stringify(key)}]=JSON.parse(await __nextturnCheck.downloads.at(-1).blob.text());return true;})()`);
  }
  const button = text => `Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim().includes(${JSON.stringify(text)}))`;
  const bidInput = 'input[aria-label="Open my private bid file"]';
  const challengeInput = 'input[aria-label="Open claim challenge"]';
  const proofInput = 'input[aria-label="Open winner proof"]';
  const savedChallengeInput = 'input[aria-label="Open my saved challenge"]';
  const tipInput = 'input[aria-label="Open public chain reading"]';
  const resultInput = 'input[aria-label="Open result file"]';

  await command('Page.navigate', { url: base }, sessionId);
  await wait(`document.querySelector('.nextturn-hero')`);
  await check(`document.title.startsWith('NextTurn') && document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'")`, 'Production branding and no-connect CSP are present');
  await click('Open app', 'a');
  await wait(`document.querySelector('#practice-discount')`);
  await click('Place practice offer');
  await wait(`${button('Close bidding')}`);
  await check(`${button('Close bidding')}.disabled`, 'Practice requires requesting the private bid download before closing');
  await check(`document.querySelectorAll('.private-receipt button').length===1 && document.querySelector('.private-receipt button').textContent.includes('download my bid file')`, 'The private bid has one download my bid file button that opens Save As');
  await click('download my bid file');
  await wait(`${button('download my bid file')} && !${button('download my bid file')}.disabled`);
  await check(`${button('Close bidding')}.disabled`, 'Cancelling Save As does not unlock the next step');
  await evaluate(`__nextturnCheck.pickerMode='fail'`);
  await click('download my bid file');
  await wait(`document.querySelector('.private-receipt [role="alert"]')`);
  await check(`${button('Close bidding')}.disabled`, 'A failed file write does not unlock the next step');
  await evaluate(`__nextturnCheck.pickerMode='unavailable'`);
  await download('download my bid file', 'practiceBid');
  await check(`${button('Close bidding')}.disabled`, 'Requesting a download alone does not claim that the bid file is saved');
  await check(`document.querySelectorAll('.private-receipt button').length===1`, 'The normal-download fallback still uses the same single save button');
  await evaluate(`document.querySelector('input[aria-label="I saved my bid file"]').click()`);
  await check(`Boolean(__nextturnCheck.memory.practiceBid.claimPrivateKeyHex) && __nextturnCheck.memory.practiceBid.claimPublicKeyHex.length===64`, 'New practice bids have a fresh local ownership key');
  await route('app/privacy', '.privacy-grid');
  await route('app/practice', '#practice-round');
  await check(`!${button('Close bidding')}.disabled`, 'The download acknowledgement survives app navigation without storage');
  await click('Close bidding');
  await wait(`${button('Open my offer')}`);
  await click('Open my offer');
  await wait(`${button('Show the result')}`);
  await click('Show the result');
  await wait(`document.querySelector('.outcome-pass')`);
  await evaluate(`(()=>{__nextturnCheck.originalSign=crypto.subtle.sign.bind(crypto.subtle);crypto.subtle.sign=async(...args)=>{await new Promise(r=>setTimeout(r,650));return __nextturnCheck.originalSign(...args);};})()`);
  await click('Ownership check');
  await wait(`document.querySelector('.winner-claim-panel button[aria-busy="true"] .button-spinner')`);
  await check(`(()=>{const button=document.querySelector('.winner-claim-panel button[aria-busy="true"]');return button.disabled&&button.textContent.includes('Checking ownership')&&getComputedStyle(button.querySelector('.button-spinner')).animationName==='none';})()`, 'Ownership checking has a disabled pending button and a reduced-motion-safe spinner');
  await wait(`document.querySelector('.winner-claim-panel .notice-success')`);
  await check(`document.querySelector('.winner-claim-panel').textContent.includes('proof matches')`, 'Practice proves control of the winning bid key locally');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await click('Ownership check');
  await wait(`document.querySelector('.winner-claim-panel .button-spinner')`);
  await check(`getComputedStyle(document.querySelector('.winner-claim-panel .button-spinner')).animationName==='button-spin'`, 'The small ownership spinner rotates only while verification is pending');
  await wait(`document.querySelector('.winner-claim-panel .notice-success')`);
  await evaluate(`crypto.subtle.sign=__nextturnCheck.originalSign`);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await click('Try the wrong winner');
  await wait(`document.querySelector('.tamper-demo .outcome-fail')`);
  await check(`document.querySelector('.tamper-demo').textContent.includes('announced winner doesn’t match')`, 'A deliberately wrong winner is rejected');
  await download('Download result file', 'practiceResult');
  await check(`(()=>{const {practiceBid:bid,practiceResult:result}=__nextturnCheck.memory;return result.manifest.rules.version===2&&!JSON.stringify(result).includes(bid.claimPrivateKeyHex)&&!JSON.stringify(result).includes('claimPrivateKeyHex');})()`, 'Public results exclude the private ownership key and receipt object');

  await route('app/audit', resultInput);
  await upload(resultInput, '__nextturnCheck.memory.practiceResult');
  await wait(`document.querySelector('.winner-claim-panel')`);
  await click('Create a fresh challenge');
  await wait(`${button('Download challenge')}`);
  await download('Download challenge', 'expectedChallenge');
  await check(`__nextturnCheck.memory.expectedChallenge.nonceHex.length===64`, 'The result checker creates a fresh 32-byte challenge');
  await route('app/testnet', bidInput);
  await check(`${button('Create public winner proof')}.disabled`, 'Signing requires both a private bid and the checker’s challenge');
  await upload(bidInput, '__nextturnCheck.memory.practiceBid');
  await wait(`document.body.textContent.includes('Private bid file loaded locally')`);
  await upload(challengeInput, '__nextturnCheck.memory.expectedChallenge');
  await wait(`${button('Create public winner proof')}?.disabled === false`);
  await click('Create public winner proof');
  await wait(`${button('Download public proof')}`);
  await download('Download public proof', 'winnerProof');
  await check(`(()=>{const {practiceBid:bid,winnerProof:proof}=__nextturnCheck.memory;return proof.format==='nextturn-winner-proof-v1'&&proof.signatureHex.length===128&&![bid.claimPrivateKeyHex,bid.saltHex].some(value=>JSON.stringify(proof).includes(value))&&!('priceMinor' in proof);})()`, 'The public proof contains a signature but no private key, discount or salt');
  await upload(challengeInput, '{}');
  await wait(`document.querySelector('[role="alert"]')`);
  await check(`${button('Create public winner proof')}.disabled && !${button('Download public proof')}`, 'A rejected challenge clears the previous signing input and proof');
  await evaluate(`__nextturnCheck.upload(${JSON.stringify(challengeInput)},__nextturnCheck.memory.expectedChallenge,300);__nextturnCheck.upload(${JSON.stringify(challengeInput)},{},0,true)`);
  await wait(`document.querySelector('[role="alert"]') && !document.querySelector(${JSON.stringify(challengeInput)}).disabled`);
  await evaluate(`new Promise(r=>setTimeout(r,400))`);
  await check(`${button('Create public winner proof')}.disabled`, 'A slow older file cannot replace the newer rejected signing input');
  await upload(challengeInput, '__nextturnCheck.memory.expectedChallenge');
  await wait(`${button('Create public winner proof')}?.disabled === false`);
  await upload(bidInput, '{}');
  await wait(`document.querySelector('[role="alert"]')`);
  await check(`${button('Create public winner proof')}.disabled`, 'A rejected private bid clears the previous signing input');

  await route('app/audit', resultInput);
  await upload(resultInput, '__nextturnCheck.memory.practiceResult');
  await wait(`document.querySelector('.winner-claim-panel')`);
  await upload(savedChallengeInput, '__nextturnCheck.memory.expectedChallenge');
  await wait(`document.querySelector(${JSON.stringify(proofInput)})`);
  await upload(proofInput, '__nextturnCheck.memory.winnerProof');
  await wait(`document.querySelector('.winner-claim-panel .notice-success')`);
  await check(`document.querySelector('.winner-claim-panel').textContent.includes('answers your current challenge')`, 'A saved checker-issued challenge verifies the honest public proof');
  await check(`document.querySelector(${JSON.stringify(proofInput)}).disabled`, 'An accepted challenge cannot be checked a second time in this page');
  await route('app/privacy', '.privacy-grid');
  await route('app/audit', resultInput);
  await upload(resultInput, '__nextturnCheck.memory.practiceResult');
  await wait(`document.querySelector('.winner-claim-panel')`);
  await upload(savedChallengeInput, '__nextturnCheck.memory.expectedChallenge');
  await wait(`document.querySelector('.winner-claim-panel [role="alert"]')`);
  await check(`!document.querySelector(${JSON.stringify(proofInput)})`, 'Accepted challenges remain used after navigating between screens in the same page');
  await click('Create a fresh challenge');
  await wait(`document.querySelector(${JSON.stringify(proofInput)}) && !document.querySelector(${JSON.stringify(proofInput)}).disabled`);
  await upload(proofInput, '__nextturnCheck.memory.winnerProof');
  await wait(`document.querySelector('.winner-claim-panel .notice-error')`);
  await check(`document.querySelector('.winner-claim-panel').textContent.includes('Proof rejected')`, 'An old proof is rejected against a newly generated challenge');
  await upload(savedChallengeInput, '__nextturnCheck.memory.expectedChallenge');
  await wait(`document.querySelector('.winner-claim-panel [role="alert"]')`);
  await check(`!document.querySelector(${JSON.stringify(proofInput)})`, 'An already accepted saved challenge cannot replace the fresh one');
  await click('Create a fresh challenge');
  await wait(`${button('Download challenge')}`);
  await upload(savedChallengeInput, `({...__nextturnCheck.memory.expectedChallenge, commitmentHex:'f'.repeat(64)})`);
  await wait(`document.querySelector('.winner-claim-panel [role="alert"]')`);
  await check(`!document.querySelector(${JSON.stringify(proofInput)})`, 'A wrong-round saved challenge fails closed instead of retaining the old challenge');
  await upload(resultInput, `${JSON.stringify(legacyBundle)}`);
  await wait(`document.querySelector('.outcome-pass') && !document.querySelector('.winner-claim-panel')`);
  await check(`!document.querySelector('.winner-claim-panel')`, 'Legacy version-1 results stay readable without claiming ownership verification');
  await evaluate(`__nextturnCheck.upload(${JSON.stringify(resultInput)},__nextturnCheck.memory.practiceResult,300);__nextturnCheck.upload(${JSON.stringify(resultInput)},{},0,true)`);
  await wait(`document.querySelector('[role="alert"]') && !document.querySelector(${JSON.stringify(resultInput)}).disabled`);
  await evaluate(`new Promise(r=>setTimeout(r,400))`);
  await check(`!document.querySelector('.outcome-pass') && !document.querySelector('.winner-claim-panel')`, 'A slow older result cannot override a newer rejected result file');

  await route('app/testnet', '.import-card input[type="file"]');
  await upload('.import-card input[type="file"]', `${JSON.stringify(manifest)}`);
  await wait(`document.querySelector('.round-file-card')`);
  await check(`${button('Seal locally')}.disabled`, 'Wallet requests require a fresh local chain reading');
  await upload(tipInput, `({...__nextturnCheck.tip(1000), fetchedAtUnixSeconds:Math.floor(Date.now()/1000)-121})`);
  await wait(`document.querySelector('[role="alert"]')`);
  await check(`${button('Seal locally')}.disabled`, 'An initially stale chain reading cannot enable bidding');
  await upload(tipInput, '__nextturnCheck.tip(1000)');
  await wait(`!${button('Seal locally')}.disabled`);
  await evaluate(`(()=>{const input=document.querySelector('form input[inputmode="decimal"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'65000');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('Seal locally');
  await wait(`${button('download my bid file')}`);
  await check(`!document.querySelector('.payment-request')`, 'The wallet request is hidden until the private bid download is requested');
  await evaluate(`__nextturnCheck.pickerMode='success'`);
  await click('download my bid file');
  await wait(`document.querySelector('.payment-request img')`);
  await evaluate(`(async()=>{__nextturnCheck.memory.walletBid=JSON.parse(await __nextturnCheck.saveBlob.text());return true;})()`);
  await check(`document.querySelector('.private-receipt [role="status"]').textContent.includes('saved or confirmed')`, 'A completed Save As unlocks the request only after the local file is closed');
  await wait(`document.querySelector('.payment-request img')`);
  await check(`(()=>{const request=new URL(document.querySelector('.payment-request a').href);const memo=atob(request.searchParams.get('memo').replace(/-/g,'+').replace(/_/g,'/'));const bid=__nextturnCheck.memory.walletBid;return request.protocol==='zcash:'&&request.searchParams.get('amount')==='0.001'&&memo==='ZT3C '+bid.tenderId+' '+bid.rulesHash+' '+bid.commitmentHex+' '+bid.claimPublicKeyHex&&!memo.includes(bid.saltHex)&&!memo.includes(bid.claimPrivateKeyHex);})()`, 'The sealed request binds the public bid key without revealing the amount, salt or private key');
  await upload(tipInput, `({...__nextturnCheck.tip(1000), network:'main'})`);
  await wait(`document.querySelector('[role="alert"]')`);
  await check(`!document.querySelector('.payment-request')`, 'A rejected replacement chain reading removes the previous wallet request');
  await evaluate(`__nextturnCheck.upload(${JSON.stringify(tipInput)},__nextturnCheck.tip(1000),300);__nextturnCheck.upload(${JSON.stringify(tipInput)},{...__nextturnCheck.tip(1000),network:'main'},0,true)`);
  await wait(`document.querySelector('[role="alert"]') && !document.querySelector(${JSON.stringify(tipInput)}).disabled`);
  await evaluate(`new Promise(r=>setTimeout(r,400))`);
  await check(`!document.querySelector('.payment-request')`, 'A slow older chain reading cannot re-enable a rejected replacement request');
  await upload(tipInput, '__nextturnCheck.tip(1000)');
  await wait(`document.querySelector('.payment-request')`);
  await evaluate('__nextturnCheck.offset = 121000');
  await wait(`!document.querySelector('.payment-request')`);
  await check(`!document.querySelector('.payment-request')`, 'A chain reading expires automatically and hides prepared requests');
  await evaluate('__nextturnCheck.offset = 0');
  await upload(tipInput, '__nextturnCheck.tip(1100)');
  await wait(`document.querySelector('.payment-request')`);
  await check(`Boolean(document.querySelector('.payment-request'))`, 'The inclusive final commitment block still allows a sealed request');
  await click('Reveal saved bid');
  await wait(`${button('Prepare reveal request')}`);
  await evaluate(`document.querySelector('.checkbox-field input').click()`);
  await check(`${button('Prepare reveal request')}.disabled`, 'A bidder cannot prepare an opening request before bidding closes');
  await upload(tipInput, '__nextturnCheck.tip(1101)');
  await wait(`!${button('Prepare reveal request')}.disabled`);
  await click('Prepare reveal request');
  await wait(`document.querySelector('.payment-request img')`);
  await check(`(()=>{const request=new URL(document.querySelector('.payment-request a').href);const memo=atob(request.searchParams.get('memo').replace(/-/g,'+').replace(/_/g,'/'));const bid=__nextturnCheck.memory.walletBid;return request.searchParams.get('amount')==='0.001'&&memo==='ZT3R '+bid.tenderId+' '+bid.rulesHash+' '+bid.priceMinor+' '+bid.saltHex+' '+bid.claimPublicKeyHex&&!memo.includes(bid.claimPrivateKeyHex);})()`, 'Opening intentionally reveals the original discount and salt, never the private proof key');
  await evaluate(`document.querySelectorAll('.payment-request details').forEach(e=>e.open=true)`);
  for (const width of [1280, 768, 390, 360]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    const metrics = await evaluate(`(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {width:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth};})()`);
    assert(metrics.width === width && metrics.scroll <= metrics.client + 1, `Wallet/proof/payment panels fit the ${width}px viewport (${metrics.scroll}/${metrics.client})`);
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await upload('input[type="file"]:not([aria-label])', '{}');
  await wait(`document.querySelector('[role="alert"]')`);
  await check(`!document.querySelector('.reveal-value') && !document.querySelector('.payment-request')`, 'A rejected replacement bid clears the old opening input and request');
  await upload('input[type="file"]:not([aria-label])', '__nextturnCheck.memory.walletBid');
  await wait(`document.querySelector('.reveal-value')`);
  await check(`${button('Prepare reveal request')}.disabled`, 'Reimporting a valid bid requires renewed disclosure consent');
  await evaluate(`document.querySelector('.checkbox-field input').click()`);
  await upload(tipInput, '__nextturnCheck.tip(1201)');
  await wait(`${button('Prepare reveal request')}.disabled`);
  await check(`!document.querySelector('.payment-request') && ${button('Prepare reveal request')}.disabled`, 'Opening requests stop after the reveal deadline');

  await click('Open another round');
  await wait(`document.querySelector('.import-card input[type="file"]')`);
  await upload('.import-card input[type="file"]', `${JSON.stringify({ ...manifest, anchorTxid: null })}`);
  await wait(`document.querySelector('.round-file-card')`);
  await check(`!document.querySelector('.payment-request')`, 'Rules anchoring also requires a fresh chain reading');
  await upload(tipInput, '__nextturnCheck.tip(999)');
  await wait(`document.querySelector('.payment-request img')`);
  await check(`(()=>{const request=new URL(document.querySelector('.payment-request a').href);return request.searchParams.get('amount')==='0.001'&&atob(request.searchParams.get('memo').replace(/-/g,'+').replace(/_/g,'/')).startsWith('ZT1A ')&&document.querySelector('.payment-request img').alt.includes('round rules');})()`, 'The on-time rules request carries only the rules fingerprint and correct anchor description');
  await upload(tipInput, '__nextturnCheck.tip(1000)');
  await wait(`!document.querySelector('.payment-request')`);
  await check(`!document.querySelector('.payment-request')`, 'The rules request is hidden once the bidding start block has arrived');

  // Only this public, unfunded fixture is allowed through the real download
  // handler. All mock private downloads remain intercepted in browser memory.
  const publicDownloadFolder = join(output, 'public-download');
  await mkdir(publicDownloadFolder);
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: publicDownloadFolder, eventsEnabled: true });
  await evaluate(`__nextturnCheck.allowPublicRoundDownload=true`);
  const downloadPoint = await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Save public round file');button.scrollIntoView({behavior:'instant',block:'center'});const box=button.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...downloadPoint, button: 'left', clickCount: 1 }, sessionId);
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...downloadPoint, button: 'left', clickCount: 1 }, sessionId);
  let downloadTimeout;
  try {
    await Promise.race([publicDownloadFinished, new Promise((_, reject) => { downloadTimeout = setTimeout(() => reject(new Error('The public canary download did not complete.')), 10_000); })]);
  } finally { clearTimeout(downloadTimeout); }
  const downloadedPublic = JSON.parse(await readFile(join(publicDownloadFolder, 'nextturn-round-aaaaaaaaaaaaaaaa.json'), 'utf8'));
  assert(downloadedPublic.rulesHash === manifest.rulesHash && downloadedPublic.rules.tenderId === manifest.rules.tenderId, 'A real public JSON download reaches the isolated browser download folder intact');
  await check(`__nextturnCheck.realPublicDownloadConnected===true`, 'The real download link is attached when the browser processes its click');
  await check(`(()=>{const c=__nextturnCheck;const secret=c.memory.walletBid.claimPrivateKeyHex;return !document.body.textContent.includes(secret)&&localStorage.length===0&&sessionStorage.length===0&&c.storageWrites===0&&c.dbOpens===0&&document.cookie==='';})()`, 'No private key is displayed and no browser storage, cookies or IndexedDB is used');
  await check(`location.search==='' && location.hash==='#app/testnet'`, 'Application URLs contain only screen names, never bid data');
  assert(requests.every(({ url }) => !url.startsWith('http') || (new URL(url).origin === parsed.origin && !new URL(url).search)), 'The flow makes only local static requests without data-bearing query strings');
  assert(!requests.some(({ type }) => ['Fetch', 'XHR', 'WebSocket'].includes(type)), 'The app uses no bid API, relay or network connection during the flow');
  assert(runtimeErrors === 0, 'The completed flow has no uncaught page errors');
  await command('Browser.close');
} finally {
  socket?.close();
  child.kill(); // Only the isolated process created by this script.
}
console.log(JSON.stringify({ passed: checks.length, checks, note: 'Generated fixtures only; private downloads stayed in browser memory. No wallet sends or real-chain round was tested.' }, null, 2));
