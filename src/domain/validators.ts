import { NUMERIC_TOPICS } from './blueprint';
import { approxEqual, evaluateExpression, parseNumeric } from './numeric';
import { reportFlag } from './quality';
import type { Flag, OptionLabel, Question } from './types';
import { isGraded, scoringOf } from './examPackage';

export { loadMath } from './numeric';

/**
 * Runs every reliability check (after `await loadMath()`) and returns the question with an updated key
 * (when the math engine can safely correct it) and a fresh list of flags.
 */
export function validateQuestion(q: Question, knownHashes?: Set<string>): Question {
  const flags: Flag[] = [];
  let next: Question = { ...q, options: q.options.map((o) => ({ ...o })) };

  if (next.options.length !== 5) {
    flags.push({ kind: 'structure', severity: 'warn', message: `Pilihan jawaban hanya ${next.options.length}, seharusnya 5.` });
  }

  if (isGraded(next.subtest)) {
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

  if (!isGraded(next.subtest) && next.answer) {
    const said = explainedOption(next);
    if (said && said !== next.answer) {
      flags.push({
        kind: 'explanation-mismatch',
        severity: 'warn',
        message: `Pembahasan menyimpulkan jawaban ${said}, tetapi kunci jawabannya ${next.answer}.`,
      });
    }
  }

  if (next.subtest === 'TWK') {
    if (!next.reference?.trim()) {
      flags.push({ kind: 'twk-unverified', severity: 'warn', message: 'Belum ada sumber rujukan (sila, pasal, atau fakta sejarah). Cocokkan dengan sumber resmi.' });
    }
  }
  if (next.confidence === 'low') {
    flags.push(
      next.source === 'import'
        ? { kind: 'import-unchecked', severity: 'warn', message: 'Disalin AI dari foto atau PDF. Cocokkan soal, opsi, kunci, dan pembahasan dengan sumber aslinya.' }
        : { kind: 'low-confidence', severity: 'warn', message: 'AI kurang yakin dengan soal ini. Sebaiknya diperiksa ulang.' },
    );
  }
  if (knownHashes?.has(next.hash)) {
    flags.push({ kind: 'duplicate', severity: 'info', message: 'Soal yang mirip sudah ada di Bank Soal.' });
  }
  // The learner's report outlives every re-check; only they can withdraw it.
  if (next.report) flags.push(reportFlag(next.report));

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

/** Graded options (TKP, and graded sub-tests of other packages): every score in range, one best option. */
export function checkTkp(q: Question): Flag[] {
  const flags: Flag[] = [];
  const rule = scoringOf(q.subtest);
  const [lo, hi] = rule.kind === 'graded' ? [rule.min, rule.max] : [1, 5];
  const scores = q.options.map((o) => o.score);
  if (scores.some((s) => !Number.isInteger(s) || s < lo || s > hi)) {
    flags.push({ kind: 'tkp-spread', severity: 'warn', message: `Skor pilihan jawaban ${q.subtest} tidak lengkap (harus ${lo} sampai ${hi}).` });
    return flags;
  }
  const max = Math.max(...scores);
  if (scores.filter((s) => s === max).length > 1) {
    flags.push({ kind: 'tkp-spread', severity: 'warn', message: 'Ada lebih dari satu jawaban dengan skor tertinggi.' });
  }
  if (max !== hi) {
    flags.push({ kind: 'tkp-spread', severity: 'warn', message: `Tidak ada jawaban dengan skor tertinggi (${hi}).` });
  }
  // With fewer score values than options, some options must share a score.
  if (hi - lo + 1 >= scores.length && new Set(scores).size < scores.length && flags.length === 0) {
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

  // The explanation is the model's own step-by-step working: when it backs the key,
  // two of the three agree and the key must not be changed on the formula's word alone.
  const backsKey = !!q.answer && explainedOption(q) === q.answer;

  if (matches.length === 1 && backsKey) {
    flags.push({
      kind: 'math-mismatch',
      severity: 'warn',
      message: `Kunci jawaban ${q.answer} dan pembahasan berbeda dengan hitungan ulang otomatis (${formatNum(value)}, opsi ${matches[0]}). Cek soal ini.`,
    });
    return { question: q, flags };
  }
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
  } else if (backsKey) {
    // Only the helper formula is off; the key and the worked explanation agree.
    flags.push({ kind: 'math-mismatch', severity: 'info', message: 'Rumus bantu dari AI tidak cocok, tetapi kunci jawaban dan pembahasan sudah sesuai.' });
  } else {
    flags.push({ kind: 'math-mismatch', severity: 'warn', message: `Hasil hitungan ulang (${formatNum(value)}) tidak ada di pilihan jawaban. Cek soal ini.` });
  }
  return { question: q, flags };
}

/**
 * The option the explanation concludes with ("Jawaban: C", "jawaban yang benar
 * adalah 0,7"), or undefined when it can't be told. Numbers are matched to the
 * one option with that value.
 */
export function explainedOption(q: Question): OptionLabel | undefined {
  const re = /jawaban(?:nya)?(?:\s+yang\s+(?:paling\s+)?(?:benar|tepat))?\s*(?:adalah|ialah|yaitu|:|=)\s*([^\n]{1,80})/gi;
  let tail: string | undefined;
  for (const m of (q.explanation ?? '').matchAll(re)) tail = m[1];
  if (!tail) return undefined;
  tail = tail.replace(/[$*_]/g, '').trim();
  const label = tail.match(/^(?:opsi|pilihan)?\s*\(?([A-E])\)?(?=$|[\s.,;:)])/);
  if (label) return q.options.some((o) => o.label === label[1]) ? (label[1] as OptionLabel) : undefined;
  const token = tail.replace(/^rp\.?\s*/i, '').match(/^\S+/)?.[0].replace(/[.,;:)]+$/, '');
  const value = token ? parseNumeric(token) : null;
  if (value === null) return undefined;
  const hits = q.options.filter((o) => {
    const n = parseNumeric(o.text);
    return n !== null && approxEqual(n, value);
  });
  return hits.length === 1 ? hits[0].label : undefined;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('id-ID') : n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

export const hasWarnings = (q: Question) => q.flags.some((f) => f.severity === 'warn');
