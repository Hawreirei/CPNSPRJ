import { z } from 'zod';
import { hashText, uid } from '../lib/id';
import { isGraded, keyedScore, clampGraded, scoringOf, type ExamPackage } from './examPackage';
import { extractJson } from './schemas';
import { OPTION_LABELS } from './types';
import type { Difficulty, OptionLabel, Question, Subtest } from './types';
import { validateQuestion } from './validators';
import { MAX_IMAGE_CHARS, MAX_IMAGE_SIDE as MAX_PICTURE_SIDE } from './questionImage';

/*
 * Questions copied from a photo or a PDF page by a multimodal model (#38). The model reads the page
 * and proposes a key and an explanation where the page has none; nothing it returns is trusted:
 * every question is checked like an AI-written one, marked "perlu dicek", and saved only after the
 * learner has looked at it next to the page.
 */

/** Shown before anything is sent, and again when a set with imported questions is shared. */
export const COPYRIGHT_NOTICE =
  'Impor hanya materi milik Anda sendiri atau yang lisensinya membolehkan disalin, misalnya catatan atau soal buatan sendiri. Jangan mengimpor soal dari buku, bimbel, atau tryout berbayar tanpa izin pemegang hak ciptanya.';


export const IMPORT_SYSTEM = `Anda menyalin soal pilihan ganda dari gambar halaman buku atau lembar latihan milik pengguna.
Salin teks soal dan opsi apa adanya, kata demi kata; jangan memperbaiki, meringkas, atau mengarang isi yang tidak terbaca.
Gunakan $...$ hanya untuk rumus. Balas HANYA dengan JSON yang diminta.`;

/** A page larger than this on its long side is scaled down before sending: Claude's own limit, and enough to read print. */
export const MAX_IMAGE_SIDE = 1568;

/**
 * Input tokens of one page image, rounded up. Gemini 3 bills a fixed 1120 at its default resolution,
 * OpenAI 85 plus 170 per 512 px tile after fitting the short side to 768, Claude width × height / 750
 * up to about 1600. Compatible servers vary, so they get the largest.
 */
export function imageTokens(provider: string, width: number, height: number): number {
  if (provider === 'gemini') return 1120;
  if (provider === 'openai') {
    const fit = Math.min(1, 2048 / Math.max(width, height));
    const short = Math.min(1, 768 / (Math.min(width, height) * fit));
    const [w, h] = [width * fit * short, height * fit * short];
    return 85 + 170 * Math.ceil(w / 512) * Math.ceil(h / 512);
  }
  if (provider === 'anthropic') return Math.min(1600, Math.ceil((width * height) / 750));
  return 1600;
}

/** Output tokens budgeted for one page: about a dozen questions with a short explanation each. */
export const PAGE_OUTPUT_TOKENS = 5000;

/** Rough cost of one page in USD: the prompt and the image in, at most one page of questions out. */
export function pageCost(prompt: string, imgTokens: number, price: { input: number; output: number }): number {
  const input = Math.ceil((IMPORT_SYSTEM.length + prompt.length) / 3.5) + imgTokens;
  return (input * price.input + PAGE_OUTPUT_TOKENS * price.output) / 1e6;
}

export interface ImportTarget {
  pkg: ExamPackage;
  /** Every question goes to this sub-test; otherwise the model picks one per question. */
  subtest?: Subtest;
  /** Topics per sub-test to choose from (SKD: the active syllabus profile). */
  topics: Partial<Record<Subtest, string[]>>;
}

export function buildImportPrompt(t: ImportTarget): string {
  const subs = t.pkg.subtests.filter((s) => !t.subtest || s.id === t.subtest);
  const lines = subs.map((s) => {
    const rule =
      s.scoring.kind === 'keyed' ? `satu jawaban benar` : `setiap opsi diberi "score" ${s.scoring.min} sampai ${s.scoring.max}, tepat satu opsi bernilai ${s.scoring.max}`;
    const topics = t.topics[s.id]?.length ? ` Topik: ${t.topics[s.id]!.join(', ')}.` : '';
    return `- ${s.id} (${s.name}): ${rule}.${topics}`;
  });
  return [
    `Gambar ini satu halaman soal latihan ${t.pkg.name}. Salin setiap soal pilihan ganda yang ada di halaman.`,
    t.subtest ? `Semua soal di halaman ini sub-tes ${t.subtest}:` : 'Tentukan sub-tes setiap soal dari daftar ini:',
    ...lines,
    '',
    'Aturan:',
    '1. "stem" dan "text" setiap opsi disalin persis dari halaman, dalam urutan aslinya. Huruf opsi (A, B, …) tidak ikut disalin ke "text".',
    '2. Bila kunci jawaban tercetak di halaman (misalnya di kunci atau pembahasan), pakai itu dan isi "answerFromPage": true. Bila tidak ada, usulkan kunci Anda sendiri dan isi "answerFromPage": false.',
    '3. Tulis "explanation" singkat (paling banyak 3 kalimat). Bila halaman memuat pembahasan, salin pembahasan itu.',
    '4. Bila soal memakai gambar, diagram, grafik, atau tabel yang tidak bisa ditulis sebagai teks, isi "figure": true. Tetap salin teks soal dan opsinya bila opsinya berupa teks; kosongkan "options" bila opsinya berupa gambar.',
    '5. Bila soal terpotong di tepi halaman atau tidak terbaca, isi "incomplete": true.',
    '6. "topic" dipilih dari daftar topik sub-tesnya; "difficulty" salah satu dari mudah, sedang, sulit.',
    '7. Bila halaman tidak berisi soal, balas {"questions": []}.',
    '',
    'Format JSON:',
    '{"questions": [{"no": 1, "subtest": "TWK", "topic": "…", "difficulty": "sedang", "stem": "…", "options": [{"label": "A", "text": "…", "score": 3}], "answer": "C", "answerFromPage": false, "explanation": "…", "figure": false, "incomplete": false}]}',
    '"score" hanya untuk sub-tes yang setiap opsinya dinilai; "answer" hanya untuk sub-tes dengan satu jawaban benar.',
  ].join('\n');
}

