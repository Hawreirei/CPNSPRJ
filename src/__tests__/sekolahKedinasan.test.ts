import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEKOLAH_KEDINASAN_2026 } from '../data/kisiSekolahKedinasan2026';
import { db, getSettings } from '../db';
import { activeProfile, allProfiles, BUILTIN_ID, DEFAULT_SETTINGS, isBuiltinProfile, NUMERIC_TOPICS, PROCEDURAL_TOPICS, TOPICS, topicsFor } from '../domain/blueprint';
import { hasKamus } from '../domain/kamus';
import { parseProfile, profileFile } from '../domain/kisi';
import type { Settings } from '../domain/types';
import { activateProfile, deleteProfile, importProfile, saveProfile } from '../engine/kisi';

const P = SEKOLAH_KEDINASAN_2026;

describe('SKD Sekolah Kedinasan 2026 (Keputusan MenPAN-RB Nomor 406 Tahun 2026)', () => {
  it('carries the decree’s numbers, source and date', () => {
    expect(P.source).toBe('Keputusan MenPAN-RB Nomor 406 Tahun 2026');
    expect(P.date).toBe('2026-07-27');
    // Diktum KEEMPAT, KETIGA, KEDELAPAN.
    expect(P.exam).toEqual({ counts: { TWK: 30, TIU: 35, TKP: 45 }, passing: { TWK: 65, TIU: 80, TKP: 156 }, durationMinutes: 100 });
    // Diktum KEENAM: the highest scores follow from the counts at 5 points a question.
    const max = { TWK: P.exam!.counts.TWK * 5, TIU: P.exam!.counts.TIU * 5, TKP: P.exam!.counts.TKP * 5 };
    expect(max).toEqual({ TWK: 150, TIU: 175, TKP: 225 });
    expect(max.TWK + max.TIU + max.TKP).toBe(550);
    // Diktum KESEMBILAN and KESEPULUH, which no per-sub-test number can express.
    expect(P.notes?.[0]).toMatch(/kumulatif SKD paling rendah 281 dan nilai TIU paling rendah 55/);
  });

  it('lists the sub-materials of Diktum KEDUA, under the names the app checks and draws', () => {
    expect(P.topics.TWK.map((t) => t.name)).toEqual(['Nasionalisme', 'Integritas', 'Bela Negara', 'Pilar Negara', 'Bahasa Negara']);
    expect(P.topics.TKP.map((t) => t.name)).toEqual([
      'Pelayanan Publik',
      'Jejaring Kerja',
      'Sosial Budaya',
      'Teknologi Informasi & Komunikasi',
      'Profesionalisme',
      'Anti Radikalisme',
    ]);
    const tiu = P.topics.TIU.map((t) => t.name);
    expect(tiu).toHaveLength(10);
    // Every TIU topic is one the app already knows, so numeric answers are recomputed and figural ones drawn.
    for (const t of tiu) expect(TOPICS.TIU).toContain(t);
    expect(tiu.filter((t) => NUMERIC_TOPICS.has(t))).toEqual(['Aritmetika', 'Deret Angka', 'Perbandingan Kuantitatif', 'Soal Cerita']);
    expect(tiu.filter((t) => PROCEDURAL_TOPICS.has(t))).toEqual(['Analogi Figural', 'Figural Berbeda', 'Deret Figural']);
    expect(tiu.filter((t) => hasKamus('TIU', t))).toHaveLength(5);
    // Spread evenly: the decree gives no weights.
    for (const s of ['TWK', 'TIU', 'TKP'] as const) expect(P.topics[s].every((t) => t.weight === undefined)).toBe(true);
  });

  it('is a valid profile, and survives export and import with its notes', () => {
    const { id: _id, ...rest } = P;
    expect(parseProfile(rest, P.id)).toEqual(P);
    expect(parseProfile(JSON.parse(profileFile(P)), 'x')).toEqual({ ...P, id: 'x' });
  });
});

describe('built-in profiles from official documents', () => {
  beforeEach(async () => {
    await db.meta.clear();
  });

  it('are offered after the app’s own topics, before the learner’s', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, kisi: { activeId: BUILTIN_ID, custom: [{ ...P, id: 'mine', name: 'Punyaku' }] } };
    expect(allProfiles(s).map((p) => p.id)).toEqual([BUILTIN_ID, P.id, 'mine']);
    expect(isBuiltinProfile(P.id)).toBe(true);
    expect(isBuiltinProfile('mine')).toBe(false);
  });

  it('apply their numbers and topics when chosen, and cannot be edited or removed', async () => {
    await activateProfile(P.id);
    const s = await getSettings();
    expect(activeProfile(s).id).toBe(P.id);
    expect({ counts: s.counts, passing: s.passing, durationMinutes: s.durationMinutes }).toEqual(P.exam);
    expect(topicsFor(s, 'TKP')).toContain('Anti Radikalisme');

    await expect(saveProfile({ ...P, name: 'Diubah' })).rejects.toThrow(/tidak bisa diubah/);
    await expect(deleteProfile(P.id)).rejects.toThrow(/tidak bisa dihapus/);
    expect(activeProfile(await getSettings()).name).toBe('SKD Sekolah Kedinasan 2026');

    // Back to the app's own profile: its numbers come back too.
    await activateProfile(BUILTIN_ID);
    expect((await getSettings()).passing).toEqual(DEFAULT_SETTINGS.passing);
  });

  it('imported, become the learner’s own copy under a new id', async () => {
    const copy = await importProfile(profileFile(P));
    expect(copy.id).not.toBe(P.id);
    expect(copy.notes).toEqual(P.notes);
    expect(isBuiltinProfile(copy.id)).toBe(false);
  });
});

describe('profile notes', () => {
  const base = { version: 1, name: 'Uji', topics: { TWK: [{ name: 'A' }], TIU: [{ name: 'B' }], TKP: [{ name: 'C' }] } };

  it('are optional, trimmed, and limited', () => {
    expect(parseProfile(base, 'a').notes).toBeUndefined();
    expect(parseProfile({ ...base, notes: [] }, 'a').notes).toBeUndefined();
    expect(parseProfile({ ...base, notes: ['  Catatan  '] }, 'a').notes).toEqual(['Catatan']);
    expect(() => parseProfile({ ...base, notes: Array(6).fill('x') }, 'a')).toThrow(/paling banyak 5 catatan/);
    expect(() => parseProfile({ ...base, notes: ['x'.repeat(401)] }, 'a')).toThrow(/lebih dari 400 karakter/);
  });
});
