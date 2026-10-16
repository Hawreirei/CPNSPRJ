import { describePic } from '../describe';
import { foldShapes, insideShape, unfold } from '../fold';
import { dirName, FOLD_NAMES, LATTICE_SEGMENTS, norm, picKey } from '../pic';
import type { Difficulty, FoldCell, FoldKind, HolesCell, LinesCell, Pic, Question, StrokeCell } from '../types';
import { chance, chooseOptions, pick, randInt, stemFor, verifyAnalogy, verifyDistinct, verifySeries, type Archetype, type Draft, type Lure, type Rand } from './build';
import { picFeats, termFeats } from './features';
import { judgeAnalogy, judgeSeries, oddOnes, type Feat } from './solver';

/*
 * Line figures with dots (example 1 of the design), lattices of lines (overlaid and mirrored),
 * and folded, punched paper.
 */

/* ------------------------------------------------------- F4: line figures */

type SProp = 'strands' | 'apex' | 'attached' | 'dots' | 'dotSide';
const SPROP_WORD: Record<SProp, string> = { strands: 'jumlah garis', apex: 'arah puncak', attached: 'titik menempel', dots: 'jumlah titik', dotSide: 'sisi deretan titik' };
const sWord = (p: SProp, v: number | boolean) => (p === 'apex' || p === 'dotSide' ? dirName(v as number) : p === 'attached' ? (v ? 'menempel' : 'terlepas') : `${v}`);

function strokeMutations(c: StrokeCell, r: Rand): StrokeCell[] {
  const out: StrokeCell[] = [
    { ...c, apex: norm(c.apex + pick([90, 180, 270], r)) },
    { ...c, strands: c.strands < 4 ? c.strands + 1 : c.strands - 1 },
    { ...c, strands: c.strands > 2 ? c.strands - 1 : c.strands + 1 },
    { ...c, attached: !c.attached, dots: c.strands },
  ];
  if (!c.attached) out.push({ ...c, dots: c.dots < 4 ? c.dots + 1 : c.dots - 1 }, { ...c, dotSide: norm(c.dotSide + pick([90, 180, 270], r)) });
  return out.filter((x) => picKey(x) !== picKey(c));
}
const strokePool = (c: StrokeCell, r: Rand, around: Pic[]) => {
  const one = strokeMutations(c, r);
  return [...one, ...[...one, ...(around as StrokeCell[])].flatMap((x) => strokeMutations(x, r))];
};
const validStroke = (c: StrokeCell) => c.strands >= 2 && c.strands <= 4 && (c.attached ? c.dots === c.strands : c.dots >= 1 && c.dots <= 4);

function randomStroke(r: Rand): StrokeCell {
  const strands = randInt(2, 4, r);
  const attached = chance(0.5, r);
  return { kind: 'strokes', strands, apex: pick([0, 90, 180, 270], r), attached, dots: attached ? strands : randInt(1, 4, r), dotSide: pick([0, 90, 180, 270], r) };
}

