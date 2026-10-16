import { describePic, FILL_NAMES } from '../describe';
import { dirName, FRAME_SLOTS, GLYPH_NAMES, GLYPH_SYMMETRY, moveSlot, norm, ORIENTED, picKey, slotAngle, slotName } from '../pic';
import type { Difficulty, Fill, FrameKind, GlyphKind, Pic, Question, SceneCell, SceneObject } from '../types';
import {
  chance,
  chooseOptions,
  pick,
  randInt,
  stemFor,
  verifyAnalogy,
  verifyDistinct,
  verifyMatrix,
  verifySeries,
  type Archetype,
  type Draft,
  type Lure,
  type Rand,
} from './build';
import { picFeats, sceneFeats, termFeats } from './features';
import { judgeAnalogy, judgeMatrix, judgeSeries, oddOnes, type Feat } from './solver';

/*
 * Scenes: a frame with numbered places and two or three objects, each moving by its own rule
 * (docs/rancangan-figural-v2.md §2–3). The recipes here build the objects' tracks, check the result
 * with the solver and pick wrong options from the usual misreadings.
 */

type Prop = 'slot' | 'dir' | 'anchor' | 'fill' | 'span';
type Val = string | number;

/** One object's property over the terms. */
interface STrack {
  glyph: GlyphKind;
  prop: Prop;
  family: string;
  param: string;
  values: Val[];
  rule: string;
  lures: { v: Val; why: string }[];
}

const PROP_WORD: Record<Prop, string> = { slot: 'letak', dir: 'arah', anchor: 'posisi', fill: 'arsiran', span: 'lebar' };

function valueWord(frame: FrameKind, prop: Prop, v: Val): string {
  if (prop === 'slot') return slotName(frame, v as number);
  if (prop === 'dir') return dirName(v as number);
  if (prop === 'anchor') return v === 'in' ? 'di dalam' : 'di luar';
  if (prop === 'fill') return FILL_NAMES[v as Fill];
  return `${v} juring`;
}

const turnWords = (d: number) => (norm(d) === 180 ? 'berputar 180°' : `berputar ${Math.abs(d)}° ${d > 0 ? 'searah' : 'berlawanan arah'} jarum jam`);
function moveWords(frame: FrameKind, k: number): string {
  const n = FRAME_SLOTS[frame];
  const kk = ((k % n) + n) % n;
  if (kk * 2 === n) return 'pindah ke seberang';
  const steps = Math.min(kk, n - kk);
  const cw = kk <= n / 2;
  const unit = frame === 'plain' || frame === 'ring8' ? `${steps * 45}°` : `${steps} ${frame === 'pie8' ? 'juring' : 'ruang'}`;
  return `bergeser ${unit} ${cw ? 'searah' : 'berlawanan arah'} jarum jam`;
}
function stepWords(frame: FrameKind, prop: Prop, d: number): string {
  if (prop === 'slot') return moveWords(frame, d);
  if (prop === 'dir') return turnWords(d);
  return `${d > 0 ? 'bertambah' : 'berkurang'} ${Math.abs(d)}`;
}

/* ------------------------------------------------------------ track values */

const modv = (x: number, m?: number) => (m ? ((x % m) + m) % m : x);
const stepVals = (start: number, d: number, n: number, m?: number) => Array.from({ length: n }, (_, i) => modv(start + d * i, m));
function altVals(start: number, d0: number, d1: number, n: number, m?: number) {
  const out = [modv(start, m)];
  for (let i = 1; i < n; i++) out.push(modv(out[i - 1] + (i % 2 ? d0 : d1), m));
  return out;
}

/**
 * A numeric track (place, direction, span) with a rule fitting the level, and the misreadings of it.
 * `mod` is the circle size; `steps` the step sizes allowed.
 */
function numericTrack(
  glyph: GlyphKind,
  prop: Prop,
  frame: FrameKind,
  n: number,
  m: number,
  family: 'step' | 'alternate' | 'repeat',
  steps: number[],
  start: number,
  r: Rand,
  mod?: number,
): STrack {
  const name = `${PROP_WORD[prop]} ${GLYPH_NAMES[glyph]}`;
  const prev = (vals: Val[]) => (m > 0 ? vals[m - 1] : vals[m + 1]) as number;
  const sgn = m > 0 ? 1 : -1;
  if (family === 'step') {
    const d = pick(steps, r);
    const values = stepVals(start, d, n, mod);
    const p = prev(values);
    return {
      glyph,
      prop,
      family: prop === 'dir' ? 'rotate' : prop === 'slot' ? 'move' : 'step',
      param: `${d}`,
      values,
      rule: `${name} ${stepWords(frame, prop, d)} setiap langkah`,
      lures: [
        { v: modv(p - sgn * d, mod), why: `Arahnya terbalik: ${name} seharusnya ${stepWords(frame, prop, d)}.` },
        { v: p, why: `${name[0].toUpperCase()}${name.slice(1)} dianggap tidak berubah, padahal ${stepWords(frame, prop, d)} setiap langkah.` },
        { v: modv(p + sgn * 2 * d, mod), why: `Perubahan ${name} diterapkan dua kali.` },
      ],
    };
  }
  if (family === 'alternate') {
    const d0 = pick(steps, r);
    const d1 = pick(
      [0, ...steps].filter((x) => modv(x, mod) !== modv(d0, mod)),
      r,
    );
    const values = altVals(start, d0, d1, n, mod);
    const p = prev(values);
    const other = m % 2 ? d1 : d0;
    const say = (x: number) => (x === 0 ? 'tetap' : stepWords(frame, prop, x));
    return {
      glyph,
      prop,
      family: 'alternate',
      param: `${d0}/${d1}`,
      values,
      rule: `${name} bergantian: ${say(d0)}, lalu ${say(d1)}, dan seterusnya`,
      lures: [{ v: m > 0 ? modv(p + other, mod) : values[1], why: `Langkah ${name} bergantian; di sini yang berlaku langkah yang lain.` }],
    };
  }
  const cyc = [modv(start, mod), modv(start + pick(steps, r), mod)];
  if (cyc[0] === cyc[1]) cyc[1] = modv(start + (mod ? mod / 2 : 1), mod);
  const values = Array.from({ length: n }, (_, i) => cyc[i % 2]);
  return {
    glyph,
    prop,
    family: 'repeat',
    param: 'p2',
    values,
    rule: `${name} bolak-balik: ${cyc.map((v) => valueWord(frame, prop, v)).join(' ↔ ')}`,
    lures: [{ v: values[m] === cyc[0] ? cyc[1] : cyc[0], why: `${name[0].toUpperCase()}${name.slice(1)} bolak-balik; hitung lagi urutannya.` }],
  };
}

/** Objects at each term from their starting state and tracks. */
function framesOf(frame: FrameKind, base: SceneObject[], tracks: STrack[], n: number): SceneCell[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'scene' as const,
    frame,
    objects: base.map((o) => tracks.filter((t) => t.glyph === o.glyph).reduce((x, t) => ({ ...x, [t.prop]: t.values[i] }), { ...o })),
  }));
}

