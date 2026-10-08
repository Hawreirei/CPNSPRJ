import type { Blueprint, DifficultyChoice, Settings, Subtest } from './types';

export const TOPICS: Record<Subtest, string[]> = {
  TWK: [
    'Pancasila',
    'UUD 1945',
    'NKRI',
    'Bhinneka Tunggal Ika',
    'Nasionalisme',
    'Integritas',
    'Bela Negara',
    'Sejarah Indonesia',
    'Bahasa Indonesia',
    'Pilar Negara',
  ],
  TIU: [
    'Sinonim',
    'Antonim',
    'Analogi Verbal',
    'Pemahaman Bacaan',
    'Aritmetika',
    'Deret Angka',
    'Soal Cerita',
    'Perbandingan Kuantitatif',
    'Silogisme',
    'Penalaran Analitis',
    'Deret Figural',
    'Analogi Figural',
  ],
  TKP: [
    'Pelayanan Publik',
    'Jejaring Kerja',
    'Sosial Budaya',
    'Teknologi Informasi & Komunikasi',
    'Profesionalisme',
    'Integritas Diri',
    'Semangat Berprestasi',
    'Kreativitas & Inovasi',
    'Orientasi pada Orang Lain',
    'Pengendalian Diri',
  ],
};

/** Topics generated in-app (no AI cost, always verifiable). */
export const PROCEDURAL_TOPICS = new Set(['Deret Figural', 'Analogi Figural']);
/** Topics whose answers are checked with mathjs. */
export const NUMERIC_TOPICS = new Set(['Aritmetika', 'Deret Angka', 'Soal Cerita', 'Perbandingan Kuantitatif']);

export const SUBTEST_NAMES: Record<Subtest, string> = {
  TWK: 'Tes Wawasan Kebangsaan',
  TIU: 'Tes Intelegensia Umum',
  TKP: 'Tes Karakteristik Pribadi',
};

/** Preset reflects the commonly used SKD structure; every number is editable in Settings. */
export const DEFAULT_SETTINGS: Settings = {
  passing: { TWK: 65, TIU: 80, TKP: 166 },
  counts: { TWK: 30, TIU: 35, TKP: 45 },
  durationMinutes: 100,
  questionsPerRequest: 20,
  concurrency: 1,
  brandName: '',
  priceOverrides: {},
};

export type PresetId = 'full' | 'twk' | 'tiu' | 'tkp' | 'mini';

export const PRESETS: { id: PresetId; name: string; description: string }[] = [
  { id: 'mini', name: 'Latihan Singkat', description: '10 soal tiap bagian (TWK, TIU, TKP). Cocok untuk mencoba.' },
  { id: 'full', name: 'SKD Lengkap', description: 'Seperti ujian sungguhan: TWK, TIU, dan TKP.' },
  { id: 'twk', name: 'TWK saja', description: 'Wawasan kebangsaan: Pancasila, UUD 1945, sejarah, dll.' },
  { id: 'tiu', name: 'TIU saja', description: 'Kemampuan verbal, hitungan, logika, dan gambar.' },
  { id: 'tkp', name: 'TKP saja', description: 'Sikap dan perilaku dalam situasi kerja.' },
];

export function buildPreset(id: PresetId, settings: Settings, difficulty: DifficultyChoice = 'campuran'): Blueprint {
  const all = (s: Subtest, count: number) => ({ subtest: s, count, topics: [...TOPICS[s]], difficulty });
  const c = settings.counts;
  const sections = {
    full: [all('TWK', c.TWK), all('TIU', c.TIU), all('TKP', c.TKP)],
    mini: [all('TWK', 10), all('TIU', 10), all('TKP', 10)],
    twk: [all('TWK', c.TWK)],
    tiu: [all('TIU', c.TIU)],
    tkp: [all('TKP', c.TKP)],
  }[id];
  const total = sections.reduce((n, s) => n + s.count, 0);
  const fullTotal = c.TWK + c.TIU + c.TKP;
  const duration = id === 'full' ? settings.durationMinutes : Math.max(10, Math.round((settings.durationMinutes * total) / fullTotal));
  return { sections, durationMinutes: duration, passing: { ...settings.passing } };
}

/** Passing threshold scaled to the number of questions actually in the set (for partial sets). */
export function scaledPassing(subtest: Subtest, count: number, settings: Pick<Settings, 'passing' | 'counts'>): number {
  const full = settings.counts[subtest];
  if (!full || count === full) return settings.passing[subtest];
  return Math.round((settings.passing[subtest] * count) / full);
}
