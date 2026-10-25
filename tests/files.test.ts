import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { downloadJson, saveJsonAs, supportsSaveAs, SaveAsUnavailableError } from '../src/lib/files.ts';

const canary = { format: 'nextturn-public-download-test-v1', privateData: false };
function setGlobal(t: TestContext, name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name); });
}

test('download links are connected, cleaned up and retain their blob for the handler', (t) => {
  let clickedConnected = false; let revoked = false; let delay = 0; let cleanup = () => {};
  const link = { href: '', download: '', hidden: false, isConnected: false,
    click() { clickedConnected = this.isConnected; }, remove() { this.isConnected = false; } };
  setGlobal(t, 'document', { createElement: () => link, body: { appendChild: () => { link.isConnected = true; } } });
  t.mock.method(URL, 'createObjectURL', () => 'blob:public-canary');
  t.mock.method(URL, 'revokeObjectURL', () => { revoked = true; });
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, ms: number) => { cleanup = callback; delay = ms; return 0 as unknown as ReturnType<typeof setTimeout>; });
  downloadJson('nextturn-public-canary.json', canary);
  assert.equal(clickedConnected, true);
  assert.equal(link.hidden, true);
  assert.equal(link.isConnected, false);
  assert.equal(link.download, 'nextturn-public-canary.json');
  assert.equal(delay, 60_000);
  assert.equal(revoked, false);
  cleanup(); assert.equal(revoked, true);
});

test('a failed download click still cleans up its attached link', (t) => {
  let removed = false;
  const link = { href: '', download: '', hidden: false, click() { throw new Error('blocked'); }, remove() { removed = true; } };
  setGlobal(t, 'document', { createElement: () => link, body: { appendChild() {} } });
  t.mock.method(URL, 'createObjectURL', () => 'blob:public-canary');
  t.mock.method(globalThis, 'setTimeout', () => 0 as unknown as ReturnType<typeof setTimeout>);
  assert.throws(() => downloadJson('nextturn-public-canary.json', canary), /blocked/);
  assert.equal(removed, true);
});

test('Save As is confirmed only after the selected stream is written and closed', async (t) => {
  let closed = false; let data: Blob | null = null; let suggestedName = '';
  setGlobal(t, 'window', { showSaveFilePicker: async (options: { suggestedName: string }) => {
    suggestedName = options.suggestedName;
    return { createWritable: async () => ({ write: async (blob: Blob) => { data = blob; }, close: async () => { closed = true; }, abort: async () => {} }) };
  } });
  assert.equal(supportsSaveAs(), true);
  assert.equal(await saveJsonAs('nextturn-public-canary.json', canary), true);
  assert.equal(closed, true);
  assert.equal(suggestedName, 'nextturn-public-canary.json');
  assert(data);
  assert.deepEqual(JSON.parse(await (data as Blob).text()), canary); // Public canary only.
});

test('cancelling the picker does not claim a saved file or start a fallback download', async (t) => {
  setGlobal(t, 'window', { showSaveFilePicker: async () => { throw new DOMException('cancelled', 'AbortError'); } });
  assert.equal(await saveJsonAs('nextturn-public-canary.json', canary), false);
});

test('write/close failures abort the stream and do not report a successful save', async (t) => {
  let aborted = false;
  setGlobal(t, 'window', { showSaveFilePicker: async () => ({ createWritable: async () => ({
    write: async () => {}, close: async () => { throw new DOMException('not written', 'AbortError'); },
    abort: async () => { aborted = true; },
  }) }) });
  await assert.rejects(() => saveJsonAs('nextturn-public-canary.json', canary), /not confirmed saved/);
  assert.equal(aborted, true);
});

test('unavailable or blocked Save As gives a safe error without printing file data', async (t) => {
  const browser: { showSaveFilePicker?: () => Promise<never> } = {};
  setGlobal(t, 'window', browser);
  assert.equal(supportsSaveAs(), false);
  await assert.rejects(() => saveJsonAs('nextturn-public-canary.json', canary), /unavailable/);
  browser.showSaveFilePicker = async () => { throw new DOMException('blocked', 'SecurityError'); };
  await assert.rejects(() => saveJsonAs('nextturn-public-canary.json', canary), (cause) => cause instanceof SaveAsUnavailableError);
});
