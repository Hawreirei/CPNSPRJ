import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSettings, saveSettings } from '../db';
import { activeProfile, BUILTIN_ID, BUILTIN_PROFILE, buildPreset, DEFAULT_SETTINGS, TOPICS, topicsFor, weightsFor } from '../domain/blueprint';
import { parseProfile, PROFILE_VERSION, profileFile, textToTopics, topicsToText } from '../domain/kisi';
import { SUBTESTS } from '../domain/types';
import type { KisiProfile, Settings } from '../domain/types';
import { activateProfile, deleteProfile, importProfile, saveProfile } from '../engine/kisi';
import { planBatches, topicSequence } from '../engine/plan';

const raw = (o: Record<string, unknown> = {}) => ({
  version: 1,
  name: 'Kisi-kisi uji 2026',
  source: 'Dokumen uji',
  date: '2026-09-01',
  topics: {
    TWK: [{ name: 'Pancasila', weight: 2 }, { name: 'UUD 1945' }],
    TIU: [{ name: 'Aritmetika' }, { name: 'Deret Figural' }],
    TKP: [{ name: 'Pelayanan Publik' }],
  },
  exam: { counts: { TWK: 20, TIU: 20, TKP: 20 }, passing: { TWK: 50, TIU: 50, TKP: 80 }, durationMinutes: 60 },
  ...o,
});

describe('built-in profile', () => {
  it('offers exactly the topics and presets the app always had', () => {
    const s: Settings = { ...DEFAULT_SETTINGS };
    expect(activeProfile(s).id).toBe(BUILTIN_ID);
    for (const sub of SUBTESTS) {
      expect(topicsFor(s, sub)).toEqual(TOPICS[sub]);
      expect(weightsFor(s, sub)).toBeUndefined();
    }
    const bp = buildPreset('full', s);
    expect(bp.sections.map((x) => ({ ...x }))).toEqual(SUBTESTS.map((sub) => ({ subtest: sub, count: s.counts[sub], topics: TOPICS[sub], difficulty: 'campuran' })));
    // Even spread: topics take turns, as before profiles existed.
    const twk = planBatches(bp, 100).filter((b) => b.subtest === 'TWK').flatMap((b) => b.items.map((i) => i.topic));
    expect(twk).toEqual(Array.from({ length: s.counts.TWK }, (_, i) => TOPICS.TWK[i % TOPICS.TWK.length]));
  });

  it('is labelled as not official', () => {
    expect(BUILTIN_PROFILE.source).toMatch(/bukan kisi-kisi resmi/);
  });
});

describe('weighted spread', () => {
  it('gives each topic its share, interleaved', () => {
    const seq = topicSequence(['A', 'B', 'C'], 8, { A: 2, B: 1, C: 1 });
    expect(seq).toEqual(['A', 'B', 'C', 'A', 'B', 'C', 'A', 'A']);
    const count = (t: string) => seq.filter((x) => x === t).length;
    expect([count('A'), count('B'), count('C')]).toEqual([4, 2, 2]);
  });

  it('rounds by largest remainder and keeps the total', () => {
    const seq = topicSequence(['A', 'B', 'C'], 10, { A: 1, B: 1, C: 2 });
    expect(seq).toHaveLength(10);
    expect(seq.filter((x) => x === 'C')).toHaveLength(5);
  });

  it('falls back to taking turns when weights are equal or missing', () => {
    expect(topicSequence(['A', 'B'], 3, { A: 3, B: 3 })).toEqual(['A', 'B', 'A']);
    expect(topicSequence(['A', 'B'], 3)).toEqual(['A', 'B', 'A']);
  });

  it('applies the active profile weights to presets and plans', () => {
    const p = parseProfile(raw(), 'p1');
    const s: Settings = { ...DEFAULT_SETTINGS, kisi: { activeId: 'p1', custom: [p] } };
    const bp = buildPreset('twk', s);
    expect(bp.sections[0]).toMatchObject({ topics: ['Pancasila', 'UUD 1945'], weights: { Pancasila: 2, 'UUD 1945': 1 } });
    const topics = planBatches(bp, 100).flatMap((b) => b.items.map((i) => i.topic));
    expect(topics.filter((t) => t === 'Pancasila')).toHaveLength(Math.round((s.counts.TWK * 2) / 3));
  });
});