const label = z
  .string()
  .transform((s) =>
    s
      .trim()
      .toUpperCase()
      .replace(/[^A-E]/g, '')
      .slice(0, 1),
  )
  .pipe(z.enum(['A', 'B', 'C', 'D', 'E']));

const pageQuestion = z.object({
  no: z.coerce.number().optional().nullable(),
  subtest: z.string().optional().nullable(),
  topic: z.string().optional().nullable(),
  difficulty: z.string().optional().nullable(),
  stem: z.string().default(''),
  options: z.array(z.object({ label: label.optional().nullable().catch(undefined), text: z.string().default(''), score: z.coerce.number().optional().nullable() })).default([]),
  answer: label.optional().nullable().catch(undefined),
  answerFromPage: z.boolean().optional().nullable(),
  explanation: z.string().optional().nullable(),
  figure: z.boolean().optional().nullable(),
  incomplete: z.boolean().optional().nullable(),
});

/** One question as it came off the page, with what the learner should know before saving it. */
export interface ImportDraft {
  question: Question;
  /** Things to check against the page, in Indonesian. */
  notes: string[];
  /** The question shows a picture on the page: it cannot be saved until one is cut and attached. */
  needsImage?: boolean;
}

export interface PageResult {
  drafts: ImportDraft[];
  /** Questions on the page that were not taken, and why. */
  skipped: { no: number; reason: string }[];
}

const DIFFICULTIES = new Set<Difficulty>(['mudah', 'sedang', 'sulit']);

/**
 * Read the model's reply for one page. Throws only when the reply is not the JSON asked for (so it
 * is requested again); a page without questions is an empty result, and a question that cannot be
 * used as it is (a figure, too few options, cut off) is listed as skipped with the reason.
 */
