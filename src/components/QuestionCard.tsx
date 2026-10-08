import type { ReactNode } from 'react';
import type { Question } from '../domain/types';
import { CellView, FigureView } from './FigureView';
import { RichText } from './RichText';
import { Badge, FlagList, SubtestBadge } from './ui';

export type CardMode = 'soal' | 'kunci' | 'pembahasan';

export function QuestionCard({
  q,
  index,
  mode,
  actions,
  showFlags = true,
}: {
  q: Question;
  index?: number;
  mode: CardMode;
  actions?: ReactNode;
  showFlags?: boolean;
}) {
  const warn = q.flags.some((f) => f.severity === 'warn');
  return (
    <article className={`card avoid-break ${warn && showFlags ? 'border-amber-300 dark:border-amber-800' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {index !== undefined && <span className="mr-1 text-sm font-semibold">{index + 1}.</span>}
        <SubtestBadge subtest={q.subtest} />
        <Badge>{q.topic}</Badge>
        <Badge>{q.difficulty}</Badge>
        {q.locked && <Badge tone="blue">🔒 terkunci</Badge>}
        {warn && showFlags && <Badge tone="amber">perlu dicek</Badge>}
        {showFlags && q.flags.some((f) => f.kind === 'cross-checked') && (
          <span title={q.flags.find((f) => f.kind === 'cross-checked')?.message}>
            <Badge tone="green">✓ diperiksa silang</Badge>
          </span>
        )}
        {showFlags && q.flags.some((f) => f.kind === 'cross-check-pending') && <Badge>belum diperiksa silang</Badge>}
        <div className="ml-auto flex flex-wrap gap-1">{actions}</div>
      </div>

      {mode !== 'kunci' && (
        <>
          <div className="leading-relaxed">
            <RichText text={q.stem} />
          </div>
          {q.figure && <FigureView figure={q.figure} />}
          <ol className="mt-3 space-y-1.5">
            {q.options.map((o) => {
              const isKey = mode === 'pembahasan' && (q.subtest === 'TKP' ? o.score === 5 : o.label === q.answer);
              return (
                <li
                  key={o.label}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1 text-sm ${isKey ? 'bg-green-50 dark:bg-green-950' : ''}`}
                >
                  <span className="w-5 shrink-0 font-semibold">{o.label}.</span>
                  <span className="flex-1">
                    {o.figure ? <CellView cell={o.figure} /> : <RichText text={o.text} />}
                  </span>
                  {mode === 'pembahasan' && q.subtest === 'TKP' && <Badge tone={o.score === 5 ? 'green' : 'slate'}>{o.score}</Badge>}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {mode === 'kunci' && <KeyLine q={q} />}

      {mode === 'pembahasan' && <Explanation q={q} />}

      {/* Only problems worth acting on; purely informational notes stay hidden. */}
      {showFlags && <FlagList flags={q.flags.filter((f) => f.severity === 'warn' || f.kind === 'math-corrected')} />}
    </article>
  );
}

export function Explanation({ q }: { q: Question }) {
  return (
    <div className="mt-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
      <div className="mb-1 font-semibold">
        Pembahasan {q.subtest !== 'TKP' && <span className="font-normal">· Jawaban: {q.answer}</span>}
      </div>
      <div className="leading-relaxed text-slate-700 dark:text-slate-300">
        <RichText text={q.explanation || '—'} />
      </div>
      {q.reference && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Rujukan: <RichText text={q.reference} />
        </div>
      )}
      {q.subtest === 'TKP' && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Skor TKP adalah rasional berbasis nilai pelayanan publik, bukan kunci resmi.</p>}
    </div>
  );
}

export function KeyLine({ q }: { q: Question }) {
  if (q.subtest === 'TKP') {
    return (
      <div className="flex flex-wrap gap-2 text-sm">
        {q.options.map((o) => (
          <span key={o.label} className={`rounded-md px-2 py-0.5 ${o.score === 5 ? 'bg-green-100 font-semibold dark:bg-green-950' : 'bg-slate-100 dark:bg-slate-800'}`}>
            {o.label} = {o.score}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="text-sm">
      Jawaban: <b>{q.answer ?? '—'}</b> <span className="muted">(benar 5, salah/kosong 0)</span>
    </div>
  );
}
