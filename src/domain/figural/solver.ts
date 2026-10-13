/*
 * The solver behind every procedural figural question (docs/rancangan-figural-v2.md §5). A picture
 * is read as features ("arrow.slot" = 3, "fill" = "solid"); the solver tries every rule in a small
 * library on each feature's values across the terms, the way a learner would, and says which
 * options some rule supports. A question is kept only when:
 *
 *   K1  exactly one option is supported (by any rule the visible terms confirm);
 *   K2  the simplest rule the visible terms confirm gives that option, and no equally simple rule
 *       gives something else;
 *   K3  what no rule governs ("free" features, such as a new symbol) is the same in all options.
 *
 * Features in one group with several views (an arrow's direction read on its own, or relative to
 * where it sits) are alternatives: one view must explain the whole group.
 */

export type Val = string | number;

export interface Feat {
  /** One feature, e.g. "arrow.slot". */
  key: string;
  /** Features read together; defaults to the key. */
  group?: string;
  /** Alternative readings of a group, e.g. "abs" and "rel". */
  view?: string;
  value: Val;
  /** Numbers on a circle of this size (angles 360, places 8). */
  mod?: number;
  /** Smallest step a rule moves this feature by (45° for directions). */
  step?: number;
  /** Depends on the previous term (a move "since the last step"). */
  rel?: boolean;
  /** Not governed by any rule: must be the same in every option. */
  free?: boolean;
}

export type Extract<T> = (seq: T[], i: number) => Feat[];

const NONE = '∅';

interface Meta {
  group: string;
  view: string;
  num: boolean;
  mod?: number;
  step: number;
  rel: boolean;
  free: boolean;
}

/** A rule for one feature. `fits` checks a whole track (the "?" filled in). */
interface Hyp {
  name: string;
  c: number;
  fits: (vals: (Val | undefined)[]) => boolean;
}

const eqv = (a: Val | undefined, b: Val | undefined) => a === b;
const modOf = (x: number, m?: number) => (m ? ((x % m) + m) % m : x);

/** Steps a numeric rule may use. */
function stepsFor(meta: Meta): number[] {
  if (meta.mod) {
    const out: number[] = [];
    for (let d = meta.step; d < meta.mod; d += meta.step) out.push(d);
    return out;
  }
  return [1, 2, 3, -1, -2, -3].map((k) => k * meta.step);
}

const isNum = (v: Val | undefined): v is number => typeof v === 'number';

