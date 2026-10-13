import { hashText, shuffle, uid } from '../../lib/id';
import { describePic } from '../describe';
import { picKey } from '../pic';
import { OPTION_LABELS } from '../types';
import type { Difficulty, Figure, FigureMeta, OptionLabel, Pic, Question } from '../types';
import { PIC_PICKER, picFeats, termFeats } from './features';
import { judgeAnalogy, judgeMatrix, judgeSeries, oddOnes, type Extract } from './solver';
import { pickOptions, type Rand } from './options';

export type { Rand };

export type FiguralTopic = 'Deret Figural' | 'Analogi Figural' | 'Matriks Figural' | 'Transformasi Figural' | 'Figural Berbeda' | 'Ruang dan Kubus' | 'Gabungan Gambar';

/** A wrong option a learner would arrive at, and why it is wrong. */
export interface Lure {
  pic: Pic;
  why: string;
}

/** A question before it gets an id and labels. */
export interface Draft {
  stem: string;
  figure: Figure;
  options: Pic[];
  answerIdx: number;
  /** Given the key's label and a way to name any option by its index. */
  explanation: (answer: OptionLabel, labelOf: (pic: Pic) => OptionLabel | undefined) => string;
  rationales: (string | undefined)[];
  meta: Omit<FigureMeta, 'archetype'>;
}

/** A recipe for figural questions (docs/rancangan-figural-v2.md §4). */
export interface Archetype {
  id: string;
  topic: FiguralTopic;
  /** For the Lab: a name and one line on what it trains. */
  name: string;
  about: string;
  /** Kinds of rule the recipe can use; the Lab lets the learner pick some. */
  families: { id: string; name: string }[];
  /** Levels it makes; others fall back to the nearest. */
  levels: Difficulty[];
  /** Null when this attempt did not work out; the caller tries again. */
  make: (difficulty: Difficulty, r: Rand, want?: string[]) => Draft | null;
  /** Judges a finished question again from its pictures alone (tests, and questions from elsewhere). */
  verify: (q: Question) => boolean;
}

const keyOf = (q: Question) => q.options.findIndex((o) => o.label === q.answer);
const optionPics = (q: Question) => q.options.map((o) => o.figure).filter((p): p is Pic => !!p);

/** A series question read term by term. */
export const verifySeries =
  (extract: Extract<Pic> = termFeats) =>
  (q: Question) =>
    !!q.figure && q.figure.layout === 'series' && optionPics(q).length === 5 && judgeSeries<Pic>(q.figure.cells, optionPics(q), keyOf(q), extract).ok;
/** a : b :: c : ? */
export const verifyAnalogy = (q: Question) =>
  !!q.figure && q.figure.layout === 'analogy' && judgeAnalogy<Pic>([[q.figure.cells[0]!, q.figure.cells[1]!]], q.figure.cells[2]!, optionPics(q), keyOf(q), picFeats).ok;
/** A 3×3 grid. */
export const verifyMatrix = (q: Question) => !!q.figure && q.figure.layout === 'matrix' && judgeMatrix<Pic>(q.figure.cells, optionPics(q), keyOf(q), picFeats).ok;
/** Exactly the key is singled out by some property. */
export const verifyOdd = (q: Question) => {
  const outs = oddOnes<Pic>(optionPics(q), picFeats);
  return outs.length === 1 && outs[0] === keyOf(q);
};
/** Five different pictures and one key: for recipes whose answer follows from the stem's own words. */
export const verifyDistinct = (q: Question) => new Set(optionPics(q).map(picKey)).size === 5 && keyOf(q) >= 0;

export const pick = <T>(arr: readonly T[], r: Rand): T => arr[Math.floor(r() * arr.length)];
export const chance = (p: number, r: Rand) => r() < p;
export const randInt = (lo: number, hi: number, r: Rand) => lo + Math.floor(r() * (hi - lo + 1));

/**
 * The key among four wrong options. `lures` (with their reasons) are kept where possible;
 * `pool` fills the rest; `reject` drops pictures some rule would also support.
 */
export function chooseOptions(
  answer: Pic,
  lures: Lure[],
  pool: Pic[],
  r: Rand,
  reject: (p: Pic) => boolean = () => false,
): { options: Pic[]; answerIdx: number; rationales: (string | undefined)[] } | null {
  const ak = picKey(answer);
  const why = new Map<string, string>();
  const ok = (p: Pic) => picKey(p) !== ak && !reject(p);
  const kept = lures.filter((l) => ok(l.pic));
  for (const l of kept) if (!why.has(picKey(l.pic))) why.set(picKey(l.pic), l.why);
  const picked = pickOptions(
    answer,
    kept.map((l) => l.pic),
    pool.filter(ok),
    r,
    PIC_PICKER,
  );
  if (!picked) return null;
  return { options: picked.opts, answerIdx: picked.answerIdx, rationales: picked.opts.map((p, i) => (i === picked.answerIdx ? undefined : why.get(picKey(p)))) };
}