describe('profile files', () => {
  it('accepts a valid profile, trimming and de-duplicating topics', () => {
    const p = parseProfile(raw({ topics: { ...raw().topics, TKP: [{ name: '  Pelayanan Publik ' }, { name: 'pelayanan publik' }, { name: 'Jejaring Kerja' }] } }), 'x');
    expect(p.id).toBe('x');
    expect(p.topics.TKP.map((t) => t.name)).toEqual(['Pelayanan Publik', 'Jejaring Kerja']);
    expect(p.exam?.durationMinutes).toBe(60);
  });

  it('round-trips through the shared file', () => {
    const p = parseProfile(raw(), 'a');
    const file = JSON.parse(profileFile(p));
    expect(file).toMatchObject({ app: 'cpns-skd-builder', kind: 'kisi', version: PROFILE_VERSION });
    expect(file.id).toBeUndefined();
    expect(parseProfile(file, 'a')).toEqual(p);
  });

  it('rejects files that are not profiles, or from a newer app', () => {
    expect(() => parseProfile({ hello: 1 }, 'x')).toThrow('bukan profil kisi-kisi');
    expect(() => parseProfile(null, 'x')).toThrow('bukan profil kisi-kisi');
    expect(() => parseProfile(raw({ version: PROFILE_VERSION + 1 }), 'x')).toThrow('versi aplikasi yang lebih baru');
    expect(() => parseProfile(raw({ version: 0 }), 'x')).toThrow('tidak dikenal');
  });

  it('says what is wrong with an invalid profile', () => {
    expect(() => parseProfile(raw({ name: ' ' }), 'x')).toThrow('nama profil kosong');
    expect(() => parseProfile(raw({ topics: { ...raw().topics, TIU: [] } }), 'x')).toThrow('(topics.TIU): butuh minimal satu topik');
    expect(() => parseProfile(raw({ topics: { ...raw().topics, TWK: [{ name: 'A', weight: Number.NaN }] } }), 'x')).toThrow('bobot harus berupa angka');
    expect(() => parseProfile(raw({ topics: { ...raw().topics, TWK: [{ name: 'Deret Figural' }] } }), 'x')).toThrow('hanya bisa dipakai di TIU');
    expect(() => parseProfile(raw({ date: '1/9/2026' }), 'x')).toThrow('YYYY-MM-DD');
    expect(() =>
      parseProfile(raw({ exam: { counts: { TWK: 10, TIU: 10, TKP: 10 }, passing: { TWK: 60, TIU: 10, TKP: 10 }, durationMinutes: 30 } }), 'x'),
    ).toThrow('ambang batas TWK melebihi skor maksimal (50)');
  });

  it('reads and writes the editor text format', () => {
    const topics = textToTopics('Pancasila | 2\n\n  UUD 1945  \nNKRI | 1,5\n');
    expect(topics).toEqual([{ name: 'Pancasila', weight: 2 }, { name: 'UUD 1945' }, { name: 'NKRI', weight: 1.5 }]);
    expect(topicsToText(topics)).toBe('Pancasila | 2\nUUD 1945\nNKRI | 1.5');
  });
});

describe('managing profiles', () => {
  beforeEach(async () => {
    await db.meta.clear();
  });

  it('imports without switching, then applies topics and numbers when chosen', async () => {
    const p = await importProfile(JSON.stringify(raw()));
    let s = await getSettings();
    expect(activeProfile(s).id).toBe(BUILTIN_ID);
    expect(s.counts).toEqual(DEFAULT_SETTINGS.counts);

    await activateProfile(p.id);
    s = await getSettings();
    expect(topicsFor(s, 'TWK')).toEqual(['Pancasila', 'UUD 1945']);
    expect(s.counts).toEqual({ TWK: 20, TIU: 20, TKP: 20 });
    expect(s.durationMinutes).toBe(60);

    // Back to the built-in profile restores its numbers too.
    await activateProfile(BUILTIN_ID);
    expect((await getSettings()).counts).toEqual(DEFAULT_SETTINGS.counts);
  });

  it('rejects broken files without changing anything', async () => {
    await expect(importProfile('{ not json')).rejects.toThrow('bukan JSON');
    await expect(importProfile(JSON.stringify(raw({ topics: {} })))).rejects.toThrow('Profil tidak valid');
    expect((await getSettings()).kisi).toBeUndefined();
  });

  it('saves edits to the profile in use right away, and never the built-in one', async () => {
    const p = await importProfile(JSON.stringify(raw()));
    await activateProfile(p.id);
    const edited: KisiProfile = { ...p, exam: { ...p.exam!, durationMinutes: 75 } };
    await saveProfile(edited);
    expect((await getSettings()).durationMinutes).toBe(75);
    await expect(saveProfile({ ...BUILTIN_PROFILE })).rejects.toThrow('tidak bisa diubah');
  });

  it('falls back to the built-in topics when the profile in use is deleted, keeping the numbers', async () => {
    const p = await importProfile(JSON.stringify(raw()));
    await activateProfile(p.id);
    await saveSettings({ passing: { TWK: 40, TIU: 40, TKP: 70 } });
    await deleteProfile(p.id);
    const s = await getSettings();
    expect(activeProfile(s).id).toBe(BUILTIN_ID);
    expect(s.kisi?.custom).toEqual([]);
    expect(s.passing).toEqual({ TWK: 40, TIU: 40, TKP: 70 });
  });
});