function makeStrokeSeries(d: Difficulty, r: Rand): Draft | null {
  const n = d === 'mudah' ? 5 : d === 'sedang' ? randInt(5, 6, r) : 6;
  const m = d !== 'mudah' && chance(0.3, r) ? randInt(2, n - 2, r) : n - 1;
  const base = randomStroke(r);
  const props: SProp[] = (['apex', 'strands', ...(base.attached ? [] : (['dots', 'dotSide'] as SProp[]))] as SProp[])
    .sort(() => r() - 0.5)
    .slice(0, d === 'mudah' ? 1 : d === 'sedang' ? 2 : 3);
  const tracks: { prop: SProp; values: number[]; rule: string; family: string; param: string }[] = [];
  for (const p of props) {
    if (p === 'apex' || p === 'dotSide') {
      const step = pick(d === 'mudah' ? [90, -90] : [90, -90, 180], r);
      const alt = d === 'sulit' && chance(0.4, r);
      const values: number[] = [base[p]];
      for (let i = 1; i < n; i++) values.push(norm(values[i - 1] + (alt && i % 2 === 0 ? 0 : step)));
      tracks.push({
        prop: p,
        values,
        family: alt ? 'alternate' : 'rotate',
        param: `${step}${alt ? '/0' : ''}`,
        rule: `${SPROP_WORD[p]} berputar ${Math.abs(step)}° ${step > 0 ? 'searah' : 'berlawanan arah'} jarum jam${alt ? ' setiap dua langkah' : ' setiap langkah'}`,
      });
    } else {
      const kind = chance(0.5, r) ? 'repeat' : 'step';
      const lo = p === 'strands' ? 2 : 1;
      const hi = 4;
      let values: number[];
      if (kind === 'step') {
        const step = pick([1, -1], r);
        const start = step > 0 ? lo : hi;
        values = Array.from({ length: n }, (_, i) => start + step * i);
        if (values.some((v) => v < lo || v > hi)) {
          // Up then down: 2, 3, 4, 3, 2 …
          const span = hi - lo;
          values = Array.from({ length: n }, (_, i) => lo + Math.abs(((i + span) % (2 * span)) - span));
          tracks.push({ prop: p, values, family: 'bounce', param: 'b', rule: `${SPROP_WORD[p]} naik satu-satu sampai ${hi}, lalu turun lagi` });
          continue;
        }
        tracks.push({ prop: p, values, family: 'step', param: `${step}`, rule: `${SPROP_WORD[p]} ${step > 0 ? 'bertambah' : 'berkurang'} satu setiap langkah` });
      } else {
        const a = randInt(lo, hi, r);
        const b = pick(
          [lo, lo + 1, hi].filter((x) => x !== a),
          r,
        );
        values = Array.from({ length: n }, (_, i) => (i % 2 ? b : a));
        tracks.push({ prop: p, values, family: 'repeat', param: 'p2', rule: `${SPROP_WORD[p]} bergantian ${a} dan ${b}` });
      }
    }
  }
  const cells = Array.from({ length: n }, (_, i) => {
    const c: StrokeCell = { ...base };
    for (const t of tracks) (c as unknown as Record<string, number>)[t.prop] = t.values[i];
    if (c.attached) c.dots = c.strands;
    return c;
  });
  if (!cells.every(validStroke)) return null;
  const key = cells[m];
  const seq = cells.map((c, i) => (i === m ? null : c));
  const prevC = cells[m > 0 ? m - 1 : m + 1];
  const lures: Lure[] = tracks.map((t) => ({
    pic: { ...key, [t.prop]: prevC[t.prop] } as StrokeCell,
    why: `${SPROP_WORD[t.prop]} dianggap sama dengan gambar sebelumnya, padahal ${t.rule}.`,
  }));
  lures.push(...tracks.filter((t) => t.prop === 'apex').map((t) => ({ pic: { ...key, apex: norm(key.apex + 180) }, why: `Arah puncaknya terbalik; ${t.rule}.` })));
  const okLures = lures.filter((l) => validStroke(l.pic as StrokeCell));
  const pool = strokePool(
    key,
    r,
    okLures.map((l) => l.pic),
  ).filter(validStroke);
  const cands = [...okLures.map((l) => l.pic), ...pool];
  const v = judgeSeries<Pic>(seq, [key, ...cands], 0, termFeats);
  if (!v.defensible[0] || v.reason?.startsWith('K2')) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(key, okLures, pool, r, (p) => supported.has(picKey(p)));
  if (!chosen) return null;
  const final = judgeSeries<Pic>(seq, chosen.options, chosen.answerIdx, termFeats);
  if (!final.ok) return null;
  return {
    stem: stemFor(m === n - 1 ? 'series' : 'series-mid', r),
    figure: { layout: 'series', cells: seq },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: [...new Set(tracks.map((t) => t.family))],
      signature: `strokes-series|${base.attached ? 'att' : 'det'}|${tracks
        .map((t) => `${t.prop}:${t.family}:${t.param}`)
        .sort()
        .join('|')}`,
      complexity: final.complexity + +(m !== n - 1),
      tracks: tracks.map((t) => ({ label: SPROP_WORD[t.prop], values: t.values.map((x, i) => `${i === m ? '? = ' : ''}${sWord(t.prop, x)}`) })),
    },
    explanation: (ans) =>
      `Pola:\n${tracks.map((t) => `• ${t.rule}.`).join('\n')}\n\n${tracks.map((t) => `${SPROP_WORD[t.prop]}: ${t.values.map((x, i) => (i === m ? '?' : sWord(t.prop, x))).join(' → ')}`).join('\n')}\n\nJadi gambar ke-${m + 1}: ${describePic(key)} (${ans}).`,
  };
}

