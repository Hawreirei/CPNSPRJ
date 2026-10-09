import { attemptMode } from '../domain/practice';
import { isCorrect, MAX_PER_QUESTION, scoreQuestion } from '../domain/scoring';
import { REASON_TAGS, SUBTESTS } from '../domain/types';
import type { Attempt, OptionLabel, Question, ReasonTag, ReviewItem, Subtest, SubtestResult } from '../domain/types';
import { isGraded } from '../domain/examPackage';

/**
 * Explains a score instead of only reporting it: where the time went, whether "unsure" marks
 * were right, likely guesses, TKP habits, recurring reasons, and the trend across exams.
 * Pure functions over data the app already stores; no AI. Thresholds are constants so they
 * can be tuned in one place.
 */

/** A question taking more than this multiple of its sub-test's average time counts as slow. */
export const SLOW_FACTOR = 2;
/** A correct answer under this fraction of the sub-test's average (and under FAST_MAX_MS) may be a guess. */
export const FAST_FACTOR = 0.35;
export const FAST_MAX_MS = 20_000;
/** Timed questions needed in a sub-test before "slow" and "fast" mean anything. */
export const MIN_TIMED = 5;
/** Answered questions needed on each side (marked unsure / not) before comparing them. */
export const MIN_FLAGGED = 3;
/** Exams needed before projecting the next score. Two points always fit a line exactly. */
export const MIN_EXAMS_FOR_PROJECTION = 3;
/** Share of the time spent on questions that ended up wrong before it is worth pointing out. */
export const WASTED_SHARE = 0.2;
export const WASTED_MIN_MS = 60_000;
/**
 * A topic needs this many answered questions, and this share of them wrong, to be named in a
 * recommendation. Small sets have one question per topic, so the sub-test is used instead
 * once it has WEAK_MIN_SUBTEST answers.
 */
export const WEAK_MIN_QUESTIONS = 2;
export const WEAK_MIN_SUBTEST = 3;
export const WEAK_WRONG_RATE = 0.5;
/** TKP: share of answers below the top option worth pointing out, once enough are answered. */
export const TKP_MISSED_SHARE = 0.4;
export const TKP_MIN_ANSWERED = 3;

interface Row {
  q: Question;
  index: number;
  answer?: OptionLabel;
  ms: number;
  correct: boolean;
  flagged: boolean;
}

function rows(a: Pick<Attempt, 'answers' | 'flagged' | 'timeSpent'>, questions: Question[]): Row[] {
  const unsure = new Set(a.flagged);
  return questions.map((q, index) => ({
    q,
    index,
    answer: a.answers[q.id],
    ms: a.timeSpent[q.id] ?? 0,
    correct: isCorrect(q, a.answers[q.id]),
    flagged: unsure.has(q.id),
  }));
}

export interface QuestionRef {
  questionId: string;
  /** 0-based position in the attempt. */
  index: number;
  topic: string;
  ms: number;
}

export interface SubtestTiming {
  subtest: Subtest;
  /** Questions with any recorded time. */
  timed: number;
  avgMs: number;
  totalMs: number;
  /** Time on TWK/TIU questions that ended wrong or empty. TKP has no wrong answers, so 0. */
  wastedMs: number;
  /** Slowest first; empty until MIN_TIMED questions are timed. */
  slow: QuestionRef[];
}

const ref = (r: Row): QuestionRef => ({ questionId: r.q.id, index: r.index, topic: r.q.topic, ms: r.ms });

export function timing(a: Pick<Attempt, 'answers' | 'flagged' | 'timeSpent'>, questions: Question[]): SubtestTiming[] {
  const all = rows(a, questions);
  return SUBTESTS.flatMap((s) => {
    const timed = all.filter((r) => r.q.subtest === s && r.ms > 0);
    if (!timed.length) return [];
    const totalMs = timed.reduce((n, r) => n + r.ms, 0);
    const avgMs = totalMs / timed.length;
    const wastedMs = isGraded(s) ? 0 : timed.filter((r) => !r.correct).reduce((n, r) => n + r.ms, 0);
    const slow =
      timed.length >= MIN_TIMED
        ? timed
            .filter((r) => r.ms > avgMs * SLOW_FACTOR)
            .sort((x, y) => y.ms - x.ms)
            .map(ref)
        : [];
    return [{ subtest: s, timed: timed.length, avgMs, totalMs, wastedMs, slow }];
  });
}

export interface TopicStat {
  subtest: Subtest;
  topic: string;
  total: number;
  /** Wrong or empty (TKP: not the top option). */
  wrong: number;
  answered: number;
  /** Answered but wrong (TKP: not the top option). */
  answeredWrong: number;
  /** Average over timed questions; 0 when none were timed. */
  avgMs: number;
}

