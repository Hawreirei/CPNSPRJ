import { NUMERIC_TOPICS } from './blueprint';
import { approxEqual, evaluateExpression, parseNumeric } from './numeric';
import type { Flag, OptionLabel, Question } from './types';

/**
 * Runs every reliability check and returns the question with an updated key
 * (when the math engine can safely correct it) and a fresh list of flags.
 */
export function validateQuestion(q: Question, knownHashes?: Set<string>): Question {
  const flags: Flag[] = [];
  let next: Question = { ...q, options: q.options.map((o) => ({ ...o })) };

  if (next.options.length !== 5) {
    flags.push({ kind: 'structure', severity: 'warn', message: `Pilihan jawaban hanya ${next.options.length}, seharusnya 5.` });
  }

  if (next.subtest === 'TKP') {
    flags.push(...checkTkp(next));
  } else {
    const fixed = checkChoice(next);
    next = fixed.question;
    flags.push(...fixed.flags);
  }

  if (next.subtest === 'TIU' && (next.mathExpression || NUMERIC_TOPICS.has(next.topic))) {
    const m = checkMath(next);
    next = m.question;
    flags.push(...m.flags);
  }

  if (next.subtest === 'TWK') {
    if (!next.reference?.trim()) {
      flags.push({ kind: 'twk-unverified', severity: 'warn', message: 'Belum ada sumber rujukan (sila, pasal, atau fakta sejarah). Cocokkan dengan sumber resmi.' });
    }
  }
  if (next.confidence === 'low') {
    flags.push({ kind: 'low-confidence', severity: 'warn', message: 'AI kurang yakin dengan soal ini. Sebaiknya diperiksa ulang.' });
  }
  if (knownHashes?.has(next.hash)) {
    flags.push({ kind: 'duplicate', severity: 'info', message: 'Soal yang mirip sudah ada di Bank Soal.' });
  }

  return { ...next, flags };
}

/** TWK/TIU: exactly one option scores 5 and it matches `answer`. */
function checkChoice(q: Question): { question: Question; flags: Flag[] } {
  const flags: Flag[] = [];
  let answer = q.answer;
  if (!answer || !q.options.some((o) => o.label === answer)) {
    const top = q.options.find((o) => o.score === 5);
    answer = top?.label;
    if (!answer) flags.push({ kind: 'structure', severity: 'warn', message: 'Kunci jawaban tidak ditemukan.' });
  }
  const options = q.options.map((o) => ({ ...o, score: o.label === answer ? 5 : 0 }));
  return { question: { ...q, answer, options }, flags };
}

export function checkTkp(q: Question): Flag[] {
  const flags: Flag[] = [];
  const scores = q.options.map((o) => o.score);
  if (scores.some((s) => !Number.isInteger(s) || s < 1 || s > 5)) {
    flags.push({ kind: 'tkp-spread', severity: 'warn', message: 'Skor pilihan jawaban TKP tidak lengkap (harus 1 sampai 5).' });
    return flags;
  }
  const max = Math.max(...scores);
  if (scores.filter((s) => s === max).length > 1) {
    flags.push({ kind: 'tkp-spread', severity: 'warn', message: 'Ada lebih dari satu jawaban dengan skor tertinggi.' });
  }
  if (max !== 5) {
    flags.push({ kind: 'tkp-spread', severity: 'warn', message: 'Tidak ada jawaban dengan skor tertinggi (5).' });
  }
  if (new Set(scores).size < scores.length && flags.length === 0) {
    flags.push({ kind: 'tkp-spread', severity: 'info', message: 'Beberapa jawaban punya skor sama.' });
  }
  return flags;
}

/** Recompute the numerical answer with mathjs and compare it to the key. */
export function checkMath(q: Question): { question: Question; flags: Flag[] } {
  const flags: Flag[] = [];
  if (!q.mathExpression) {
    flags.push({ kind: 'math-mismatch', severity: 'info', message: 'Jawaban hitungan belum diperiksa otomatis.' });
    return { question: q, flags };
  }
  const value = evaluateExpression(q.mathExpression);
  if (value === null) {
    flags.push({ kind: 'math-mismatch', severity: 'warn', message: 'Jawaban hitungan tidak bisa diperiksa otomatis. Cek manual.' });
    return { question: q, flags };
  }
  const matches: OptionLabel[] = q.options
    .filter((o) => {
      const n = parseNumeric(o.text);
      return n !== null && approxEqual(n, value);
    })
    .map((o) => o.label);

  if (matches.length === 1 && matches[0] === q.answer) return { question: q, flags };

  if (matches.length === 1) {
    const answer = matches[0];
    flags.push({
      kind: 'math-corrected',
      severity: 'info',
      message: `Kunci jawaban diperbaiki otomatis dari ${q.answer ?? '-'} ke ${answer} (hasil hitung: ${formatNum(value)}).`,
    });
    return {
      question: { ...q, answer, options: q.options.map((o) => ({ ...o, score: o.label === answer ? 5 : 0 })) },
      flags,
    };
  }
  if (matches.length > 1) {
    flags.push({ kind: 'math-mismatch', severity: 'warn', message: `Lebih dari satu pilihan jawaban bernilai ${formatNum(value)}.` });
  } else {
    flags.push({ kind: 'math-mismatch', severity: 'warn', message: `Hasil hitungan (${formatNum(value)}) tidak ada di pilihan jawaban. Cek soal ini.` });
  }
  return { question: q, flags };
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('id-ID') : n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

export const hasWarnings = (q: Question) => q.flags.some((f) => f.severity === 'warn');