/** Example 1 of the design: 1 → 2 is the same change as 3 → 4. */
function makeStrokePairs(d: Difficulty, r: Rand): Draft | null {
  // The change: turn the apex, take a line away or add one, detach or attach the dots.
  const turn = pick(d === 'mudah' ? [90, 180, 270] : [0, 90, 180, 270], r);
  const toggle = d === 'sulit' || (d === 'sedang' && chance(0.6, r));
  const strandStep = d === 'sulit' ? pick([1, -1], r) : chance(0.5, r) ? pick([1, -1], r) : 0;
  const attached0 = chance(0.5, r);
  // Both figures start alike: as many dots as lines; detached dots line up where the apex points.
  const start = (): StrokeCell => {
    const strands = randInt(Math.max(2, 2 - strandStep), Math.min(4, 4 - strandStep), r);
    const apex = pick([0, 90, 180, 270], r);
    return { kind: 'strokes', strands, apex, attached: attached0, dots: strands, dotSide: apex };
  };
  const A = start();
  const C = start();
  const change = (x: StrokeCell): StrokeCell => {
    const strands = x.strands + strandStep;
    const attached = toggle ? !x.attached : x.attached;
    const apex = norm(x.apex + turn);
    return { ...x, apex, strands, attached, dots: attached ? strands : x.dots, dotSide: apex };
  };
  const B = change(A);
  const D = change(C);
  if (![A, B, C, D].every(validStroke) || picKey(A) === picKey(C)) return null;
  const nChanges = +(turn !== 0) + +toggle + +(strandStep !== 0);
  if (nChanges < (d === 'mudah' ? 1 : d === 'sedang' ? 2 : 3)) return null;
  const lures: Lure[] = [{ pic: C, why: 'Gambar ketiga belum diubah sama sekali.' }];
  if (turn)
    lures.push(
      { pic: { ...D, apex: C.apex }, why: 'Arah puncaknya belum diputar seperti pada pasangan pertama.' },
      { pic: { ...D, apex: norm(C.apex - turn) }, why: 'Puncaknya diputar ke arah yang terbalik.' },
    );
  if (toggle)
    lures.push({ pic: { ...D, attached: C.attached, dots: C.attached ? D.strands : C.dots }, why: 'Titik-titiknya belum dilepas atau ditempelkan seperti pada pasangan pertama.' });
  if (strandStep) lures.push({ pic: { ...D, strands: C.strands, dots: D.attached ? C.strands : D.dots }, why: 'Jumlah garisnya belum diubah seperti pada pasangan pertama.' });
  const okLures = lures.filter((l) => validStroke(l.pic as StrokeCell));
  const pool = strokePool(
    D,
    r,
    okLures.map((l) => l.pic),
  ).filter(validStroke);
  const cands = [...okLures.map((l) => l.pic), ...pool];
  const v = judgeAnalogy<Pic>([[A, B]], C, [D, ...cands], 0, picFeats);
  if (!v.defensible[0]) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(D, okLures, pool, r, (p) => supported.has(picKey(p)));
  if (!chosen) return null;
  const final = judgeAnalogy<Pic>([[A, B]], C, chosen.options, chosen.answerIdx, picFeats);
  if (!final.ok) return null;
  const rule = [
    turn ? `puncak berputar ${turn === 180 ? '180°' : `${turn === 90 ? 90 : 90}° ${turn === 90 ? 'searah' : 'berlawanan arah'} jarum jam`}` : '',
    toggle ? 'titik yang menempel dilepas (atau sebaliknya)' : '',
    strandStep ? `jumlah garis ${strandStep > 0 ? 'bertambah' : 'berkurang'} satu` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return {
    stem: stemFor('analogy', r),
    figure: { layout: 'analogy', cells: [A, B, C, null] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: ['pairs', ...(toggle ? ['toggle'] : []), ...(turn ? ['rotate'] : [])],
      signature: `strokes-pairs|t${turn}|${toggle ? 'tog' : ''}|s${strandStep}`,
      complexity: final.complexity + nChanges,
    },
    explanation: (ans) => `Dari gambar 1 ke gambar 2: ${rule}.\n\nTerapkan pada gambar 3. Hasilnya: ${describePic(D)} (${ans}).`,
  };
}

/** Odd one out by a relation: four figures have as many dots as lines, one does not. */
function strokeRelation(p: StrokeCell): Feat[] {
  return [{ key: 'match', value: p.dots === p.strands ? 'sama' : 'beda' }];
}
function makeStrokeOdd(d: Difficulty, r: Rand): Draft | null {
  const odd = randInt(0, 4, r);
  const opts: StrokeCell[] = [];
  for (let i = 0; i < 5; i++) {
    const strands = randInt(2, 4, r);
    const dots =
      i === odd
        ? pick(
            [1, 2, 3, 4].filter((x) => x !== strands),
            r,
          )
        : strands;
    // Detached dots, so the count has to be compared, not seen at the line ends.
    opts.push({
      kind: 'strokes',
      strands,
      apex: pick([0, 90, 180, 270], r),
      attached: d === 'mudah' && i !== odd ? chance(0.5, r) : false,
      dots,
      dotSide: pick([0, 90, 180, 270], r),
    });
  }
  if (new Set(opts.map(picKey)).size !== 5) return null;
  // No property on its own may single out another figure.
  const plain = oddOnes<Pic>(opts, picFeats).filter((i) => i !== odd);
  if (plain.length) return null;
  if (oddOnes<Pic>(opts, (p) => strokeRelation(p as StrokeCell)).join() !== `${odd}`) return null;
  return {
    stem: stemFor('odd', r),
    figure: { layout: 'odd-one-out', cells: [] },
    options: opts,
    answerIdx: odd,
    rationales: opts.map((o, i) => (i === odd ? undefined : `Gambar ini punya ${o.strands} garis dan ${o.dots} titik: jumlahnya sama.`)),
    meta: { families: ['relation'], signature: `strokes-odd|${d}`, complexity: d === 'mudah' ? 2 : 3 },
    explanation: (label) =>
      `Pada empat gambar, jumlah titik sama dengan jumlah garis. Gambar ${label} punya ${opts[odd].strands} garis tetapi ${opts[odd].dots} titik, jadi tidak sesuai.`,
  };
}

/* ------------------------------------------------- F11: lines overlaid */

type Op = 'union' | 'xor' | 'and' | 'minus';
const OPS: Record<Op, { name: string; apply: (a: number[], b: number[]) => number[] }> = {
  union: { name: 'semua garis kedua gambar digabung', apply: (a, b) => [...new Set([...a, ...b])] },
  xor: { name: 'garis yang ada di kedua gambar hilang, sisanya digabung', apply: (a, b) => [...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x))] },
  and: { name: 'hanya garis yang ada di kedua gambar yang tersisa', apply: (a, b) => a.filter((x) => b.includes(x)) },
  minus: { name: 'garis gambar kedua dihapus dari gambar pertama', apply: (a, b) => a.filter((x) => !b.includes(x)) },
};
const lines = (segs: number[]): LinesCell => ({ kind: 'lines', segs: [...new Set(segs)].sort((x, y) => x - y) });
const randomSegs = (k: number, r: Rand) => [...Array(20).keys()].sort(() => r() - 0.5).slice(0, k);