/** Rules for one feature that the visible values allow and confirm. */
function hypotheses(vis: (Val | undefined)[], meta: Meta): Hyp[] {
  const idx = vis.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0);
  const n = vis.length;
  const out: Hyp[] = [];
  if (idx.length < 2) return out;
  const unknown = Array.from({ length: n }, (_, i) => i).filter((i) => vis[i] === undefined);

  // The same value throughout.
  if (idx.every((i) => eqv(vis[i], vis[idx[0]]))) out.push({ name: 'tetap', c: 0, fits: (t) => t.every((v) => v === undefined || eqv(v, vis[idx[0]])) });

  const numeric = meta.num && idx.every((i) => isNum(vis[i]));
  const diff = (a: number, b: number) => modOf(b - a, meta.mod);
  const same = (x: number, y: number) => modOf(x, meta.mod) === modOf(y, meta.mod);

  if (numeric) {
    // Changes by the same step each time.
    if (idx.length >= 3)
      for (const d of stepsFor(meta)) {
        const ok = idx.every((i) => idx.every((j) => j <= i || same(diff(vis[i] as number, vis[j] as number), d * (j - i))));
        if (ok)
          out.push({
            name: `langkah ${d}`,
            c: 1,
            fits: (t) => t.every((v, i) => i === 0 || v === undefined || t[i - 1] === undefined || same(diff(t[i - 1] as number, v as number), d)),
          });
      }
    // Steps alternate between two sizes (one may be 0).
    const pairs = idx.filter((i) => i + 1 < n && vis[i + 1] !== undefined);
    if (pairs.length >= 3 && pairs.some((i) => i % 2 === 0) && pairs.some((i) => i % 2 === 1)) {
      const ds = [0, ...stepsFor(meta)];
      for (const d0 of ds)
        for (const d1 of ds) {
          if (same(d0, d1)) continue;
          const stepAt = (i: number) => (i % 2 === 0 ? d0 : d1);
          if (!pairs.every((i) => same(diff(vis[i] as number, vis[i + 1] as number), stepAt(i)))) continue;
          // Every value must follow from the visible ones.
          out.push({
            name: `bergantian ${d0}/${d1}`,
            c: 3,
            fits: (t) => t.every((v, i) => i === 0 || v === undefined || t[i - 1] === undefined || same(diff(t[i - 1] as number, v as number), stepAt(i - 1))),
          });
        }
    }
  }

  // Repeats every p terms.
  for (const p of [2, 3]) {
    if (p >= n) continue;
    const classes = Array.from({ length: p }, (_, r) => idx.filter((i) => i % p === r));
    if (!classes.every((cl) => cl.every((i) => eqv(vis[i], vis[cl[0]])))) continue;
    const repeated = classes.filter((cl) => cl.length >= 2).length;
    if (repeated < Math.min(p, 2)) continue;
    // The "?" must fall in a class that has a visible member.
    if (!unknown.every((u) => classes[u % p].length > 0)) continue;
    if (idx.every((i) => eqv(vis[i], vis[idx[0]]))) continue;
    out.push({ name: `berulang tiap ${p}`, c: p, fits: (t) => t.every((v, i) => v === undefined || eqv(v, t[i % p]) || t[i % p] === undefined) });
  }

  // Odd and even terms follow their own rule (one of them changing by steps).
  if (numeric) {
    const sub = (r: number) => idx.filter((i) => i % 2 === r);
    const subRules = (r: number): { c: number; d: number }[] => {
      const s = sub(r);
      const rules: { c: number; d: number }[] = [];
      if (s.length >= 2 && s.every((i) => eqv(vis[i], vis[s[0]]))) rules.push({ c: 0, d: 0 });
      if (s.length >= 3)
        for (const d of stepsFor(meta)) if (s.every((i) => s.every((j) => j <= i || same(diff(vis[i] as number, vis[j] as number), (d * (j - i)) / 2)))) rules.push({ c: 1, d });
      return rules;
    };
    for (const a of subRules(0))
      for (const b of subRules(1)) {
        if (a.c === 0 && b.c === 0) continue;
        out.push({
          name: `selang-seling ${a.d}/${b.d}`,
          c: 2 + a.c + b.c,
          fits: (t) => t.every((v, i) => i < 2 || v === undefined || t[i - 2] === undefined || same(diff(t[i - 2] as number, v as number), i % 2 === 0 ? a.d : b.d)),
        });
      }
  }
  return out;
}

export interface Verdict {
  /** K1–K3 hold. */
  ok: boolean;
  /** Which options some confirmed rule supports. */
  defensible: boolean[];
  /** Why not ok, for tests. */
  reason?: string;
  /** Sum of the simplest rules' complexity over the groups (§3.4 of the design). */
  complexity: number;
  /** The simplest rule found per feature, for explanations and the trace. */
  rules: Record<string, string>;
}

function collect<T>(full: T[], extract: Extract<T>): { maps: Map<string, Feat>[]; metas: Map<string, Meta> } {
  const maps = full.map((_, i) => new Map(extract(full, i).map((f) => [f.key, f])));
  const metas = new Map<string, Meta>();
  for (const m of maps)
    for (const f of m.values())
      if (!metas.has(f.key))
        metas.set(f.key, {
          group: f.group ?? f.key,
          view: f.view ?? '',
          num: f.mod !== undefined || typeof f.value === 'number',
          mod: f.mod,
          step: f.step ?? 1,
          rel: !!f.rel,
          free: !!f.free,
        });
  return { maps, metas };
}

/**
 * Judge a sequence with one "?" (null): series, or anything read term by term. `options` are the
 * candidate pictures, `key` the intended answer's index.
 */
