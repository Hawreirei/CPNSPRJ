import { attemptMode } from './practice';
import type { Attempt, Flag, FlagKind, Question, QuestionReport, ReportReason } from './types';
import { isGraded } from './examPackage';

/** Flags left by a second model's opinion (engine/crosscheck.ts); re-checking stored answers keeps them. */
export const CROSS_CHECK_KINDS = new Set<FlagKind>(['cross-check-mismatch', 'cross-checked', 'cross-check-pending']);

export const REPORT_REASONS: Record<ReportReason, string> = {
  'kunci-salah': 'Kunci jawaban salah',
  ambigu: 'Ambigu (lebih dari satu jawaban benar)',
  usang: 'Usang atau tidak sesuai aturan terbaru',
  typo: 'Salah ketik atau tampilan rusak',
  lainnya: 'Lainnya',
};

/** The "needs checking" flag that stands for a report, so every list and count that looks at flags sees it. */
export function reportFlag(r: QuestionReport): Flag {
  const note = r.note?.trim();
  return { kind: 'user-report', severity: 'warn', message: `Dilaporkan: ${REPORT_REASONS[r.reason].toLowerCase()}${note ? `. "${note}"` : '.'}` };
}

export function withReportFlag(flags: Flag[], report: QuestionReport | undefined): Flag[] {
  const rest = flags.filter((f) => f.kind !== 'user-report');
  return report ? [...rest, reportFlag(report)] : rest;
}

export const isReported = (q: Pick<Question, 'report'>) => !!q.report;

/** Ratings at or below this are picked after everything else when building a set from the bank. */
export const LOW_RATING = 2;

/** Lower comes first when picking from the bank: 0 normal, 1 rated low, 2 reported. */
export function bankPriority(q: Pick<Question, 'report' | 'rating'>): number {
  if (q.report) return 2;
  return q.rating !== undefined && q.rating <= LOW_RATING ? 1 : 0;
}

/** Fewer answers than this say more about luck than about the question. */
export const MIN_CALIBRATION_ANSWERS = 5;

export interface AnswerStats {
  answered: number;
  wrong: number;
}

/**
 * How often each TWK/TIU question was answered wrong across the learner's attempts: finished
 * exams, and practice (whose answers are final as soon as they're given). Blank answers are left
 * out, as elsewhere in the analytics. TKP has no wrong answer, only weaker ones, so it is skipped.
 */
export function answerStats(attempts: Attempt[], questions: Question[]): Map<string, AnswerStats> {
  const keyed = new Map(questions.filter((q) => !isGraded(q.subtest) && q.answer).map((q) => [q.id, q.answer]));
  const out = new Map<string, AnswerStats>();
  for (const a of attempts) {
    if (!a.result && attemptMode(a) !== 'practice') continue;
    for (const [id, ans] of Object.entries(a.answers)) {
      const key = keyed.get(id);
      if (!key || !ans) continue;
      const s = out.get(id) ?? { answered: 0, wrong: 0 };
      s.answered++;
      if (ans !== key) s.wrong++;
      out.set(id, s);
    }
  }
  return out;
}

/** Share answered wrong, or null until there are enough answers to mean something. */
export function wrongRate(s: AnswerStats | undefined): number | null {
  return s && s.answered >= MIN_CALIBRATION_ANSWERS ? s.wrong / s.answered : null;
}
