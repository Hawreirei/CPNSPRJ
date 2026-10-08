import { db } from '../db';
import type { CardState, Grade } from '../domain/types';
import { logReviewDay } from './review';
import { schedule, START_EASE, startOfDay } from './srs';

/** Start learning these cards: each is new, due today. Cards already being learned keep their schedule. */
export async function startCards(cardIds: readonly string[], now = Date.now()): Promise<number> {
  const have = new Set((await db.cards.bulkGet([...cardIds])).filter(Boolean).map((c) => c!.cardId));
  const fresh: CardState[] = cardIds
    .filter((id) => !have.has(id))
    .map((cardId) => ({ cardId, due: startOfDay(now), interval: 0, ease: START_EASE, reps: 0, lapses: 0, addedAt: now }));
  await db.cards.bulkPut(fresh);
  return fresh.length;
}

/** Stop learning these cards; their progress is removed. */
export async function stopCards(cardIds: readonly string[]): Promise<void> {
  await db.cards.bulkDelete([...cardIds]);
}

/** Grade a card after seeing its answer. Counts as a day of study for the streak, like a notebook review. */
export async function gradeCard(cardId: string, grade: Grade, now = Date.now()): Promise<CardState | undefined> {
  return db.transaction('rw', db.cards, db.meta, async () => {
    const card = await db.cards.get(cardId);
    if (!card) return;
    const next = { ...schedule(card, grade, now), firstReviewedAt: card.firstReviewedAt ?? now };
    await db.cards.put(next);
    await logReviewDay(now);
    return next;
  });
}
