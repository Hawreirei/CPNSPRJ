import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import { feedback } from '../domain/practice';
import { TUTOR_ASKS, type TutorAsk, type TutorTurn } from '../domain/tutor';
import type { OptionLabel, Question } from '../domain/types';
import { moreLikeThis } from '../engine/generator';
import { addNote } from '../engine/notes';
import { askTutor, tutorEstimate } from '../engine/tutor';
import { RichText } from './RichText';
import { fmtUsd, Modal } from './ui';
import { errorText } from '../engine/storage';
import { logError } from '../lib/errorLog';

interface Turn extends TutorTurn {
  keyLooksWrong?: boolean;
  saved?: boolean;
}

/**
 * Ask an AI tutor about one question. Loaded only when opened. Answers can be kept as notes on the
 * question; when the tutor thinks the key is wrong, reporting the question is one click away.
 */
export default function TutorDialog({
  q,
  userAnswer,
  onClose,
  onReport,
  onChanged,
}: {
  q: Question;
  userAnswer?: OptionLabel;
  onClose: () => void;
  onReport?: () => void;
  onChanged?: (q: Question) => void;
}) {
  const hasKey = useLiveQuery(async () => (await db.keys.count()) > 0, []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [similar, setSimilar] = useState('');
  const [cost, setCost] = useState<Awaited<ReturnType<typeof tutorEstimate>>>(null);
  const ctrl = useRef<AbortController | null>(null);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const wrong = !!userAnswer && !feedback(q, userAnswer).correct;

  useEffect(() => {
    let live = true;
    void tutorEstimate(q, { question: draft || TUTOR_ASKS['other-way'], userAnswer, history: turns }).then((c) => live && setCost(c));
    return () => {
      live = false;
    };
  }, [q, draft, userAnswer, turns]);
  useEffect(() => () => ctrl.current?.abort(), []);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError('');
    ctrl.current = new AbortController();
    const history = turns.map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: 'user', text: question.trim() }]);
    setDraft('');
    try {
      const r = await askTutor(q, { question, userAnswer, history }, ctrl.current.signal);
      setTurns((t) => [...t, { role: 'tutor', text: r.answer, keyLooksWrong: r.keyLooksWrong }]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        void logError('tutor', e);
        setError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function keep(i: number) {
    const saved = await addNote(q.id, turns[i].text);
    setTurns((t) => t.map((x, k) => (k === i ? { ...x, saved: true } : x)));
    if (saved) onChanged?.(saved);
  }

  async function easierOnes() {
    setBusy(true);
    setError('');
    try {
      const n = await moreLikeThis(q.originSetId!, q, 2, undefined, { easier: true });
      setSimilar(`${n} soal serupa yang lebih mudah ditambahkan ke set, tepat setelah soal ini.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const blocked = offline || hasKey === false;
  const quick = (Object.keys(TUTOR_ASKS) as TutorAsk[]).filter((k) => k !== 'why-wrong' || wrong);
  const flagged = turns.some((t) => t.keyLooksWrong);

  return (
    <Modal open onClose={onClose} title="Tanya AI tentang soal ini" wide>
      {/* Keys typed here must not reach the exam and review shortcuts on the page behind. */}
      <div className="space-y-3" onKeyDown={(e) => e.stopPropagation()}>
        <p className="muted line-clamp-2 text-sm">
          <RichText text={q.stem} />
        </p>
        {offline && <p className="text-sm text-amber-800 dark:text-amber-300">Anda sedang offline. Tanya AI butuh koneksi internet.</p>}
        {hasKey === false && (
          <p className="text-sm">
            Tanya AI memakai API key Anda.{' '}
            <Link className="text-brand-600 underline dark:text-brand-300" to="/keys">
              Tambah API key
            </Link>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {quick.map((k) => (
            <button key={k} className="btn btn-sm" disabled={busy || blocked} onClick={() => void ask(TUTOR_ASKS[k])}>
              {k === 'other-way' ? 'Jelaskan dengan cara lain' : k === 'why-wrong' ? `Mengapa jawaban saya (${userAnswer}) salah?` : 'Beri trik cepat'}
            </button>
          ))}
          {q.originSetId && (
            <button className="btn btn-sm" disabled={busy || blocked} onClick={() => void easierOnes()}>
              Buat 2 soal serupa yang lebih mudah
            </button>
          )}
        </div>

        <div aria-live="polite" className="space-y-2">
          {turns.map((t, i) =>
            t.role === 'user' ? (
              <p key={i} className="ml-auto max-w-[85%] rounded-lg bg-brand-50 px-3 py-2 text-sm dark:bg-slate-800">
                {t.text}
              </p>
            ) : (
              <div key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed dark:border-slate-700">
                <RichText text={t.text} />
                <div className="mt-2">
                  <button className="btn btn-sm" disabled={t.saved} onClick={() => void keep(i)}>
                    {t.saved ? 'Tersimpan sebagai catatan' : 'Simpan sebagai catatan'}
                  </button>
                </div>
              </div>
            ),
          )}
          {busy && <p className="muted text-sm">AI sedang menjawab…</p>}
          {similar && <p className="text-sm">{similar}</p>}
        </div>

        {flagged && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            AI menilai kunci atau pembahasan soal ini mungkin keliru. Cocokkan dengan sumber resmi; bila memang salah, laporkan soalnya.
            {onReport && (
              <button className="btn btn-sm ml-2" onClick={onReport}>
                Laporkan soal
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
        >
          <label className="label" htmlFor="tutor-question">
            Pertanyaan Anda
          </label>
          <textarea id="tutor-question" className="input min-h-20" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Misalnya: mengapa opsi C bukan jawabannya?" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="muted text-xs">
              {cost ? `1 permintaan AI dengan ${cost.label} (${cost.model}), sekitar ${fmtUsd(cost.usd)}.` : ''} Jawaban AI bisa keliru, terutama untuk TWK.
            </span>
            <button type="submit" className="btn btn-primary" disabled={busy || blocked || !draft.trim()}>
              Kirim
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