/** Two objects drawn on top of each other: same place and the same side of the middle square. */
function collides(c: SceneCell): boolean {
  const seen = new Set<string>();
  for (const o of c.objects) {
    if (o.glyph === 'wedge' || o.glyph === 'swedge') continue;
    const k = c.frame === 'plain' ? `${o.slot % 8}:${o.anchor ?? 'out'}` : `${o.slot % FRAME_SLOTS[c.frame]}`;
    if (seen.has(k)) return true;
    seen.add(k);
  }
  if (c.frame === 'plain') {
    // Inside the square, only the corners hold objects: the sides belong to the triangles.
    if (c.objects.some((o) => o.glyph !== 'tab' && o.anchor === 'in' && o.slot % 2 === 0)) return true;
    // A tab outside a side and an object outside the next corners are fine; inside, a tab fills its side.
    const tabs = c.objects.filter((o) => o.glyph === 'tab');
    for (const t of tabs) for (const o of c.objects) if (o !== t && o.anchor === t.anchor && o.slot % 8 === t.slot % 8) return true;
  }
  if (c.frame === 'pie8') {
    const cover = new Map<number, number>();
    for (const o of c.objects) for (let k = 0; k < (o.span ?? 1); k++) cover.set((o.slot + k) % 8, (cover.get((o.slot + k) % 8) ?? 0) + 1);
    if ([...cover.values()].some((v) => v > 1)) return true;
  }
  return false;
}

const withProp = (c: SceneCell, glyph: GlyphKind, prop: Prop, v: Val): SceneCell => ({ ...c, objects: c.objects.map((o) => (o.glyph === glyph ? { ...o, [prop]: v } : o)) });

/** Wrong pictures one property away, on the objects' own properties. */
function sceneMutations(c: SceneCell, r: Rand): SceneCell[] {
  const out: SceneCell[] = [];
  for (const o of c.objects) {
    out.push(withProp(c, o.glyph, 'slot', moveSlot(c.frame, o.slot, pick([1, -1, 2], r) * (o.glyph === 'tab' ? 2 : 1))));
    if (o.glyph !== 'tab' && o.glyph !== 'wedge' && o.glyph !== 'swedge' && GLYPH_SYMMETRY[o.glyph].turn !== 0)
      out.push(withProp(c, o.glyph, 'dir', norm((o.dir ?? 0) + pick([90, 180, -90, 45], r))));
    if (o.anchor) out.push(withProp(c, o.glyph, 'anchor', o.anchor === 'in' ? 'out' : 'in'));
    if (o.span !== undefined) out.push(withProp(c, o.glyph, 'span', o.span > 1 ? o.span - 1 : o.span + 1));
    if (o.fill && o.glyph !== 'dot') out.push(withProp(c, o.glyph, 'fill', pick(['solid', 'empty', 'striped'] as Fill[], r)));
  }
  return out.filter((x) => !collides(x) && picKey(x) !== picKey(c));
}
function scenePool(c: SceneCell, r: Rand, around: Pic[]): SceneCell[] {
  const one = sceneMutations(c, r);
  const two = [...one, ...(around as SceneCell[])].flatMap((x) => sceneMutations(x, r));
  return [...one, ...two];
}

function trackWords(frame: FrameKind, t: STrack, n: number, m: number) {
  return {
    label: `${PROP_WORD[t.prop]} ${GLYPH_NAMES[t.glyph]}`,
    values: Array.from({ length: n }, (_, i) => `${i === m ? '? = ' : ''}${valueWord(frame, t.prop, t.values[i])}`),
  };
}

/** A series draft from tracks: judged, with options and words. */
function seriesDraft(arch: string, frame: FrameKind, base: SceneObject[], tracks: STrack[], n: number, m: number, r: Rand, note = ''): Draft | null {
  const cells = framesOf(frame, base, tracks, n);
  if (cells.some(collides)) return null;
  if (new Set(cells.map(picKey)).size < Math.min(n, 3)) return null;
  const key = cells[m];
  const seq = cells.map((c, i) => (i === m ? null : c));
  const lures: Lure[] = tracks.flatMap((t) => t.lures.map((l) => ({ pic: withProp(key, t.glyph, t.prop, l.v), why: l.why }))).filter((l) => !collides(l.pic as SceneCell));
  const pool = scenePool(
    key,
    r,
    lures.map((l) => l.pic),
  );
  const cands = [...lures.map((l) => l.pic), ...pool];
  const v = judgeSeries<Pic>(seq, [key, ...cands], 0, termFeats);
  if (!v.defensible[0] || v.reason?.startsWith('K2')) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(key, lures, pool, r, (p) => supported.has(picKey(p)));
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
      signature: `${arch}|${frame}|n${n}|m${m === n - 1 ? 'end' : 'mid'}|${tracks
        .map((t) => `${t.glyph}.${t.prop}:${t.family}:${t.param}`)
        .sort()
        .join('|')}`,
      complexity: final.complexity + +(m !== n - 1) + Math.max(0, base.length - 1),
      tracks: tracks.map((t) => trackWords(frame, t, n, m)),
    },
    explanation: (answer) =>
      `Pola:\n${tracks.map((t) => `• ${t.rule}.`).join('\n')}${note ? `\n${note}` : ''}\n\n${tracks
        .map((t) => `${PROP_WORD[t.prop]} ${GLYPH_NAMES[t.glyph]}: ${t.values.map((x, i) => (i === m ? '?' : valueWord(frame, t.prop, x))).join(' → ')}`)
        .join('\n')}\n\nJadi gambar ke-${m + 1}: ${describePic(key)} (${answer}).`,
  };
}

const lengthFor = (d: Difficulty, r: Rand) => (d === 'mudah' ? 5 : d === 'sedang' ? randInt(5, 6, r) : randInt(6, 7, r));
const gapFor = (d: Difficulty, n: number, r: Rand) => (d !== 'mudah' && chance(d === 'sulit' ? 0.4 : 0.2, r) ? randInt(2, n - 2, r) : n - 1);
const ROT_STEPS: Record<Difficulty, number[]> = { mudah: [90, -90], sedang: [90, -90, 45, -45, 180], sulit: [45, -45, 90, -90, 135, -135] };

/* ------------------------------------------------------------- F2: orbit */

