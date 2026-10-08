import { getSettings } from '../db';
import { buildTutorPrompt, parseTutorReply, TUTOR_SYSTEM, tutorCost, type TutorTurn } from '../domain/tutor';
import type { OptionLabel, Question } from '../domain/types';
import { resolveKey } from './keys';
import { priceFor } from './plan';
import { callModel, openSession } from './session';

export interface TutorRequest {
  question: string;
  userAnswer?: OptionLabel;
  history?: TutorTurn[];
}

/** Which key and model a tutor request would use, and its rough cost; null without a key. */
export async function tutorEstimate(q: Question, req: TutorRequest): Promise<{ label: string; model: string; usd: number } | null> {
  const key = await resolveKey();
  if (!key) return null;
  return { label: key.label, model: key.model, usd: tutorCost(buildTutorPrompt(q, req), priceFor(key.model, await getSettings())) };
}

/** Ask the tutor about a question with the default key, within its quota (one request, retried if garbled). */
export async function askTutor(q: Question, req: TutorRequest, signal: AbortSignal): Promise<{ answer: string; keyLooksWrong: boolean }> {
  const session = await openSession();
  return callModel(session, { system: TUTOR_SYSTEM, prompt: buildTutorPrompt(q, req) }, parseTutorReply, signal, async () => {});
}
