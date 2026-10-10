import { describe, expect, it } from 'vitest';
import { areaAfterKey, BIG_STEP, describeArea, MIN_SIDE, moveArea, normalizeArea, resizeArea, START_AREA, STEP } from '../domain/cropArea';
import { cropBox } from '../domain/photoImport';

const key = (k: string, mods: { shiftKey?: boolean; altKey?: boolean } = {}) => ({ key: k, shiftKey: false, altKey: false, ...mods });

describe('keyboard crop area (#59)', () => {
  it('starts in the middle, half the page wide', () => {
    expect(START_AREA).toEqual({ x: 0.25, y: 0.35, w: 0.5, h: 0.3 });
    expect(describeArea(START_AREA)).toBe('Area 50% × 30% mulai dari 25%, 35%');
  });

  it('moves by 2% a press, 10% with Alt, without drifting', () => {
    expect(areaAfterKey(START_AREA, key('ArrowRight'))).toEqual({ ...START_AREA, x: 0.27 });
    expect(areaAfterKey(START_AREA, key('ArrowUp', { altKey: true }))).toEqual({ ...START_AREA, y: 0.25 });
    let a = START_AREA;
    for (let i = 0; i < 5; i++) a = areaAfterKey(a, key('ArrowLeft'))!;
    expect(a.x).toBe(0.15);
    expect([STEP, BIG_STEP]).toEqual([0.02, 0.1]);
  });

  it('resizes from the top-left corner with Shift', () => {
    expect(areaAfterKey(START_AREA, key('ArrowRight', { shiftKey: true }))).toEqual({ ...START_AREA, w: 0.52 });
    expect(areaAfterKey(START_AREA, key('ArrowUp', { shiftKey: true, altKey: true }))).toEqual({ ...START_AREA, h: 0.2 });
  });

  it('keeps the area on the page', () => {
    expect(moveArea(START_AREA, -1, -1)).toEqual({ ...START_AREA, x: 0, y: 0 });
    expect(moveArea(START_AREA, 1, 1)).toEqual({ ...START_AREA, x: 0.5, y: 0.7 });
    // Growing stops at the right and bottom edges.
    expect(resizeArea(START_AREA, 1, 1)).toEqual({ ...START_AREA, w: 0.75, h: 0.65 });
    // An area already at the edge cannot be pushed further.
    const corner = { x: 0.9, y: 0.9, w: 0.1, h: 0.1 };
    expect(areaAfterKey(corner, key('ArrowRight', { altKey: true }))).toEqual(corner);
    expect(areaAfterKey(corner, key('ArrowDown', { shiftKey: true }))).toEqual(corner);
  });

  it('never shrinks below the minimum size', () => {
    expect(resizeArea(START_AREA, -1, -1)).toEqual({ ...START_AREA, w: MIN_SIDE, h: MIN_SIDE });
    let a = START_AREA;
    for (let i = 0; i < 40; i++) a = areaAfterKey(a, key('ArrowLeft', { shiftKey: true }))!;
    expect(a.w).toBe(MIN_SIDE);
  });

  it('takes over a dragged box, even one dragged up and to the left', () => {
    const dragged = { x: 0.6, y: 0.45, w: -0.5, h: -0.25 };
    expect(normalizeArea(dragged)).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 });
    expect(areaAfterKey(dragged, key('ArrowDown'))).toEqual({ x: 0.1, y: 0.22, w: 0.5, h: 0.25 });
    expect(describeArea(dragged)).toBe('Area 50% × 25% mulai dari 10%, 20%');
  });

  it('ignores other keys', () => {
    expect(areaAfterKey(START_AREA, key('Enter'))).toBeNull();
    expect(areaAfterKey(START_AREA, key('a', { shiftKey: true }))).toBeNull();
  });

  it('cuts the same pixels cropBox would for the area', () => {
    const a = resizeArea(moveArea(START_AREA, -0.05, -0.15), -0.1, -0.1);
    expect(a).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.2 });
    expect(cropBox(a, { width: 600, height: 850 })).toMatchObject({ sx: 120, sy: 170, sw: 240, sh: 170 });
  });
});