function makeOrbit(d: Difficulty, r: Rand, want?: string[]): Draft | null {
  const frame: FrameKind = 'plain';
  const n = lengthFor(d, r);
  const m = gapFor(d, n, r);
  const objs: SceneObject[] = [];
  const tracks: STrack[] = [];
  const allowed = (f: string) => !want?.length || want.includes(f);
  const level = d === 'mudah' ? 1 : d === 'sedang' ? 2 : 3;

  // The arrow outside the square: moves around it, and points by its own rule or along its place.
  if (chance(0.85, r)) {
    const start = randInt(0, 7, r);
    const fam = level === 3 && chance(0.4, r) ? 'alternate' : 'step';
    const slot = numericTrack('arrow', 'slot', frame, n, m, fam, level === 1 ? [2, -2] : [1, -1, 2, -2, 3, -3], start, r, 8);
    tracks.push(slot);
    const mode = pick(
      (level === 1 ? ['shift', 'orbit'] : ['shift', 'orbit', 'rotate']).filter((f) => allowed(f) || !want?.some((w) => ['shift', 'orbit', 'rotate'].includes(w))),
      r,
    );
    const dir0 = pick([0, 90, 180, 270], r);
    if (mode === 'orbit') {
      const offset = norm(dir0 - slotAngle(frame, start));
      const values = slot.values.map((s) => norm(slotAngle(frame, s as number) + offset));
      const p = (m > 0 ? values[m - 1] : values[m + 1]) as number;
      tracks.push({
        glyph: 'arrow',
        prop: 'dir',
        family: 'orbit',
        param: `${offset}`,
        values,
        rule: `arah panah ikut berputar bersama letaknya (panah selalu ${offset === 0 ? 'menjauhi' : offset === 180 ? 'menghadap' : 'menyamping terhadap'} persegi)`,
        lures: [{ v: p, why: 'Panah dianggap hanya bergeser. Padahal arahnya ikut berputar mengikuti letaknya.' }],
      });
    } else if (mode === 'rotate') {
      tracks.push(numericTrack('arrow', 'dir', frame, n, m, level === 3 && chance(0.3, r) ? 'alternate' : 'step', ROT_STEPS[d], dir0, r, 360));
    } else {
      const values = slot.values.map(() => dir0);
      const orbitDir = norm(dir0 + slotAngle(frame, slot.values[m] as number) - slotAngle(frame, start));
      tracks.push({
        glyph: 'arrow',
        prop: 'dir',
        family: 'shift',
        param: 'fixed',
        values,
        rule: `panah selalu menghadap ${dirName(dir0)}`,
        lures: [{ v: orbitDir, why: 'Panah dianggap ikut berputar. Padahal panah hanya bergeser dan arahnya tetap.' }],
      });
    }
    objs.push({ glyph: 'arrow', slot: start, anchor: 'out', dir: dir0, fill: 'solid' });
  }
  // A black triangle on a side: moves side to side, flips in and out, or both in turn.
  if (objs.length === 0 || (level >= 2 && chance(0.7, r))) {
    const side = randInt(0, 3, r) * 2;
    const fams = level === 1 ? ['move', 'toggle'] : level === 2 ? ['move', 'toggle', 'both'] : ['both', 'alternate'];
    const fam = pick(
      fams.filter((f) => allowed(f) || !want?.some((w) => ['move', 'toggle', 'both', 'alternate'].includes(w))),
      r,
    );
    const anchor0 = pick(['in', 'out'] as const, r);
    if (fam === 'move' || fam === 'both') tracks.push(numericTrack('tab', 'slot', frame, n, m, 'step', [2, -2], side, r, 8));
    if (fam === 'toggle' || fam === 'both' || fam === 'alternate') {
      const values = Array.from({ length: n }, (_, i) => (i % 2 ? (anchor0 === 'in' ? 'out' : 'in') : anchor0));
      tracks.push({
        glyph: 'tab',
        prop: 'anchor',
        family: 'toggle',
        param: 'p2',
        values,
        rule: 'segitiga hitam bergantian di dalam dan di luar persegi',
        lures: [{ v: values[m] === 'in' ? 'out' : 'in', why: 'Segitiga bergantian di dalam dan di luar persegi; di langkah ini letaknya yang lain.' }],
      });
    }
    if (fam === 'alternate') {
      // Example 3 of the design: out to the next side, then in on the same side.
      const t = numericTrack('tab', 'slot', frame, n, m, 'alternate', [2, -2], side, r, 8);
      if (!/\/0$|^0\//.test(t.param)) return null;
      tracks.push(t);
    }
    objs.push({ glyph: 'tab', slot: side, anchor: anchor0 });
  }
  // A dot inside the square moving around its corners and sides.
  if (level === 3 && chance(0.5, r)) {
    const start = randInt(0, 3, r) * 2 + 1;
    tracks.push(numericTrack('dot', 'slot', frame, n, m, 'step', [2, -2, 4], start, r, 8));
    objs.push({ glyph: 'dot', slot: start, anchor: 'in' });
  }
  if (want?.length && !tracks.some((t) => want.includes(t.family))) return null;
  if (level === 3 && tracks.length < 3) return null;
  if (level === 2 && tracks.length < 2) return null;
  return seriesDraft('orbit', frame, objs, tracks, n, m, r);
}

/* ----------------------------------------------------------- F3: regions */

const REGION_GLYPHS: GlyphKind[] = ['rect', 'square', 'ring', 'dot', 'star', 'cross', 'eq', 'arrow', 'dblarrow', 'pin', 'half', 'L', 'flag'];

function makeRegions(d: Difficulty, r: Rand, want?: string[]): Draft | null {
  const frame: FrameKind = pick(['diag4', 'quad4'], r);
  const n = lengthFor(d, r);
  const m = gapFor(d, n, r);
  const k = d === 'mudah' ? 2 : 3;
  const glyphs = [...REGION_GLYPHS].sort(() => r() - 0.5).slice(0, k);
  const slots = [0, 1, 2, 3].sort(() => r() - 0.5);
  const objs: SceneObject[] = glyphs.map((g, i) => ({
    glyph: g,
    slot: slots[i],
    ...(ORIENTED.includes(g) || g === 'rect' || g === 'eq' ? { dir: pick([0, 90, 180, 270], r) } : {}),
  }));
  const famsSlot: ('step' | 'alternate' | 'repeat')[] = d === 'mudah' ? ['step'] : d === 'sedang' ? ['step', 'step', 'repeat'] : ['step', 'alternate', 'alternate'];
  // Moves are drawn again until no two objects share a space at any step (four spaces, up to three objects).
  let tracks: STrack[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    tracks = objs.map((o) => numericTrack(o.glyph, 'slot', frame, n, m, pick(famsSlot, r), d === 'mudah' ? [1, -1] : [1, -1, 2], o.slot, r, 4));
    if (!framesOf(frame, objs, tracks, n).some(collides)) break;
  }
  for (const o of objs) {
    // Oriented objects may also turn or flip.
    if (o.dir !== undefined && d !== 'mudah' && chance(0.6, r)) {
      const sym = GLYPH_SYMMETRY[o.glyph].turn;
      const steps = sym === 180 ? [90] : ROT_STEPS[d].filter((x) => Math.abs(x) % 90 === 0);
      tracks.push(numericTrack(o.glyph, 'dir', frame, n, m, chance(0.3, r) ? 'repeat' : 'step', steps, o.dir, r, 360));
    }
  }
  if (want?.length && !tracks.some((t) => want.includes(t.family))) return null;
  // Three objects all moving the same way is one rule, not three: ask for at least two different moves.
  if (k === 3 && new Set(tracks.filter((t) => t.prop === 'slot').map((t) => t.param)).size < 2) return null;
  return seriesDraft('regions', frame, objs, tracks, n, m, r);
}

/* --------------------------------------------------------- F3b: relay */

/**
 * Example 2 of the design: a rectangle that moves by two moves in turn, and a relay of symbols:
 * each step a new symbol appears; the next step it moves on (an oriented one jumps to the opposite
 * space and turns over, a plain one moves one space), and then it is gone.
 */
const RELAY_ORIENTED: GlyphKind[] = ['arrow', 'dblarrow', 'pin'];
const RELAY_PLAIN: GlyphKind[] = ['square', 'ring', 'star', 'cross'];

function relayExtract(seq: SceneCell[], i: number): Feat[] {
  const c = seq[i];
  // The first term has no symbol from before yet, so the count is read from the second on.
  const out: Feat[] = i ? [{ key: 'count', value: c.objects.length, rel: true }] : [];
  const rect = c.objects.find((o) => o.glyph === 'rect');
  out.push({ key: 'rect.slot', value: rect ? rect.slot % 4 : -1, mod: 4, step: 1 });
  if (rect) out.push({ key: 'rect.dir', value: norm(rect.dir ?? 0) % 180, mod: 180, step: 90 });
  if (i === 0) return out;
  const prev = seq[i - 1];
  const moving = c.objects.filter((o) => o.glyph !== 'rect');
  const carried = moving.find((o) => prev.objects.some((p) => p.glyph === o.glyph));
  const fresh = moving.filter((o) => !prev.objects.some((p) => p.glyph === o.glyph));
  if (carried) {
    const before = prev.objects.find((p) => p.glyph === carried.glyph)!;
    out.push({ key: 'carried.move', value: modv(carried.slot - before.slot, 4), mod: 4, step: 1, rel: true });
    out.push({ key: 'carried.turn', value: ORIENTED.includes(carried.glyph) ? norm((carried.dir ?? 0) - (before.dir ?? 0)) : 'tetap', rel: true });
    out.push({ key: 'carried.kind', value: ORIENTED.includes(carried.glyph) ? 'berarah' : 'polos', rel: true });
  } else out.push({ key: 'carried.move', value: 'hilang', rel: true });
  // The new symbol is the question's given: no rule says which it is or where it appears.
  out.push({ key: 'new', value: fresh.map((o) => `${o.glyph}@${o.slot % 4}/${norm(o.dir ?? 0)}`).join(',') || 'tidak ada', free: true, rel: true });
  return out;
}

function makeRelay(d: Difficulty, r: Rand): Draft | null {
  const frame: FrameKind = 'diag4';
  // Six terms at least: the moving symbol's two behaviours each show twice before the "?".
  const n = d === 'sulit' ? randInt(6, 7, r) : 6;
  const m = n - 1;
  // The rectangle: opposite, then one space back, and so on (or a simpler move below sulit).
  const rectT = numericTrack('rect', 'slot', frame, n, m, d === 'sulit' ? 'alternate' : 'step', d === 'sulit' ? [2] : [1, -1], randInt(0, 3, r), r, 4);
  if (d === 'sulit' && !rectT.param.startsWith('2/')) return null;
  const plainMove = pick([1, -1], r);
  const startOriented = chance(0.5, r);
  const orientedPool = [...RELAY_ORIENTED].sort(() => r() - 0.5);
  const plainPool = [...RELAY_PLAIN].sort(() => r() - 0.5);
  // Symbols alternate oriented and plain, so both behaviours show.
  const symbols: GlyphKind[] = [];
  for (let i = 0; i < n; i++) symbols.push((i % 2 === 0) === startOriented ? orientedPool[Math.floor(i / 2) % 3] : plainPool[Math.floor(i / 2) % 4]);
  if (new Set(symbols.slice(0, n)).size < n) return null;
  const cells: SceneCell[] = [];
  const pos = new Map<number, { slot: number; dir: number }>();
  for (let i = 0; i < n; i++) {
    const rectSlot = rectT.values[i] as number;
    const objs: SceneObject[] = [{ glyph: 'rect', slot: rectSlot, dir: 0 }];
    if (i > 0) {
      const g = symbols[i - 1];
      const p = pos.get(i - 1)!;
      const moved = ORIENTED.includes(g) ? { slot: (p.slot + 2) % 4, dir: norm(p.dir + 180) } : { slot: modv(p.slot + plainMove, 4), dir: p.dir };
      objs.push({ glyph: g, slot: moved.slot, ...(ORIENTED.includes(g) ? { dir: moved.dir } : {}) });
    }
    // A new symbol goes where its next move will not land on the rectangle.
    const next = (s: number) => (ORIENTED.includes(symbols[i]) ? (s + 2) % 4 : modv(s + plainMove, 4));
    const free = [0, 1, 2, 3].filter((s) => !objs.some((o) => o.slot === s) && (i + 1 >= n || next(s) !== rectT.values[i + 1]));
    if (!free.length) return null;
    const slot = pick(free, r);
    const dir = pick([0, 90, 180, 270], r);
    objs.push({ glyph: symbols[i], slot, ...(ORIENTED.includes(symbols[i]) ? { dir } : {}) });
    pos.set(i, { slot, dir });
    cells.push({ kind: 'scene', frame, objects: objs });
  }
  if (cells.some(collides)) return null;
  const key = cells[m];
  const seq = cells.map((c, i) => (i === m ? null : c));
  const carriedG = symbols[m - 1];
  const prevPos = pos.get(m - 1)!;
  const lures: Lure[] = [
    ...rectT.lures.map((l) => ({ pic: withProp(key, 'rect', 'slot', l.v), why: l.why })),
    {
      pic: withProp(
        withProp(key, carriedG, 'slot', ORIENTED.includes(carriedG) ? modv(prevPos.slot + plainMove, 4) : (prevPos.slot + 2) % 4),
        carriedG,
        'dir',
        ORIENTED.includes(carriedG) ? prevPos.dir : 0,
      ),
      why: `Aturan simbol ${ORIENTED.includes(carriedG) ? 'polos' : 'berarah'} dipakai untuk ${GLYPH_NAMES[carriedG]}. Simbol berarah pindah ke seberang dan terbalik; simbol polos bergeser satu ruang.`,
    },
    {
      pic: withProp(key, carriedG, 'slot', prevPos.slot),
      why: `${GLYPH_NAMES[carriedG]} dianggap diam. Simbol baru di langkah sebelumnya selalu berpindah di langkah berikutnya.`,
    },
    {
      pic: {
        ...key,
        objects: [
          ...key.objects.filter((o) => o.glyph !== symbols[m]),
          { glyph: symbols[m - 2], slot: pos.get(m - 2)!.slot, ...(ORIENTED.includes(symbols[m - 2]) ? { dir: pos.get(m - 2)!.dir } : {}) },
          key.objects.find((o) => o.glyph === symbols[m])!,
        ],
      },
      why: `${GLYPH_NAMES[symbols[m - 2]]} seharusnya sudah hilang: setiap simbol hanya tampil dua langkah.`,
    },
  ].filter((l) => !collides(l.pic as SceneCell) && picKey(l.pic) !== picKey(key));
  // Wrong options keep the new symbol where it is, so only the rules decide.
  const keep = (c: SceneCell) => c.objects.some((o) => o.glyph === symbols[m] && o.slot === key.objects.find((x) => x.glyph === symbols[m])!.slot);
  const pool = scenePool(
    key,
    r,
    lures.map((l) => l.pic),
  ).filter((c) => keep(c) && c.objects.find((o) => o.glyph === symbols[m])!.dir === key.objects.find((o) => o.glyph === symbols[m])!.dir);
  const extract = (s: Pic[], i: number) => relayExtract(s as SceneCell[], i);
  const cands = [...lures.map((l) => l.pic), ...pool];
  const v = judgeSeries<Pic>(seq, [key, ...cands], 0, extract);
  if (!v.defensible[0]) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(
    key,
    lures.filter((l) => keep(l.pic as SceneCell)),
    pool,
    r,
    (p) => supported.has(picKey(p)),
  );
  if (!chosen) return null;
  const final = judgeSeries<Pic>(seq, chosen.options, chosen.answerIdx, extract);
  if (!final.ok) return null;
  const moveName = moveWords(frame, plainMove);
  return {
    stem: 'Perhatikan deret gambar berikut. Setiap langkah muncul satu simbol baru. Gambar manakah yang tepat untuk mengisi tanda tanya?',
    figure: { layout: 'series', cells: seq },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: ['relay', 'conditional', rectT.family],
      signature: `relay|n${n}|rect:${rectT.family}:${rectT.param}|plain:${plainMove}`,
      complexity: final.complexity + 4,
      tracks: [trackWords(frame, rectT, n, m), { label: 'simbol baru', values: symbols.map((g, i) => (i === m ? `? (${GLYPH_NAMES[g]})` : GLYPH_NAMES[g])) }],
    },
    explanation: (answer) =>
      `Pola:\n• ${rectT.rule}.\n• Setiap langkah muncul satu simbol baru. Di langkah berikutnya simbol itu berpindah, lalu hilang. Simbol berarah (panah, pentol) pindah ke ruang seberang dan terbalik; simbol polos ${moveName}.\n\nDi langkah ke-${m + 1}, ${GLYPH_NAMES[carriedG]} dari langkah sebelumnya ${ORIENTED.includes(carriedG) ? 'pindah ke seberang dan terbalik' : moveName}, ${GLYPH_NAMES[symbols[m - 2]]} hilang, dan ${GLYPH_NAMES[symbols[m]]} muncul.\n\nJadi: ${describePic(key)} (${answer}).`,
  };
}

