import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { exportBackup } from '../db/backup';
import { addKey, deleteKey, hasSecret, providerConfig, SessionKeyMissingError, setSessionSecret } from '../engine/keys';

const SECRET = 'AIzaSySessionOnlySecretKey0123456789abcd';

/** A tab's sessionStorage: cleared to stand for a closed tab. */
function fakeSessionStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    size: () => m.size,
  };
}

/** Everything stored in IndexedDB as text, ArrayBuffers included. */
async function everythingStored(): Promise<string> {
  const rows = await Promise.all(db.tables.map((t) => t.toArray()));
  return JSON.stringify(rows, (_k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? new TextDecoder().decode(v as ArrayBuffer) : v));
}

describe('session-only keys', () => {
  let storage: ReturnType<typeof fakeSessionStorage>;
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    storage = fakeSessionStorage();
    vi.stubGlobal('sessionStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('work for requests but are never written to IndexedDB or a backup', async () => {
    const rec = await addKey({ provider: 'gemini', label: 'Sesi', apiKey: ` ${SECRET} `, model: 'gemini-x', sessionOnly: true });
    expect(rec).toMatchObject({ sessionOnly: true, isDefault: true });
    expect(rec.cipher).toBeUndefined();
    expect(await providerConfig(rec.id)).toMatchObject({ provider: 'gemini', model: 'gemini-x', apiKey: SECRET });
    expect(hasSecret(rec)).toBe(true);

    expect(await everythingStored()).not.toContain(SECRET);
    expect(await (await exportBackup()).text()).not.toContain(SECRET);
  });

  it('give a clear message once the tab is gone, and work again when typed in', async () => {
    const rec = await addKey({ provider: 'gemini', label: 'Laptop kampus', apiKey: SECRET, model: 'gemini-x', sessionOnly: true });
    storage.clear();
    expect(hasSecret(rec)).toBe(false);
    await expect(providerConfig(rec.id)).rejects.toThrow(SessionKeyMissingError);
    await expect(providerConfig(rec.id)).rejects.toThrow('Key "Laptop kampus" hanya untuk sesi dan sudah hilang');
    setSessionSecret(rec.id, SECRET);
    expect((await providerConfig(rec.id)).apiKey).toBe(SECRET);
  });

  it('are removed from the tab when deleted', async () => {
    const rec = await addKey({ provider: 'gemini', label: 'Sesi', apiKey: SECRET, model: 'gemini-x', sessionOnly: true });
    await deleteKey(rec.id);
    expect(storage.size()).toBe(0);
  });

  it('leave stored keys as they were: encrypted, and not in sessionStorage', async () => {
    const rec = await addKey({ provider: 'gemini', label: 'Tersimpan', apiKey: SECRET, model: 'gemini-x' });
    expect(rec.sessionOnly).toBeUndefined();
    expect(rec.cipher).toBeInstanceOf(ArrayBuffer);
    expect(storage.size()).toBe(0);
    expect((await providerConfig(rec.id)).apiKey).toBe(SECRET);
    expect(await everythingStored()).not.toContain(SECRET);
  });
});
