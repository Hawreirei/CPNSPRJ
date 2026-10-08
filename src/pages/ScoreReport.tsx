import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../db';
import { isCorrect, scoreQuestion, weakTopics } from '../domain/scoring';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { attemptMode } from '../domain/practice';
import type { Question } from '../domain/types';
import { mistakesInAttempt } from '../engine/srs';
import { attemptQuestions } from '../engine/attempts';
import { startGeneration } from '../engine/generator';
import { createRemedialSet } from '../engine/sets';
import { Recommendations, TimingCard, TkpCard, UnsureCard } from '../components/Analysis';
import { fmtSec } from '../engine/analytics';
import { QuestionCard } from '../components/QuestionCard';
import { opensGroup, passageLabel } from '../domain/groups';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { Badge, Empty, fmtDate, ProgressBar, SubtestBadge } from '../components/ui';
import { tabAwaySummary } from '../domain/catMode';
import type { TabAway } from '../domain/types';

/** What Mode CAT recorded. Shown, never scored. */
function CatModeCard({ aways, lockedOrder }: { aways?: TabAway[]; lockedOrder: boolean }) {
  const t = tabAwaySummary(aways);
  return (
    <section className="card space-y-1 text-sm" aria-labelledby="cat-mode-title">
      <h2 id="cat-mode-title">Mode CAT</h2>
      <p>
        {t.count === 0
          ? 'Tidak pernah meninggalkan halaman ujian.'
          : `Meninggalkan halaman ujian ${t.count} kali, total ${fmtSec(t.totalMs)}${t.count > 1 ? ` (terlama ${fmtSec(t.longestMs)})` : ''}.`}
      </p>
      {lockedOrder && <p className="muted">Urutan sub-tes dikunci.</p>}
      <p className="muted text-xs">Hanya catatan untuk Anda; nilai tidak dikurangi.</p>
    </section>
  );
}

