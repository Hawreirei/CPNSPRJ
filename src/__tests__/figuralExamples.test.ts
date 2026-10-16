import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../domain/figural';
import { canShow, foldNet, netClass, randomNet } from '../domain/figural/cube';
import { termFeats } from '../domain/figural/features';
import { judgeSeries } from '../domain/figural/solver';
import { foldShapes, unfold } from '../domain/fold';
import type { CubeCell, Face, NetCell, Pic, Question, SceneCell, SceneObject } from '../domain/types';
import { seeded } from './figuralHelpers';

/*
 * The example questions the design started from (docs/rancangan-figural-v2.md §1), written in the
 * picture model: the model can say them, and the solver reaches the same verdict as a careful reader.
 */

const plain = (objects: SceneObject[]): SceneCell => ({ kind: 'scene', frame: 'plain', objects });
const arrow = (slot: number, dir: number): SceneObject => ({ glyph: 'arrow', slot, anchor: 'out', dir, fill: 'solid' });
const tab = (slot: number, anchor: 'in' | 'out'): SceneObject => ({ glyph: 'tab', slot, anchor });

describe('example 3: an orbiting arrow and a triangle that steps out and in', () => {
  // Arrow: top, left, bottom, right, top (anticlockwise), pointing left, up, right, down, left (clockwise).
  // Triangle: right inside, top outside, top inside, left outside, left inside.
  const seq: (SceneCell | null)[] = [
    plain([arrow(0, 270), tab(2, 'in')]),
    plain([arrow(6, 0), tab(0, 'out')]),
    plain([arrow(4, 90), tab(0, 'in')]),
    plain([arrow(2, 180), tab(6, 'out')]),
    plain([arrow(0, 270), tab(6, 'in')]),
    null,
  ];
  const options = [
    plain([arrow(6, 180), tab(6, 'out')]),
    plain([arrow(6, 180), tab(4, 'out')]),
    plain([arrow(6, 0), tab(6, 'out')]),
    plain([arrow(6, 0), tab(4, 'in')]),
    plain([arrow(6, 0), tab(4, 'out')]),
  ];
  it('has one answer, E', () => {
    const v = judgeSeries<Pic>(seq, options, 4, termFeats);
    expect(v.ok, v.reason).toBe(true);
    expect(v.defensible).toEqual([false, false, false, false, true]);
  });
});

describe('example 2: the last choice rests on a symbol no rule governs', () => {
  const d = (objects: SceneObject[]): SceneCell => ({ kind: 'scene', frame: 'diag4', objects });
  const rect = (slot: number): SceneObject => ({ glyph: 'rect', slot, dir: 0 });
  const seq: (SceneCell | null)[] = [
    d([rect(2), { glyph: 'ring', slot: 1 }, { glyph: 'pin', slot: 0, dir: 0 }]),
    d([rect(0), { glyph: 'pin', slot: 2, dir: 180 }, { glyph: 'square', slot: 3 }]),
    d([rect(3), { glyph: 'square', slot: 2 }, { glyph: 'dblarrow', slot: 1, dir: 0 }]),
    d([rect(1), { glyph: 'dblarrow', slot: 3, dir: 180 }, { glyph: 'star', slot: 0 }]),
    d([rect(0), { glyph: 'star', slot: 3 }, { glyph: 'arrow', slot: 2, dir: 180 }]),
    null,
  ];
  // A and B differ only in the new symbol (S or =).
  const options = [
    d([rect(2), { glyph: 'arrow', slot: 0, dir: 0 }, { glyph: 'L', slot: 1, dir: 0 }]),
    d([rect(2), { glyph: 'arrow', slot: 0, dir: 0 }, { glyph: 'eq', slot: 1, dir: 0 }]),
    d([rect(0), { glyph: 'arrow', slot: 2, dir: 180 }, { glyph: 'eq', slot: 1, dir: 0 }]),
    d([rect(3), { glyph: 'arrow', slot: 0, dir: 0 }, { glyph: 'eq', slot: 1, dir: 0 }]),
    d([rect(2), { glyph: 'arrow', slot: 1, dir: 90 }, { glyph: 'eq', slot: 3, dir: 0 }]),
  ];
  it('is refused, as the generator would never make it', () => {
    const relay = ARCHETYPES.find((a) => a.id === 'relay')!;
    const q = {
      figure: { layout: 'series', cells: seq },
      options: options.map((figure, i) => ({ label: 'ABCDE'[i], text: '', score: i === 0 ? 5 : 0, figure })),
      answer: 'A',
    } as unknown as Question;
    expect(relay.verify(q)).toBe(false);
  });
});

describe('example 4: a cube net with plain faces', () => {
  const W: Face = { sym: 'white', rot: 0 };
  const B: Face = { sym: 'black', rot: 0 };
  const D: Face = { sym: 'dot', rot: 0 };
  // One square above the dotted one; a row black, dotted, black, white; one more white under the last.
  const net: NetCell = {
    kind: 'net',
    squares: [
      { x: 1, y: 0, face: W },
      { x: 0, y: 1, face: B },
      { x: 1, y: 1, face: D },
      { x: 2, y: 1, face: B },
      { x: 3, y: 1, face: W },
      { x: 3, y: 2, face: W },
    ],
  };
  const cube = (front: Face, top: Face, right: Face): CubeCell => ({ kind: 'cube', front, top, right });
  const options = [cube(D, W, B), cube(B, W, B), cube(D, B, B), cube(B, B, W), cube(D, W, W)];
  it('folds into a cube only A shows', () => {
    const folded = foldNet(net)!;
    expect(folded).not.toBeNull();
    expect(options.map((o) => canShow(folded, o))).toEqual([true, false, false, false, false]);
  });
});

describe('cube nets', () => {
  it('come in all eleven shapes', () => {
    const r = seeded(5);
    const classes = new Set(Array.from({ length: 600 }, () => netClass(randomNet(r))));
    expect(classes.size).toBe(11);
  });
  it('refuse shapes that do not fold into a cube', () => {
    const row = Array.from({ length: 6 }, (_, x) => ({ x, y: 0, face: { sym: 'white' as const, rot: 0 } }));
    expect(foldNet({ kind: 'net', squares: row })).toBeNull();
  });
});

describe('folded paper', () => {
  it('mirrors a hole across each fold when opened', () => {
    // Folded right onto left, punched top-left: the opened sheet has it top-left and top-right.
    expect(unfold(['R>L'], [0])).toEqual([0, 3]);
    // Then folded top onto bottom as well, punched in the bottom-left quarter: four holes.
    expect(unfold(['R>L', 'T>B'], [13])).toEqual([1, 2, 13, 14]);
    // Along the diagonal: a hole below it reappears mirrored above it.
    expect(unfold(['TR>BL'], [4])).toEqual([1, 4]);
  });
  it('folds a diagonal only on a square', () => {
    expect(foldShapes(['R>L', 'TR>BL'])).toBeNull();
    expect(foldShapes(['R>L', 'T>B', 'TR>BL'])).not.toBeNull();
  });
});
