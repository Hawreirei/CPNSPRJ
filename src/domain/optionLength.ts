import { isGraded } from './examPackage';
import { keyIndex } from './shuffle';
import type { Flag, Question } from './types';

/*
 * Models writing a question tend to make the right answer the most careful, most complete and
 * therefore longest option, and the distractors (or TKP's low-scoring options) short. A learner
 * soon notices and scores well on TWK and TKP by picking the longest option without reading the
 * question (#user feedback: "jawaban benar umumnya yang paling panjang"). The prompts ask for
 * options of equal length; this file finds the questions where that did not happen, so they are
 * marked "perlu dicek" and rewritten (engine/repair.ts), and measures a whole set.
 */

/** The key is a giveaway when it is this much longer (or shorter) than every other option… */
export const LONGEST_RATIO = 1.2;
/** …and longer by at least this many characters (short options such as names may differ a bit). */
export const LONGEST_MIN_CHARS = 8;
/** Graded questions: scores rise (or fall) with length this closely (Spearman's rho)… */
export const RANK_RHO = 0.8;
/** …while the longest option is at least this much longer than the shortest. */
export const RANK_SPREAD = 1.4;

/** An option's length as a reader sees it: characters, with whitespace and LaTeX markup squeezed out. */
export function optionLength(text: string): number {
  return text
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[$*_{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/** Ranks from 1 (smallest), ties sharing their average rank. */
function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = Array<number>(xs.length);
  for (let s = 0; s < order.length;) {
    let e = s;
    while (e + 1 < order.length && order[e + 1].x === order[s].x) e++;
    for (let k = s; k <= e; k++) out[order[k].i] = (s + e) / 2 + 1;
    s = e + 1;
  }
  return out;
}

/** Spearman's rank correlation; 0 when either side has no spread. */
export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

type Checked = Pick<Question, 'subtest' | 'options' | 'answer' | 'source'>;

/** Options that are words (not pictures) and the index of the answer, or null when length means nothing here. */
function lengths(q: Checked): { lens: number[]; best: number } | null {
  if (q.options.length < 3 || q.options.some((o) => o.figure || !o.text.trim())) return null;
  const best = keyIndex(q);
  if (best < 0) return null;
  return { lens: q.options.map((o) => optionLength(o.text)), best };
}

/**
 * The answer (or graded question's best option) clearly stands out by its length, so it can be
 * picked unread: 'longest', the pattern learners notice, or 'shortest', the pattern a model asked
 * not to make the key the longest may fall into instead. Null when it does not stand out.
 */
export function keyGiveaway(q: Checked): 'longest' | 'shortest' | null {
  const m = lengths(q);
  if (!m) return null;
  const others = m.lens.filter((_, i) => i !== m.best);
  const key = m.lens[m.best];
  const longest = Math.max(...others);
  const shortest = Math.min(...others);
  if (key >= longest * LONGEST_RATIO && key - longest >= LONGEST_MIN_CHARS) return 'longest';
  if (shortest >= key * LONGEST_RATIO && shortest - key >= LONGEST_MIN_CHARS) return 'shortest';
  return null;
}

/** Graded questions: the score rises (or falls) with the option's length, so length alone picks a good one. */
export function scoreFollowsLength(q: Checked): boolean {
  if (!isGraded(q.subtest)) return false;
  const m = lengths(q);
  if (!m) return false;
  const rho = spearman(
    m.lens,
    q.options.map((o) => o.score),
  );
  return Math.abs(rho) >= RANK_RHO && Math.max(...m.lens) >= Math.min(...m.lens) * RANK_SPREAD;
}

/**
 * The "perlu dicek" flag for a question whose answer can be told from the options' lengths alone,
 * or null. Only AI questions are checked: an imported question is a copy of its source, and a
 * learner's own question is theirs to write.
 */
export function lengthCueFlag(q: Checked): Flag | null {
  if (q.source !== 'ai') return null;
  const graded = isGraded(q.subtest);
  const best = keyIndex(q);
  const giveaway = keyGiveaway(q);
  if (giveaway) {
    const label = q.options[best].label;
    const what = graded ? `Opsi skor tertinggi (${label})` : `Jawaban benar (${label})`;
    return {
      kind: 'length-cue',
      severity: 'warn',
      message: `${what} jauh lebih ${giveaway === 'longest' ? 'panjang' : 'pendek'} daripada opsi lain, sehingga bisa ditebak tanpa membaca soal. Samakan panjang dan kerincian kelima opsi.`,
    };
  }
  if (scoreFollowsLength(q)) {
    const up =
      spearman(
        q.options.map((o) => optionLength(o.text)),
        q.options.map((o) => o.score),
      ) > 0;
    return {
      kind: 'length-cue',
      severity: 'warn',
      message: `Makin ${up ? 'panjang' : 'pendek'} opsinya, makin tinggi skornya, sehingga skor tinggi bisa didapat hanya dengan memilih opsi ${up ? 'terpanjang' : 'terpendek'}. Samakan panjang dan kerincian kelima opsi.`,
    };
  }
  return null;
}

export interface LongestGuess {
  /** Keyed questions with one longest option, and how many of them it answers right. */
  keyed: number;
  right: number;
  /** Share a blind guess gets right on these keyed questions (1 in 5). */
  keyedChance: number | null;
  /** Graded questions with one longest option, and the score always picking it earns as a share of the best possible. */
  graded: number;
  gradedShare: number | null;
  /** The share a blind guess earns on these graded questions (the average score). */
  gradedChance: number | null;
}

/**
 * What a learner would score by always picking the longest option, without reading the questions:
 * the measure of the cue this file guards against. With options of equal length, keyed questions
 * come out near 1 in 5 and graded ones near the average score.
 */
export function longestGuess(questions: Pick<Question, 'subtest' | 'options' | 'answer'>[]): LongestGuess {
  let keyed = 0;
  let right = 0;
  let graded = 0;
  let got = 0;
  let max = 0;
  let guess = 0;
  let mean = 0;
  for (const q of questions) {
    if (q.options.length < 3 || q.options.some((o) => o.figure || !o.text.trim())) continue;
    const lens = q.options.map((o) => optionLength(o.text));
    const top = Math.max(...lens);
    if (lens.filter((l) => l === top).length > 1) continue;
    const pick = lens.indexOf(top);
    if (isGraded(q.subtest)) {
      graded++;
      got += q.options[pick].score;
      max += Math.max(...q.options.map((o) => o.score));
      mean += q.options.reduce((s, o) => s + o.score, 0) / q.options.length;
    } else if (q.answer) {
      keyed++;
      guess += 1 / q.options.length;
      if (q.options[pick].label === q.answer) right++;
    }
  }
  return {
    keyed,
    right,
    keyedChance: keyed ? guess / keyed : null,
    graded,
    gradedShare: max ? got / max : null,
    gradedChance: max ? mean / max : null,
  };
}
