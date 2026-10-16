import { canonPose, faceKey, FRAME_SLOTS, GLYPH_SYMMETRY, isLegacy, norm, ORIENTED, picKey, slotAngle } from '../pic';
import type { Pic, SceneCell } from '../types';
import type { Feat } from './solver';

/*
 * How the solver and the option picker read a picture: one feature per visible property. Every
 * value is what the eye sees (directions reduced by the glyph's symmetry), so two pictures with the
 * same features look the same.
 */

const SIDES: Partial<Record<string, number>> = { triangle: 3, square: 4, diamond: 4, pentagon: 5, hexagon: 6 };

export function sceneFeats(c: SceneCell): Feat[] {
  const out: Feat[] = [];
  const n = FRAME_SLOTS[c.frame];
  for (const o of c.objects) {
    const g = o.glyph;
    out.push({ key: `${g}.slot`, value: ((o.slot % n) + n) % n, mod: n, step: 1 });
    if (o.anchor) out.push({ key: `${g}.anchor`, value: o.anchor });
    if (o.fill) out.push({ key: `${g}.fill`, value: o.fill });
    if (o.span !== undefined) out.push({ key: `${g}.span`, value: o.span, step: 1 });
    if (g === 'tab' || g === 'wedge' || g === 'swedge') continue;
    const sym = GLYPH_SYMMETRY[g];
    if (sym.turn === 0) continue;
    const pose = canonPose(g, o.dir, o.mirrored);
    const mod = sym.turn;
    const step = mod % 45 === 0 ? 45 : 15;
    // Its direction read on its own, or against where it sits (an object that orbits keeps facing the centre).
    out.push({ key: `${g}.dir`, group: `${g}.pose`, view: 'abs', value: pose.dir % mod, mod, step });
    if (ORIENTED.includes(g)) out.push({ key: `${g}.rdir`, group: `${g}.pose`, view: 'rel', value: norm((o.dir ?? 0) - slotAngle(c.frame, o.slot)) % mod, mod, step });
    if (!sym.axis) out.push({ key: `${g}.mirror`, value: pose.mirrored ? 'cermin' : 'asli' });
  }
  return out;
}

/** Features of one picture on its own. */
export function picFeats(p: Pic): Feat[] {
  if (isLegacy(p)) {
    const out: Feat[] = [
      { key: 'shape', group: 'shape', view: 'name', value: p.shape },
      { key: 'fill', value: p.fill },
      { key: 'count', value: p.count, step: 1 },
    ];
    const sides = SIDES[p.shape];
    out.push({ key: 'sides', group: 'shape', view: 'sides', value: sides ?? `x-${p.shape}`, step: 1 });
    if (p.shape === 'arrow') out.push({ key: 'rot', value: norm(p.rotation), mod: 360, step: 45 });
    else if (p.shape === 'triangle') out.push({ key: 'rot', value: norm(p.rotation) % 120, mod: 120, step: 15 });
    else out.push({ key: 'rot', value: 0, mod: 360, step: 45 });
    return out;
  }
  switch (p.kind) {
    case 'scene':
      return sceneFeats(p);
    case 'strokes':
      return [
        { key: 'strands', value: p.strands, step: 1 },
        { key: 'apex', value: norm(p.apex), mod: 360, step: 90 },
        { key: 'attached', value: p.attached ? 'ya' : 'tidak' },
        { key: 'dots', value: p.attached ? p.strands : p.dots, step: 1 },
        // Where the dots line up, read on its own or against where the apex points.
        ...(p.attached
          ? [
              { key: 'dotSide', group: 'dotSide', view: 'abs', value: 'ujung' },
              { key: 'dotSideRel', group: 'dotSide', view: 'rel', value: 'ujung' },
            ]
          : [
              { key: 'dotSide', group: 'dotSide', view: 'abs', value: norm(p.dotSide), mod: 360, step: 90 },
              { key: 'dotSideRel', group: 'dotSide', view: 'rel', value: norm(p.dotSide - p.apex), mod: 360, step: 90 },
            ]),
      ];
    case 'lines':
      return Array.from({ length: 20 }, (_, i) => ({ key: `seg${i}`, value: p.segs.includes(i) ? '1' : '0' }));
    case 'cube':
      return (['front', 'top', 'right'] as const).map((f) => ({ key: f, value: faceKey(p[f]) }));
    case 'face':
      return [{ key: 'face', value: faceKey(p.face) }];
    case 'net':
      return p.squares.map((s) => ({ key: `sq${s.x},${s.y}`, value: faceKey(s.face) }));
    case 'holes':
      return Array.from({ length: 16 }, (_, i) => ({ key: `h${i}`, value: p.holes.includes(i) ? '1' : '0' }));
    case 'fold':
      return [{ key: 'fold', value: picKey(p) }];
  }
}

/** Read term `i` of a sequence on its own. */
export const termFeats = <T extends Pic>(seq: T[], i: number) => picFeats(seq[i]);

/** How many visible properties two pictures differ in. */
export function picDistance(a: Pic, b: Pic): number {
  const fa = new Map(picFeats(a).map((f) => [f.key, f.value]));
  const fb = new Map(picFeats(b).map((f) => [f.key, f.value]));
  let d = 0;
  for (const k of new Set([...fa.keys(), ...fb.keys()])) if (fa.get(k) !== fb.get(k)) d++;
  return d;
}

export const PIC_PICKER = { key: picKey, distance: picDistance };
