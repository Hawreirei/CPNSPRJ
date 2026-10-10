import { getSettings, saveSettings } from '../db';
import { BUILTIN_ID, BUILTIN_PROFILES, isBuiltinProfile } from '../domain/blueprint';
import { parseProfile } from '../domain/kisi';
import type { KisiProfile, KisiSettings, Settings } from '../domain/types';
import { uid } from '../lib/id';

const kisiOf = (s: Settings): KisiSettings => s.kisi ?? { activeId: BUILTIN_ID, custom: [] };

/** The exam numbers a profile carries replace the ones in Settings when it is put in use. */
const examPatch = (p: KisiProfile): Partial<Settings> => (p.exam ? { counts: { ...p.exam.counts }, passing: { ...p.exam.passing }, durationMinutes: p.exam.durationMinutes } : {});

/** Add or replace a learner's profile. Saving the profile in use applies its numbers right away. */
export async function saveProfile(p: KisiProfile): Promise<void> {
  if (isBuiltinProfile(p.id)) throw new Error('Profil bawaan tidak bisa diubah. Duplikat dulu.');
  const s = await getSettings();
  const k = kisiOf(s);
  const custom = k.custom.some((x) => x.id === p.id) ? k.custom.map((x) => (x.id === p.id ? p : x)) : [...k.custom, p];
  await saveSettings({ kisi: { ...k, custom }, ...(k.activeId === p.id ? examPatch(p) : {}) });
}

export async function activateProfile(id: string): Promise<void> {
  const s = await getSettings();
  const k = kisiOf(s);
  const p = [...BUILTIN_PROFILES, ...k.custom].find((x) => x.id === id);
  if (!p) throw new Error('Profil tidak ditemukan.');
  await saveSettings({ kisi: { ...k, activeId: id }, ...examPatch(p) });
}

/** Removing the profile in use falls back to the built-in topics; the exam numbers are left as they are. */
export async function deleteProfile(id: string): Promise<void> {
  if (isBuiltinProfile(id)) throw new Error('Profil bawaan tidak bisa dihapus.');
  const k = kisiOf(await getSettings());
  await saveSettings({ kisi: { activeId: k.activeId === id ? BUILTIN_ID : k.activeId, custom: k.custom.filter((x) => x.id !== id) } });
}

/** Read a shared profile file and add it, without putting it in use. */
export async function importProfile(text: string): Promise<KisiProfile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Berkas bukan JSON yang valid.');
  }
  const p = parseProfile(raw, uid());
  await saveProfile(p);
  return p;
}