/* ------------------------------------------------------- F14: pie wedges */

function makePie(d: Difficulty, r: Rand, want?: string[]): Draft | null {
  const frame: FrameKind = 'pie8';
  const n = lengthFor(d, r);
  const m = gapFor(d, n, r);
  const objs: SceneObject[] = [{ glyph: 'wedge', slot: randInt(0, 7, r), span: d === 'mudah' ? randInt(1, 2, r) : randInt(1, 3, r) }];
  if (d !== 'mudah') objs.push({ glyph: 'swedge', slot: randInt(0, 7, r), span: randInt(1, 2, r) });
  // Wedges are drawn again until they never overlap.
  let tracks: STrack[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    tracks = objs.map((o) =>
      numericTrack(o.glyph, 'slot', frame, n, m, d === 'sulit' && chance(0.4, r) ? 'alternate' : 'step', d === 'mudah' ? [1, -1, 2] : [1, -1, 2, -2, 3, -3], o.slot, r, 8),
    );
    if (!framesOf(frame, objs, tracks, n).some(collides) && (objs.length < 2 || tracks[0].param !== tracks[1].param)) break;
  }
  if (d === 'sulit' && chance(0.5, r)) {
    const w = objs[0];
    const t = numericTrack('wedge', 'span', frame, n, m, chance(0.5, r) ? 'repeat' : 'step', [1, -1], w.span!, r);
    if (!t.values.every((v) => (v as number) >= 1 && (v as number) <= 4)) return null;
    tracks.push(t);
  }
  if (want?.length && !tracks.some((t) => want.includes(t.family))) return null;
  if (objs.length === 2 && tracks[0].param === tracks[1].param) return null;
  return seriesDraft('pie', frame, objs, tracks, n, m, r);
}