export function judgeSeries<T>(seq: (T | null)[], options: T[], key: number, extract: Extract<T>): Verdict {
  const m = seq.indexOf(null);
  const fulls = options.map((o) => seq.map((c) => c ?? o) as T[]);
  const all = fulls.map((f) => collect(f, extract));
  const metas = new Map<string, Meta>();
  for (const a of all) for (const [k, v] of a.metas) if (!metas.has(k)) metas.set(k, v);
  const track = (maps: Map<string, Feat>[], k: string, meta: Meta) => maps.map((mp, i) => (meta.rel && i === 0 ? undefined : (mp.get(k)?.value ?? (meta.rel ? undefined : NONE))));
  const visibleAt = (meta: Meta, i: number) => i !== m && !(meta.rel && i - 1 === m);
  const keys = [...metas.keys()];

  // K3: free features agree across the options.
  for (const k of keys) {
    const meta = metas.get(k)!;
    if (!meta.free) continue;
    const vals = all.map((a) => track(a.maps, k, meta)[m]);
    if (!vals.every((v) => eqv(v, vals[0]))) return { ok: false, defensible: options.map(() => false), reason: `K3 ${k}`, complexity: 0, rules: {} };
  }

  // Rules each feature's visible values confirm (the same for every option).
  const hyps = new Map<string, Hyp[]>();
  for (const k of keys) {
    const meta = metas.get(k)!;
    if (meta.free) continue;
    const t = track(all[key].maps, k, meta).map((v, i) => (visibleAt(meta, i) ? v : undefined));
    hyps.set(k, hypotheses(t, meta));
  }
  return decide(
    keys.filter((k) => !metas.get(k)!.free),
    metas,
    hyps,
    options.length,
    key,
    (o, k) => track(all[o].maps, k, metas.get(k)!),
  );
}

/** Shared tail of the judges: groups, views, K1 and K2. */
function decide(keys: string[], metas: Map<string, Meta>, hyps: Map<string, Hyp[]>, nOpts: number, key: number, trackOf: (o: number, k: string) => (Val | undefined)[]): Verdict {
  const groups = new Map<string, Map<string, string[]>>();
  for (const k of keys) {
    const meta = metas.get(k)!;
    const g = groups.get(meta.group) ?? new Map<string, string[]>();
    g.set(meta.view, [...(g.get(meta.view) ?? []), k]);
    groups.set(meta.group, g);
  }
  const minC = (hs: Hyp[]) => (hs.length ? Math.min(...hs.map((h) => h.c)) : Infinity);
  const defensible: boolean[] = [];
  const optCost: number[] = [];
  for (let o = 0; o < nOpts; o++) {
    let ok = true;
    let cost = 0;
    for (const views of groups.values()) {
      let best = Infinity;
      for (const ks of views.values()) {
        let c = 0;
        for (const k of ks) {
          const t = trackOf(o, k);
          c += minC(hyps.get(k)!.filter((h) => h.fits(t)));
        }
        best = Math.min(best, c);
      }
      if (best === Infinity) ok = false;
      else cost += best;
    }
    defensible.push(ok);
    optCost.push(ok ? cost : Infinity);
  }
  const rules: Record<string, string> = {};
  // K2: in every group, the view and rules the key uses are the simplest the visible terms allow,
  // and every equally simple rule agrees with the key.
  let baseline = 0;
  for (const views of groups.values()) {
    let groupBest = Infinity;
    for (const ks of views.values())
      groupBest = Math.min(
        groupBest,
        ks.reduce((s, k) => s + minC(hyps.get(k)!), 0),
      );
    baseline += groupBest;
    let keyBest = Infinity;
    let keyView: string[] = [];
    for (const ks of views.values()) {
      const c = ks.reduce((s, k) => s + minC(hyps.get(k)!.filter((h) => h.fits(trackOf(key, k)))), 0);
      if (c < keyBest) {
        keyBest = c;
        keyView = ks;
      }
    }
    if (keyBest > groupBest) return { ok: false, defensible, reason: `K2 simpler reading of ${[...views.values()].flat().join(',')}`, complexity: baseline, rules };
    for (const k of keyView) {
      const hs = hyps.get(k)!;
      const c = minC(hs);
      const simplest = hs.filter((h) => h.c === c);
      if (!simplest.every((h) => h.fits(trackOf(key, k)))) return { ok: false, defensible, reason: `K2 ambiguous ${k}`, complexity: baseline, rules };
      rules[k] = simplest[0]?.name ?? '';
    }
  }
  const supported = defensible.filter(Boolean).length;
  const ok = defensible[key] && supported === 1;
  return {
    ok,
    defensible,
    reason: ok ? undefined : defensible[key] ? `K1 ${supported} options supported` : 'K1 key not supported',
    complexity: optCost[key] === Infinity ? baseline : optCost[key],
    rules,
  };
}

/* ------------------------------------------------------------- analogies */

