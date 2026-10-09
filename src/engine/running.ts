import { db } from '../db';

/**
 * Generation runs in progress, by set id. Kept apart from the generator so startup code (the update
 * check in lib/pwa.ts, the recovery below) can ask without loading the generator, its prompts and zod.
 */
export const controllers = new Map<string, AbortController>();

export const isAnyGenerationRunning = () => controllers.size > 0;

/** Recover sets left in "generating" after a reload. */
export async function recoverInterrupted() {
  await db.sets.where('status').equals('generating').modify({ status: 'paused' });
}