/** Stems vary a little so a set does not read the same line ten times. */
export function stemFor(kind: 'series' | 'series-mid' | 'analogy' | 'matrix' | 'odd', r: Rand): string {
  const stems: Record<typeof kind, string[]> = {
    series: [
      'Perhatikan deret gambar berikut. Gambar manakah yang tepat untuk mengisi tanda tanya?',
      'Gambar-gambar berikut berubah menurut suatu pola. Gambar manakah yang melanjutkan deret itu?',
      'Tentukan gambar yang tepat untuk menggantikan tanda tanya pada deret berikut.',
      'Deret gambar berikut mengikuti aturan tertentu. Gambar apakah yang seharusnya berada di posisi tanda tanya?',
    ],
    'series-mid': [
      'Satu gambar di tengah deret berikut hilang. Gambar manakah yang tepat untuk mengisi tanda tanya?',
      'Perhatikan deret gambar berikut. Gambar manakah yang tepat untuk tanda tanya agar polanya utuh?',
      'Tanda tanya pada deret berikut menggantikan satu gambar. Gambar manakah itu?',
    ],
    analogy: [
      'Gambar pertama berhubungan dengan gambar kedua. Dengan hubungan yang sama, gambar ketiga berhubungan dengan gambar manakah?',
      'Hubungan gambar ketiga dengan tanda tanya sama dengan hubungan gambar pertama dengan gambar kedua. Gambar manakah yang tepat?',
      'Perhatikan perubahan dari gambar pertama ke gambar kedua. Terapkan perubahan yang sama pada gambar ketiga.',
    ],
    matrix: [
      'Gambar-gambar berikut tersusun dalam tiga baris dan tiga kolom menurut suatu pola. Gambar manakah yang tepat untuk mengisi tanda tanya?',
      'Lengkapi susunan 3 × 3 berikut. Gambar manakah yang tepat untuk tanda tanya?',
      'Setiap baris dan kolom pada susunan berikut mengikuti aturan. Gambar apakah yang hilang?',
    ],
    odd: [
      'Empat dari lima gambar pada pilihan jawaban mengikuti pola yang sama. Gambar manakah yang tidak sesuai dengan pola itu?',
      'Manakah gambar yang berbeda sendiri di antara pilihan berikut?',
      'Satu gambar pada pilihan jawaban tidak sekelompok dengan yang lain. Gambar manakah itu?',
    ],
  };
  return pick(stems[kind], r);
}

/** A finished question from a draft. */
export function toQuestion(arch: Archetype, difficulty: Difficulty, d: Draft): Question {
  const now = Date.now();
  const labels = d.options.map((_, i) => OPTION_LABELS[i]);
  const answer = labels[d.answerIdx];
  const labelOf = (p: Pic) => {
    const i = d.options.findIndex((o) => picKey(o) === picKey(p));
    return i >= 0 ? labels[i] : undefined;
  };
  const options = d.options.map((pic, i) => ({
    label: labels[i],
    text: describePic(pic),
    score: i === d.answerIdx ? 5 : 0,
    figure: pic,
    ...(d.rationales[i] ? { rationale: d.rationales[i] } : {}),
  }));
  // With no stem figure the puzzle lives in the options, so they make it unique.
  const content = d.figure.cells.length ? JSON.stringify(d.figure.cells) : JSON.stringify(d.options.map((o) => picKey(o)).sort());
  return {
    id: uid(),
    subtest: 'TIU',
    topic: arch.topic,
    difficulty,
    stem: d.stem,
    options,
    answer,
    explanation: d.explanation(answer, labelOf),
    figure: d.figure,
    figureMeta: { archetype: arch.id, ...d.meta },
    flags: [],
    locked: false,
    starred: false,
    hash: hashText(d.stem + content),
    source: 'procedural',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A bag of items drawn without putting back until it is empty, so a set of ten uses as many
 * different recipes as it can before any repeats. Items used recently in the bank are put last.
 */
export function bagOrder<T>(items: T[], n: number, r: Rand, recent: (x: T) => number = () => 0): T[] {
  const out: T[] = [];
  while (out.length < n) {
    const round = shuffle(items, r).sort((a, b) => recent(a) - recent(b));
    out.push(...round);
  }
  return out.slice(0, n);
}
