import { SUBTESTS } from './types';
import type { Blueprint, Difficulty, DifficultyChoice, ExamNumbers, KisiProfile, KisiTopic, Settings, Subtest } from './types';
import { isSkd, packageOf, SKD_CPNS, specOf, type ExamPackage } from './examPackage';

export const TOPICS: Record<Subtest, string[]> = {
  TWK: ['Pancasila', 'UUD 1945', 'NKRI', 'Bhinneka Tunggal Ika', 'Nasionalisme', 'Integritas', 'Bela Negara', 'Sejarah Indonesia', 'Bahasa Indonesia', 'Pilar Negara'],
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
    'Matriks Figural',
    'Transformasi Figural',
    'Figural Berbeda',
    'Analisis Data',
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

/** Topics generated in-app (no AI cost, always verifiable): figural, and data analysis from tables and charts. */
export const PROCEDURAL_TOPICS = new Set(['Deret Figural', 'Analogi Figural', 'Matriks Figural', 'Transformasi Figural', 'Figural Berbeda', 'Analisis Data']);
/** Reading comprehension: two or more of these in a section are written as passages with several questions each. */
export const PASSAGE_TOPIC = 'Pemahaman Bacaan';
/** Topics whose answers are checked with mathjs. */
export const NUMERIC_TOPICS = new Set(['Aritmetika', 'Deret Angka', 'Soal Cerita', 'Perbandingan Kuantitatif']);

export const SUBTEST_NAMES = Object.fromEntries(SKD_CPNS.subtests.map((s) => [s.id, s.name])) as Record<Subtest, string>;

/** Preset reflects the commonly used SKD structure; every number is editable in Settings. */
export const DEFAULT_SETTINGS: Settings = {
  passing: { TWK: 65, TIU: 80, TKP: 166 },
  counts: { TWK: 30, TIU: 35, TKP: 45 },
  durationMinutes: 100,
  questionsPerRequest: 20,
  concurrency: 1,
  reviewDailyLimit: 20,
  brandName: '',
  priceOverrides: {},
};

/* ------------------------------------------------------- syllabus profiles */

export const BUILTIN_ID = 'bawaan';

/** The topics the app has always used. Not an official syllabus, and labelled as such. */
export const BUILTIN_PROFILE: KisiProfile = {
  version: 1,
  id: BUILTIN_ID,
  name: 'Bawaan aplikasi',
  source: 'Bawaan aplikasi, bukan kisi-kisi resmi',
  topics: Object.fromEntries(SUBTESTS.map((s) => [s, TOPICS[s].map((name) => ({ name }))])) as Record<Subtest, KisiTopic[]>,
  exam: { counts: DEFAULT_SETTINGS.counts, passing: DEFAULT_SETTINGS.passing, durationMinutes: DEFAULT_SETTINGS.durationMinutes },
};

export function allProfiles(settings: Pick<Settings, 'kisi'>): KisiProfile[] {
  return [BUILTIN_PROFILE, ...(settings.kisi?.custom ?? [])];
}

export function activeProfile(settings: Pick<Settings, 'kisi'>): KisiProfile {
  const id = settings.kisi?.activeId;
  return settings.kisi?.custom.find((p) => p.id === id) ?? BUILTIN_PROFILE;
}

/** Topics offered for new questions in a sub-test. Existing questions may carry others; they stay valid. */
export function topicsFor(settings: Pick<Settings, 'kisi'>, s: Subtest): string[] {
  // Syllabus profiles are about SKD; other packages carry their topics in the package file.
  if (!isSkd(packageOf(s))) return specOf(s).topics ?? [];
  return activeProfile(settings).topics[s]?.map((t) => t.name) ?? [];
}

/** Per-topic shares, or undefined when the profile spreads questions evenly. */
export function weightsFor(settings: Pick<Settings, 'kisi'>, s: Subtest): Record<string, number> | undefined {
  const topics = isSkd(packageOf(s)) ? activeProfile(settings).topics[s] : undefined;
  if (!topics || topics.every((t) => (t.weight ?? 1) === 1)) return undefined;
  return Object.fromEntries(topics.map((t) => [t.name, t.weight ?? 1]));
}

export const examNumbersOf = (s: Pick<Settings, 'counts' | 'passing' | 'durationMinutes'>): ExamNumbers => ({
  counts: { ...s.counts },
  passing: { ...s.passing },
  durationMinutes: s.durationMinutes,
});

/** One step easier, for "similar but easier" questions. */
export const easier = (d: Difficulty): Difficulty => (d === 'sulit' ? 'sedang' : 'mudah');

export type PresetId = 'full' | 'twk' | 'tiu' | 'tkp' | 'mini';

export const PRESETS: { id: PresetId; name: string; description: string }[] = [
  { id: 'mini', name: 'Latihan Singkat', description: '10 soal tiap bagian (TWK, TIU, TKP). Cocok untuk mencoba.' },
  { id: 'full', name: 'SKD Lengkap', description: 'Seperti ujian sungguhan: TWK, TIU, dan TKP.' },
  { id: 'twk', name: 'TWK saja', description: 'Wawasan kebangsaan: Pancasila, UUD 1945, sejarah, dll.' },
  { id: 'tiu', name: 'TIU saja', description: 'Kemampuan verbal, hitungan, logika, dan gambar.' },
  { id: 'tkp', name: 'TKP saja', description: 'Sikap dan perilaku dalam situasi kerja.' },
];

export function buildPreset(id: PresetId, settings: Settings, difficulty: DifficultyChoice = 'campuran'): Blueprint {
  const all = (s: Subtest, count: number) => {
    const weights = weightsFor(settings, s);
    return { subtest: s, count, topics: topicsFor(settings, s), difficulty, ...(weights ? { weights } : {}) };
  };
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

/**
 * A set for an imported exam package: "mini" takes up to 10 questions per sub-test, "full" the
 * package's numbers. Sub-tests about the learner's job get that job title as their one topic.
 */
export function buildPackagePreset(pkg: ExamPackage, size: 'mini' | 'full', difficulty: DifficultyChoice = 'campuran', jobTitle = ''): Blueprint {
  const job = jobTitle.trim();
  const sections = pkg.subtests.map((s) => ({
    subtest: s.id,
    count: size === 'full' ? (s.count ?? 10) : Math.min(10, s.count ?? 10),
    topics: s.fromJobTitle ? (job ? [job] : []) : [...(s.topics ?? [])],
    difficulty,
  }));
  const total = sections.reduce((n, s) => n + s.count, 0);
  const fullTotal = pkg.subtests.reduce((n, s) => n + (s.count ?? 10), 0);
  const fullMinutes = pkg.durationMinutes ?? fullTotal;
  return {
    sections,
    durationMinutes: size === 'full' ? fullMinutes : Math.max(10, Math.round((fullMinutes * total) / fullTotal)),
    passing: Object.fromEntries(pkg.subtests.filter((s) => s.passing !== undefined).map((s) => [s.id, s.passing!])),
  };
}

/** A sub-test in its full exam: SKD takes its numbers from Settings, other packages from their file. */
export function fullExam(subtest: Subtest, settings: Pick<Settings, 'counts' | 'passing'>): { count: number; passing?: number } {
  if (isSkd(packageOf(subtest))) return { count: settings.counts[subtest] ?? 0, passing: settings.passing[subtest] };
  const spec = specOf(subtest);
  return { count: spec.count ?? 0, passing: spec.passing };
}

/** A package's full exam: total questions and minutes. */
export function fullExamOf(pkg: ExamPackage, settings: Pick<Settings, 'counts' | 'durationMinutes'>): { total: number; durationMinutes: number } {
  if (isSkd(pkg)) return { total: SUBTESTS.reduce((n, s) => n + settings.counts[s], 0), durationMinutes: settings.durationMinutes };
  return { total: pkg.subtests.reduce((n, s) => n + (s.count ?? 0), 0), durationMinutes: pkg.durationMinutes ?? 0 };
}

/** A pass mark scaled to the questions actually in a set (partial sets); none stays none. */
export function scaledPassing(passing: number | undefined, count: number, fullCount: number): number | undefined {
  if (passing === undefined || !fullCount || count === fullCount) return passing;
  return Math.round((passing * count) / fullCount);
}