/**
 * a1 : b1 (, a2 : b2 …) = q : ? — per feature the change from each a to its b must carry over to q.
 * Rules: unchanged (0); the same numeric step (1); a fixed mapping or a fixed result (1, or 2 when a
 * numeric step also explains it); swapping the two values (2).
 */
export function judgeAnalogy<T>(pairs: [T, T][], query: T, options: T[], key: number, extract: (p: T) => Feat[]): Verdict {
  const featsOf = (p: T) => new Map(extract(p).map((f) => [f.key, f]));
  const A = pairs.map(([a, b]) => [featsOf(a), featsOf(b)] as const);
  const Q = featsOf(query);
  const O = options.map(featsOf);
  const metas = new Map<string, Meta>();
  for (const mp of [...A.flat(), Q, ...O])
    for (const f of mp.values())
      if (!metas.has(f.key))
        metas.set(f.key, {
          group: f.group ?? f.key,
          view: f.view ?? '',
          num: f.mod !== undefined || typeof f.value === 'number',
          mod: f.mod,
          step: f.step ?? 1,
          rel: false,
          free: !!f.free,
        });
  const keys = [...metas.keys()];
  const v = (mp: Map<string, Feat>, k: string) => mp.get(k)?.value ?? NONE;
  for (const k of keys) {
    if (!metas.get(k)!.free) continue;
    if (!O.every((o) => eqv(v(o, k), v(O[0], k)))) return { ok: false, defensible: options.map(() => false), reason: `K3 ${k}`, complexity: 0, rules: {} };
  }
  const hyps = new Map<string, Hyp[]>();
  for (const k of keys) {
    const meta = metas.get(k)!;
    if (meta.free) continue;
    const ex = A.map(([a, b]) => [v(a, k), v(b, k)] as const);
    const q = v(Q, k);
    const hs: Hyp[] = [];
    // The track handed to `fits` is [q, answer].
    const result = (pred: Val) => (t: (Val | undefined)[]) => eqv(t[1], pred);
    if (ex.every(([a, b]) => eqv(a, b))) hs.push({ name: 'tetap', c: 0, fits: result(q) });
    const numeric = meta.num && [...ex.flat(), q].every(isNum);
    let stepped = false;
    if (numeric) {
      const d = modOf((ex[0][1] as number) - (ex[0][0] as number), meta.mod);
      if (d !== 0 && ex.every(([a, b]) => modOf((b as number) - (a as number), meta.mod) === d)) {
        hs.push({ name: `langkah ${d}`, c: 1, fits: result(modOf((q as number) + d, meta.mod)) });
        stepped = true;
      }
    }
    if (!ex.every(([a, b]) => eqv(a, b))) {
      const map = new Map<Val, Val>();
      let fn = true;
      for (const [a, b] of ex) {
        if (map.has(a) && !eqv(map.get(a), b)) fn = false;
        map.set(a, b);
      }
      if (fn && map.has(q)) hs.push({ name: 'berubah menjadi', c: 1, fits: result(map.get(q)!) });
      else if (ex.every(([, b]) => eqv(b, ex[0][1]))) hs.push({ name: 'selalu menjadi', c: stepped ? 2 : 1, fits: result(ex[0][1]) });
      const vals = new Set(ex.flat());
      if (vals.size === 2 && !map.has(q) && vals.has(q)) {
        const other = [...vals].find((x) => !eqv(x, q))!;
        hs.push({ name: 'bertukar', c: 2, fits: result(other) });
      }
    }
    hyps.set(k, hs);
  }
  return decide(
    keys.filter((k) => !metas.get(k)!.free),
    metas,
    hyps,
    options.length,
    key,
    (o, k) => [v(Q, k), v(O[o], k)],
  );
}

/* --------------------------------------------------------------- matrices */

/**
 * A 3×3 grid read row by row, "?" last. Per feature: the same everywhere (0), the same along each
 * row or column (1), each row or column holding the same three values (2), each row or column
 * stepping by the same amount (2), or rows summing to the same number (3).
 */
