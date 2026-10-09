import type { OptionLabel, Question, QuestionOption, Subtest } from './types';

/**
 * Exam packages (#37): an exam's sub-tests and how each is scored, as data rather than as
 * `subtest === 'TKP'` checks spread through the code.
 *
 * Stage 1 (this module): SKD CPNS is the only package and `Subtest` is still the fixed union, so
 * behaviour is exactly as before. Code asks a sub-test's scoring rule instead of naming TKP.
 * Later stages (docs/paket-ujian.md) turn sub-tests into ids from the active package, so another
 * exam (PPPK first) can be added from its official document without touching scoring code.
 */

/**
 * `keyed`: one correct option worth `correct` points, everything else 0 (SKD TWK and TIU).
 * `graded`: every option has its own score from `min` to `max`; no option is "wrong" (SKD TKP).
 */
export type ScoringRule = { kind: 'keyed'; correct: number } | { kind: 'graded'; min: number; max: number };

export interface SubtestSpec {
  id: Subtest;
  name: string;
  scoring: ScoringRule;
  /** Imported packages: questions in the full exam. SKD takes its numbers from Settings instead. */
  count?: number;
  /** Pass mark for the full exam; absent when the exam is decided by ranking. */
  passing?: number;
  /** Topics to write questions on. */
  topics?: string[];
  /** Questions are about the job the learner names (PPPK technical competence), not a topic list. */
  fromJobTitle?: boolean;
  /** What the sub-test measures, in the source document's words; given to the model with the topics. */
  guide?: string;
}

export interface ExamPackage {
  id: string;
  name: string;
  /** Where the numbers come from, in a few words. */
  source: string;
  /** The official document the numbers come from. Without it the package is shown as "bukan data resmi". */
  official?: { title: string; date: string; url?: string };
  /** Length of the full exam (SKD: from Settings). */
  durationMinutes?: number;
  /** Exceptions and details the numbers cannot express, shown when the package is picked. */
  notes?: string[];
  subtests: SubtestSpec[];
}

/** SKD CPNS as the app has always scored it. Its numbers live in Settings and the syllabus profile. */
export const SKD_CPNS: ExamPackage = {
  id: 'skd-cpns',
  name: 'SKD CPNS',
  source: 'Bawaan aplikasi',
  subtests: [
    { id: 'TWK', name: 'Tes Wawasan Kebangsaan', scoring: { kind: 'keyed', correct: 5 } },
    { id: 'TIU', name: 'Tes Intelegensia Umum', scoring: { kind: 'keyed', correct: 5 } },
    { id: 'TKP', name: 'Tes Karakteristik Pribadi', scoring: { kind: 'graded', min: 1, max: 5 } },
  ],
};

/**
 * PPPK 2024, from Keputusan MenPAN-RB Nomor 347 Tahun 2024 (19 Agustus 2024). Every number below
 * cites its diktum. There is no pass mark: applicants pass by ranking (Diktum KEDUA PULUH SEMBILAN).
 */