/* ---------------------------------------------- turning and mirroring scenes */

/** The scene turned by `q` quarter turns clockwise. */
export function rotateScene(c: SceneCell, q: number): SceneCell {
  const per = FRAME_SLOTS[c.frame] / 4;
  return { ...c, objects: c.objects.map((o) => ({ ...o, slot: moveSlot(c.frame, o.slot, per * q), ...(o.dir !== undefined ? { dir: norm(o.dir + 90 * q) } : {}) })) };
}

/** The scene mirrored left to right (about the upright line through the middle). */
export function mirrorScene(c: SceneCell): SceneCell {
  const n = FRAME_SLOTS[c.frame];
  const slot = (o: SceneObject) => {
    if (c.frame === 'quad4') return [1, 0, 3, 2][o.slot % 4];
    if (c.frame === 'pie8') return modv(n - o.slot - (o.span ?? 1), n);
    return modv(n - o.slot, n);
  };
  return {
    ...c,
    objects: c.objects.map((o) => ({
      ...o,
      slot: slot(o),
      ...(o.dir !== undefined ? { dir: norm(-o.dir) } : {}),
      ...(GLYPH_SYMMETRY[o.glyph].axis ? {} : { mirrored: !o.mirrored }),
    })),
  };
}
/** Mirrored top to bottom: mirror left-right, then half a turn. */
export const flipScene = (c: SceneCell) => rotateScene(mirrorScene(c), 2);

/** Every quarter turn of a scene, as keys. */
const turnKeys = (c: SceneCell) => [0, 1, 2, 3].map((q) => picKey(rotateScene(c, q)));

/* ------------------------------------------------- F9: not a turn of it */

const CHIRAL_GLYPHS: GlyphKind[] = ['L', 'flag', 'arrow', 'pin', 'dot', 'star'];

function chiralScene(r: Rand): SceneCell | null {
  const frame: FrameKind = pick(['plain', 'quad4', 'ring8'], r);
  const k = randInt(2, 3, r);
  const objs: SceneObject[] = [];
  const glyphs = [...CHIRAL_GLYPHS].sort(() => r() - 0.5).slice(0, k);
  if (frame === 'plain' && chance(0.6, r)) objs.push({ glyph: 'tab', slot: randInt(0, 3, r) * 2, anchor: pick(['in', 'out'] as const, r) });
  for (const g of glyphs) {
    const inside = frame === 'plain' && g !== 'arrow' && g !== 'pin';
    const slot = inside ? randInt(0, 3, r) * 2 + 1 : randInt(0, FRAME_SLOTS[frame] - 1, r);
    objs.push({
      glyph: g,
      slot,
      ...(frame === 'plain' ? { anchor: g === 'arrow' || g === 'pin' ? 'out' : 'in' } : {}),
      ...(ORIENTED.includes(g) ? { dir: pick([0, 90, 180, 270], r) } : {}),
    });
  }
  const c: SceneCell = { kind: 'scene', frame, objects: objs };
  if (collides(c)) return null;
  // No turn may give it back, and its mirror image must not be a turn of it.
  const keys = turnKeys(c);
  if (new Set(keys).size !== 4) return null;
  if (keys.includes(picKey(mirrorScene(c)))) return null;
  return c;
}

