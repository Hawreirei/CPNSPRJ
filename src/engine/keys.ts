import { db } from '../db';
import { decryptSecret, encryptSecret } from '../db/crypto';
import { uid } from '../lib/id';
import type { ApiKeyRecord, KeyLimits, ProviderId } from '../domain/types';
import { listModels, pickRecommendedModel } from '../providers';
import type { ProviderConfig } from '../providers';

export async function addKey(input: { provider: ProviderId; label: string; apiKey: string; model: string; baseUrl?: string; autoModel?: boolean; modelCheckedAt?: number; limits?: KeyLimits }) {
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
    autoModel: input.autoModel ?? true,
    limits: input.limits,
    modelCheckedAt: input.modelCheckedAt,
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

const RECHECK_MS = 7 * 24 * 3600 * 1000;

/**
 * Re-read the account's model list and switch to the newest stable recommended
 * model. Returns the (possibly unchanged) model id.
 */
export async function refreshKeyModel(keyId: string): Promise<{ model: string; changed: boolean }> {
  const rec = await db.keys.get(keyId);
  if (!rec) throw new Error('API key tidak ditemukan.');
  const cfg = await providerConfig(keyId);
  const pick = pickRecommendedModel(await listModels(cfg));
  const model = pick ?? rec.model;
  await db.keys.update(keyId, { model, modelCheckedAt: Date.now() });
  return { model, changed: model !== rec.model };
}

/** Config for a generation run; refreshes an auto-managed model if it has not been checked recently. */
export async function freshProviderConfig(keyId?: string): Promise<ProviderConfig & { keyId: string; autoModel: boolean }> {
  const rec = await resolveKey(keyId);
  if (!rec) throw new Error('Belum ada API key. Tambahkan di halaman API Keys.');
  if (rec.autoModel !== false && (!rec.modelCheckedAt || Date.now() - rec.modelCheckedAt > RECHECK_MS)) {
    try {
      await refreshKeyModel(rec.id);
    } catch {
      // Listing can fail (network, CORS on some compatible servers); keep the current model.
    }
  }
  return { ...(await providerConfig(rec.id)), keyId: rec.id, autoModel: rec.autoModel !== false };
}
