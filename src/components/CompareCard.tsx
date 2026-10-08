import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { compareAttempts, signed, toPractise, type Change, type QuestionChange } from '../domain/compare';
import { isGraded, specOf } from '../domain/examPackage';
import { attemptPath } from '../domain/practice';
import type { Attempt, Question } from '../domain/types';
import { fmtSec } from '../engine/analytics';
import { startAttempt } from '../engine/attempts';
import { errorText } from '../engine/storage';
import { fmtDate, SubtestBadge } from './ui';

const GROUPS: { change: Change; title: string; tone: string }[] = [
  { change: 'worsened', title: 'Memburuk', tone: 'text-red-700 dark:text-red-300' },
  { change: 'still-wrong', title: 'Tetap salah', tone: 'text-amber-700 dark:text-amber-300' },
  { change: 'improved', title: 'Membaik', tone: 'text-green-700 dark:text-green-300' },
];

/** What happened to one question between the two exams, in words. */
function describe(c: QuestionChange): string {
  const ans = (x: QuestionChange['before']) => x.answer ?? 'kosong';
  return isGraded(c.subtest) ? `skor ${c.before.score} → ${c.after.score} (${ans(c.before)} → ${ans(c.after)})` : `jawaban ${ans(c.before)} → ${ans(c.after)}`;
}

/**
 * The exam compared with an earlier exam on the same set (#46): scores, time, and which questions
 * changed. Questions that got worse or stayed wrong can be practised again in one click.
 */
export function CompareCard({ a, earlier, questions }: { a: Attempt; earlier: Attempt[]; questions: Question[] }) {
  const nav = useNavigate();
  const [withId, setWithId] = useState(earlier[0]?.id);
  const [error, setError] = useState('');
  const before = earlier.find((x) => x.id === withId) ?? earlier[0];
  if (!before) return null;
  const c = compareAttempts(before, a, questions);
  const count = (ch: Change) => c.changes.filter((x) => x.change === ch).length;
  const again = toPractise(c);
  const stem = new Map(questions.map((q) => [q.id, q.stem]));

  async function practise() {
    setError('');
    try {
      const p = await startAttempt(a.setId, { mode: 'practice', shuffleQuestions: false, durationMinutes: 0, filter: { questionIds: again } });
      nav(attemptPath(p));
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section className="card space-y-3" aria-labelledby="compare-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="compare-title">Dibanding percobaan sebelumnya</h2>
        {earlier.length > 1 && (
          <div>
            <label className="label" htmlFor="compare-with">
              Bandingkan dengan
            </label>
            <select id="compare-with" className="input w-auto" value={before.id} onChange={(e) => setWithId(e.target.value)}>
              {earlier.map((x) => (
                <option key={x.id} value={x.id}>
                  {fmtDate(x.startedAt)} · skor {x.result!.total}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="muted text-sm">Ujian {fmtDate(before.startedAt)} dibanding ujian ini, pada set yang sama.</p>

      <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <div className="muted text-xs">Skor total</div>
          <div className="font-medium">
            {c.total.before} → {c.total.after} ({signed(c.total.after - c.total.before)})
          </div>
        </li>
        {c.perSubtest.map((s) => (
          <li key={s.subtest}>
            <div className="muted text-xs">{specOf(s.subtest).name}</div>
            <div className="font-medium">
              {s.before} → {s.after} ({signed(s.after - s.before)})
            </div>
          </li>
        ))}
        <li>
          <div className="muted text-xs">Durasi</div>
          <div className="font-medium">
            {fmtSec(c.durationMs.before)} → {fmtSec(c.durationMs.after)}
          </div>
        </li>
      </ul>

      <p className="text-sm">
        {count('improved')} membaik · {count('worsened')} memburuk · {count('still-wrong')} tetap salah · {count('still-right')} tetap benar.
        {c.notInBoth > 0 && <span className="muted"> {c.notInBoth} soal hanya ada di salah satu percobaan (set diubah) dan tidak dibandingkan.</span>}
      </p>
      {c.changes.some((x) => isGraded(x.subtest)) && (
        <p className="muted text-xs">Soal TKP dan soal bertingkat lain dibandingkan dari skornya: naik berarti membaik, dan "tetap salah" berarti belum mendapat skor tertinggi.</p>
      )}

      {GROUPS.filter((g) => count(g.change)).map((g) => (
        <details key={g.change}>
          <summary className={`cursor-pointer text-sm font-medium ${g.tone}`}>
            {g.title} ({count(g.change)})
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {c.changes
              .filter((x) => x.change === g.change)
              .map((x) => (
                <li key={x.id} className="flex items-start gap-2">
                  <SubtestBadge subtest={x.subtest} />
                  <span>
                    <b>Soal {x.no}</b>: {describe(x)}. <span className="muted">{(stem.get(x.id) ?? '').slice(0, 90)}</span>
                  </span>
                </li>
              ))}
          </ul>
        </details>
      ))}

      {again.length > 0 && (
        <div>
          <button className="btn btn-primary" onClick={() => void practise()}>
            Latih ulang {again.length} soal yang memburuk atau tetap salah
          </button>
          <p className="muted mt-1 text-xs">Mode Latihan: kunci dan pembahasan tampil setiap selesai menjawab. Soal yang salah juga sudah masuk Buku Kesalahan.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