export function topicStats(a: Pick<Attempt, 'answers' | 'flagged' | 'timeSpent'>, questions: Question[]): TopicStat[] {
  const map = new Map<string, TopicStat & { timed: number; ms: number }>();
  for (const r of rows(a, questions)) {
    const k = `${r.q.subtest}|${r.q.topic}`;
    const t = map.get(k) ?? { subtest: r.q.subtest, topic: r.q.topic, total: 0, wrong: 0, answered: 0, answeredWrong: 0, avgMs: 0, timed: 0, ms: 0 };
    t.total++;
    if (!r.correct) t.wrong++;
    if (r.answer) {
      t.answered++;
      if (!r.correct) t.answeredWrong++;
    }
    if (r.ms > 0) {
      t.timed++;
      t.ms += r.ms;
    }
    map.set(k, t);
  }
  return [...map.values()].map(({ timed, ms, ...t }) => ({ ...t, avgMs: timed ? ms / timed : 0 }));
}

export interface Calibration {
  flagged: number;
  flaggedCorrect: number;
  unflagged: number;
  unflaggedCorrect: number;
  /** akurat: unsure answers really are wrong more often. terlalu-hati: they are about as good as the rest. */
  verdict: 'akurat' | 'terlalu-hati' | 'campuran';
}

/** Were the "ragu-ragu" marks right? Answered questions only; null until both groups have MIN_FLAGGED. */
export function calibration(a: Pick<Attempt, 'answers' | 'flagged' | 'timeSpent'>, questions: Question[]): Calibration | null {
  const answered = rows(a, questions).filter((r) => r.answer);
  const f = answered.filter((r) => r.flagged);
  const u = answered.filter((r) => !r.flagged);
  if (f.length < MIN_FLAGGED || u.length < MIN_FLAGGED) return null;
  const flaggedCorrect = f.filter((r) => r.correct).length;
  const unflaggedCorrect = u.filter((r) => r.correct).length;
  const fr = flaggedCorrect / f.length;
  const ur = unflaggedCorrect / u.length;
  const verdict = fr <= ur - 0.2 ? 'akurat' : fr >= ur - 0.05 ? 'terlalu-hati' : 'campuran';
  return { flagged: f.length, flaggedCorrect, unflagged: u.length, unflaggedCorrect, verdict };
}

/**
 * Correct TWK/TIU answers given much faster than usual and not marked unsure. A hint, not a verdict:
 * some questions are simply easy.
 */
export function likelyGuesses(a: Pick<Attempt, 'answers' | 'flagged' | 'timeSpent'>, questions: Question[]): QuestionRef[] {
  const avg = new Map(
    timing(a, questions)
      .filter((t) => t.timed >= MIN_TIMED)
      .map((t) => [t.subtest, t.avgMs]),
  );
  return rows(a, questions)
    .filter((r) => !isGraded(r.q.subtest) && r.correct && !r.flagged && r.ms > 0)
    .filter((r) => {
      const m = avg.get(r.q.subtest);
      return m !== undefined && r.ms < Math.min(FAST_MAX_MS, m * FAST_FACTOR);
    })
    .map(ref);
}

export interface TkpPattern {
  answered: number;
  /** How often each score (1–5) was picked. */
  chosen: Record<1 | 2 | 3 | 4 | 5, number>;
  /** Answers below the top option. */
  missedBest: number;
  avgScore: number;
}

export function tkpPattern(a: Pick<Attempt, 'answers'>, questions: Question[]): TkpPattern | null {
  const tkp = questions.filter((q) => q.subtest === 'TKP' && a.answers[q.id]);
  if (!tkp.length) return null;
  const chosen = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const q of tkp) {
    const s = scoreQuestion(q, a.answers[q.id]);
    if (s >= 1 && s <= 5) chosen[s as 1 | 2 | 3 | 4 | 5]++;
    sum += s;
  }
  return { answered: tkp.length, chosen, missedBest: tkp.length - chosen[5], avgScore: sum / tkp.length };
}

export interface ReasonCount {
  subtest: Subtest;
  tag: ReasonTag;
  label: string;
  count: number;
}

/** Reason tags from the mistake notebook, most frequent first. */
export function reasonSummary(reviews: Pick<ReviewItem, 'questionId' | 'reasonTags'>[], subtestOf: Map<string, Subtest>): ReasonCount[] {
  const label = Object.fromEntries(REASON_TAGS.map((t) => [t.id, t.label])) as Record<ReasonTag, string>;
  const map = new Map<string, ReasonCount>();
  for (const r of reviews) {
    const subtest = subtestOf.get(r.questionId);
    if (!subtest) continue;
    for (const tag of r.reasonTags) {
      const k = `${subtest}|${tag}`;
      const c = map.get(k) ?? { subtest, tag, label: label[tag], count: 0 };
      c.count++;
      map.set(k, c);
    }
  }
  return [...map.values()].sort((x, y) => y.count - x.count || SUBTESTS.indexOf(x.subtest) - SUBTESTS.indexOf(y.subtest));
}