export const PPPK_2024: ExamPackage = {
  id: 'pppk-2024',
  name: 'PPPK 2024',
  source: 'Keputusan MenPAN-RB Nomor 347 Tahun 2024',
  official: {
    title: 'Keputusan Menteri PANRB Nomor 347 Tahun 2024 tentang Mekanisme Seleksi PPPK Tahun Anggaran 2024',
    date: '2024-08-19',
    url: 'https://jdih.menpan.go.id',
  },
  // Diktum KETUJUH BELAS (120 minutes for the three competences) and KEDELAPAN BELAS (10 for the
  // interview), taken here as one sitting.
  durationMinutes: 130,
  notes: [
    'Waktu resmi: 120 menit untuk kompetensi teknis, manajerial, dan sosial kultural, ditambah 10 menit wawancara (Diktum KETUJUH BELAS dan KEDELAPAN BELAS). Di aplikasi digabung menjadi satu sesi 130 menit.',
    'Pelamar disabilitas sensorik netra: 150 menit dan 15 menit (Diktum KEDUA PULUH dan KEDUA PULUH SATU).',
    'Jabatan Pengelola Umum Operasional: kompetensi teknis 45 soal, nilai tertinggi 445 (Diktum KEDUA PULUH TUJUH dan KEDUA PULUH DELAPAN). Ubah jumlah soal teknis di "Sesuaikan lebih lanjut".',
    'Tidak ada ambang batas: pelamar lulus bila berperingkat terbaik (Diktum KEDUA PULUH SEMBILAN).',
  ],
  subtests: [
    {
      id: 'PPPK-TEKNIS',
      name: 'Kompetensi Teknis',
      scoring: { kind: 'keyed', correct: 5 }, // Diktum KEDUA PULUH TIGA huruf a
      count: 90, // Diktum KEDUA PULUH DUA huruf a
      fromJobTitle: true,
      guide: 'Menilai penguasaan pengetahuan, keterampilan, dan sikap/perilaku yang dapat diamati, diukur, dan dikembangkan, yang spesifik berkaitan dengan bidang teknis jabatan.',
    },
    {
      id: 'PPPK-MANAJERIAL',
      name: 'Kompetensi Manajerial',
      scoring: { kind: 'graded', min: 1, max: 4 }, // Diktum KEDUA PULUH TIGA huruf b
      count: 25, // Diktum KEDUA PULUH DUA huruf b
      topics: [
        'Integritas',
        'Kerja Sama',
        'Komunikasi',
        'Orientasi pada Hasil',
        'Pelayanan Publik',
        'Pengembangan Diri dan Orang Lain',
        'Mengelola Perubahan',
        'Pengambilan Keputusan',
      ],
      guide: 'Menilai komitmen, kemampuan, dan perilaku individu dalam berorganisasi yang dapat diamati dan diukur.',
    },
    {
      id: 'PPPK-SOSKUL',
      name: 'Kompetensi Sosial Kultural',
      scoring: { kind: 'graded', min: 1, max: 4 }, // Diktum KEDUA PULUH TIGA huruf b
      count: 20, // Diktum KEDUA PULUH DUA huruf c
      topics: ['Kepekaan terhadap Keberagaman', 'Kemampuan Berhubungan Sosial', 'Kepekaan terhadap Pentingnya Persatuan', 'Empati'],
      guide:
        'Menilai pengetahuan dan sikap terkait pengalaman berinteraksi dengan masyarakat majemuk (agama, suku dan budaya, perilaku, wawasan kebangsaan, etika, nilai, moral, emosi, dan prinsip), sebagai perekat bangsa.',
    },
    {
      id: 'PPPK-WAWANCARA',
      name: 'Wawancara',
      scoring: { kind: 'graded', min: 1, max: 4 }, // Diktum KEDUA PULUH TIGA huruf b
      count: 10, // Diktum KEDUA PULUH DUA huruf d
      topics: ['Kejujuran', 'Komitmen', 'Keadilan', 'Etika', 'Kepatuhan'],
      guide: 'Wawancara berbasis komputer yang menggali informasi nonkognitif untuk menilai integritas dan moralitas.',
    },
  ],
};

/** Every package the app knows, in display order: the built-in ones first. */
const PACKAGES: ExamPackage[] = [];
const SPECS = new Map<Subtest, { spec: SubtestSpec; pkg: ExamPackage; order: number }>();

/** Add a package. Sub-test ids must be new: a question's sub-test alone decides how it is scored. */
export function registerPackage(pkg: ExamPackage) {
  const taken = pkg.subtests.find((s) => SPECS.has(s.id));
  if (taken) throw new Error(`Sub-tes "${taken.id}" sudah dipakai paket lain.`);
  PACKAGES.push(pkg);
  for (const spec of pkg.subtests) SPECS.set(spec.id, { spec, pkg, order: SPECS.size });
}
const BUILT_IN = [SKD_CPNS, PPPK_2024];
for (const pkg of BUILT_IN) registerPackage(pkg);

export const packages = (): readonly ExamPackage[] => PACKAGES;

/** SKD CPNS: its numbers and topics come from Settings and the syllabus profile, not the package. */
export const isSkd = (pkg: Pick<ExamPackage, 'id'>) => pkg.id === SKD_CPNS.id;

/** Shipped with the app: cannot be removed or replaced by an imported file. */
export const isBuiltIn = (pkg: Pick<ExamPackage, 'id'>) => BUILT_IN.some((p) => p.id === pkg.id);

/**
 * Make the registry match the learner's imported packages (kept in Settings). Called whenever
 * Settings are read, so scoring always knows them. A package whose sub-test ids clash is skipped.
 */
