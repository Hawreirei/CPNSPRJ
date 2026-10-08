import { Link } from 'react-router-dom';
import { SUBTEST_NAMES } from '../domain/blueprint';
import type { Attempt, Question } from '../domain/types';
import { calibration, fmtSec, likelyGuesses, MIN_FLAGGED, MIN_TIMED, recommendations, timing, tkpPattern } from '../engine/analytics';
import { ProgressBar, SubtestBadge } from './ui';

/** Up to three concrete next steps for one attempt, each linking to where to act on it. */
export function Recommendations({ a, questions }: { a: Attempt; questions: Question[] }) {
  const recs = recommendations(a, questions);
  if (!recs.length) return null;
  return (
    <section className="card space-y-2 border-brand-500">
      <h2>Saran untuk latihan berikutnya</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {recs.map((r) => (
          <li key={r.kind}>
            {r.text}{' '}
            {r.practiceTopics && (
              <Link
                className="whitespace-nowrap text-brand-600 dark:text-brand-300 underline"
                to={`/simulation?set=${a.setId}&mode=practice&topics=${encodeURIComponent(r.practiceTopics.join('|'))}`}
              >
                Latih sekarang
              </Link>
            )}
            {r.to && (
              <Link className="whitespace-nowrap text-brand-600 dark:text-brand-300 underline" to={r.to}>
                Buka Buku Kesalahan
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TimingCard({ a, questions, practice }: { a: Attempt; questions: Question[]; practice: boolean }) {
  const t = timing(a, questions);
  const slowest = t.flatMap((s) => s.slow).sort((x, y) => y.ms - x.ms);
  return (
    <section className="card space-y-2">
      <h2>Waktu</h2>
      {practice && <p className="muted text-xs">Latihan: waktu dihitung sampai menjawab, tanpa waktu membaca pembahasan.</p>}
      {!t.length ? (
        <p className="muted text-sm">Belum ada data waktu untuk percobaan ini.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="py-1 pr-2">Sub-tes</th>
                <th className="pr-2 text-right">Rata-rata/soal</th>
                <th className="pr-2 text-right">Soal lama</th>
                <th className="text-right">Di soal salah</th>
              </tr>
            </thead>
            <tbody>
              {t.map((s) => (
                <tr key={s.subtest} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2">
                    <SubtestBadge subtest={s.subtest} />
                  </td>
                  <td className="pr-2 text-right tabular-nums">{fmtSec(s.avgMs)}</td>
                  <td className="pr-2 text-right tabular-nums">{s.timed >= MIN_TIMED ? s.slow.length : '—'}</td>
                  <td className="text-right tabular-nums">{s.subtest === 'TKP' ? '—' : fmtSec(s.wastedMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted text-xs">"Soal lama": lebih dari 2× rata-rata sub-tesnya (butuh minimal {MIN_TIMED} soal berwaktu).</p>
          {slowest.length > 0 && (
            <>
              <div className="text-sm font-medium">Paling lama:</div>
              <ul className="space-y-1 text-sm">
                {slowest.slice(0, 5).map((r) => (
                  <li key={r.questionId} className="flex justify-between gap-2">
                    <span className="truncate">
                      No. {r.index + 1} · {r.topic}
                    </span>
                    <span className="shrink-0 tabular-nums">{fmtSec(r.ms)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function UnsureCard({ a, questions }: { a: Attempt; questions: Question[] }) {
  const cal = calibration(a, questions);
  const guesses = likelyGuesses(a, questions);
  const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;
  return (
    <section className="card space-y-2">
      <h2>Ragu-ragu dan tebakan</h2>
      {!cal ? (
        <p className="muted text-sm">Butuh minimal {MIN_FLAGGED} jawaban bertanda ragu-ragu dan {MIN_FLAGGED} tanpa tanda untuk membandingkannya.</p>
      ) : (
        <>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Ditandai ragu, benar</span>
              <span className="tabular-nums">
                {cal.flaggedCorrect}/{cal.flagged} ({pct(cal.flaggedCorrect, cal.flagged)})
              </span>
            </div>
            <ProgressBar value={cal.flaggedCorrect} max={cal.flagged} />
            <div className="flex justify-between">
              <span>Tanpa tanda, benar</span>
              <span className="tabular-nums">
                {cal.unflaggedCorrect}/{cal.unflagged} ({pct(cal.unflaggedCorrect, cal.unflagged)})
              </span>
            </div>
            <ProgressBar value={cal.unflaggedCorrect} max={cal.unflagged} />
          </div>
          <p className="text-sm">
            {cal.verdict === 'akurat'
              ? 'Tanda ragu Anda akurat: soal-soal itu memang lebih sering salah.'
              : cal.verdict === 'terlalu-hati'
                ? 'Anda cenderung terlalu hati-hati: soal yang ditandai ragu hampir sama sering benarnya.'
                : 'Tanda ragu Anda sebagian tepat.'}
          </p>
        </>
      )}
      {guesses.length > 0 && (
        <p className="text-sm">
          <b>{guesses.length}</b> jawaban benar diberikan jauh lebih cepat dari biasanya tanpa tanda ragu (No. {guesses.slice(0, 6).map((g) => g.index + 1).join(', ')}
          {guesses.length > 6 ? ', …' : ''}). Mungkin tebakan; pastikan Anda paham pembahasannya.
        </p>
      )}
    </section>
  );
}

export function TkpCard({ a, questions }: { a: Attempt; questions: Question[] }) {
  const p = tkpPattern(a, questions);
  if (!p) return null;
  const max = Math.max(...Object.values(p.chosen), 1);
  return (
    <section className="card space-y-2">
      <h2>Pola jawaban {SUBTEST_NAMES.TKP.replace('Tes ', '')}</h2>
      <p className="muted text-sm">
        Rata-rata skor {p.avgScore.toFixed(1)} dari 5 · {p.missedBest} dari {p.answered} jawaban bukan pilihan terbaik.
      </p>
      <div className="space-y-1">
        {([5, 4, 3, 2, 1] as const).map((s) => (
          <div key={s} className="flex items-center gap-2 text-sm">
            <span className="w-14 shrink-0">Skor {s}</span>
            <div className="flex-1">
              <ProgressBar value={p.chosen[s]} max={max} tone={s === 5 ? 'green' : 'brand'} />
            </div>
            <span className="w-6 shrink-0 text-right tabular-nums">{p.chosen[s]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
