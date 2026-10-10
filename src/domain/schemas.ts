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

/**
 * Recover the complete question objects from a reply that was cut off
 * (e.g. hit the output-token limit), so a paid request is not wasted.
 */
export function salvageQuestions(text: string): unknown[] {
  const anchor = text.search(/"questions"\s*:\s*\[/);
  let i = anchor >= 0 ? text.indexOf('[', anchor) + 1 : text.indexOf('[') + 1;
  if (i <= 0) return [];
  const out: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          out.push(JSON.parse(text.slice(objStart, i + 1)));
        } catch {
          /* skip malformed object */
        }
        objStart = -1;
      }
    } else if (c === ']' && depth === 0) break;
  }
  return out;
}

function rawQuestions(text: string): unknown[] {
  try {
    const parsed = extractJson(text) as { questions?: unknown };
    if (Array.isArray(parsed?.questions)) return parsed.questions;
  } catch {
    /* fall through to salvage */
  }
  return salvageQuestions(text);
}

/**
 * Parse the model's questions. Invalid or truncated entries are dropped
 * individually; the caller re-requests whatever is missing.
 */
export function parseAiQuestions(text: string, ctx: { subtest: Subtest; items: BatchItem[]; setId?: string }): Question[] {
  const valid = rawQuestions(text)
    .map((raw, idx) => ({ parsed: aiQuestion.safeParse(raw), idx }))
    .filter((x) => x.parsed.success)
    .map((x) => ({ q: x.parsed.data!, idx: x.idx }));
  if (!valid.length) throw new Error('Respons AI tidak berisi soal yang valid.');
  const now = Date.now();
  return valid.map(({ q, idx }) => {
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

/**
 * Split a reply that covers several sub-tests (see buildMultiPrompt) by each
 * question's "subtest" field and parse every part on its own.
 */
export function parseMultiQuestions(text: string, parts: { subtest: Subtest; items: BatchItem[] }[], setId?: string): Map<Subtest, Question[]> {
  const bySub = new Map<Subtest, unknown[]>(parts.map((p) => [p.subtest, []]));
  const unlabeled: unknown[] = [];
  for (const raw of rawQuestions(text)) {
    const s = String((raw as { subtest?: unknown } | null)?.subtest ?? '')
      .trim()
      .toUpperCase() as Subtest;
    if (bySub.has(s)) bySub.get(s)!.push(raw);
    else unlabeled.push(raw);
  }
  // Without a label, fill the parts in the order the prompt asked for.
  for (const raw of unlabeled) {
    const part = parts.find((p) => bySub.get(p.subtest)!.length < p.items.length);
    if (part) bySub.get(part.subtest)!.push(raw);
  }
  const out = new Map<Subtest, Question[]>();
  for (const p of parts) {
    const list = bySub.get(p.subtest)!;
    let questions: Question[] = [];
    if (list.length) {
      try {
        questions = parseAiQuestions(JSON.stringify({ questions: list }), { subtest: p.subtest, items: p.items, setId });
      } catch {
        // Nothing usable for this part; its items are requested again.
      }
    }
    out.set(p.subtest, questions);
  }
  if (![...out.values()].some((q) => q.length)) throw new Error('Respons AI tidak berisi soal yang valid.');
  return out;
}
