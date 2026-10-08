import { feedback } from '../domain/practice';
import type { OptionLabel, Question } from '../domain/types';
import { CellView } from './FigureView';
import { RichText } from './RichText';
import { Badge } from './ui';

/**
 * Selectable options that turn into a marked key once `revealed`: top option green,
 * a wrong pick red (TKP: blue, since every TKP option scores), the rest dimmed.
 */
export function AnswerOptions({
  q,
  chosen,
  revealed,
  onAnswer,
}: {
  q: Question;
  chosen?: OptionLabel;
  revealed: boolean;
  onAnswer: (label: OptionLabel) => void;
}) {
  const best = feedback(q, chosen ?? 'A').best;
  return (
    // Keyed per question so the previous answer's colors never fade over the next question.
    <div key={q.id} className="mt-4 space-y-2">
      {q.options.map((o) => {
        const sel = chosen === o.label;
        const isBest = revealed && best.includes(o.label);
        const tone = !revealed
          ? sel
            ? 'border-brand-500 bg-brand-50 dark:bg-slate-800'
            : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'
          : isBest
            ? 'border-green-500 bg-green-50 dark:bg-green-950'
            : sel
              ? q.subtest === 'TKP'
                ? 'border-sky-500 bg-sky-50 dark:bg-sky-950'
                : 'border-red-500 bg-red-50 dark:bg-red-950'
              : 'border-slate-200 opacity-70 dark:border-slate-700';
        return (
          <button
            key={o.label}
            onClick={() => onAnswer(o.label)}
            disabled={revealed}
            aria-pressed={sel}
            className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-default ${tone}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${sel ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400'}`}
            >
              {o.label}
            </span>
            <span className="flex-1 pt-0.5">{o.figure ? <CellView cell={o.figure} /> : <RichText text={o.text} />}</span>
            {revealed && q.subtest === 'TKP' && <Badge tone={o.score === 5 ? 'green' : 'slate'}>{o.score}</Badge>}
          </button>
        );
      })}
    </div>
  );
}

/** One-line verdict on an answer; without an answer, just names the key. */
export function FeedbackBanner({ q, answer }: { q: Question; answer?: OptionLabel }) {
  const fb = feedback(q, answer ?? 'A');
  const best = fb.best.join(', ') || '—';
  const box = 'mt-4 rounded-lg px-3 py-2 text-sm font-medium';
  const green = 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200';
  if (!answer) {
    return (
      <div className={`${box} bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200`}>
        {q.subtest === 'TKP' ? `Pilihan terbaik: ${best}.` : `Jawaban yang benar: ${best}.`}
      </div>
    );
  }
  if (q.subtest === 'TKP') {
    return (
      <div className={`${box} ${fb.correct ? green : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'}`}>
        {fb.correct ? 'Skor 5 dari 5. Pilihan terbaik.' : `Skor ${fb.score} dari 5. Pilihan terbaik: ${best}.`}
      </div>
    );
  }
  return (
    <div className={`${box} ${fb.correct ? green : 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'}`}>
      {fb.correct ? 'Benar. +5' : `Kurang tepat. Jawaban yang benar: ${best}.`}
    </div>
  );
}