function makeNotATurn(d: Difficulty, r: Rand): Draft | null {
  const c = chiralScene(r);
  if (!c) return null;
  const turns = [0, 1, 2, 3].sort(() => r() - 0.5);
  const odd = randInt(0, 4, r);
  const options: SceneCell[] = [];
  let t = 0;
  for (let i = 0; i < 5; i++) options.push(i === odd ? rotateScene(mirrorScene(c), randInt(0, 3, r)) : rotateScene(c, turns[t++]));
  // Mudah: one of the four is the scene as it is, which makes comparing easier.
  if (d === 'mudah' && !options.some((o) => picKey(o) === picKey(c))) return null;
  if (new Set(options.map(picKey)).size !== 5) return null;
  // No single property may single out an option other than the mirror image.
  const outs = oddOnes<Pic>(options, picFeats);
  if (outs.some((i) => i !== odd)) return null;
  // Below sulit, a scene with an L or flag mirrored shows the flip in the glyph itself: make sulit harder by not having one.
  if (d === 'sulit' && c.objects.some((o) => o.glyph === 'L' || o.glyph === 'flag')) return null;
  return {
    stem: 'Empat dari lima gambar berikut adalah gambar yang sama yang diputar. Satu gambar adalah bayangan cerminnya. Gambar manakah itu?',
    figure: { layout: 'odd-one-out', cells: [] },
    options,
    answerIdx: odd,
    rationales: options.map((_, i) => (i === odd ? undefined : 'Gambar ini hasil memutar gambar yang lain; susunan objeknya tetap searah jarum jam.')),
    meta: { families: ['mirror', 'rotate'], signature: `not-a-turn|${c.frame}|${c.objects.length}`, complexity: c.objects.length + (d === 'sulit' ? 3 : 2) },
    explanation: (label) =>
      `Putar setiap gambar sampai salah satu objeknya berada di tempat yang sama, lalu bandingkan letak objek lainnya. Empat gambar cocok setelah diputar. Gambar ${label} hanya cocok bila dicerminkan: urutan objeknya terbalik (searah jarum jam menjadi berlawanan arah jarum jam). Jadi gambar ${label} adalah bayangan cermin.`,
  };
}

/* ---------------------------------------------- F13: turn and mirror a scene */

type SceneStep = 'r90' | 'r180' | 'r270' | 'mh' | 'mv';
const SCENE_STEPS: Record<SceneStep, { name: string; apply: (c: SceneCell) => SceneCell }> = {
  r90: { name: 'diputar 90° searah jarum jam', apply: (c) => rotateScene(c, 1) },
  r180: { name: 'diputar 180°', apply: (c) => rotateScene(c, 2) },
  r270: { name: 'diputar 90° berlawanan arah jarum jam', apply: (c) => rotateScene(c, 3) },
  mh: { name: 'dicerminkan terhadap garis tegak', apply: mirrorScene },
  mv: { name: 'dicerminkan terhadap garis mendatar', apply: flipScene },
};

function makeSceneTransform(d: Difficulty, r: Rand): Draft | null {
  const c = chiralScene(r);
  if (!c) return null;
  const all = Object.keys(SCENE_STEPS) as SceneStep[];
  const steps: SceneStep[] =
    d === 'mudah'
      ? [pick(['r90', 'r180', 'r270'] as SceneStep[], r)]
      : d === 'sedang'
        ? [pick(['mh', 'mv'] as SceneStep[], r)]
        : (() => {
            const a = pick(all, r);
            return [a, pick(a.startsWith('m') ? (['r90', 'r270', 'r180'] as SceneStep[]) : (['mh', 'mv'] as SceneStep[]), r)];
          })();
  const run = (ss: SceneStep[]) => ss.reduce((x, s) => SCENE_STEPS[s].apply(x), c);
  const answer = run(steps);
  if (picKey(answer) === picKey(c)) return null;
  const lures: Lure[] = [{ pic: c, why: 'Ini gambar awal yang belum diubah.' }];
  for (const s of all) if (!(steps.length === 1 && steps[0] === s)) lures.push({ pic: run([s]), why: `Ini hasil bila gambar ${SCENE_STEPS[s].name}.` });
  if (steps.length === 2) lures.push({ pic: run([steps[1], steps[0]]), why: 'Ini terjadi bila urutan kedua langkah dibalik.' });
  // Objects moved to their mirrored places but not turned over themselves.
  if (steps.some((s) => s.startsWith('m'))) {
    const half = { ...answer, objects: answer.objects.map((o, i) => ({ ...o, dir: c.objects[i].dir, mirrored: c.objects[i].mirrored })) };
    lures.push({ pic: half, why: 'Letak objek sudah dicerminkan, tetapi arah objeknya sendiri belum.' });
  }
  const pool = scenePool(
    answer,
    r,
    lures.map((l) => l.pic),
  );
  const chosen = chooseOptions(answer, lures, pool, r);
  if (!chosen) return null;
  const name = steps.map((s) => SCENE_STEPS[s].name).join(', lalu ');
  return {
    stem: `Gambar berikut ${name}. Gambar manakah hasilnya?`,
    figure: { layout: 'transform', cells: [c, null] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: [...new Set(steps.map((s) => (s.startsWith('m') ? 'mirror' : 'rotate')))],
      signature: `scene-transform|${c.frame}|${steps.join('+')}`,
      complexity: steps.length + c.objects.length,
    },
    explanation: (ans) =>
      `${steps.map((s, i) => `Langkah ${i + 1}: gambar ${SCENE_STEPS[s].name}.`).join(' ')} Setiap objek ikut berpindah tempat${steps.some((s) => s.startsWith('m')) ? ' dan arahnya ikut tercermin' : ' dan ikut berputar'}.\n\nHasilnya: ${describePic(answer)} (${ans}).`,
  };
}

/** Four options are turns of one scene and the key is not. */
function verifyNotATurn(q: Question): boolean {
  const opts = q.options.map((o) => o.figure as SceneCell);
  const k = q.options.findIndex((o) => o.label === q.answer);
  const classOf = (c: SceneCell) => turnKeys(c).sort()[0];
  const classes = opts.map(classOf);
  const others = classes.filter((_, i) => i !== k);
  return others.every((c) => c === others[0]) && classes[k] !== others[0] && classOf(mirrorScene(opts[k])) === others[0] && new Set(opts.map(picKey)).size === 5;
}

/** The key is the stated steps applied to the scene. */
function verifySceneTransform(q: Question): boolean {
  const steps = q.figureMeta?.signature.split('|')[2]?.split('+') as SceneStep[] | undefined;
  const src = q.figure?.cells[0] as SceneCell | undefined;
  if (!src || !steps?.every((s) => s in SCENE_STEPS) || !q.stem.includes(steps.map((s) => SCENE_STEPS[s].name).join(', lalu '))) return false;
  const answer = steps.reduce((x, s) => SCENE_STEPS[s].apply(x), src);
  const key = q.options.find((o) => o.label === q.answer)!.figure!;
  return picKey(key) === picKey(answer);
}

/* ------------------------------------------------------- F8: scene analogy */

