import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db';
import { attemptMode, feedback, isTimed } from '../domain/practice';
import type { Attempt, OptionLabel, Question } from '../domain/types';
import { attemptQuestions, finishAttempt } from '../engine/attempts';
import { AnswerOptions, FeedbackBanner } from '../components/AnswerOptions';
import { StemMedia } from '../components/DataView';
import { Explanation } from '../components/QuestionCard';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { RichText } from '../components/RichText';
import { Badge, Modal, SubtestBadge } from '../components/ui';

/**
 * Practice mode: each answer is final and immediately reveals the key and explanation.
 * Kept apart from the CAT page so the exam flow stays exactly as it is.
 */
export default function Practice() {
  const { attemptId = '' } = useParams();
  const nav = useNavigate();
  const [attempt, setAttemptState] = useState<Attempt | null>(null);
  // Ref mirrors state so rapid key presses never act on a stale attempt.
  const attemptRef = useRef<Attempt | null>(null);
  const setAttempt = (a: Attempt) => {
    attemptRef.current = a;
    setAttemptState(a);
  };
  const [questions, setQuestions] = useState<Question[]>([]);
  const [now, setNow] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const enteredAt = useRef(Date.now());
  // On every question change, focus moves to its heading so screen readers announce it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const currentIndex = attempt?.currentIndex;
  useEffect(() => {
    if (currentIndex !== undefined) headingRef.current?.focus({ preventScroll: true });
  }, [currentIndex]);
  const submitting = useRef(false);

  useEffect(() => {
    (async () => {
      const a = await db.attempts.get(attemptId);
      if (!a) return;
      if (a.result) {
        nav(`/results/${a.id}`, { replace: true });
        return;
      }
      if (attemptMode(a) !== 'practice') {
        nav(`/cat/${a.id}`, { replace: true });
        return;
      }
      setQuestions(await attemptQuestions(a));
      setAttempt(a);
      enteredAt.current = Date.now();
    })();
  }, [attemptId, nav]);

  /**
   * Persist a patch. Time counts only until the current question is answered,
   * so reading the explanation does not inflate time-per-question.
   */
  const commit = useCallback(
    (patch: Partial<Attempt>) => {
      const a = attemptRef.current;
      if (!a) return;
      const q = questions[a.currentIndex];
      const spent = Date.now() - enteredAt.current;
      enteredAt.current = Date.now();
      const timeSpent = q && !a.answers[q.id] ? { ...a.timeSpent, [q.id]: (a.timeSpent[q.id] ?? 0) + spent } : a.timeSpent;
      const next = { ...a, timeSpent, ...patch };
      setAttempt(next);
      void db.attempts.update(a.id, { timeSpent: next.timeSpent, answers: next.answers, flagged: next.flagged, currentIndex: next.currentIndex });
    },
    [questions],
  );

  const submit = useCallback(async () => {
    const a = attemptRef.current;
    if (!a || submitting.current) return;
    submitting.current = true;
    commit({});
    await db.attempts.update(a.id, { answers: attemptRef.current!.answers, timeSpent: attemptRef.current!.timeSpent, flagged: attemptRef.current!.flagged });
    await finishAttempt(a.id);
    nav(`/results/${a.id}`, { replace: true });
  }, [commit, nav]);

  const timed = attempt ? isTimed(attempt) : false;
  useEffect(() => {
    if (!timed) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [timed]);

  useEffect(() => {
    if (attempt && timed && now >= attempt.endsAt) void submit();
  }, [now, attempt, timed, submit]);

  useEffect(() => {
    if (!attempt) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT') return;
      // A focused button already handles Enter through its own click.
      if (e.key === 'Enter' && tag === 'BUTTON') return;
      const k = e.key.toUpperCase();
      const cur = attemptRef.current;
      if (!cur || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['A', 'B', 'C', 'D', 'E'].includes(k)) answer(k as OptionLabel);
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && cur.answers[questions[cur.currentIndex].id])) go(cur.currentIndex + 1);
      if (e.key === 'ArrowLeft') go(cur.currentIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!attempt || !questions.length) return <div className="p-6">Memuat…</div>;

  const idx = attempt.currentIndex;
  const q = questions[idx];
  const chosen = attempt.answers[q.id];
  const fb = chosen ? feedback(q, chosen) : null;
  const isFlagged = attempt.flagged.includes(q.id);
  const isLast = idx === questions.length - 1;
  const answeredCount = questions.filter((x) => attempt.answers[x.id]).length;
  const correctCount = questions.filter((x) => attempt.answers[x.id] && feedback(x, attempt.answers[x.id]).correct).length;
  const remaining = Math.max(0, attempt.endsAt - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  function go(i: number) {
    if (i < 0 || i >= questions.length) return;
    commit({ currentIndex: i });
    setGridOpen(false);
  }
  /** Answers are final in practice: the key is already on screen once one is chosen. */
  function answer(label: OptionLabel) {
    const a = attemptRef.current;
    if (!a) return;
    const id = questions[a.currentIndex].id;
    if (a.answers[id]) return;
    commit({ answers: { ...a.answers, [id]: label } });
  }
  function toggleFlag() {
    const a = attemptRef.current;
    if (!a) return;
    const id = questions[a.currentIndex].id;
    const flagged = a.flagged.includes(id) ? a.flagged.filter((x) => x !== id) : [...a.flagged, id];
    commit({ flagged });
  }

  const grid = (
    // Six columns and 44px buttons on phones: big enough to tap; the desktop sidebar keeps them compact.
    <div className="grid grid-cols-6 gap-1 sm:grid-cols-10 lg:grid-cols-5">
      {questions.map((x, i) => {
        const ans = attempt.answers[x.id];
        const f = ans ? feedback(x, ans) : null;
        const color = !f
          ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          : f.correct
            ? 'bg-green-600 text-white'
            : x.subtest === 'TKP'
              ? 'bg-sky-500 text-white'
              : 'bg-red-600 text-white';
        return (
          <button
            key={x.id}
            onClick={() => go(i)}
            className={`h-11 rounded text-xs font-medium lg:h-8 ${color} ${i === idx ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${
              attempt.flagged.includes(x.id) ? 'outline-2 outline-amber-400' : ''
            }`}
            aria-label={`Soal ${i + 1}${!f ? ', belum dijawab' : f.correct ? ', benar' : x.subtest === 'TKP' ? `, skor ${f.score}` : ', salah'}${attempt.flagged.includes(x.id) ? ', ragu-ragu' : ''}`}
            aria-current={i === idx ? 'step' : undefined}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-normal">
          <Badge tone="blue">Latihan</Badge> {attempt.setName}
        </h1>
        <div className="hidden text-sm sm:block">
          Benar <b>{correctCount}</b> / {answeredCount}
        </div>
        {timed && (
          <div
            role="timer"
            aria-label={`Sisa waktu ${mm} menit ${ss} detik`}
            className={`rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums ${remaining < 5 * 60000 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800'}`}
          >
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </div>
        )}
        <button className="btn btn-sm lg:hidden" onClick={() => setGridOpen(true)}>
          Nomor
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setConfirmOpen(true)}>
          Selesai
        </button>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 lg:grid-cols-[1fr_260px]">
        <main className="card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 ref={headingRef} tabIndex={-1} data-focus-target className="text-base font-semibold">
              Soal {idx + 1}
            </h2>
            <SubtestBadge subtest={q.subtest} />
            <Badge>{q.topic}</Badge>
            {isFlagged && <span className="badge bg-amber-100 text-amber-800">ragu-ragu</span>}
          </div>
          <div className="text-[15px] leading-relaxed">
            <RichText text={q.stem} />
          </div>
          <StemMedia q={q} />
          <AnswerOptions q={q} chosen={chosen} revealed={!!fb} onAnswer={answer} />

          {fb && (
            <div aria-live="polite">
              <FeedbackBanner q={q} answer={chosen!} />
              <Explanation q={q} onFeedback={() => setFeedbackOpen(true)} />
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn" disabled={idx === 0} onClick={() => go(idx - 1)}>
              ← Sebelumnya
            </button>
            <button className={`btn ${isFlagged ? 'border-amber-400 bg-amber-100 text-amber-900' : ''}`} onClick={toggleFlag}>
              Ragu-ragu
            </button>
            {isLast ? (
              <button className="btn btn-primary ml-auto" onClick={() => setConfirmOpen(true)}>
                Selesai & lihat hasil
              </button>
            ) : (
              <button className="btn btn-primary ml-auto" onClick={() => go(idx + 1)}>
                {fb ? 'Berikutnya →' : 'Lewati →'}
              </button>
            )}
          </div>
          <p className="muted mt-3 text-xs">
            Pintasan: A–E memilih jawaban, Enter atau → ke soal berikutnya, ← soal sebelumnya. Jawaban tidak bisa diubah setelah pembahasan tampil.
          </p>
        </main>

        <aside className="hidden lg:block">
          <div className="card sticky top-16 space-y-3">
            <div className="text-sm">
              Terjawab <b>{answeredCount}</b> / {questions.length} · benar <b>{correctCount}</b>
            </div>
            {grid}
            <Legend />
          </div>
        </aside>
      </div>

      <Modal open={gridOpen} onClose={() => setGridOpen(false)} title="Nomor soal">
        {grid}
        <div className="mt-3">
          <Legend />
        </div>
      </Modal>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Akhiri latihan?">
        <p className="text-sm">
          Terjawab {answeredCount} dari {questions.length} soal, {correctCount} benar.
          {questions.length - answeredCount > 0 && ` ${questions.length - answeredCount} soal dilewati dan dihitung kosong.`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirmOpen(false)}>
            Kembali
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Lihat hasil
          </button>
        </div>
      </Modal>
      {feedbackOpen && (
        <FeedbackDialog
          q={q}
          onClose={() => setFeedbackOpen(false)}
          // Practice works on a snapshot of the questions; keep it in step with what was saved.
          onSaved={(saved) => setQuestions((qs) => qs.map((x) => (x.id === saved.id ? saved : x)))}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-green-600" /> benar / TKP skor 5
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-red-600" /> salah
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-sky-500" /> TKP skor 1–4
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-slate-300" /> belum
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded outline-2 outline-amber-400" /> ragu-ragu
      </span>
    </div>
  );
}