/* -------------------------------------------------------------------------- trends */

/** A sub-test score on the full-length scale, so partial sets compare with full ones. */
export function scaledScore(r: Pick<SubtestResult, 'score' | 'max'>, fullMax: number): number {
  return r.max === fullMax ? r.score : Math.round((r.score / r.max) * fullMax);
}

export interface SeriesPoint {
  attemptId: string;
  at: number;
  setName: string;
  value: number;
  max: number;
}

/** Exam scores per sub-test, oldest first, on the full-length scale. Practice is left out. */
export function examSeries(attempts: Attempt[], counts: Record<Subtest, number>): Record<Subtest, SeriesPoint[]> {
  const exams = attempts.filter((a) => a.result && attemptMode(a) === 'exam').sort((x, y) => x.startedAt - y.startedAt);
  const out = { TWK: [], TIU: [], TKP: [] } as Record<Subtest, SeriesPoint[]>;
  for (const a of exams) {
    // SKD scores only: sub-tests of other exam packages have no place on these scales.
    for (const r of a.result!.perSubtest.filter((p) => p.subtest in out)) {
      const max = counts[r.subtest] * MAX_PER_QUESTION;
      out[r.subtest].push({ attemptId: a.id, at: a.startedAt, setName: a.setName, value: scaledScore(r, max), max });
    }
  }
  return out;
}

export interface Trend {
  n: number;
  /** Least-squares change per exam; 0 with fewer than two exams. */
  slope: number;
  last: number;
  /** Next exam, with a range; only from MIN_EXAMS_FOR_PROJECTION exams on. */
  projection?: { value: number; low: number; high: number };
}

/**
 * Straight-line fit over exam order (not dates: gaps between exams say little about skill).
 * The range is at least ±5% of the maximum and widens with how far scores scatter around the line.
 */
export function trend(values: number[], max: number): Trend | null {
  const n = values.length;
  if (!n) return null;
  const last = values[n - 1];
  if (n < 2) return { n, slope: 0, last };
  const xm = (n - 1) / 2;
  const ym = values.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  values.forEach((v, x) => {
    sxy += (x - xm) * (v - ym);
    sxx += (x - xm) ** 2;
  });
  const slope = sxy / sxx;
  if (n < MIN_EXAMS_FOR_PROJECTION) return { n, slope, last };
  const intercept = ym - slope * xm;
  const sse = values.reduce((s, v, x) => s + (v - (intercept + slope * x)) ** 2, 0);
  const sd = Math.sqrt(sse / (n - 2));
  const clamp = (v: number) => Math.max(0, Math.min(max, Math.round(v)));
  const value = intercept + slope * n;
  const half = Math.max(0.05 * max, 1.5 * sd);
  return { n, slope, last, projection: { value: clamp(value), low: clamp(value - half), high: clamp(value + half) } };
}

export interface TopicMove {
  subtest: Subtest;
  topic: string;
  latestPct: number;
  previousPct: number;
  delta: number;
}

/** Topic score share in the latest exam against the average of earlier exams that had the topic. */
export function topicMovers(attempts: Attempt[]): TopicMove[] {
  const exams = attempts.filter((a) => a.result && attemptMode(a) === 'exam').sort((x, y) => x.startedAt - y.startedAt);
  if (exams.length < 2) return [];
  const latest = exams[exams.length - 1].result!.topics;
  const earlier = exams.slice(0, -1);
  return latest.flatMap((t) => {
    const prev = earlier.flatMap((a) => a.result!.topics.filter((p) => p.subtest === t.subtest && p.topic === t.topic && p.max > 0));
    if (!prev.length || !t.max) return [];
    const previousPct = prev.reduce((s, p) => s + p.score / p.max, 0) / prev.length;
    const latestPct = t.score / t.max;
    return [{ subtest: t.subtest, topic: t.topic, latestPct, previousPct, delta: latestPct - previousPct }];
  });
}

/* ------------------------------------------------------------------ recommendations */

export interface Recommendation {
  kind: 'unanswered' | 'weak-topic' | 'wasted-time' | 'tkp' | 'calibration';
  text: string;
  /** Topics to practise, for a link into practice mode. */
  practiceTopics?: string[];
  /** In-app link, for advice that points at the mistake notebook. */
  to?: string;
}

