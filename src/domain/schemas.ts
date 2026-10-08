import { z } from 'zod';
import { hashText, uid } from '../lib/id';
import { OPTION_LABELS } from './types';
import type { BatchItem, OptionLabel, Question, Subtest } from './types';

const label = z
  .string()
  .transform((s) => s.trim().toUpperCase().replace(/[^A-E]/g, '').slice(0, 1))
  .pipe(z.enum(['A', 'B', 'C', 'D', 'E']));

const aiOption = z.object({
  label: label.optional(),
  text: z.string().min(1),
  score: z.coerce.number().optional(),
});

const aiQuestion = z.object({
  topic: z.string().optional(),
  difficulty: z.string().optional(),
  stem: z.string().min(5),
  options: z.array(aiOption).min(4).max(6),
  answer: label.optional().nullable(),
  explanation: z.string().default(''),
  reference: z.string().optional().nullable(),
  confidence: z.string().optional().nullable(),
  mathExpression: z.string().optional().nullable(),
});

const aiPayload = z.object({ questions: z.array(aiQuestion).min(1) });

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error('Respons AI tidak berisi JSON.');
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  const end = body.lastIndexOf(close);
  const raw = body.slice(start, end + 1);
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? { questions: parsed } : parsed;
}

export function parseAiQuestions(text: string, ctx: { subtest: Subtest; items: BatchItem[]; setId?: string }): Question[] {
  const payload = aiPayload.parse(extractJson(text));
  const now = Date.now();
  return payload.questions.map((q, idx) => {
    // Topic/difficulty come from the requested slot, not the model's echo, so a set keeps its blueprint.
    const slot = ctx.items[idx] ?? ctx.items.find((i) => i.topic === q.topic) ?? ctx.items[0];
    const options = q.options.slice(0, 5).map((o, i) => ({
      label: OPTION_LABELS[i],
      text: o.text.trim(),
      score: ctx.subtest === 'TKP' ? Math.round(o.score ?? 0) : 0,
      origLabel: o.label,
    }));
    let answer: OptionLabel | undefined;
    if (ctx.subtest !== 'TKP') {
      // Map the model's label back to position in case it re-lettered options.
      const byOrig = options.find((o) => o.origLabel === q.answer);
      answer = byOrig?.label ?? (q.answer as OptionLabel | undefined);
      if (!answer) answer = options[q.options.findIndex((o) => (o.score ?? 0) >= 5)]?.label;
    }
    return {
      id: uid(),
      subtest: ctx.subtest,
      topic: slot.topic,
      difficulty: slot.difficulty,
      stem: q.stem.trim(),
      options: options.map(({ origLabel: _o, ...o }) => ({ ...o, score: ctx.subtest === 'TKP' ? o.score : o.label === answer ? 5 : 0 })),
      answer,
      explanation: q.explanation.trim(),
      reference: q.reference?.trim() || undefined,
      confidence: q.confidence === 'low' ? 'low' : 'high',
      mathExpression: q.mathExpression?.trim() || undefined,
      flags: [],
      locked: false,
      starred: false,
      hash: hashText(q.stem),
      originSetId: ctx.setId,
      source: 'ai',
      createdAt: now,
      updatedAt: now,
    } satisfies Question;
  });
}
