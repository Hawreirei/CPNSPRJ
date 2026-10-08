import { db } from '../db';
import { decryptSecret, encryptSecret } from '../db/crypto';
import { uid } from '../lib/id';
import type { ApiKeyRecord, KeyLimits, ModelInfo, ProviderId } from '../domain/types';
import { listModelInfo, pickRecommendedModel } from '../providers';
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
const LIST_TTL_MS = 24 * 3600 * 1000;

/** Fetch and cache the key's model list (no model change). Listing uses no generation quota. */
export async function loadKeyModels(keyId: string): Promise<ModelInfo[]> {
  const models = await listModelInfo(await providerConfig(keyId));
  await db.keys.update(keyId, { models, modelsFetchedAt: Date.now() });
  return models;
}

/** Pick `model` by hand: stop automatic switching for this key. */
export async function chooseKeyModel(keyId: string, model: string) {
  await db.keys.update(keyId, { model, autoModel: false });
}

/** Hand model choice back to the app (newest stable recommended model). */
export async function switchToAutoModel(keyId: string) {
  await db.keys.update(keyId, { autoModel: true });
  return refreshKeyModel(keyId);
}

/**
 * Re-read the account's model list and switch to the newest stable recommended
 * model. Returns the (possibly unchanged) model id.
 */
export async function refreshKeyModel(
  keyId: string,
  opts: { exclude?: string; hint?: string } = {},
): Promise<{ model: string; changed: boolean }> {
  const rec = await db.keys.get(keyId);
  if (!rec) throw new Error('API key tidak ditemukan.');
  const cfg = await providerConfig(keyId);
  let list: string[] | null = null;
  try {
    const models = await listModelInfo(cfg);
    await db.keys.update(keyId, { models, modelsFetchedAt: Date.now() });
    // A model the provider just rejected may still be listed; never pick it again.
    list = models.map((m) => m.id).filter((m) => m !== opts.exclude && m.replace(/^models\//, '') !== opts.exclude);
  } catch (e) {
    if (!opts.hint) throw e;
  }
  // The provider's own suggestion wins when it is available to this key (or the list can't be read).
  const hinted = opts.hint && (!list || list.some((m) => m === opts.hint || m.endsWith(`/${opts.hint}`))) ? opts.hint : undefined;
  const model = hinted ?? (list ? pickRecommendedModel(list) : undefined) ?? opts.hint ?? rec.model;
  await db.keys.update(keyId, { model, modelCheckedAt: Date.now() });
  return { model, changed: model !== rec.model };
}

/**
 * Keep model lists fresh (daily) for every key, and move auto-managed keys to
 * the newest stable model weekly. Manually chosen models are never changed.
 */
export async function refreshStaleKeyModels(): Promise<void> {
  const keys = await db.keys.toArray();
  const now = Date.now();
  await Promise.all(
    keys.map((k) => {
      if (k.autoModel !== false && (!k.modelCheckedAt || now - k.modelCheckedAt > RECHECK_MS)) return refreshKeyModel(k.id).catch(() => undefined);
      if (!k.modelsFetchedAt || now - k.modelsFetchedAt > LIST_TTL_MS) return loadKeyModels(k.id).catch(() => undefined);
      return undefined;
    }),
  );
}

/** Config for a generation run; refreshes an auto-managed model if it has not been checked recently. */
export async function freshProviderConfig(
  keyId?: string,
  modelOverride?: string,
): Promise<ProviderConfig & { keyId: string; autoModel: boolean }> {
  const rec = await resolveKey(keyId);
  if (!rec) throw new Error('Belum ada API key. Tambahkan di halaman API Keys.');
  // A model picked for this set is used as-is and never switched behind the user's back.
  if (modelOverride) return { ...(await providerConfig(rec.id)), model: modelOverride, keyId: rec.id, autoModel: false };
  if (rec.autoModel !== false && (!rec.modelCheckedAt || Date.now() - rec.modelCheckedAt > RECHECK_MS)) {
    try {
      await refreshKeyModel(rec.id);
    } catch {
      // Listing can fail (network, CORS on some compatible servers); keep the current model.
    }
  }
  return { ...(await providerConfig(rec.id)), keyId: rec.id, autoModel: rec.autoModel !== false };
}
