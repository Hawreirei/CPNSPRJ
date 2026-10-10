import { beforeAll, describe, expect, it } from 'vitest';
import { KAMUS_TIU } from '../data/kamusTiu';
import { TOPICS } from '../domain/blueprint';
import { hasKamus, KAMUS_TOPICS } from '../domain/kamus';
import { approxEqual, evaluateExpression, loadMath } from '../domain/numeric';

beforeAll(loadMath);

describe('Kamus Rumus TIU (#47)', () => {
  it('every example with arithmetic gives its stated answer, recomputed with mathjs', () => {
    const numeric = KAMUS_TIU.filter((e) => e.example.expression !== undefined);
    expect(numeric.length).toBeGreaterThanOrEqual(15);
    for (const e of numeric) {
      const v = evaluateExpression(e.example.expression!);
      expect(v, e.id).not.toBeNull();
      expect(approxEqual(v!, e.example.answer!), `${e.id}: ${e.example.expression} = ${v}, tertulis ${e.example.answer}`).toBe(true);
    }
  });

  it('logic entries have no arithmetic, and every other entry has an answer', () => {
    for (const e of KAMUS_TIU) {
      if (e.topic === 'Silogisme') expect(e.example.expression, e.id).toBeUndefined();
      else expect(typeof e.example.answer, e.id).toBe('number');
    }
  });

  it('covers each of its topics, which are TIU topics of the syllabus, with unique ids and balanced math', () => {
    expect(new Set(KAMUS_TIU.map((e) => e.id)).size).toBe(KAMUS_TIU.length);
    for (const t of KAMUS_TOPICS) {
      expect(TOPICS.TIU, t).toContain(t);
      expect(KAMUS_TIU.filter((e) => e.topic === t).length, t).toBeGreaterThanOrEqual(3);
    }
    for (const e of KAMUS_TIU) {
      for (const text of [e.formula, e.note ?? '', e.example.question, e.example.solution]) expect((text.match(/\$/g) ?? []).length % 2, `${e.id}: ${text}`).toBe(0);
    }
  });

  it('links only TIU explanations of those topics', () => {
    expect(hasKamus('TIU', 'Deret Angka')).toBe(true);
    expect(hasKamus('TIU', 'Sinonim')).toBe(false);
    expect(hasKamus('TWK', 'Deret Angka')).toBe(false);
  });
});

describe('Kamus formulas are valid TeX', () => {
  it('every $...$ part renders with KaTeX without an error', async () => {
    const katex = (await import('katex')).default;
    const { splitMath } = await import('../lib/richText');
    for (const e of KAMUS_TIU) {
      for (const text of [e.formula, e.note ?? '', e.example.question, e.example.solution]) {
        for (const p of splitMath(text).filter((x) => x.math)) expect(() => katex.renderToString(p.text, { throwOnError: true }), `${e.id}: ${p.text}`).not.toThrow();
      }
    }
  });
});
