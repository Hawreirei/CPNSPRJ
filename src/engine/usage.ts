import { db } from '../db';

/** Count one AI request and its tokens against the set it was made for. */
export async function addUsage(setId: string, inputTokens: number, outputTokens: number) {
  const set = await db.sets.get(setId);
  if (!set) return;
  await db.sets.update(setId, {
    usage: {
      inputTokens: set.usage.inputTokens + inputTokens,
      outputTokens: set.usage.outputTokens + outputTokens,
      requests: set.usage.requests + 1,
    },
  });
}
