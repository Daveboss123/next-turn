/** Explicit local files only. No upload, automatic storage, or secret-bearing URLs. */
export async function readJsonFile(file: File, maxBytes = 5_000_000): Promise<unknown> {
  if (file.size > maxBytes) throw new Error('File is too large for a local audit (5 MB maximum).');
  try { return JSON.parse(await file.text()) as unknown; }
  catch { throw new Error('Could not read JSON. Import an exported NextTurn file, not wallet secrets.'); }
}

export function downloadJson(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  try {
    // Some browsers/webviews ignore a detached download link. Keep the blob
    // alive long enough for their download handler to obtain the bytes.
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

interface SaveStream { write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }
interface SaveHandle { createWritable(): Promise<SaveStream> }
interface SavePickerOptions {
  suggestedName: string;
  excludeAcceptAllOption: boolean;
  types: { description: string; accept: Record<string, string[]> }[];
}
type SavePickerWindow = Window & { showSaveFilePicker?: (options: SavePickerOptions) => Promise<SaveHandle> };

/** Only a picker-opening failure permits falling back to a normal download. */
export class SaveAsUnavailableError extends Error {
  override name = 'SaveAsUnavailableError';
}

export function supportsSaveAs(): boolean {
  return typeof window !== 'undefined' && typeof (window as SavePickerWindow).showSaveFilePicker === 'function';
}

/** An explicit user-selected local file; no handle, key or receipt is persisted. */
export async function saveJsonAs(filename: string, value: unknown): Promise<boolean> {
  const picker = typeof window !== 'undefined' ? (window as SavePickerWindow).showSaveFilePicker : undefined;
  if (!picker) throw new SaveAsUnavailableError('Save As is unavailable here. The browser can use its normal download flow instead.');
  let handle: SaveHandle;
  try {
    handle = await picker.call(window, { suggestedName: filename, excludeAcceptAllOption: true,
      types: [{ description: 'NextTurn JSON file', accept: { 'application/json': ['.json'] } }] });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return false;
    throw new SaveAsUnavailableError('The browser could not open Save As. Its normal download flow can be used instead.');
  }
  let stream: SaveStream | undefined;
  try {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
    stream = await handle.createWritable();
    await stream.write(blob);
    await stream.close();
    return true;
  } catch {
    try { await stream?.abort(); } catch { /* Do not expose native errors or file data. */ }
    throw new Error('The file was not confirmed saved. Try another local folder, or use Download and check your Downloads folder.');
  }
}