/** Ops that turn a and b into c. */
const opsFitting = (a: number[], b: number[], c: number[]) => (Object.keys(OPS) as Op[]).filter((o) => picKey(lines(OPS[o].apply(a, b))) === picKey(lines(c)));

function makeOverlay(d: Difficulty, r: Rand): Draft | null {
  const ops: Op[] = d === 'mudah' ? ['union', 'xor', 'and'] : ['union', 'xor', 'and', 'minus'];
  const op = pick(ops, r);
  // More lines to keep track of at higher levels.
  const k = d === 'mudah' ? randInt(3, 4, r) : d === 'sedang' ? randInt(4, 5, r) : randInt(5, 6, r);
  const A = randomSegs(k, r);
  const B = [...A.slice(0, randInt(1, 2, r)), ...randomSegs(k, r)].slice(0, k);
  const D = randomSegs(k, r);
  const E = [...D.slice(0, randInt(1, 2, r)), ...randomSegs(k, r)].slice(0, k);
  const C = OPS[op].apply(A, B);
  const key = OPS[op].apply(D, E);
  // The example row must allow only one reading, and the answer must not be empty.
  if (opsFitting(A, B, C).join() !== op || key.length < 2 || C.length < 2) return null;
  const keyPic = lines(key);
  const lures: Lure[] = (Object.keys(OPS) as Op[])
    .filter((o) => o !== op)
    .map((o) => ({ pic: lines(OPS[o].apply(D, E)), why: `Ini hasil bila ${OPS[o].name}; contoh di baris pertama menunjukkan aturan lain.` }))
    .filter((l) => (l.pic as LinesCell).segs.length > 0);
  lures.push({ pic: lines(D), why: 'Ini gambar pertama saja, belum digabung.' }, { pic: lines(E), why: 'Ini gambar kedua saja, belum digabung.' });
  const pool: Pic[] = [];
  for (let i = 0; i < 12; i++) {
    const s = randInt(0, 19, r);
    pool.push(lines(key.includes(s) ? key.filter((x) => x !== s) : [...key, s]));
  }
  const chosen = chooseOptions(keyPic, lures, pool, r, (p) => (p as LinesCell).segs.length === 0);
  if (!chosen) return null;
  return {
    stem: 'Pada baris pertama, gambar ketiga dibentuk dari dua gambar di depannya. Dengan aturan yang sama, gambar manakah yang tepat untuk tanda tanya?',
    figure: { layout: 'sum', cells: [lines(A), lines(B), lines(C), lines(D), lines(E), null] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: { families: [op], signature: `overlay|${op}|${k}`, complexity: { union: 1, xor: 3, and: 2, minus: 3 }[op] + (d === 'sulit' ? 2 : 0) },
    explanation: (ans) => `Aturan di baris pertama: ${OPS[op].name}.\n\nTerapkan pada baris kedua: ${describePic(keyPic)} (${ans}).`,
  };
}

function verifyOverlay(q: Question): boolean {
  const c = (q.figure?.cells ?? []).map((x) => (x as LinesCell | null)?.segs ?? []);
  const fit = opsFitting(c[0], c[1], c[2]);
  if (fit.length !== 1) return false;
  const want = picKey(lines(OPS[fit[0]].apply(c[3], c[4])));
  return q.options.filter((o) => picKey(o.figure!) === want).length === 1 && picKey(q.options.find((o) => o.label === q.answer)!.figure!) === want;
}

/* --------------------------------------------- F13: mirroring a line drawing */

const LP = (i: number): [number, number] => [i % 3, Math.floor(i / 3)];
const LI = ([x, y]: [number, number]) => y * 3 + x;
const segOf = (a: number, b: number) => LATTICE_SEGMENTS.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a));
const mapSegs = (segs: number[], f: (p: [number, number]) => [number, number]) => segs.map((s) => segOf(LI(f(LP(LATTICE_SEGMENTS[s][0]))), LI(f(LP(LATTICE_SEGMENTS[s][1])))));
type LStep = 'r90' | 'r180' | 'r270' | 'mh' | 'mv';
const LSTEPS: Record<LStep, { name: string; f: (p: [number, number]) => [number, number] }> = {
  r90: { name: 'diputar 90° searah jarum jam', f: ([x, y]) => [2 - y, x] },
  r180: { name: 'diputar 180°', f: ([x, y]) => [2 - x, 2 - y] },
  r270: { name: 'diputar 90° berlawanan arah jarum jam', f: ([x, y]) => [y, 2 - x] },
  mh: { name: 'dicerminkan terhadap garis tegak', f: ([x, y]) => [2 - x, y] },
  mv: { name: 'dicerminkan terhadap garis mendatar', f: ([x, y]) => [x, 2 - y] },
};
const runL = (segs: number[], steps: LStep[]) => steps.reduce((s, k) => mapSegs(s, LSTEPS[k].f), segs);

