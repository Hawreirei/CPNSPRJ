import { db } from '../db';
import { decryptSecret, encryptSecret } from '../db/crypto';
import { uid } from '../lib/id';
import type { ApiKeyRecord, ProviderId } from '../domain/types';
import type { ProviderConfig } from '../providers';

export async function addKey(input: { provider: ProviderId; label: string; apiKey: string; model: string; baseUrl?: string }) {
  const { cipher, iv } = await encryptSecret(input.apiKey.trim());
  const hasDefault = (await db.keys.count()) > 0;
  const rec: ApiKeyRecord = {
    id: uid(),
    provider: input.provider,
    label: input.label || input.provider,
    model: input.model,
    baseUrl: input.baseUrl?.trim() || undefined,
    cipher,
    iv,
    isDefault: !hasDefault,
    createdAt: Date.now(),
  };
  await db.keys.add(rec);
  return rec;
}

export async function setDefaultKey(id: string) {
  await db.transaction('rw', db.keys, async () => {
    await db.keys.toCollection().modify({ isDefault: false });
    await db.keys.update(id, { isDefault: true });
  });
}

export async function deleteKey(id: string) {
  const rec = await db.keys.get(id);
  await db.keys.delete(id);
  if (rec?.isDefault) {
    const next = await db.keys.toCollection().first();
    if (next) await db.keys.update(next.id, { isDefault: true });
  }
}

export async function resolveKey(keyId?: string): Promise<ApiKeyRecord | undefined> {
  if (keyId) {
    const k = await db.keys.get(keyId);
    if (k) return k;
  }
  return (await db.keys.filter((k) => k.isDefault).first()) ?? (await db.keys.toCollection().first());
}

export async function providerConfig(keyId?: string): Promise<ProviderConfig> {
  const rec = await resolveKey(keyId);
  if (!rec) throw new Error('Belum ada API key. Tambahkan di halaman API Keys.');
  return { provider: rec.provider, model: rec.model, baseUrl: rec.baseUrl, apiKey: await decryptSecret(rec.cipher, rec.iv) };
}
