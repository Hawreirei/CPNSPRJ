import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db';
import type { Attempt, OptionLabel, Question } from '../domain/types';
import { attemptQuestions, finishAttempt } from '../engine/attempts';
import { CellView, FigureView } from '../components/FigureView';
import { RichText } from '../components/RichText';
import { Modal, SubtestBadge } from '../components/ui';

export default function Simulation() {
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
  const enteredAt = useRef(Date.now());
  const submitting = useRef(false);

  useEffect(() => {
    (async () => {
      const a = await db.attempts.get(attemptId);
      if (!a) return;
      if (a.result) {
        nav(`/results/${a.id}`, { replace: true });
        return;
      }
      setQuestions(await attemptQuestions(a));
      setAttempt(a);
      enteredAt.current = Date.now();
    })();
  }, [attemptId, nav]);

  /** Persist a patch and credit time spent on the current question. */
  const commit = useCallback(
    (patch: Partial<Attempt>) => {
      const a = attemptRef.current;
      if (!a) return;
      const q = questions[a.currentIndex];
      const spent = Date.now() - enteredAt.current;
      enteredAt.current = Date.now();
      const timeSpent = q ? { ...a.timeSpent, [q.id]: (a.timeSpent[q.id] ?? 0) + spent } : a.timeSpent;
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (attempt && now >= attempt.endsAt) void submit();
  }, [now, attempt, submit]);

  useEffect(() => {
    if (!attempt) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toUpperCase();
      const cur = attemptRef.current;
      if (!cur || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['A', 'B', 'C', 'D', 'E'].includes(k)) answer(k as OptionLabel);
      if (e.key === 'ArrowRight') go(cur.currentIndex + 1);
      if (e.key === 'ArrowLeft') go(cur.currentIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!attempt || !questions.length) return <div className="p-6">Memuat…</div>;

  const idx = attempt.currentIndex;
  const q = questions[idx];
  const remaining = Math.max(0, attempt.endsAt - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const answeredCount = Object.keys(attempt.answers).filter((id) => attempt.questionIds.includes(id)).length;
  const isFlagged = attempt.flagged.includes(q.id);

  function go(i: number) {
    if (i < 0 || i >= questions.length) return;
    commit({ currentIndex: i });
    setGridOpen(false);
  }
  function answer(label: OptionLabel) {
    const a = attemptRef.current;
    if (!a) return;
    const id = questions[a.currentIndex].id;
    const answers = { ...a.answers };
    if (answers[id] === label) delete answers[id];
    else answers[id] = label;
    commit({ answers });
  }
  function toggleFlag() {
    const a = attemptRef.current;
    if (!a) return;
    const id = questions[a.currentIndex].id;
    const flagged = a.flagged.includes(id) ? a.flagged.filter((x) => x !== id) : [...a.flagged, id];
    commit({ flagged });
  }

  const grid = (
    <div className="grid grid-cols-8 gap-1 sm:grid-cols-10 lg:grid-cols-5">
      {questions.map((x, i) => {
        const ans = !!attempt.answers[x.id];
        const fl = attempt.flagged.includes(x.id);
        return (
          <button
            key={x.id}
            onClick={() => go(i)}
            className={`h-8 rounded text-xs font-medium ${i === idx ? 'ring-2 ring-brand-500' : ''} ${
              fl ? 'bg-amber-400 text-black' : ans ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
            aria-label={`Soal ${i + 1}`}
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
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{attempt.setName}</div>
        <div className={`rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums ${remaining < 5 * 60000 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800'}`}>
          {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </div>
        <button className="btn btn-sm lg:hidden" onClick={() => setGridOpen(true)}>
          Nomor
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setConfirmOpen(true)}>
          Selesai
        </button>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 lg:grid-cols-[1fr_260px]">
        <main className="card">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-semibold">Soal {idx + 1}</span>
            <SubtestBadge subtest={q.subtest} />
            {isFlagged && <span className="badge bg-amber-100 text-amber-800">ragu-ragu</span>}
          </div>
          <div className="text-[15px] leading-relaxed">
            <RichText text={q.stem} />
          </div>
          {q.figure && <FigureView figure={q.figure} />}
          <div className="mt-4 space-y-2">
            {q.options.map((o) => {
              const sel = attempt.answers[q.id] === o.label;
              return (
                <button
                  key={o.label}
                  onClick={() => answer(o.label)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    sel ? 'border-brand-500 bg-brand-50 dark:bg-slate-800' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${sel ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400'}`}>
                    {o.label}
                  </span>
                  <span className="flex-1 pt-0.5">{o.figure ? <CellView cell={o.figure} /> : <RichText text={o.text} />}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn" disabled={idx === 0} onClick={() => go(idx - 1)}>
              ← Sebelumnya
            </button>
            <button className={`btn ${isFlagged ? 'border-amber-400 bg-amber-100 text-amber-900' : ''}`} onClick={toggleFlag}>
              Ragu-ragu
            </button>
            <button className="btn btn-primary ml-auto" disabled={idx === questions.length - 1} onClick={() => go(idx + 1)}>
              Berikutnya →
            </button>
          </div>
          <p className="muted mt-3 text-xs">Pintasan: A–E memilih jawaban (tekan lagi untuk membatalkan), ← → pindah soal.</p>
        </main>

        <aside className="hidden lg:block">
          <div className="card sticky top-16 space-y-3">
            <div className="text-sm">
              Terjawab <b>{answeredCount}</b> / {questions.length}
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

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Akhiri simulasi?">
        <p className="text-sm">
          Terjawab {answeredCount} dari {questions.length} soal.
          {questions.length - answeredCount > 0 && ` ${questions.length - answeredCount} soal belum dijawab.`}
          {attempt.flagged.length > 0 && ` ${attempt.flagged.length} ditandai ragu-ragu.`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirmOpen(false)}>
            Kembali
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Kirim jawaban
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-green-600" /> terjawab
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-amber-400" /> ragu-ragu
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded bg-slate-300" /> kosong
      </span>
    </div>
  );
}