function makeSceneAnalogy(d: Difficulty, r: Rand): Draft | null {
  const frame: FrameKind = pick(['plain', 'diag4', 'quad4', 'ring8'], r);
  const k = d === 'mudah' ? 2 : 3;
  const glyphs = (frame === 'plain' ? ['arrow', 'dot', 'star', 'pin'] : REGION_GLYPHS)
    .slice()
    .sort(() => r() - 0.5)
    .slice(0, k) as GlyphKind[];
  const n = FRAME_SLOTS[frame];
  const mk = (): SceneCell => ({
    kind: 'scene',
    frame,
    objects: glyphs.map((g) => ({
      glyph: g,
      slot: frame === 'plain' && (g === 'dot' || g === 'star') ? randInt(0, 3, r) * 2 + 1 : randInt(0, n - 1, r),
      ...(frame === 'plain' ? { anchor: g === 'dot' || g === 'star' ? ('in' as const) : ('out' as const) } : {}),
      ...(ORIENTED.includes(g) ? { dir: pick([0, 90, 180, 270], r) } : {}),
    })),
  });
  const A = mk();
  const C = mk();
  if (collides(A) || collides(C) || picKey(A) === picKey(C)) return null;
  // What happens from A to B: the whole picture turns, or each object moves (and turns) by its own amount.
  const whole = d !== 'sulit' && chance(0.5, r);
  const changes: { glyph: GlyphKind; slot: number; dir: number }[] = glyphs.map((g) => ({
    glyph: g,
    // Objects inside the plain square move corner to corner (two places at a time).
    slot: whole
      ? 0
      : pick(d === 'mudah' ? [1, -1, 0] : [1, -1, 2, 0], r) *
        (frame === 'plain' || frame === 'ring8' ? (d === 'mudah' || (frame === 'plain' && (g === 'dot' || g === 'star')) ? 2 : 1) : 1),
    dir: whole ? 0 : ORIENTED.includes(g) ? pick([0, 90, 180, -90], r) : 0,
  }));
  const q = whole ? pick([1, 2, 3], r) : 0;
  const apply = (s: SceneCell) =>
    whole
      ? rotateScene(s, q)
      : {
          ...s,
          objects: s.objects.map((o) => {
            const ch = changes.find((x) => x.glyph === o.glyph)!;
            return { ...o, slot: moveSlot(frame, o.slot, ch.slot), ...(o.dir !== undefined ? { dir: norm(o.dir + ch.dir) } : {}) };
          }),
        };
  const B = apply(A);
  const D = apply(C);
  if ([B, D].some(collides) || picKey(A) === picKey(B)) return null;
  if (!whole && changes.filter((c) => c.slot || c.dir).length < (d === 'mudah' ? 1 : 2)) return null;
  const lures: Lure[] = [{ pic: C, why: 'Gambar ketiga belum diubah sama sekali.' }];
  for (const ch of changes) {
    const c0 = C.objects.find((x) => x.glyph === ch.glyph)!;
    if (whole) continue;
    if (ch.slot) lures.push({ pic: withProp(D, ch.glyph, 'slot', c0.slot), why: `${GLYPH_NAMES[ch.glyph]} belum dipindahkan seperti pada pasangan pertama.` });
    if (ch.slot) lures.push({ pic: withProp(D, ch.glyph, 'slot', moveSlot(frame, c0.slot, -ch.slot)), why: `${GLYPH_NAMES[ch.glyph]} dipindahkan ke arah yang terbalik.` });
    if (ch.dir) lures.push({ pic: withProp(D, ch.glyph, 'dir', c0.dir ?? 0), why: `${GLYPH_NAMES[ch.glyph]} belum diputar seperti pada pasangan pertama.` });
  }
  if (whole)
    for (const qq of [1, 2, 3].filter((x) => x !== q))
      lures.push({ pic: rotateScene(C, qq), why: `Gambar diputar ${qq * 90}°, padahal pada pasangan pertama gambar diputar ${q * 90}°.` });
  if (whole) lures.push({ pic: mirrorScene(C), why: 'Ini bayangan cermin, bukan hasil memutar.' });
  const pool = scenePool(
    D,
    r,
    lures.map((l) => l.pic),
  ).filter((x) => !collides(x));
  const cands = [...lures.map((l) => l.pic), ...pool];
  const v = judgeAnalogy<Pic>([[A, B]], C, [D, ...cands], 0, picFeats);
  if (!v.defensible[0]) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(D, lures, pool, r, (p) => supported.has(picKey(p)));
  if (!chosen) return null;
  const final = judgeAnalogy<Pic>([[A, B]], C, chosen.options, chosen.answerIdx, picFeats);
  if (!final.ok) return null;
  const rule = whole
    ? `seluruh gambar diputar ${q * 90}° searah jarum jam`
    : changes
        .map((ch) => {
          const parts = [ch.slot ? moveWords(frame, ch.slot) : 'tetap di tempatnya', ch.dir ? turnWords(ch.dir) : ''].filter(Boolean);
          return `${GLYPH_NAMES[ch.glyph]} ${parts.join(' dan ')}`;
        })
        .join('; ');
  return {
    stem: stemFor('analogy', r),
    figure: { layout: 'analogy', cells: [A, B, C, null] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: whole ? ['rotate-whole'] : ['move', ...(changes.some((c) => c.dir) ? ['rotate'] : [])],
      signature: `scene-analogy|${frame}|${whole ? `whole${q}` : changes.map((c) => `${c.slot}/${c.dir}`).join(',')}`,
      complexity: final.complexity + k,
    },
    explanation: (ans) => `Dari gambar 1 ke gambar 2: ${rule}.\n\nTerapkan pada gambar 3. Hasilnya: ${describePic(D)} (${ans}).`,
  };
}

/* ----------------------------------------------------- F10: scene matrix */