/** Short duration for tables: "45d", "2m 5d". */
export const fmtSec = (ms: number) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}d` : ms > 0 && ms < 500 ? '<1d' : `${Math.round(ms / 1000)}d`);

const sec = (ms: number) => `${Math.round(ms / 1000)} detik`;
const min = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} menit` : sec(ms));
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** At most `limit` pieces of advice, most useful first. */
export function recommendations(a: Attempt, questions: Question[], limit = 3): Recommendation[] {
  const out: Recommendation[] = [];
  const exam = attemptMode(a) === 'exam';

  const empty = questions.filter((q) => !a.answers[q.id]).length;
  if (exam && empty > 0) {
    out.push({
      kind: 'unanswered',
      text: `${empty} soal tidak dijawab. Jawaban kosong bernilai 0, sama dengan jawaban salah, dan opsi TKP mana pun bernilai minimal 1, jadi isi semua soal sebelum waktu habis.`,
    });
  }

  // TKP gets its own advice below; when it applies, weak-topic advice looks at TWK/TIU only.
  const tkp = tkpPattern(a, questions);
  const tkpAdvice = !!tkp && tkp.answered >= TKP_MIN_ANSWERED && tkp.missedBest / tkp.answered >= TKP_MISSED_SHARE;

  // Answered questions only: empty ones are covered by the advice above and say nothing about skill.
  const stats = topicStats(a, questions).filter((t) => !(tkpAdvice && t.subtest === 'TKP'));
  const wrongWord = (s: Subtest) => (isGraded(s) ? 'bukan pilihan terbaik' : 'salah');
  const weak = stats
    .filter((t) => t.answered >= WEAK_MIN_QUESTIONS && t.answeredWrong / t.answered >= WEAK_WRONG_RATE)
    .sort((x, y) => y.answeredWrong / y.answered - x.answeredWrong / x.answered || y.avgMs - x.avgMs);
  if (weak.length) {
    const t = weak[0];
    out.push({
      kind: 'weak-topic',
      text: `Latih ${t.topic} (${t.subtest}): ${t.answeredWrong} dari ${t.answered} jawaban ${wrongWord(t.subtest)}${t.avgMs ? `, rata-rata ${sec(t.avgMs)} per soal` : ''}.`,
      practiceTopics: [t.topic],
    });
  } else {
    const bySubtest = SUBTESTS.map((s) => {
      const ts = stats.filter((t) => t.subtest === s);
      const answered = ts.reduce((n, t) => n + t.answered, 0);
      const wrong = ts.reduce((n, t) => n + t.answeredWrong, 0);
      return { s, answered, wrong, topics: ts.filter((t) => t.answeredWrong > 0).map((t) => t.topic) };
    })
      .filter((x) => x.answered >= WEAK_MIN_SUBTEST && x.wrong / x.answered >= WEAK_WRONG_RATE)
      .sort((x, y) => y.wrong / y.answered - x.wrong / x.answered);
    if (bySubtest.length) {
      const x = bySubtest[0];
      out.push({
        kind: 'weak-topic',
        text: `Latih ${x.s}: ${x.wrong} dari ${x.answered} jawaban ${wrongWord(x.s)}, di topik ${x.topics.slice(0, 4).join(', ')}${x.topics.length > 4 ? ', dan lainnya' : ''}.`,
        practiceTopics: x.topics,
      });
    }
  }

  const times = timing(a, questions);
  const total = times.reduce((n, t) => n + t.totalMs, 0);
  const wasted = times.reduce((n, t) => n + t.wastedMs, 0);
  if (wasted >= WASTED_MIN_MS && wasted / total >= WASTED_SHARE) {
    out.push({
      kind: 'wasted-time',
      text: `${min(wasted)} (${pct(wasted / total)} waktu) habis di soal yang akhirnya salah. Bila macet, tandai ragu-ragu, lanjut dulu, lalu kembali di akhir.`,
    });
  }

  if (tkp && tkpAdvice) {
    out.push({
      kind: 'tkp',
      text: `Di TKP, ${tkp.missedBest} dari ${tkp.answered} jawaban bukan pilihan terbaik (rata-rata skor ${tkp.avgScore.toFixed(1)}). Ulangi di Buku Kesalahan dan perhatikan alasan opsi skor 5.`,
      to: '/review',
    });
  }

  const cal = calibration(a, questions);
  if (cal && cal.verdict !== 'campuran') {
    const fr = pct(cal.flaggedCorrect / cal.flagged);
    const ur = pct(cal.unflaggedCorrect / cal.unflagged);
    out.push(
      cal.verdict === 'akurat'
        ? {
            kind: 'calibration',
            text: `Soal yang Anda tandai ragu memang lebih sering salah (${fr} benar, soal lain ${ur}). Ulangi soal-soal itu di Buku Kesalahan.`,
            to: '/review',
          }
        : {
            kind: 'calibration',
            text: `Soal yang Anda tandai ragu hampir sama sering benarnya (${fr} benar, soal lain ${ur}). Jawaban pertama Anda bisa lebih dipercaya; jangan berlama-lama di soal itu.`,
          },
    );
  }

  return out.slice(0, limit);
}
