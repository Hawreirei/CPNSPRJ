import { lazy, Suspense, useState, type ReactNode } from 'react';
import { wrongRate, type AnswerStats } from '../domain/quality';
import type { OptionLabel, Question } from '../domain/types';
import { deleteNote } from '../engine/notes';
import { StemMedia } from './DataView';
import { PassageView } from './PassageView';
import { CellView } from './FigureView';
import { RichText } from './RichText';
import { Badge, FlagList, SubtestBadge } from './ui';
import { isGraded, isTopOption } from '../domain/examPackage';
import { hasKamus, kamusPath } from '../domain/kamus';
import { uudRefs } from '../domain/cards';

// The tutor, its prompts and the similar-question generator load only when someone asks.
const TutorDialog = lazy(() => import('./TutorDialog'));

export type CardMode = 'soal' | 'kunci' | 'pembahasan';

export function QuestionCard({
  q,
  index,
  mode,
  actions,
  showFlags = true,
  stats,
  onFeedback,
  passage = 'closed',
  passageLabel,
  userAnswer,
}: {
  q: Question;
  index?: number;
  mode: CardMode;
  actions?: ReactNode;
  showFlags?: boolean;
  /** How the learner has fared on this question; shown once there are enough answers. */
  stats?: AnswerStats;
  /** Offers "rate or report" under the explanation. */
  onFeedback?: () => void;
  /** How to show a reading passage: in full (first question of its group), folded, or not at all (print). */
  passage?: 'open' | 'closed' | 'hidden';
  passageLabel?: string;
  /** The learner's answer, for the tutor's "why was mine wrong?". */
  userAnswer?: OptionLabel;
}) {
  const warn = q.flags.some((f) => f.severity === 'warn');
  const rate = wrongRate(stats);
  return (
    <article className={`card avoid-break ${warn && showFlags ? 'border-amber-300 dark:border-amber-800' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {index !== undefined && <span className="mr-1 text-sm font-semibold">{index + 1}.</span>}
        <SubtestBadge subtest={q.subtest} />
        <Badge>{q.topic}</Badge>
        <Badge>{q.difficulty}</Badge>
        {rate !== null && (
          <span title="Kesulitan menurut jawaban Anda di ujian dan latihan">
            <Badge tone={rate >= 0.6 ? 'red' : rate <= 0.2 ? 'green' : 'slate'}>
              {Math.round(rate * 100)}% salah dari {stats!.answered} jawaban
            </Badge>
          </span>
        )}
        {q.rating !== undefined && <Badge>nilai {q.rating}/5</Badge>}
        {q.importedFrom && (
          <span title={`Dari set bersama "${q.importedFrom.name}"`}>
            <Badge tone="blue">dari berkas bersama</Badge>
          </span>
        )}
        {q.source === 'import' && <Badge tone="blue">dari foto/PDF</Badge>}
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
          {q.passage && passage !== 'hidden' && <PassageView passage={q.passage} label={passageLabel} mode={passage} />}
          <div className="leading-relaxed">
            <RichText text={q.stem} />
          </div>
          <StemMedia q={q} />
          <ol className="mt-3 space-y-1.5">
            {q.options.map((o) => {
              const isKey = mode === 'pembahasan' && (isGraded(q.subtest) ? isTopOption(q, o) : o.label === q.answer);
              return (
                <li
                  key={o.label}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1 text-sm ${isKey ? 'bg-green-50 dark:bg-green-950' : ''}`}
                >
                  <span className="w-5 shrink-0 font-semibold">{o.label}.</span>
                  <span className="flex-1">
                    {o.figure ? <CellView cell={o.figure} /> : <RichText text={o.text} />}
                    {mode === 'pembahasan' && o.rationale && <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{o.rationale}</span>}
                  </span>
                  {mode === 'pembahasan' && isGraded(q.subtest) && <Badge tone={isTopOption(q, o) ? 'green' : 'slate'}>{o.score}</Badge>}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {mode === 'kunci' && <KeyLine q={q} />}

      {mode === 'pembahasan' && <Explanation q={q} onFeedback={onFeedback} userAnswer={userAnswer} />}

      {/* Only problems worth acting on; purely informational notes stay hidden. */}
      {showFlags && <FlagList flags={q.flags.filter((f) => f.severity === 'warn' || f.kind === 'math-corrected')} />}
    </article>
  );
}

