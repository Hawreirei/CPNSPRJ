import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { DEFAULT_SETTINGS, PASSAGE_TOPIC } from '../domain/blueprint';
import { endOfGroup, keepGroupsTogether, moveUnit, opensGroup, passageLabel, shuffleUnits, takeUnits, units } from '../domain/groups';
import { buildCrossCheckPrompt, buildPassagePrompt, buildPrompt, buildRewritePrompt } from '../domain/prompts';
import { parseAiPassages, parseAiQuestions } from '../domain/schemas';
import type { BatchItem, Blueprint, OptionLabel, Passage, Question } from '../domain/types';
import { startAttempt } from '../engine/attempts';
import { appendToSet } from '../engine/generator';
import { isPassageBatch, passageSizes, planBatches } from '../engine/plan';
import { createBankSet, createRemedialSet, moveInSet, pickFromBank } from '../engine/sets';

let n = 0;
const passage = (id: string, questionIds?: string[]): Passage => ({ id, title: `Judul ${id}`, text: `Teks wacana ${id}. `.repeat(10), ...(questionIds ? { questionIds } : {}) });
function mkQ(partial: Partial<Question> = {}): Question {
  const id = partial.id ?? `q${++n}`;
  return {
    id,
    subtest: 'TIU',
    topic: PASSAGE_TOPIC,
    difficulty: 'sedang',
    stem: `Pertanyaan ${id}?`,
    options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label) => ({ label, text: `Opsi ${label} ${id}`, score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: 'Jawaban: A.',
    flags: [],
    locked: false,
    starred: false,
    hash: `h-${id}`,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}
const ids = (qs: { id: string }[]) => qs.map((q) => q.id);

/** P1 = a,b,c; single s; P2 = d,e. */
function sample() {
  const p1 = passage('p1', ['a', 'b', 'c']);
  const p2 = passage('p2', ['d', 'e']);
  return [
    mkQ({ id: 'a', passage: p1 }),
    mkQ({ id: 'b', passage: p1 }),
    mkQ({ id: 's', topic: 'Sinonim' }),
    mkQ({ id: 'c', passage: p1 }),
    mkQ({ id: 'd', passage: p2 }),
    mkQ({ id: 'e', passage: p2 }),
  ];
}

/** Every group's questions are next to each other and in their original order. */
function groupsIntact(order: Question[], original: Question[]) {
  for (const pid of new Set(original.flatMap((q) => (q.passage ? [q.passage.id] : [])))) {
    const want = original.filter((q) => q.passage?.id === pid).map((q) => q.id);
    const at = order.findIndex((q) => q.id === want[0]);
    expect(ids(order.slice(at, at + want.length)), `group ${pid}`).toEqual(want);
  }
}

describe('passage groups', () => {
  it('gathers a group at its first question, in reading order', () => {
    expect(units(sample()).map(ids)).toEqual([['a', 'b', 'c'], ['s'], ['d', 'e']]);
    // Whatever order the questions come in (the database's is arbitrary), a group reads in its own order.
    const [a, b, s, c, d, e] = sample();
    expect(units([c, e, a, s, b, d]).map(ids)).toEqual([['a', 'b', 'c'], ['d', 'e'], ['s']]);
    expect(ids(keepGroupsTogether(sample()))).toEqual(['a', 'b', 'c', 's', 'd', 'e']);
  });

  it('never splits a group when shuffling', () => {
    const qs = keepGroupsTogether(sample());
    for (let seed = 1; seed < 200; seed++) {
      let x = seed;
      const r = () => (x = (x * 16807) % 2147483647) / 2147483647;
      const out = shuffleUnits(qs, r);
      expect(out).toHaveLength(qs.length);
      groupsIntact(out, qs);
    }
  });

  it('moves a whole group past its neighbour, and a single question past a whole group', () => {
    const qs = keepGroupsTogether(sample());
    expect(ids(moveUnit(qs, 'b', 1))).toEqual(['s', 'a', 'b', 'c', 'd', 'e']);
    expect(ids(moveUnit(qs, 's', 1))).toEqual(['a', 'b', 'c', 'd', 'e', 's']);
    expect(ids(moveUnit(qs, 's', -1))).toEqual(['s', 'a', 'b', 'c', 'd', 'e']);
    expect(ids(moveUnit(qs, 'a', -1))).toEqual(ids(qs));
  });

  it('takes whole groups only', () => {
    const qs = keepGroupsTogether(sample());
    expect(ids(takeUnits(qs, 4))).toEqual(['a', 'b', 'c', 's']);
    expect(ids(takeUnits(qs, 2))).toEqual(['s']);
    expect(ids(takeUnits(qs, 3))).toEqual(['a', 'b', 'c']);
  });

  it('labels a passage with the numbers of its questions', () => {
    const qs = keepGroupsTogether(sample());
    expect(passageLabel(qs, qs[1])).toBe('Bacaan untuk soal 1–3');
    expect(passageLabel(qs, qs[4])).toBe('Bacaan untuk soal 5–6');
    expect(opensGroup(qs, qs[0])).toBe(true);
    expect(opensGroup(qs, qs[1])).toBe(false);
    expect(opensGroup(qs, qs[3])).toBe(false);
    expect(endOfGroup(qs, 'a')).toBe('c');
    expect(endOfGroup(qs, 's')).toBe('s');
  });
});

describe('planning passages', () => {
  const bp = (count: number): Blueprint => ({
    sections: [{ subtest: 'TIU', count, topics: [PASSAGE_TOPIC, 'Sinonim'], difficulty: 'sedang' }],
    durationMinutes: 10,
    passing: DEFAULT_SETTINGS.passing,
  });

  it('puts two or more reading questions in their own passage batch', () => {
    const batches = planBatches(bp(10), 20);
    const reading = batches.filter(isPassageBatch);
    expect(reading).toHaveLength(1);
    expect(reading[0].count).toBe(5);
    expect(batches.filter((b) => !isPassageBatch(b)).flatMap((b) => b.items.map((i) => i.topic))).not.toContain(PASSAGE_TOPIC);
    expect(passageSizes(5)).toEqual([3, 2]);
    expect(passageSizes(7)).toEqual([3, 2, 2]);
    expect(passageSizes(2)).toEqual([2]);
  });

  it('leaves a lone reading question in the normal batch', () => {
    const batches = planBatches(bp(2), 20);
    expect(batches.some(isPassageBatch)).toBe(false);
  });
});

describe('passage prompt and reply', () => {
  const items: BatchItem[] = Array.from({ length: 5 }, (_, i) => ({ topic: PASSAGE_TOPIC, difficulty: i < 3 ? 'mudah' : 'sulit' }));
  const sizes = [3, 2];
  const reply = (counts: number[]) =>
    JSON.stringify({
      passages: counts.map((c, p) => ({
        title: `Wacana ${p}`,
        text: `Isi wacana nomor ${p} yang cukup panjang untuk dibaca. `.repeat(4),
        questions: Array.from({ length: c }, (_, k) => ({
          stem: `Menurut wacana ${p}, apa ${k}?`,
          options: ['A', 'B', 'C', 'D', 'E'].map((l) => ({ label: l, text: `Opsi ${l}` })),
          answer: 'B',
          explanation: 'Kalimat kedua. Jawaban: B.',
        })),
      })),
    });

  it('asks for each passage with its number of questions', () => {
    const p = buildPassagePrompt({ items, sizes });
    expect(p).toMatch(/^Wacana 1: 3 soal, kesulitan mudah/m);
    expect(p).toMatch(/^Wacana 2: 2 soal, kesulitan sulit/m);
    expect(p).toContain('"passages"');
  });

  it('gives every question of a passage the same passage, in order', () => {
    const qs = parseAiPassages(reply([3, 2]), { items, sizes, setId: 's1' });
    expect(qs).toHaveLength(5);
    expect(new Set(qs.slice(0, 3).map((q) => q.passage!.id)).size).toBe(1);
    expect(qs[3].passage!.id).toBe(qs[4].passage!.id);
    expect(qs[0].passage!.id).not.toBe(qs[3].passage!.id);
    expect(qs[0].passage!.title).toBe('Wacana 0');
    expect(qs[0].passage!.questionIds).toEqual(ids(qs.slice(0, 3)));
    expect(qs.map((q) => q.difficulty)).toEqual(['mudah', 'mudah', 'mudah', 'sulit', 'sulit']);
    expect(qs.every((q) => q.answer === 'B' && q.originSetId === 's1')).toBe(true);
    // The same question after another passage is not a duplicate.
    expect(qs[0].hash).not.toBe(parseAiQuestions(JSON.stringify({ questions: [JSON.parse(reply([1])).passages[0].questions[0]] }), { subtest: 'TIU', items }).at(0)!.hash);
  });

  it('refuses a reply with missing passages or questions, as a whole', () => {
    expect(() => parseAiPassages(reply([3]), { items, sizes })).toThrow('AI mengirim 1 wacana, diminta 2');
    expect(() => parseAiPassages(reply([3, 1]), { items, sizes })).toThrow('Wacana 2 berisi 1 soal valid, diminta 2');
    expect(() => parseAiPassages(reply([4, 2]), { items, sizes })).toThrow('Wacana 1');
    expect(() => parseAiPassages('{"questions": []}', { items, sizes })).toThrow('tidak berisi wacana');
  });

  it('shows the passage to the second model and to a rewrite', () => {
    const q = mkQ({ passage: passage('px') });
    expect(buildCrossCheckPrompt('TIU', [q])).toContain('[Bacaan: Teks wacana px.');
    expect(buildRewritePrompt(q, '')).toContain('Soal ini menyertai wacana berikut');
    expect(buildRewritePrompt(mkQ(), '')).not.toContain('wacana berikut');
  });
});

describe('TKP dilemmas', () => {
  it('asks hard TKP questions for a dilemma and a reason per option', () => {
    const p = buildPrompt({ subtest: 'TKP', items: [{ topic: 'Pelayanan Publik', difficulty: 'sulit' }] });
    expect(p).toContain('DILEMA');
    expect(p).toContain('"rationale"');
  });

  it('keeps the reason per option', () => {
    const raw = {
      questions: [
        {
          stem: 'Situasi kerja yang sulit?',
          options: [5, 4, 3, 2, 1].map((s, i) => ({ label: 'ABCDE'[i], text: `Tindakan ${i}`, score: s, rationale: `Alasan ${s}` })),
          explanation: 'x',
        },
      ],
    };
    const [q] = parseAiQuestions(JSON.stringify(raw), { subtest: 'TKP', items: [{ topic: 'Pelayanan Publik', difficulty: 'sulit' }] });
    expect(q.options.map((o) => o.rationale)).toEqual(['Alasan 5', 'Alasan 4', 'Alasan 3', 'Alasan 2', 'Alasan 1']);
    // Only TKP options have reasons.
    const [t] = parseAiQuestions(JSON.stringify({ questions: [{ ...raw.questions[0], answer: 'A' }] }), { subtest: 'TWK', items: [{ topic: 'Pancasila', difficulty: 'sulit' }] });
    expect(t.options.every((o) => o.rationale === undefined)).toBe(true);
  });
});

describe('sets and attempts keep groups together', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  async function setWith(order: Question[]) {
    await db.questions.bulkPut(order);
    return createBankSet(
      'Bacaan',
      { sections: [{ subtest: 'TIU', count: order.length, topics: [PASSAGE_TOPIC, 'Sinonim'], difficulty: 'campuran' }], durationMinutes: 10, passing: DEFAULT_SETTINGS.passing },
      order,
    );
  }

  it('builds a set from scattered picks with each group in one place', async () => {
    const set = await setWith(sample());
    expect(set.questionIds).toEqual(['a', 'b', 'c', 's', 'd', 'e']);
  });

  it('moves groups as blocks inside a set', async () => {
    const set = await setWith(sample());
    await moveInSet(set.id, 'c', 1);
    expect((await db.sets.get(set.id))!.questionIds).toEqual(['s', 'a', 'b', 'c', 'd', 'e']);
    await moveInSet(set.id, 's', 1);
    expect((await db.sets.get(set.id))!.questionIds).toEqual(['a', 'b', 'c', 's', 'd', 'e']);
  });

  it('shuffles an exam without splitting a group', async () => {
    const set = await setWith(sample());
    const original = keepGroupsTogether(sample());
    for (let i = 0; i < 30; i++) {
      const a = await startAttempt(set.id, { shuffleQuestions: true, durationMinutes: 10 });
      groupsIntact((await db.questions.bulkGet(a.questionIds)) as Question[], original);
    }
  });

  it('adds "more like this" after the whole group', async () => {
    const set = await setWith(sample());
    await appendToSet(set.id, [mkQ({ id: 'new', topic: 'Sinonim' })], 'a');
    expect((await db.sets.get(set.id))!.questionIds).toEqual(['a', 'b', 'c', 'new', 's', 'd', 'e']);
  });

  it('picks whole groups from the bank, or none of a group that does not fit', async () => {
    await db.questions.bulkPut(sample());
    const bp = (count: number): Blueprint => ({
      sections: [{ subtest: 'TIU', count, topics: [PASSAGE_TOPIC], difficulty: 'campuran' }],
      durationMinutes: 10,
      passing: DEFAULT_SETTINGS.passing,
    });
    for (let i = 0; i < 20; i++) {
      const five = await pickFromBank(bp(5));
      expect(five.picked.map((q) => q.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
      groupsIntact(five.picked, keepGroupsTogether(sample()));
      const two = await pickFromBank(bp(2));
      expect(two.picked.map((q) => q.id).sort()).toEqual(['d', 'e']);
      expect(two.shortfall).toEqual([]);
    }
    const weak = await createRemedialSet([{ subtest: 'TIU', topic: PASSAGE_TOPIC, score: 0, max: 10, total: 2 }], 4);
    // Up to four questions: one whole group fits, the other would overflow and is left out.
    expect([[3], [2]]).toContainEqual(units((await db.questions.bulkGet(weak.questionIds)) as Question[]).map((u) => u.length));
  });
});
