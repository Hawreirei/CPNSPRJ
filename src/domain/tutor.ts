import { z } from 'zod';
import { describeCell, describeData, describeFigure } from './describe';
import { extractJson } from './schemas';
import type { OptionLabel, Question } from './types';
import { isGraded } from './examPackage';

/*
 * "Tanya AI": a tutor for one question. It is given the question, its options, key, explanation
 * and reference, and the learner's answer; nothing else about the learner. It must explain from
 * the key and explanation it is given, and say so, rather than invent a new key, when they look wrong.
 */

export const TUTOR_SYSTEM = `Anda tutor SKD CPNS yang sabar dan teliti. Jawab dalam Bahasa Indonesia yang jelas, paling banyak 200 kata.
Jelaskan HANYA berdasarkan soal, kunci jawaban, pembahasan, dan rujukan yang diberikan. Jangan mengganti kunci jawaban.
Jika menurut Anda kunci atau pembahasan tampak keliru, katakan terus terang, jelaskan alasannya, sarankan pengguna mencocokkan dengan sumber resmi, dan isi "keyLooksWrong": true.
Untuk TWK, sebut rujukannya (pasal, sila, peristiwa) dan katakan bila Anda tidak yakin. Jangan mengarang nomor pasal.
Gunakan $...$ hanya untuk rumus. Balas HANYA dengan JSON: {"answer": "jawaban Anda", "keyLooksWrong": false}`;

export type TutorAsk = 'other-way' | 'why-wrong' | 'trick';

export const TUTOR_ASKS: Record<TutorAsk, string> = {
  'other-way': 'Jelaskan soal ini dengan cara lain yang lebih mudah dipahami.',
  'why-wrong': 'Mengapa jawaban saya salah, dan apa yang membuat kunci jawabannya benar?',
  trick: 'Beri trik cepat untuk mengerjakan soal seperti ini di ujian.',
};

export interface TutorTurn {
  role: 'user' | 'tutor';
  text: string;
}

/** Turns of the conversation sent back to the model; older ones are dropped. */
export const TUTOR_HISTORY = 4;

/** The question as the tutor sees it. Only the question itself and the learner's answer to it. */
export function tutorContext(q: Question, userAnswer?: OptionLabel): string {
  const lines = [`Sub-tes: ${q.subtest}, topik: ${q.topic}, kesulitan: ${q.difficulty}.`];
  if (q.passage) lines.push(`Wacana:\n${q.passage.text}`);
  if (q.data) lines.push(`Data: ${describeData(q.data)}`);
  if (q.figure?.cells.length) lines.push(`Gambar soal: ${describeFigure(q.figure)}`);
  lines.push(`Soal: ${q.stem}`);
  lines.push(
    'Opsi:\n' +
      q.options.map((o) => `${o.label}. ${o.figure ? `[gambar: ${describeCell(o.figure)}]` : o.text}${isGraded(q.subtest) ? ` (skor ${o.score}${o.rationale ? `: ${o.rationale}` : ''})` : ''}`).join('\n'),
  );
  if (!isGraded(q.subtest)) lines.push(`Kunci jawaban: ${q.answer ?? '-'}`);
  lines.push(`Pembahasan: ${q.explanation || '-'}`);
  if (q.reference) lines.push(`Rujukan: ${q.reference}`);
  if (userAnswer) lines.push(`Jawaban pengguna: ${userAnswer}`);
  return lines.join('\n');
}

export function buildTutorPrompt(q: Question, opts: { question: string; userAnswer?: OptionLabel; history?: TutorTurn[] }): string {
  const parts = [tutorContext(q, opts.userAnswer)];
  const history = (opts.history ?? []).slice(-TUTOR_HISTORY);
  if (history.length) parts.push(`Percakapan sebelumnya:\n${history.map((t) => `${t.role === 'user' ? 'Pengguna' : 'Tutor'}: ${t.text}`).join('\n')}`);
  parts.push(`Pertanyaan pengguna: ${opts.question.trim()}`);
  return parts.join('\n\n');
}

const reply = z.object({ answer: z.string().trim().min(1), keyLooksWrong: z.boolean().optional() });

/** The tutor's reply. A provider that ignores the JSON instruction still gets its plain text through. */
export function parseTutorReply(text: string): { answer: string; keyLooksWrong: boolean } {
  try {
    const r = reply.safeParse(extractJson(text));
    if (r.success) return { answer: r.data.answer, keyLooksWrong: !!r.data.keyLooksWrong };
  } catch {
    /* not JSON */
  }
  const plain = text.trim();
  if (!plain || plain.startsWith('{')) throw new Error('Respons AI tidak bisa dibaca.');
  return { answer: plain, keyLooksWrong: false };
}

/** Rough cost of one tutor request in USD: the prompt in, about one short answer out. */
export function tutorCost(prompt: string, price: { input: number; output: number }): number {
  const input = Math.ceil((TUTOR_SYSTEM.length + prompt.length) / 3.5);
  const output = 400;
  return (input * price.input + output * price.output) / 1e6;
}