export default function ScoreReport() {
  const { attemptId = '' } = useParams();
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const a = await db.attempts.get(attemptId);
    if (!a) return null;
    const questions = await attemptQuestions(a);
    // Counted from the notebook itself, so attempts finished before it existed show nothing.
    const inNotebook = (await db.reviews.bulkGet(mistakesInAttempt(questions, a.answers, a.flagged))).filter(Boolean).length;
    return { a, questions, inNotebook };
  }, [attemptId]);
  const [review, setReview] = useState<'none' | 'wrong' | 'all'>('none');
  const [busy, setBusy] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<Question | null>(null);

  if (data === undefined) return null;
  if (!data?.a.result) return <Empty title="Hasil tidak ditemukan" />;
  const { a, questions, inNotebook } = data;
  const r = a.result!;
  const weak = weakTopics(r.topics);
  const durationMs = (a.finishedAt ?? a.endsAt) - a.startedAt;
  const practice = attemptMode(a) === 'practice';

  async function remedial() {
    setBusy(true);
    const set = await createRemedialSet(weak.slice(0, 6), 5, a.questionIds);
    if (set.batches.length) void startGeneration(set.id);
    nav(`/sets/${set.id}`);
  }

  const reviewList = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => review === 'all' || (review === 'wrong' && !isCorrect(q, a.answers[q.id])));
  const shownQuestions = reviewList.map((x) => x.q);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>
            Laporan Skor {practice && <Badge tone="blue">Latihan</Badge>}
          </h1>
          <p className="muted mt-1">
            {a.setName} · {fmtDate(a.startedAt)} · durasi {fmtSec(durationMs)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn" to={`/simulation?set=${a.setId}${practice ? '&mode=practice' : ''}`}>
            Ulangi
          </Link>
          <Link className="btn" to="/progress">
            Progres
          </Link>
        </div>
      </div>

      {a.catMode && <CatModeCard aways={a.tabAways} lockedOrder={!!a.lockedOrder} />}

      <div className={`card ${practice ? '' : `border-2 ${r.passedAll ? 'border-green-500' : 'border-red-400'}`}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-4xl font-bold">{r.total}</div>
          <div className="muted">dari {r.maxTotal}</div>
          {!practice && <Badge tone={r.passedAll ? 'green' : 'red'}>{r.passedAll ? 'Memenuhi semua ambang batas' : 'Belum memenuhi ambang batas'}</Badge>}
        </div>
        <p className="muted mt-2 text-xs">
          {practice
            ? 'Hasil latihan: kunci tampil setiap selesai menjawab, jadi skor ini tidak masuk grafik skor ujian di Progres.'
            : 'Kelulusan SKD mensyaratkan setiap sub-tes mencapai ambang batasnya masing-masing.'}
        </p>
        {inNotebook > 0 && (
          <p className="mt-2 text-sm">
            {inNotebook} soal yang salah, kosong, atau ragu-ragu masuk{' '}
            <Link className="text-brand-600 dark:text-brand-300 underline" to="/review">
              Buku Kesalahan
            </Link>{' '}
            untuk diulang terjadwal.
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {r.perSubtest.map((s) => (
          <div key={s.subtest} className="card space-y-2">
            <div className="flex items-center gap-2">
              <SubtestBadge subtest={s.subtest} />
              <span className="text-sm font-medium">{SUBTEST_NAMES[s.subtest]}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{s.score}</span>
              <span className="muted">/ {s.max}</span>
              <Badge tone={s.passed ? 'green' : 'red'}>{s.passed ? 'lulus' : 'belum'}</Badge>
            </div>
            <ProgressBar value={s.score} max={s.max} tone={s.passed ? 'green' : 'red'} />
            <div className="muted text-xs">
              Ambang {s.passing} · {s.subtest === 'TKP' ? `${s.correct} opsi skor 5` : `${s.correct} benar`} · {s.answered}/{s.total} dijawab
            </div>
          </div>
        ))}
      </div>

      <Recommendations a={a} questions={questions} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2>Topik lemah</h2>
          {weak.length === 0 ? (
            <p className="muted mt-2">Tidak ada topik di bawah 60%. Bagus!</p>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {weak.slice(0, 8).map((t) => (
                  <li key={t.subtest + t.topic}>
                    <div className="flex justify-between text-sm">
                      <span>
                        <SubtestBadge subtest={t.subtest} /> {t.topic}
                      </span>
                      <span>{Math.round((t.score / t.max) * 100)}%</span>
                    </div>
                    <ProgressBar value={t.score} max={t.max} tone="red" />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  className="btn"
                  to={`/simulation?set=${a.setId}&mode=practice&topics=${encodeURIComponent(weak.map((t) => t.topic).join('|'))}`}
                >
                  Latih ulang topik ini
                </Link>
                <button className="btn btn-primary" disabled={busy} onClick={remedial}>
                  Buat set latihan topik lemah
                </button>
              </div>
              <p className="muted mt-1 text-xs">
                "Latih ulang" memakai soal set ini dengan pembahasan langsung. "Buat set" mengambil soal lain dari bank soal dulu; AI hanya dipakai bila bank kurang.
              </p>
            </>
          )}
        </section>
        <TimingCard a={a} questions={questions} practice={practice} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <UnsureCard a={a} questions={questions} />
        <TkpCard a={a} questions={questions} />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto">Tinjau jawaban</h2>
          <button className={`btn btn-sm ${review === 'wrong' ? 'btn-primary' : ''}`} onClick={() => setReview('wrong')}>
            Salah / kosong
          </button>
          <button className={`btn btn-sm ${review === 'all' ? 'btn-primary' : ''}`} onClick={() => setReview('all')}>
            Semua
          </button>
          {review !== 'none' && (
            <button className="btn btn-sm" onClick={() => setReview('none')}>
              Sembunyikan
            </button>
          )}
        </div>
        {review !== 'none' &&
          reviewList.map(({ q, i }) => {
            const ans = a.answers[q.id];
            return (
              <QuestionCard
                key={q.id}
                q={q}
                index={i}
                mode="pembahasan"
                showFlags={false}
                passage={opensGroup(shownQuestions, q) ? 'open' : 'closed'}
                passageLabel={passageLabel(questions, q)}
                userAnswer={a.answers[q.id]}
                onFeedback={() => setFeedbackFor(q)}
                actions={
                  <Badge tone={isCorrect(q, ans) ? 'green' : 'red'}>
                    Jawaban Anda: {ans ?? '—'} · skor {scoreQuestion(q, ans)}
                  </Badge>
                }
              />
            );
          })}
      </section>
      {feedbackFor && <FeedbackDialog q={feedbackFor} onClose={() => setFeedbackFor(null)} />}
    </div>
  );
}
