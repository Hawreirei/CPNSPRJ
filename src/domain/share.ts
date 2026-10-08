import { z } from 'zod';
import type { Blueprint, FlagKind, Question } from './types';

/*
 * A set shared as a file or a link: the set's name and blueprint and its questions, without
 * anything personal (API keys never; no attempts, notebook, ratings, reports or, unless chosen,
 * notes). A received file is untrusted: it is validated field by field before anything is stored,
 * and its text is only ever rendered as text.
 */

export const SHARE_VERSION = 1;
const MAX_QUESTIONS = 300;
const text = (max: number) => z.string().max(max);

/** Flags worth keeping from the sender: a second model's opinion and duplicates. The rest are recomputed. */
export const SHARED_FLAG_KINDS = new Set<FlagKind>(['cross-check-mismatch', 'cross-checked', 'duplicate']);

const label = z.enum(['A', 'B', 'C', 'D', 'E']);
const finite = z.number().finite();
const cell = z.object({
  shape: z.enum(['circle', 'square', 'triangle', 'diamond', 'star', 'arrow', 'pentagon']),
  fill: z.enum(['solid', 'empty', 'striped']),
  rotation: finite.min(-720).max(720),
  count: z.number().int().min(1).max(4),
});
const subtest = z.enum(['TWK', 'TIU', 'TKP']);
const difficulty = z.enum(['mudah', 'sedang', 'sulit']);

const questionSchema = z.object({
  id: text(80),
  subtest,
  topic: text(80).min(1),
  difficulty,
  stem: text(4000).min(1),
  options: z
    .array(
      z.object({
        label,
        text: text(1000),
        score: z.number().int().min(0).max(5),
        figure: cell.optional(),
        rationale: text(600).optional(),
      }),
    )
    .min(2)
    .max(5),
  answer: label.optional(),
  explanation: text(6000),
  reference: text(500).optional(),
  confidence: z.enum(['high', 'low']).optional(),
  mathExpression: text(300).optional(),
  figure: z.object({ layout: z.enum(['series', 'analogy', 'matrix', 'transform', 'odd-one-out']), cells: z.array(cell.nullable()).max(9) }).optional(),
  data: z
    .object({
      kind: z.enum(['table', 'bar', 'line', 'pie']),
      title: text(200),
      unit: text(40),
      category: text(60),
      labels: z.array(text(60)).min(1).max(12),
      series: z.array(z.object({ name: text(60), values: z.array(finite).max(12) })).min(1).max(4),
    })
    .optional(),
  passage: z.object({ id: text(80), title: text(200).optional(), text: text(8000).min(1), questionIds: z.array(text(80)).max(10).optional() }).optional(),
  notes: z.array(z.object({ text: text(4000), at: finite })).max(20).optional(),
  flags: z.array(z.object({ kind: z.string(), message: text(500), severity: z.enum(['info', 'warn']) })).max(20).default([]),
  hash: text(80).optional(),
  source: z.enum(['ai', 'procedural', 'manual']),
});

const blueprintSchema = z.object({
  sections: z.array(z.object({ subtest, count: z.number().int().min(0).max(500), topics: z.array(text(80)).max(60), difficulty: z.enum(['mudah', 'sedang', 'sulit', 'campuran']), weights: z.record(z.string(), finite).optional() })).max(3),
  durationMinutes: z.number().int().min(1).max(600),
  passing: z.object({ TWK: finite, TIU: finite, TKP: finite }),
});

const fileSchema = z.object({
  app: z.literal('cpns-skd-builder'),
  kind: z.literal('set'),
  version: z.number().int(),
  exportedAt: text(40).optional(),
  set: z.object({ name: text(120).min(1), blueprint: blueprintSchema }),
  questions: z.array(questionSchema).min(1, 'set kosong').max(MAX_QUESTIONS, `paling banyak ${MAX_QUESTIONS} soal`),
});

export type SharedQuestion = z.infer<typeof questionSchema>;
export interface SharedSet {
  app: 'cpns-skd-builder';
  kind: 'set';
  version: number;
  exportedAt?: string;
  set: { name: string; blueprint: Blueprint };
  questions: SharedQuestion[];
}

/** What a set looks like when shared: questions stripped of everything personal. */
export function toShared(name: string, blueprint: Blueprint, questions: Question[], opts: { includeNotes?: boolean } = {}): SharedSet {
  return {
    app: 'cpns-skd-builder',
    kind: 'set',
    version: SHARE_VERSION,
    exportedAt: new Date().toISOString(),
    set: { name, blueprint },
    questions: questions.map((q) => ({
      id: q.id,
      subtest: q.subtest,
      topic: q.topic,
      difficulty: q.difficulty,
      stem: q.stem,
      options: q.options.map(({ label, text, score, figure, rationale }) => ({ label, text, score, ...(figure ? { figure } : {}), ...(rationale ? { rationale } : {}) })),
      ...(q.answer ? { answer: q.answer } : {}),
      explanation: q.explanation,
      ...(q.reference ? { reference: q.reference } : {}),
      ...(q.confidence ? { confidence: q.confidence } : {}),
      ...(q.mathExpression ? { mathExpression: q.mathExpression } : {}),
      ...(q.figure ? { figure: q.figure } : {}),
      ...(q.data ? { data: q.data } : {}),
      ...(q.passage ? { passage: q.passage } : {}),
      ...(opts.includeNotes && q.notes?.length ? { notes: q.notes } : {}),
      flags: q.flags.filter((f) => SHARED_FLAG_KINDS.has(f.kind)),
      hash: q.hash,
      source: q.source,
    })),
  };
}

/** Validate a received file or link. Throws, in Indonesian, saying what is wrong; stores nothing. */
export function parseShared(raw: unknown): SharedSet {
  const kind = (raw as { kind?: unknown } | null)?.kind;
  if (!raw || typeof raw !== 'object' || (raw as { app?: unknown }).app !== 'cpns-skd-builder' || kind !== 'set') {
    throw new Error(kind === undefined && (raw as { sets?: unknown } | null)?.sets ? 'Ini berkas cadangan, bukan set bersama. Pulihkan lewat Pengaturan.' : 'Berkas bukan set bersama CPNS SKD Set Builder.');
  }
  const version = (raw as { version?: unknown }).version;
  if (typeof version === 'number' && version > SHARE_VERSION) throw new Error('Set ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi lalu coba lagi.');
  const r = fileSchema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Error(`Set tidak valid${i.path.length ? ` (${i.path.join('.')})` : ''}: ${i.message}.`);
  }
  return r.data as SharedSet;
}

/* -------------------------------------------------------------- links */

/** Set data in a link goes after "#/import?d=", in the fragment: browsers never send it to a server. */
export const LINK_PREFIX = '#/import?d=';
/** Longer links are cut by chat apps; such sets are shared as a file. */
export const MAX_LINK = 8000;
/** A QR code holds at most about 2.9 kB; links up to this length get one. */
export const MAX_QR_LINK = 2800;

const toBase64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** The set, compressed (deflate, built into the browser) and URL-safe. */
export async function encodeLinkData(shared: SharedSet): Promise<string> {
  const { exportedAt: _drop, ...lean } = shared;
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(lean)), new CompressionStream('deflate-raw')));
}

export async function decodeLinkData(d: string): Promise<unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(d), new DecompressionStream('deflate-raw'))));
  } catch {
    throw new Error('Tautan rusak atau terpotong. Minta tautan baru atau berkasnya.');
  }
}