export function judgeMatrix<T>(cells: (T | null)[], options: T[], key: number, extract: (p: T) => Feat[]): Verdict {
  const featsOf = (p: T) => new Map(extract(p).map((f) => [f.key, f]));
  const grid = cells.map((c) => (c ? featsOf(c) : null));
  const O = options.map(featsOf);
  const metas = new Map<string, Meta>();
  for (const mp of [...grid.filter((g) => !!g), ...O])
    for (const f of mp.values())
      if (!metas.has(f.key))
        metas.set(f.key, {
          group: f.group ?? f.key,
          view: f.view ?? '',
          num: f.mod !== undefined || typeof f.value === 'number',
          mod: f.mod,
          step: f.step ?? 1,
          rel: false,
          free: !!f.free,
        });
  const keys = [...metas.keys()];
  const at = (k: string, o: number) => grid.map((g) => (g ? (g.get(k)?.value ?? NONE) : (O[o].get(k)?.value ?? NONE)));
  const lines = (byRow: boolean) => [0, 1, 2].map((a) => [0, 1, 2].map((b) => (byRow ? a * 3 + b : b * 3 + a)));
  const hyps = new Map<string, Hyp[]>();
  for (const k of keys) {
    const meta = metas.get(k)!;
    const vis = grid.map((g) => (g ? (g.get(k)?.value ?? NONE) : undefined));
    const hs: Hyp[] = [];
    const visOk = (pred: (vals: (Val | undefined)[]) => boolean) => pred(vis);
    const allSame = (t: (Val | undefined)[]) => t.every((x) => x === undefined || eqv(x, t[0]));
    if (visOk(allSame)) hs.push({ name: 'tetap', c: 0, fits: allSame });
    for (const byRow of [true, false]) {
      const L = lines(byRow);
      const where = byRow ? 'baris' : 'kolom';
      const lineSame = (t: (Val | undefined)[]) => L.every((l) => l.every((i) => t[i] === undefined || eqv(t[i], t[l[0]])));
      if (visOk(lineSame) && !visOk(allSame)) hs.push({ name: `sama dalam setiap ${where}`, c: 1, fits: lineSame });
      const latin = (t: (Val | undefined)[]) => {
        const sets = L.map((l) => l.map((i) => t[i]));
        const full = sets.filter((s) => s.every((x) => x !== undefined));
        if (!full.length) return false;
        const ref = new Set(full[0]);
        if (ref.size !== 3) return false;
        return sets.every((s) => s.every((x) => x === undefined || ref.has(x)) && new Set(s.filter((x) => x !== undefined)).size === s.filter((x) => x !== undefined).length);
      };
      if (visOk(latin)) hs.push({ name: `tiga nilai yang sama di setiap ${where}`, c: 2, fits: latin });
      const numeric = meta.num && vis.every((x) => x === undefined || isNum(x));
      if (numeric) {
        for (const d of stepsFor(meta)) {
          const stepping = (t: (Val | undefined)[]) =>
            L.every((l) =>
              [0, 1].every((j) => t[l[j]] === undefined || t[l[j + 1]] === undefined || modOf((t[l[j + 1]] as number) - (t[l[j]] as number), meta.mod) === modOf(d, meta.mod)),
            );
          if (visOk(stepping)) hs.push({ name: `bertambah ${d} di setiap ${where}`, c: 2, fits: stepping });
        }
        if (!meta.mod) {
          const sums = (t: (Val | undefined)[]) => {
            const s = L.map((l) => (l.every((i) => t[i] !== undefined) ? l.reduce((a, i) => a + (t[i] as number), 0) : null)).filter((x) => x !== null);
            return s.length >= 2 && s.every((x) => x === s[0]);
          };
          if (visOk(sums)) hs.push({ name: `jumlahnya sama di setiap ${where}`, c: 3, fits: sums });
        }
      }
    }
    hyps.set(k, hs);
  }
  return decide(keys, metas, hyps, options.length, key, (o, k) => at(k, o));
}

/* ------------------------------------------------------------ odd one out */

/** Which options are the only one differing from the other four in some feature. */
export function oddOnes<T>(options: T[], extract: (p: T) => Feat[]): number[] {
  const maps = options.map((o) => new Map(extract(o).map((f) => [f.key, f.value])));
  const keys = new Set(maps.flatMap((m) => [...m.keys()]));
  const out = new Set<number>();
  for (const k of keys) {
    const vals = maps.map((m) => m.get(k) ?? NONE);
    for (let i = 0; i < vals.length; i++) {
      const others = vals.filter((_, j) => j !== i);
      if (others.every((x) => eqv(x, others[0])) && !eqv(vals[i], others[0])) out.add(i);
    }
  }
  return [...out];
}