export function setCustomPackages(list: readonly ExamPackage[] = []) {
  for (const pkg of PACKAGES.splice(BUILT_IN.length)) for (const spec of pkg.subtests) SPECS.delete(spec.id);
  for (const pkg of list) {
    try {
      registerPackage(pkg);
    } catch {
      // Kept in Settings, but not usable until the clash is resolved.
    }
  }
}

/** A sub-test's spec. Unknown ids (data from a newer version) are scored like a keyed sub-test, not dropped. */
export function specOf(subtest: Subtest): SubtestSpec {
  return SPECS.get(subtest)?.spec ?? { id: subtest, name: subtest, scoring: { kind: 'keyed', correct: 5 } };
}

/** The package a sub-test belongs to; SKD CPNS for unknown ids. */
export const packageOf = (subtest: Subtest): ExamPackage => SPECS.get(subtest)?.pkg ?? SKD_CPNS;

/** Position of a sub-test in exam order across all packages; unknown ids last. */
export const examRank = (s: Subtest) => SPECS.get(s)?.order ?? Number.MAX_SAFE_INTEGER;

/** Sub-tests in package order (SKD: TWK, TIU, TKP), unknown ones last, each once. */
export function inExamOrder(subtests: Iterable<Subtest>): Subtest[] {
  return [...new Set(subtests)].sort((a, b) => examRank(a) - examRank(b) || a.localeCompare(b));
}

/** The sub-tests among `items`, in exam order. */
export const subtestsIn = (items: readonly { subtest: Subtest }[]): Subtest[] => inExamOrder(items.map((x) => x.subtest));

/** Questions sorted by sub-test in exam order; order within a sub-test is kept. */
export function inSubtestOrder<T extends { subtest: Subtest }>(items: readonly T[]): T[] {
  const order = subtestsIn(items);
  return [...items].sort((a, b) => order.indexOf(a.subtest) - order.indexOf(b.subtest));
}

/**
 * How the given sub-tests are scored, in one line for printed sets, e.g. for SKD:
 * "TWK & TIU: jawaban benar bernilai 5, salah atau kosong 0. TKP: setiap opsi bernilai 1–5."
 */
export function scoringRulesText(subtests: readonly Subtest[], short = false): string {
  const groups = new Map<string, Subtest[]>();
  for (const s of inExamOrder(subtests)) {
    const r = scoringOf(s);
    const text =
      r.kind === 'keyed'
        ? short
          ? `benar ${r.correct}, salah/kosong 0`
          : `jawaban benar bernilai ${r.correct}, salah atau kosong 0`
        : short
          ? `tiap opsi ${r.min}–${r.max}`
          : `setiap opsi bernilai ${r.min}–${r.max}`;
    groups.set(text, [...(groups.get(text) ?? []), s]);
  }
  return [...groups].map(([text, ids]) => `${ids.join(' & ')}: ${text}.`).join(' ');
}

export function scoringOf(subtest: Subtest): ScoringRule {
  return specOf(subtest).scoring;
}

/** Every option scores (TKP): there is a best option, but no wrong one. */
export const isGraded = (subtest: Subtest) => scoringOf(subtest).kind === 'graded';

/** Most points one question of this sub-test can earn. */
export function maxPerQuestion(subtest: Subtest): number {
  const r = scoringOf(subtest);
  return r.kind === 'keyed' ? r.correct : r.max;
}

/** Whether `option` earns the question's top score: the key, or a graded sub-test's best option. */
export const isTopOption = (q: Pick<Question, 'subtest'>, option: Pick<QuestionOption, 'score'> | undefined) => !!option && option.score === maxPerQuestion(q.subtest);

/** Options that earn the top score: the key for a keyed sub-test, every best option for a graded one. */
export function topOptions(q: Pick<Question, 'subtest' | 'options' | 'answer'>): OptionLabel[] {
  if (isGraded(q.subtest)) return q.options.filter((o) => isTopOption(q, o)).map((o) => o.label);
  return q.answer ? [q.answer] : [];
}

/** Score a keyed option gets: the full mark for the key, nothing for the rest. */
export function keyedScore(subtest: Subtest, isKey: boolean): number {
  const r = scoringOf(subtest);
  return r.kind === 'keyed' && isKey ? r.correct : 0;
}

/** A graded score clamped to the sub-test's range. */
export function clampGraded(subtest: Subtest, score: number): number {
  const r = scoringOf(subtest);
  return r.kind === 'graded' ? Math.max(r.min, Math.min(r.max, Math.round(score))) : score;
}