export function parseImportedPage(text: string, t: ImportTarget, knownHashes?: Set<string>, now = Date.now()): PageResult {
  const raw = (extractJson(text) as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) throw new Error('Respons AI tidak berisi daftar soal.');
  const ids = new Set(t.pkg.subtests.map((s) => s.id));
  const drafts: ImportDraft[] = [];
  const skipped: PageResult['skipped'] = [];
  raw.forEach((item, i) => {
    const r = pageQuestion.safeParse(item);
    const no = (r.success && r.data.no) || i + 1;
    if (!r.success) return skipped.push({ no, reason: 'isinya tidak terbaca' });
    const q = r.data;
    const options = q.options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text);
    if (q.incomplete) return skipped.push({ no, reason: 'terpotong atau tidak terbaca di halaman ini' });
    if (q.stem.trim().length < 5) return skipped.push({ no, reason: 'teks soalnya tidak terbaca' });
    if (q.figure && options.length < 4) return skipped.push({ no, reason: 'pilihan jawabannya berupa gambar; soal seperti ini belum bisa diimpor' });
    if (options.length < 4) return skipped.push({ no, reason: `opsinya hanya ${options.length}; perlu paling sedikit 4` });

    const notes: string[] = [];
    // The question's own picture is cut from the page by the learner (#49) before it can be saved.
    if (q.figure) notes.push(NEEDS_IMAGE_NOTE);
    const named = q.subtest?.trim().toUpperCase() ?? '';
    let subtest: Subtest;
    if (t.subtest) subtest = t.subtest;
    else if (ids.has(named)) subtest = named;
    else {
      subtest = t.pkg.subtests[0].id;
      notes.push(`Sub-tes ${named ? `"${named}" ` : ''}tidak dikenali; dipasang ke ${subtest}. Ganti bila perlu.`);
    }
    if (options.length > 5) notes.push(`Halaman memuat ${options.length} opsi; hanya 5 yang pertama diambil.`);

    const graded = isGraded(subtest);
    const opts = options.slice(0, 5).map((o, k) => ({ label: OPTION_LABELS[k], text: o.text, score: o.score ?? 0, origLabel: o.label }));
    let answer: OptionLabel | undefined;
    if (!graded) {
      // The model may re-letter options it copied; follow its letters back to positions.
      answer = opts.find((o) => o.origLabel === q.answer)?.label ?? (q.answer && opts.some((o) => o.label === q.answer) ? q.answer : undefined);
      if (!answer) notes.push('Kunci jawaban tidak ditemukan; pilih sendiri lewat Edit.');
      else if (!q.answerFromPage) notes.push('Kunci jawaban diusulkan AI, bukan dari halaman. Periksa.');
    } else if (!q.answerFromPage) notes.push('Skor setiap opsi diusulkan AI. Periksa.');

    const topics = t.topics[subtest] ?? [];
    const topic = topics.find((x) => x.toLowerCase() === q.topic?.trim().toLowerCase()) ?? (q.topic?.trim().slice(0, 80) || topics[0] || specName(t, subtest));
    const difficulty = DIFFICULTIES.has(q.difficulty as Difficulty) ? (q.difficulty as Difficulty) : 'sedang';
    const stem = q.stem.trim();
    const question = validateQuestion(
      {
        id: uid(),
        subtest,
        topic,
        difficulty,
        stem,
        options: opts.map(({ origLabel: _o, ...o }) => ({ ...o, score: graded ? clampGraded(subtest, o.score) : keyedScore(subtest, o.label === answer) })),
        answer,
        explanation: q.explanation?.trim() ?? '',
        confidence: 'low',
        flags: [],
        locked: false,
        starred: false,
        hash: hashText(stem),
        source: 'import',
        createdAt: now,
        updatedAt: now,
      },
      knownHashes,
    );
    drafts.push({ question, notes, ...(q.figure ? { needsImage: true } : {}) });
  });
  return { drafts, skipped };
}

/**
 * Where to cut a picture from a page, in the page image's own pixels, from a rectangle given in
 * fractions of its displayed size (what a drag on screen yields), and the size to store it at.
 */
export function cropBox(rect: { x: number; y: number; w: number; h: number }, natural: { width: number; height: number }) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp(Math.min(rect.x, rect.x + rect.w));
  const y0 = clamp(Math.min(rect.y, rect.y + rect.h));
  const x1 = clamp(Math.max(rect.x, rect.x + rect.w));
  const y1 = clamp(Math.max(rect.y, rect.y + rect.h));
  const sx = Math.round(x0 * natural.width);
  const sy = Math.round(y0 * natural.height);
  const sw = Math.max(1, Math.round((x1 - x0) * natural.width));
  const sh = Math.max(1, Math.round((y1 - y0) * natural.height));
  const scale = Math.min(1, MAX_PICTURE_SIDE / Math.max(sw, sh));
  return { sx, sy, sw, sh, width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) };
}

export const NEEDS_IMAGE_NOTE = 'Soal ini memakai gambar di halaman. Potong gambarnya dari halaman asli dan tempelkan ke soal ini sebelum menyimpan.';

/** JPEG qualities tried in turn until a picture fits the size cap. */
export const CROP_QUALITIES = [0.85, 0.7, 0.55, 0.4];
export { MAX_IMAGE_CHARS };

const specName = (t: ImportTarget, s: Subtest) => t.pkg.subtests.find((x) => x.id === s)?.name ?? s;

/**
 * Move a draft to another sub-test of its package. Between a keyed and a graded sub-test the key
 * becomes the best option and back, so nothing the learner already set is lost.
 */
export function moveToSubtest(q: Question, subtest: Subtest, topics: string[] = []): Question {
  if (subtest === q.subtest) return q;
  const topic = topics.length && !topics.includes(q.topic) ? topics[0] : q.topic;
  const to = scoringOf(subtest);
  let options = q.options;
  let answer = q.answer;
  if (to.kind === 'graded' && !isGraded(q.subtest)) {
    options = q.options.map((o) => ({ ...o, score: o.label === q.answer ? to.max : to.min }));
    answer = undefined;
  } else if (to.kind === 'keyed') {
    if (isGraded(q.subtest)) answer = [...q.options].sort((a, b) => b.score - a.score)[0]?.label;
    options = q.options.map(({ rationale: _r, ...o }) => ({ ...o, score: keyedScore(subtest, o.label === answer) }));
  } else options = q.options.map((o) => ({ ...o, score: clampGraded(subtest, o.score) }));
  return validateQuestion({ ...q, subtest, topic, options, answer, updatedAt: Date.now() });
}