function makeLinesTransform(d: Difficulty, r: Rand): Draft | null {
  const src = randomSegs(d === 'mudah' ? 4 : 5, r);
  const all = Object.keys(LSTEPS) as LStep[];
  // A drawing equal to any of its turns or mirror images would make several options the same.
  const images = all.map((s) => picKey(lines(runL(src, [s]))));
  if (new Set([picKey(lines(src)), ...images]).size !== 6) return null;
  const steps: LStep[] =
    d === 'mudah' ? [pick(all, r)] : d === 'sedang' ? [pick(['mh', 'mv', 'r90', 'r270'] as LStep[], r)] : [pick(['mh', 'mv'] as LStep[], r), pick(['r90', 'r270'] as LStep[], r)];
  const answer = lines(runL(src, steps));
  const lures: Lure[] = [
    { pic: lines(src), why: 'Ini gambar awal yang belum diubah.' },
    ...all.filter((s) => !(steps.length === 1 && steps[0] === s)).map((s) => ({ pic: lines(runL(src, [s])), why: `Ini hasil bila gambar ${LSTEPS[s].name}.` })),
  ];
  if (steps.length === 2) lures.push({ pic: lines(runL(src, [steps[1], steps[0]])), why: 'Ini terjadi bila urutan kedua langkah dibalik.' });
  const chosen = chooseOptions(answer, lures, [], r);
  if (!chosen) return null;
  const name = steps.map((s) => LSTEPS[s].name).join(', lalu ');
  return {
    stem: `Gambar garis berikut ${name}. Gambar manakah hasilnya?`,
    figure: { layout: 'transform', cells: [lines(src), null] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: { families: [...new Set(steps.map((s) => (s.startsWith('m') ? 'mirror' : 'rotate')))], signature: `lines-transform|${steps.join('+')}`, complexity: steps.length + 1 },
    explanation: (ans) =>
      `Bayangkan titik-titik ujung setiap garis ikut ${name}. Garis yang semula di kiri berpindah sesuai langkah itu, begitu pula garis miring.\n\nHasilnya: ${describePic(answer)} (${ans}).`,
  };
}

function verifyLinesTransform(q: Question): boolean {
  const steps = q.figureMeta?.signature.split('|')[1]?.split('+') as LStep[] | undefined;
  const src = q.figure?.cells[0] as LinesCell | undefined;
  if (!src || !steps?.every((s) => s in LSTEPS)) return false;
  return picKey(q.options.find((o) => o.label === q.answer)!.figure!) === picKey(lines(runL(src.segs, steps)));
}

/** Odd one out: four drawings are their own mirror image (left-right), one is not. */
function symmetryFeats(p: Pic): Feat[] {
  const s = (p as LinesCell).segs;
  return [{ key: 'sym', value: picKey(lines(mapSegs(s, LSTEPS.mh.f))) === picKey(lines(s)) ? 'simetris' : 'tidak' }];
}
function symmetricSegs(k: number, r: Rand): number[] {
  const half = randomSegs(k, r);
  return [...new Set([...half, ...mapSegs(half, LSTEPS.mh.f)])];
}
function makeLinesOdd(d: Difficulty, r: Rand): Draft | null {
  const odd = randInt(0, 4, r);
  const opts = Array.from({ length: 5 }, (_, i) => lines(i === odd ? randomSegs(randInt(4, 6, r), r) : symmetricSegs(d === 'mudah' ? 2 : 3, r)));
  if (new Set(opts.map(picKey)).size !== 5) return null;
  if (oddOnes<Pic>(opts, symmetryFeats).join() !== `${odd}`) return null;
  // The odd one should not stand out by sheer number of lines.
  const counts = opts.map((o) => o.segs.length);
  if (counts.filter((c) => c === counts[odd]).length < 2) return null;
  return {
    stem: stemFor('odd', r),
    figure: { layout: 'odd-one-out', cells: [] },
    options: opts,
    answerIdx: odd,
    rationales: opts.map((_, i) => (i === odd ? undefined : 'Gambar ini sama dengan bayangan cerminnya (simetris kiri-kanan).')),
    meta: { families: ['symmetry'], signature: `lines-odd|${d}`, complexity: d === 'mudah' ? 2 : 3 },
    explanation: (label) =>
      `Bayangkan garis tegak di tengah setiap gambar. Empat gambar simetris: sisi kiri sama dengan bayangan sisi kanan. Gambar ${label} tidak simetris, jadi tidak sesuai.`,
  };
}

/* ------------------------------------------------- F12: folded, punched paper */

const HALF_FOLDS: FoldKind[] = ['R>L', 'L>R', 'T>B', 'B>T'];

function makeFold(d: Difficulty, r: Rand): Draft | null {
  const nFolds = d === 'mudah' ? 1 : d === 'sedang' ? 2 : randInt(2, 3, r);
  const folds: FoldKind[] = [];
  for (let i = 0; i < nFolds; i++) folds.push(d === 'sulit' && i === nFolds - 1 ? pick(['TR>BL', 'TL>BR', ...HALF_FOLDS] as FoldKind[], r) : pick(HALF_FOLDS, r));
  const shapes = foldShapes(folds);
  if (!shapes) return null;
  const last = shapes[shapes.length - 1];
  const inside = [...Array(16).keys()].filter((h) => insideShape(last, h));
  if (!inside.length) return null;
  // Three folds make eight layers: one hole is enough, or the opened sheet is all holes.
  const holes = inside.sort(() => r() - 0.5).slice(0, Math.min(inside.length, nFolds > 2 ? 1 : randInt(1, 2, r)));
  const key = unfold(folds, holes);
  if (!key || key.length > 8) return null;
  const keyPic: HolesCell = { kind: 'holes', holes: key };
  const lures: Lure[] = [{ pic: { kind: 'holes', holes }, why: 'Ini letak lubang sebelum kertas dibuka.' }];
  for (let until = 1; until < folds.length; until++) {
    const part = unfold(folds, holes, until);
    if (part) lures.push({ pic: { kind: 'holes', holes: part }, why: 'Ini terjadi bila tidak semua lipatan dibuka.' });
  }
  // The right holes mirrored the other way, as when a fold is opened to the wrong side.
  const flipH = key.map((h) => Math.floor(h / 4) * 4 + (3 - (h % 4)));
  const flipV = key.map((h) => (3 - Math.floor(h / 4)) * 4 + (h % 4));
  lures.push({ pic: { kind: 'holes', holes: [...flipH].sort((a, b) => a - b) }, why: 'Lubangnya dicerminkan ke arah yang salah.' });
  lures.push({ pic: { kind: 'holes', holes: [...flipV].sort((a, b) => a - b) }, why: 'Lubangnya dicerminkan ke arah yang salah.' });
  // One hole more or less than the key, or than a lure, so the key does not sit in the middle.
  const toggleHole = (hs: number[]) => {
    const h = randInt(0, 15, r);
    return { kind: 'holes' as const, holes: (hs.includes(h) ? hs.filter((x) => x !== h) : [...hs, h]).sort((a, b) => a - b) };
  };
  const pool: Pic[] = [];
  for (let i = 0; i < 6; i++) pool.push(toggleHole(key));
  for (const l of lures) for (let i = 0; i < 2; i++) pool.push(toggleHole((l.pic as HolesCell).holes));
  const chosen = chooseOptions(keyPic, lures, pool, r, (p) => (p as HolesCell).holes.length === 0);
  if (!chosen) return null;
  const cells: FoldCell[] = folds.map((_, i) => ({ kind: 'fold', folds: folds.slice(0, i + 1), ...(i === folds.length - 1 ? { holes } : {}) }));
  return {
    stem: `Selembar kertas persegi dilipat ${nFolds > 1 ? `${nFolds} kali seperti` : 'seperti'} gambar, lalu dilubangi pada lipatan terakhir. Bagaimana kertas itu setelah dibuka kembali?`,
    figure: { layout: 'fold', cells },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: ['fold', ...(folds.some((f) => f.includes('>B') && f.length > 3) ? ['diagonal'] : [])],
      signature: `fold|${folds.join('+')}|h${holes.length}`,
      complexity: nFolds * 2 + holes.length,
    },
    explanation: (ans) =>
      `Buka lipatan satu per satu dari yang terakhir: setiap lubang ikut dicerminkan terhadap garis lipatannya. Lipatan: ${folds.map((f) => FOLD_NAMES[f]).join(', lalu ')}.\n\nSetelah dibuka, lubangnya ada ${key.length}: ${describePic(keyPic).replace('Kertas berlubang di ', '')} (${ans}).`,
  };
}