function makeSceneMatrix(d: Difficulty, r: Rand): Draft | null {
  const frame: FrameKind = pick(['ring8', 'plain'], r);
  // Each property follows the rows, the columns, or takes each of its three values once per row and column.
  const pair: [string, string] = d === 'mudah' ? (chance(0.5, r) ? ['row', 'col'] : ['col', 'row']) : d === 'sedang' ? [pick(['row', 'col'], r), 'latin'] : ['latin', 'latin2'];
  if (chance(0.5, r)) pair.reverse();
  const places = pair;
  // The first object moves around; the second moves too, turns in place, or changes its fill.
  const kind = pick(['slot', 'dir', 'fill'] as const, r);
  const moving = pick(
    REGION_GLYPHS.filter((g) => !ORIENTED.includes(g) && g !== 'rect' && g !== 'eq'),
    r,
  );
  const second: GlyphKind =
    kind === 'dir'
      ? pick(['arrow', 'pin', 'L', 'flag'] as GlyphKind[], r)
      : kind === 'fill'
        ? pick(['square', 'star', 'triangle'] as GlyphKind[], r)
        : pick(
            REGION_GLYPHS.filter((g) => g !== moving && !ORIENTED.includes(g)),
            r,
          );
  // Two objects on eight places, each with places of its own, so they never meet.
  const ring = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => r() - 0.5);
  const slotsA = ring.slice(0, 3);
  const slotsB = ring.slice(3, 6);
  const fixed = ring[6];
  const dirs = [0, 90, 180, 270].sort(() => r() - 0.5).slice(0, 3);
  const fills = (['solid', 'empty', 'striped', 'dotted'] as Fill[]).sort(() => r() - 0.5).slice(0, 3);
  const anchor = frame === 'plain' ? { anchor: 'out' as const } : {};
  const idx = (p: string, i: number, j: number) => (p === 'row' ? i : p === 'col' ? j : p === 'latin' ? (i + j) % 3 : (2 * i + j) % 3);
  const cell = (i: number, j: number): SceneCell => {
    const k = idx(places[1], i, j);
    return {
      kind: 'scene',
      frame,
      objects: [
        { glyph: moving, slot: slotsA[idx(places[0], i, j)], ...anchor },
        kind === 'slot'
          ? { glyph: second, slot: slotsB[k], ...anchor }
          : kind === 'dir'
            ? { glyph: second, slot: fixed, dir: dirs[k], ...anchor }
            : { glyph: second, slot: fixed, fill: fills[k], ...anchor },
      ],
    };
  };
  const cells = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => cell(i, j)));
  if (cells.some(collides)) return null;
  const key = cells[8];
  const visible = [...cells.slice(0, 8), null];
  const prop: Prop = kind;
  const values: Val[] = kind === 'slot' ? slotsB : kind === 'dir' ? dirs : fills;
  const lures: Lure[] = [
    ...slotsA
      .filter((x) => x !== key.objects[0].slot)
      .map((x) => ({
        pic: withProp(key, moving, 'slot', x),
        why: `Letak ${GLYPH_NAMES[moving]} ini sudah dipakai di baris atau kolom yang sama, atau tidak mengikuti urutannya.`,
      })),
    ...values
      .filter((x) => x !== key.objects[1][prop])
      .map((x) => ({
        pic: withProp(key, second, prop, x),
        why: `${PROP_WORD[prop][0].toUpperCase()}${PROP_WORD[prop].slice(1)} ${GLYPH_NAMES[second]} ini sudah dipakai di baris atau kolom yang sama.`,
      })),
  ];
  const pool = scenePool(
    key,
    r,
    lures.map((l) => l.pic),
  );
  const cands = [...lures.map((l) => l.pic), ...pool];
  const v = judgeMatrix<Pic>(visible, [key, ...cands], 0, picFeats);
  if (!v.defensible[0]) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(key, lures, pool, r, (p) => supported.has(picKey(p)) || collides(p as SceneCell));
  if (!chosen) return null;
  const final = judgeMatrix<Pic>(visible, chosen.options, chosen.answerIdx, picFeats);
  if (!final.ok) return null;
  const say = (g: GlyphKind, pr: Prop, p: string, vals: Val[]) => {
    const list = vals.map((v) => valueWord(frame, pr, v)).join(', ');
    const what = `${PROP_WORD[pr]} ${GLYPH_NAMES[g]}`;
    return p === 'row'
      ? `${what} sama dalam setiap baris (${list})`
      : p === 'col'
        ? `${what} sama dalam setiap kolom (${list})`
        : `${what} (${list}) muncul masing-masing sekali di setiap baris dan kolom`;
  };
  return {
    stem: stemFor('matrix', r),
    figure: { layout: 'matrix', cells: visible },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: [...new Set(places.map((p) => (p.startsWith('latin') ? 'latin' : p)))],
      signature: `scene-matrix|${frame}|slot:${places[0]}|${kind}:${places[1]}`,
      complexity: final.complexity + 1,
    },
    explanation: (ans) =>
      `Pola: ${say(moving, 'slot', places[0], slotsA)}; ${say(second, kind, places[1], values)}.\n\nJadi gambar di baris ketiga, kolom ketiga: ${describePic(key)} (${ans}).`,
  };
}

/* ---------------------------------------------------------------- recipes */

export const SCENE_ARCHETYPES: Archetype[] = [
  {
    id: 'orbit',
    topic: 'Deret Figural',
    name: 'Deret orbit',
    about: 'Panah, segitiga, dan titik bergerak mengelilingi persegi; ada yang bergeser, ikut berputar, atau keluar-masuk.',
    families: [
      { id: 'shift', name: 'Bergeser (arah tetap)' },
      { id: 'orbit', name: 'Mengorbit (arah ikut letak)' },
      { id: 'rotate', name: 'Berputar sendiri' },
      { id: 'toggle', name: 'Keluar-masuk' },
      { id: 'alternate', name: 'Gerak bergantian' },
    ],
    levels: ['mudah', 'sedang', 'sulit'],
    make: makeOrbit,
    verify: verifySeries(),
  },
  {
    id: 'regions',
    topic: 'Deret Figural',
    name: 'Deret ruang',
    about: 'Simbol berpindah di antara empat ruang kotak, masing-masing dengan langkahnya sendiri.',
    families: [
      { id: 'move', name: 'Pindah tetap' },
      { id: 'alternate', name: 'Pindah bergantian' },
      { id: 'repeat', name: 'Bolak-balik' },
      { id: 'rotate', name: 'Berputar' },
    ],
    levels: ['mudah', 'sedang', 'sulit'],
    make: makeRegions,
    verify: verifySeries(),
  },
  {
    id: 'relay',
    topic: 'Deret Figural',
    name: 'Deret estafet',
    about: 'Simbol baru muncul, berpindah menurut jenisnya, lalu hilang; persegi panjang bergerak sendiri.',
    families: [{ id: 'relay', name: 'Estafet bersyarat jenis' }],
    levels: ['sedang', 'sulit'],
    make: (d, r) => makeRelay(d, r),
    verify: verifySeries((s, i) => relayExtract(s as SceneCell[], i)),
  },
  {
    id: 'pie',
    topic: 'Deret Figural',
    name: 'Juring berputar',
    about: 'Juring hitam dan juring arsir berputar dengan langkah berbeda.',
    families: [
      { id: 'move', name: 'Langkah tetap' },
      { id: 'alternate', name: 'Langkah bergantian' },
    ],
    levels: ['mudah', 'sedang', 'sulit'],
    make: makePie,
    verify: verifySeries(),
  },
  {
    id: 'scene-analogy',
    topic: 'Analogi Figural',
    name: 'Analogi adegan',
    about: 'Beberapa objek berpindah dan berputar dari gambar pertama ke kedua; terapkan pada gambar ketiga.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeSceneAnalogy(d, r),
    verify: verifyAnalogy,
  },
  {
    id: 'not-a-turn',
    topic: 'Figural Berbeda',
    name: 'Bukan hasil putaran',
    about: 'Empat gambar adalah putaran gambar yang sama; satu adalah bayangan cerminnya.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeNotATurn(d, r),
    verify: verifyNotATurn,
  },
  {
    id: 'scene-transform',
    topic: 'Transformasi Figural',
    name: 'Putar dan cermin adegan',
    about: 'Seluruh gambar diputar atau dicerminkan; setiap objek ikut berpindah dan berbalik.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeSceneTransform(d, r),
    verify: (q) => verifyDistinct(q) && verifySceneTransform(q),
  },
  {
    id: 'scene-matrix',
    topic: 'Matriks Figural',
    name: 'Matriks letak',
    about: 'Letak dua simbol mengikuti baris, kolom, atau muncul sekali di setiap baris dan kolom.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeSceneMatrix(d, r),
    verify: verifyMatrix,
  },
];

export { sceneFeats };