export function Explanation({
  q,
  onFeedback,
  userAnswer,
  onChanged,
}: {
  q: Question;
  /** Interactive explanations (not print) offer rating, reporting and the tutor. */
  onFeedback?: () => void;
  userAnswer?: OptionLabel;
  /** For pages that hold their own copy of the questions: called after a note is added or removed. */
  onChanged?: (q: Question) => void;
}) {
  const [tutorOpen, setTutorOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
      <div className="mb-1 font-semibold">
        Pembahasan {!isGraded(q.subtest) && <span className="font-normal">· Jawaban: {q.answer}</span>}
      </div>
      <div className="leading-relaxed text-slate-700 dark:text-slate-300">
        <RichText text={q.explanation || '—'} />
      </div>
      {q.reference && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Rujukan: <RichText text={q.reference} />
          {onFeedback &&
            uudRefs(q.reference).map((id) => (
              <span key={id}>
                {' · '}
                {/* The official text in a new tab, to check the reference against. */}
                <a className="text-brand-600 dark:text-brand-300 underline" href={`#/kartu?pasal=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">
                  Lihat teks resmi Pasal {id} (tab baru)
                </a>
              </span>
            ))}
        </div>
      )}
      {q.subtest === 'TKP' && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Skor TKP adalah rasional berbasis nilai pelayanan publik, bukan kunci resmi.</p>}
      {onFeedback && hasKamus(q.subtest, q.topic) && (
        <p className="mt-2 text-xs">
          {/* A new tab, so a practice or review in progress stays where it is. */}
          <a className="text-brand-600 dark:text-brand-300 underline" href={`#${kamusPath(q.topic)}`} target="_blank" rel="noreferrer">
            Rumus {q.topic} di Kamus Rumus TIU (tab baru)
          </a>
        </p>
      )}
      {!!q.notes?.length && (
        <div className="mt-3 space-y-1.5">
          <div className="text-xs font-semibold">Catatan Anda</div>
          {q.notes.map((n) => (
            <div key={n.at} className="rounded-md bg-amber-50 px-2 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <RichText text={n.text} />
              {onFeedback && (
                <button className="ml-2 text-xs text-slate-500 underline dark:text-slate-400" onClick={() => void deleteNote(q.id, n.at).then((x) => x && onChanged?.(x))}>
                  Hapus catatan
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {onFeedback && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button className="btn btn-sm" onClick={() => setTutorOpen(true)}>
            Tanya AI
          </button>
          <button className="text-xs text-brand-600 underline dark:text-brand-300" onClick={onFeedback}>
            {q.report ? 'Soal ini sudah Anda laporkan · ubah' : 'Kunci salah atau soal bermasalah? Laporkan atau beri nilai'}
          </button>
        </div>
      )}
      {tutorOpen && (
        <Suspense fallback={null}>
          <TutorDialog
            q={q}
            userAnswer={userAnswer}
            onClose={() => setTutorOpen(false)}
            onChanged={onChanged}
            onReport={() => {
              setTutorOpen(false);
              onFeedback?.();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export function KeyLine({ q }: { q: Question }) {
  if (isGraded(q.subtest)) {
    return (
      <div className="flex flex-wrap gap-2 text-sm">
        {q.options.map((o) => (
          <span key={o.label} className={`rounded-md px-2 py-0.5 ${isTopOption(q, o) ? 'bg-green-100 font-semibold dark:bg-green-950' : 'bg-slate-100 dark:bg-slate-800'}`}>
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