function verifyFold(q: Question): boolean {
  const last = q.figure?.cells[q.figure.cells.length - 1] as FoldCell | undefined;
  if (!last?.holes) return false;
  const want = unfold(last.folds, last.holes);
  if (!want) return false;
  const key = picKey({ kind: 'holes', holes: want });
  return q.options.filter((o) => picKey(o.figure!) === key).length === 1 && picKey(q.options.find((o) => o.label === q.answer)!.figure!) === key;
}

/* ---------------------------------------------------------------- recipes */

export const MORE_ARCHETYPES: Archetype[] = [
  {
    id: 'strokes-series',
    topic: 'Deret Figural',
    name: 'Deret garis dan titik',
    about: 'Garis yang bertemu di satu puncak berputar, bertambah, atau melepas titiknya.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeStrokeSeries(d, r),
    verify: verifySeries(),
  },
  {
    id: 'strokes-pairs',
    topic: 'Analogi Figural',
    name: 'Pasangan garis dan titik',
    about: 'Gambar 1 ke 2 berubah seperti gambar 3 ke 4: puncak berputar, titik lepas, garis bertambah.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeStrokePairs(d, r),
    verify: verifyAnalogy,
  },
  {
    id: 'strokes-odd',
    topic: 'Figural Berbeda',
    name: 'Garis dan titik yang tidak cocok',
    about: 'Empat gambar punya titik sebanyak garisnya; satu tidak.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeStrokeOdd(d, r),
    verify: (q) =>
      verifyDistinct(q) &&
      oddOnes<Pic>(
        q.options.map((o) => o.figure!),
        (p) => strokeRelation(p as StrokeCell),
      ).join() === `${q.options.findIndex((o) => o.label === q.answer)}`,
  },
  {
    id: 'overlay',
    topic: 'Gabungan Gambar',
    name: 'Gabungan garis',
    about: 'Dua gambar garis ditumpuk: digabung, garis yang sama hilang, atau hanya yang sama tersisa.',
    families: [
      { id: 'union', name: 'Digabung' },
      { id: 'xor', name: 'Garis sama hilang' },
      { id: 'and', name: 'Hanya garis sama' },
      { id: 'minus', name: 'Dikurangi' },
    ],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeOverlay(d, r),
    verify: (q) => verifyDistinct(q) && verifyOverlay(q),
  },
  {
    id: 'lines-transform',
    topic: 'Transformasi Figural',
    name: 'Cermin gambar garis',
    about: 'Gambar garis diputar atau dicerminkan.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeLinesTransform(d, r),
    verify: (q) => verifyDistinct(q) && verifyLinesTransform(q),
  },
  {
    id: 'lines-odd',
    topic: 'Figural Berbeda',
    name: 'Yang tidak simetris',
    about: 'Empat gambar garis simetris kiri-kanan; satu tidak.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeLinesOdd(d, r),
    verify: (q) =>
      verifyDistinct(q) &&
      oddOnes<Pic>(
        q.options.map((o) => o.figure!),
        symmetryFeats,
      ).join() === `${q.options.findIndex((o) => o.label === q.answer)}`,
  },
  {
    id: 'fold',
    topic: 'Transformasi Figural',
    name: 'Kertas dilipat dan dilubangi',
    about: 'Kertas dilipat, dilubangi, lalu dibuka: lubangnya tercermin di setiap lipatan.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeFold(d, r),
    verify: (q) => verifyDistinct(q) && verifyFold(q),
  },
];
