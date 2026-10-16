import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { ARCHETYPES, makeWith } from '../domain/figural';
import { FIGURAL_RECIPES, FIGURAL_TOPICS, figuralMisses } from '../domain/figuralNames';
import { TOPICS } from '../domain/blueprint';
import { createFiguralSet } from '../engine/sets';
import { seeded } from './figuralHelpers';

describe('recipe names for pages that do not load the generators', () => {
  it('match the recipes', () => {
    expect(Object.fromEntries(ARCHETYPES.map((a) => [a.id, { name: a.name, topic: a.topic }]))).toEqual(FIGURAL_RECIPES);
  });
  it('cover every figural topic, all offered in TIU', () => {
    expect(new Set(Object.values(FIGURAL_RECIPES).map((r) => r.topic))).toEqual(new Set(FIGURAL_TOPICS));
    for (const t of FIGURAL_TOPICS) expect(TOPICS.TIU).toContain(t);
  });
});

describe('figural mistakes by recipe', () => {
  it('counts wrong and blank answers per recipe, most missed first', () => {
    const orbit = ARCHETYPES.find((a) => a.id === 'orbit')!;
    const cube = ARCHETYPES.find((a) => a.id === 'cube-net')!;
    const qs = [makeWith(orbit, 'sulit', seeded(1)), makeWith(orbit, 'sulit', seeded(2)), makeWith(cube, 'mudah', seeded(3)), makeWith(cube, 'mudah', seeded(4))];
    const wrong = (i: number) => (qs[i].answer === 'A' ? 'B' : 'A');
    const misses = figuralMisses(qs, { [qs[0].id]: wrong(0), [qs[2].id]: qs[2].answer!, [qs[3].id]: wrong(3) });
    expect(misses.map((m) => [m.archetype, m.wrong, m.total])).toEqual([
      ['orbit', 2, 2],
      ['cube-net', 1, 2],
    ]);
    expect(misses[0].difficulty).toBe('sulit');
  });
});

describe('figural practice sets', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('are made on the device from the chosen recipe and stored with their questions', async () => {
    const set = await createFiguralSet('Lab: Deret orbit', [{ topic: 'Deret Figural', difficulty: 'sedang', count: 6, archetypes: ['orbit'] }]);
    expect(set.status).toBe('ready');
    expect(set.questionIds).toHaveLength(6);
    const qs = await db.questions.bulkGet(set.questionIds);
    expect(qs.every((q) => q?.figureMeta?.archetype === 'orbit' && q.source === 'procedural')).toBe(true);
    expect((await db.sets.get(set.id))?.blueprint.sections[0]).toMatchObject({ subtest: 'TIU', count: 6, topics: ['Deret Figural'] });
  });
});
