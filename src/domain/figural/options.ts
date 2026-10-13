import { shuffle } from '../../lib/id';

/*
 * Choosing the four wrong options. A wrong option made by changing one property of the key sits
 * one step from the key and two from every other wrong option, so the key always ended up as the
 * option most like all the others: a learner could pick it without reading the question (100% of
 * Deret, Analogi, Matriks and Transformasi before this). Here the four are chosen from a larger
 * pool so that the key's place in that ranking is drawn at random, like any other option's.
 */

export type Rand = () => number;

export interface Picker<T> {
  /** Visual identity: two pictures with the same key look the same on screen. */
  key: (x: T) => string;
  /** How many visible properties two pictures differ in. */
  distance: (a: T, b: T) => number;
}

/** Options' summed distance to the other options, lower = more central. */
export function centrality<T>(opts: T[], distance: (a: T, b: T) => number): number[] {
  return opts.map((a) => opts.reduce((s, b) => s + (a === b ? 0 : distance(a, b)), 0));
}

/**
 * The answer and four wrong options from `pool`, shuffled. `preferred` are the wrong options a
 * learner would actually arrive at (a misread rule); as many as possible are kept, as long as the
 * key's rank among the five stays where the draw put it. Returns null when the pool has fewer
 * than four distinct wrong pictures.
 */
export function pickOptions<T>(answer: T, preferred: T[], pool: T[], r: Rand, p: Picker<T>): { opts: T[]; answerIdx: number } | null {
  const ak = p.key(answer);
  const seen = new Set([ak]);
  const cands: { x: T; pref: boolean }[] = [];
  const add = (x: T, pref: boolean) => {
    const k = p.key(x);
    if (seen.has(k)) return;
    seen.add(k);
    cands.push({ x, pref });
  };
  for (const x of shuffle(preferred, r)) add(x, true);
  for (const x of shuffle(pool, r)) add(x, false);
  if (cands.length < 4) return null;
  // Enough room to steer the ranking, small enough to try every four (C(14,4) = 1001).
  const prefs = cands.filter((c) => c.pref).slice(0, 7);
  const list = [...prefs, ...cands.filter((c) => !c.pref).slice(0, 14 - prefs.length)];
  const n = list.length;
  const all = [answer, ...list.map((c) => c.x)];
  const d = all.map((a) => all.map((b) => (a === b ? 0 : p.distance(a, b))));
  const target = Math.floor(r() * 5);
  const wantPref = Math.min(3, prefs.length);
  let best: number[][] = [];
  let bestCost = Infinity;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let e = c + 1; e < n; e++) {
          const idx = [0, a + 1, b + 1, c + 1, e + 1];
          const tot = idx.map((i) => idx.reduce((s, j) => s + d[i][j], 0));
          const less = tot.filter((t) => t < tot[0]).length;
          const ties = tot.filter((t) => t === tot[0]).length - 1;
          const rankCost = target < less ? less - target : target > less + ties ? target - less - ties : 0;
          const prefCount = [a, b, c, e].filter((i) => list[i].pref).length;
          // The key's rank comes first; within one step of it, keep the lures a learner would fall for.
          const cost = rankCost * 4 + Math.max(0, wantPref - prefCount) * 3;
          if (cost < bestCost) {
            bestCost = cost;
            best = [idx];
          } else if (cost === bestCost) best.push(idx);
        }
  const chosen = best[Math.floor(r() * best.length)];
  const opts = shuffle(
    chosen.map((i) => all[i]),
    r,
  );
  return { opts, answerIdx: opts.indexOf(answer) };
}
