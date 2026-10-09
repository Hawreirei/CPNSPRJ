import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db';
import type { Attempt, OptionLabel, Question } from '../domain/types';
import { attemptQuestions, finishAttempt } from '../engine/attempts';
import { attemptMode } from '../domain/practice';
import { CellView } from '../components/FigureView';
import { StemMedia } from '../components/DataView';
import { PassageView } from '../components/PassageView';
import { passageLabel } from '../domain/groups';
import { RichText } from '../components/RichText';
import { Badge, Modal, SubtestBadge } from '../components/ui';
import { allowedRange, canGo, nextSection } from '../domain/catMode';
import { fmtSec } from '../engine/analytics';
import { specOf } from '../domain/examPackage';

const fullscreenSupported = () => typeof document !== 'undefined' && !!document.fullscreenEnabled;
const exitFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
};

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
  /** Mode CAT with a locked order: the next sub-test block, while its confirmation is open. */
  const [sectionAsk, setSectionAsk] = useState<number | null>(null);
  /** Mode CAT: how long the tab was just hidden, while the notice is open. */
  const [awayMs, setAwayMs] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const hiddenAt = useRef<number | null>(null);
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
      if (attemptMode(a) === 'practice') {
        nav(`/practice/${a.id}`, { replace: true });
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
    exitFullscreen();
    nav(`/results/${a.id}`, { replace: true });
  }, [commit, nav]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Mode CAT: note every time the exam tab is hidden. Leaving full screen is not leaving the tab.
  const catMode = !!attempt?.catMode;
  useEffect(() => {
    if (!catMode) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const at = hiddenAt.current;
      hiddenAt.current = null;
      const a = attemptRef.current;
      if (at === null || !a || a.result) return;
      const ms = Date.now() - at;
      const tabAways = [...(a.tabAways ?? []), { at, ms }];
      attemptRef.current = { ...a, tabAways };
      setAttemptState(attemptRef.current);
      void db.attempts.update(a.id, { tabAways });
      setAwayMs(ms);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [catMode]);

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

  const range = allowedRange(attempt, questions);
  const next = nextSection(attempt, questions);

  function go(i: number) {
    const a = attemptRef.current;
    if (!a || i < 0 || i >= questions.length) return;
    if (!canGo(a, questions, i)) {
      // Moving past the end of a locked sub-test asks first; going back is simply not possible.
      const n = nextSection(a, questions);
      if (n && i >= n.index) {
        setGridOpen(false);
        setSectionAsk(n.index);
      }
      return;
    }
    commit({ currentIndex: i });
    setGridOpen(false);
  }
  function enterSection(i: number) {
    setSectionAsk(null);
    commit({ currentIndex: i });
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
    // Six columns and 44px buttons on phones: big enough to tap; the desktop sidebar keeps them compact.
    <div className="grid grid-cols-6 gap-1 sm:grid-cols-10 lg:grid-cols-5">
      {questions.map((x, i) => {
        const ans = !!attempt.answers[x.id];
        const fl = attempt.flagged.includes(x.id);
        const locked = i < range.from || (i > range.to && i !== next?.index);
        return (
          <button
            key={x.id}
            onClick={() => go(i)}
            disabled={locked}
            className={`h-11 rounded text-xs font-medium disabled:opacity-40 lg:h-8 ${i === idx ? 'ring-2 ring-brand-500' : ''} ${
              fl ? 'bg-amber-400 text-black' : ans ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
            aria-label={`Soal ${i + 1}${ans ? ', terjawab' : ', belum dijawab'}${fl ? ', ragu-ragu' : ''}${locked ? ', terkunci' : ''}`}
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
          {attempt.setName} {catMode && <Badge>Mode CAT</Badge>}
        </h1>
        {catMode && fullscreenSupported() && (
          <button className="btn btn-sm" onClick={() => (fullscreen ? exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => {}))}>
            {fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
          </button>
        )}
        <div
          role="timer"
          aria-label={`Sisa waktu ${mm} menit ${ss} detik`}
          className={`rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums ${remaining < 5 * 60000 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800'}`}
        >
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
            <h2 ref={headingRef} tabIndex={-1} data-focus-target className="text-base font-semibold">
              Soal {idx + 1}
            </h2>
            <SubtestBadge subtest={q.subtest} />
            {isFlagged && <span className="badge bg-amber-100 text-amber-800">ragu-ragu</span>}
          </div>
          {/* Every question of a passage group shows the passage, so it stays in view while moving through the group. */}
          {q.passage && <PassageView passage={q.passage} label={passageLabel(questions, q)} />}
          <div className="text-[15px] leading-relaxed">
            <RichText text={q.stem} />
          </div>
          <StemMedia q={q} />
          {/* min-h-11: each option is at least 44 px tall, big enough to tap on a phone (#69). */}
          <div className="mt-4 space-y-2">
            {q.options.map((o) => {
              const sel = attempt.answers[q.id] === o.label;
              return (
                <button
                  key={o.label}
                  onClick={() => answer(o.label)}
                  className={`flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    sel ? 'border-brand-500 bg-brand-50 dark:bg-slate-800' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${sel ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400'}`}
                  >
                    {o.label}
                  </span>
                  <span className="flex-1 pt-0.5">{o.figure ? <CellView cell={o.figure} /> : <RichText text={o.text} />}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn" disabled={idx === range.from} onClick={() => go(idx - 1)}>
              ← Sebelumnya
            </button>
            <button className={`btn ${isFlagged ? 'border-amber-400 bg-amber-100 text-amber-900' : ''}`} onClick={toggleFlag}>
              Ragu-ragu
            </button>
            {next && idx === range.to ? (
              <button className="btn btn-primary ml-auto" onClick={() => setSectionAsk(next.index)}>
                Lanjut ke {next.subtest} →
              </button>
            ) : (
              <button className="btn btn-primary ml-auto" disabled={idx === questions.length - 1} onClick={() => go(idx + 1)}>
                Berikutnya →
              </button>
            )}
          </div>
          <p className="muted mt-3 text-xs">
            Pintasan: A–E memilih jawaban (tekan lagi untuk membatalkan), ← → pindah soal.
            {attempt.lockedOrder && ' Urutan sub-tes dikunci: setelah lanjut ke sub-tes berikutnya, sub-tes sebelumnya tidak bisa dibuka lagi.'}
          </p>
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

      <Modal open={sectionAsk !== null} onClose={() => setSectionAsk(null)} title={`Lanjut ke ${next ? specOf(next.subtest).name : ''}?`}>
        {(() => {
          const ids = questions.slice(range.from, range.to + 1).map((x) => x.id);
          const done = ids.filter((id) => attempt.answers[id]).length;
          return (
            <p className="text-sm">
              Terjawab {done} dari {ids.length} soal {q.subtest}. Setelah lanjut, soal {q.subtest} tidak bisa dibuka lagi.
            </p>
          );
        })()}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setSectionAsk(null)}>
            Tetap di {q.subtest}
          </button>
          <button className="btn btn-primary" onClick={() => sectionAsk !== null && enterSection(sectionAsk)}>
            Lanjut ke {next?.subtest}
          </button>
        </div>
      </Modal>

      <Modal open={awayMs !== null} onClose={() => setAwayMs(null)} title="Anda meninggalkan halaman ujian">
        <p className="text-sm">
          Halaman ujian tidak terlihat selama {fmtSec(awayMs ?? 0)}. Ini dicatat di Laporan Skor, tanpa pengurangan nilai. Waktu ujian tetap berjalan selama Anda pergi.
        </p>
        <div className="mt-4 flex justify-end">
          <button className="btn btn-primary" onClick={() => setAwayMs(null)}>
            Lanjutkan ujian
          </button>
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
