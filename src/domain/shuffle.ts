import { shuffle } from '../lib/id';
import { isGraded } from './examPackage';
import { OPTION_LABELS } from './types';
import type { OptionLabel, Question } from './types';

/**
 * Where the answer sits: the key, or a graded question's single best option. Models tend to put
 * it in the same few places (often B or C), which a learner soon starts to guess, so the app
 * places it itself (#user feedback: "kunci jawaban terlalu monoton").
 */
export function keyIndex(q: Pick<Question, 'subtest' | 'options' | 'answer'>): number {
  if (isGraded(q.subtest)) {
    const max = Math.max(...q.options.map((o) => o.score));
    const best = q.options.flatMap((o, i) => (o.score === max ? [i] : []));
    return best.length === 1 ? best[0] : -1;
  }
  return q.options.findIndex((o) => o.label === q.answer);
}

/** Options that point at other options ("A dan B benar", "Semua jawaban di atas") must keep their places. */
const POINTS_AT_OTHERS = /\b[A-E]\s*(?:dan|atau|,|&)\s*[A-E]\b|\b(?:semua|tidak ada|bukan salah satu)\b.*\b(?:benar|salah|jawaban|pilihan|opsi)\b|\bdi atas\b/i;

/**
 * An option letter mentioned in an explanation: after "opsi", "pilihan" or "jawaban"
 * ("Jawaban: C", "opsi B"), or standing alone the way a list or a verdict writes it ("A.", "(B)",
 * "C: ...", "D salah"). Letters inside legal references ("Pasal 28 C", "huruf B") are left alone.
 */
const LETTER =
  /(\b(?:[Oo]psi|[Pp]ilihan|[Jj]awaban)(?:nya)?(?:\s+yang\s+(?:paling\s+)?(?:benar|tepat))?(?:\s+(?:adalah|ialah|yaitu))?\s*[:=]?\s*\(?)([A-E])(?![A-Za-z0-9])|(^|[\s([*"'/,])(?<!\d )(?<![Pp]asal )(?<![Hh]uruf )([A-E])(?=\)|\]|\.(?!\d)|:|,|;|\s*[–—=]|\s+-|-\s|\s+\(|\s+(?:dan|atau|salah|benar|kurang|tidak|keliru|tepat|lebih|mendapat|bernilai|memiliki|merupakan|adalah|juga|sama)\b|\s*$)/gm;

/** A text with option letters renamed after the options moved: "Jawaban: C" becomes "Jawaban: A". */
export function relabel(text: string, map: Partial<Record<string, OptionLabel>>): string {
  return text.replace(LETTER, (_all, before1?: string, l1?: string, before2?: string, l2?: string) =>
    before1 !== undefined ? `${before1}${map[l1!] ?? l1}` : `${before2}${map[l2!] ?? l2}`,
  );
}

/**
 * The question with its options in a new random order and the answer at `target` (0 = A).
 * The explanation's and each rationale's letters follow the options. Unchanged when there is no
 * single answer, an option points at others, or an option is a picture.
 */
export function placeKey<T extends Pick<Question, 'subtest' | 'options' | 'answer' | 'explanation'>>(q: T, target: number, rand: () => number = Math.random): T {
  const k = keyIndex(q);
  if (k < 0 || q.options.length < 2 || q.options.some((o) => o.figure || POINTS_AT_OTHERS.test(o.text))) return q;
  const others = shuffle(
    q.options.filter((_, i) => i !== k),
    rand,
  );
  const at = Math.max(0, Math.min(target, q.options.length - 1));
  const order = [...others.slice(0, at), q.options[k], ...others.slice(at)];
  const map: Partial<Record<string, OptionLabel>> = Object.fromEntries(order.map((o, i) => [o.label, OPTION_LABELS[i]]));
  return {
    ...q,
    options: order.map((o, i) => ({ ...o, label: OPTION_LABELS[i], ...(o.rationale ? { rationale: relabel(o.rationale, map) } : {}) })),
    answer: q.answer ? map[q.answer] : q.answer,
    explanation: relabel(q.explanation, map),
  };
}

/**
 * Chooses where each next answer goes so a set has no pattern to learn: each position about
 * equally often, picked at random with the less-used ones more likely, and never three in a row.
 * `previous` are the answer positions already in the set.
 */
export function keyBalancer(previous: number[], size = 5, rand: () => number = Math.random) {
  const counts: number[] = Array(size).fill(0);
  const recent: number[] = [];
  const record = (pos: number) => {
    if (pos < 0 || pos >= size) return;
    counts[pos]++;
    recent.push(pos);
    if (recent.length > 2) recent.shift();
  };
  previous.forEach(record);
  function next(): number {
    const banned = recent.length === 2 && recent[0] === recent[1] ? recent[0] : -1;
    const allowed = counts.map((_, i) => i).filter((i) => i !== banned);
    const least = Math.min(...allowed.map((i) => counts[i]));
    // Positions used at most once more than the least used; the less used, the likelier.
    const pool = allowed.filter((i) => counts[i] <= least + 1);
    const weights = pool.map((i) => least + 2 - counts[i]);
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    for (const [j, i] of pool.entries()) {
      r -= weights[j];
      if (r < 0) return i;
    }
    return pool[pool.length - 1];
  }
  return { next, record };
}
