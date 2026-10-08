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
}

export interface ExamPackage {
  id: string;
  name: string;
  /** Where the numbers come from, in a few words. */
  source: string;
  /** The official document the numbers come from. Without it the package is shown as "bukan data resmi". */
  official?: { title: string; date: string; url?: string };
  /** Imported packages: length of the full exam. */
  durationMinutes?: number;
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

/** Every package the app knows, in display order; SKD CPNS first. */
const PACKAGES: ExamPackage[] = [];
const SPECS = new Map<Subtest, { spec: SubtestSpec; pkg: ExamPackage; order: number }>();

/** Add a package. Sub-test ids must be new: a question's sub-test alone decides how it is scored. */
export function registerPackage(pkg: ExamPackage) {
  const taken = pkg.subtests.find((s) => SPECS.has(s.id));
  if (taken) throw new Error(`Sub-tes "${taken.id}" sudah dipakai paket lain.`);
  PACKAGES.push(pkg);
  for (const spec of pkg.subtests) SPECS.set(spec.id, { spec, pkg, order: SPECS.size });
}
registerPackage(SKD_CPNS);

export const packages = (): readonly ExamPackage[] => PACKAGES;

export const isBuiltIn = (pkg: Pick<ExamPackage, 'id'>) => pkg.id === SKD_CPNS.id;

/**
 * Make the registry match the learner's imported packages (kept in Settings). Called whenever
 * Settings are read, so scoring always knows them. A package whose sub-test ids clash is skipped.
 */
export function setCustomPackages(list: readonly ExamPackage[] = []) {
  for (const pkg of PACKAGES.splice(1)) for (const spec of pkg.subtests) SPECS.delete(spec.id);
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
