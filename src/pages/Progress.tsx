import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, useSettings } from '../db';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { attemptMode, examAttempts } from '../domain/practice';
import { SUBTESTS } from '../domain/types';
import type { Attempt, Question, Subtest } from '../domain/types';
import { isBuiltIn, packageOf, packages } from '../domain/examPackage';
import { examSeries, MIN_EXAMS_FOR_PROJECTION, reasonSummary, topicMovers, trend } from '../engine/analytics';
import { ScoreTrend } from '../components/ScoreTrend';
import { Badge, Empty, ProgressBar, SubtestBadge } from '../components/ui';

export default function Progress() {
  const settings = useSettings();
  const attempts = useLiveQuery(() => db.attempts.orderBy('startedAt').filter((a) => !!a.result).toArray(), []);
  const reasons = useLiveQuery(async () => {
    const reviews = (await db.reviews.toArray()).filter((r) => r.reasonTags.length);
    const qs = (await db.questions.bulkGet(reviews.map((r) => r.questionId))).filter((q): q is Question => !!q);
    return reasonSummary(reviews, new Map(qs.map((q) => [q.id, q.subtest])));
  }, []);
  if (!attempts) return null;
  if (!attempts.length) {
    return (
      <div className="space-y-4">
        <h1>Progres</h1>
        <Empty title="Belum ada simulasi selesai">
          <Link className="text-brand-600 dark:text-brand-300 underline" to="/simulation">
            Mulai simulasi
          </Link>{' '}
          untuk melihat riwayat skor dan penguasaan topik.
        </Empty>
      </div>
    );
  }

  // Practice reveals the key as you go, so only exams are comparable on the score chart.
  const exams = examAttempts(attempts);
  const practiceCount = attempts.length - exams.length;
  // Partial sets are rescaled to the full maximum so every exam sits on the same chart.
  const bySubtest = examSeries(attempts, settings.counts);
  const series = (s: Subtest) => bySubtest[s].map((p) => ({ label: `${new Date(p.at).toLocaleDateString('id-ID')} · ${p.setName}`, value: p.value, max: p.max }));
  const moves = topicMovers(attempts);
  const improved = moves.filter((m) => m.delta >= 0.1).sort((x, y) => y.delta - x.delta).slice(0, 3);
  const declined = moves.filter((m) => m.delta <= -0.1).sort((x, y) => x.delta - y.delta).slice(0, 3);

  // Topic mastery: recency-weighted share of max score across all attempts. Practice counts too:
  // each answer is given before its explanation is shown.
  const mastery = new Map<string, { subtest: Subtest; topic: string; w: number; ws: number; n: number }>();
  attempts.forEach((a, idx) => {
    const weight = 0.7 ** (attempts.length - 1 - idx);
    for (const t of a.result!.topics) {
      const k = `${t.subtest}|${t.topic}`;
      const m = mastery.get(k) ?? { subtest: t.subtest, topic: t.topic, w: 0, ws: 0, n: 0 };
      m.w += weight * t.max;
      m.ws += weight * t.score;
      m.n += t.total;
      mastery.set(k, m);
    }
  });
  const topics = [...mastery.values()].map((m) => ({ ...m, pct: m.w ? m.ws / m.w : 0 })).sort((a, b) => a.pct - b.pct);

  return (
    <div className="space-y-6">
      <div>
        <h1>Progres</h1>
        <p className="muted mt-1">
          {exams.length} ujian{practiceCount > 0 && ` dan ${practiceCount} latihan`} selesai. Grafik skor hanya memakai ujian; skor set yang tidak penuh diskalakan ke
          skor maksimum standar agar sebanding.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {SUBTESTS.map((s) => (
          <ScoreTrend key={s} title={`${s} — ${SUBTEST_NAMES[s]}`} points={series(s)} passing={settings.passing[s]} max={settings.counts[s] * 5} />
        ))}
      </div>

      {exams.length > 0 && (
        <section className="card space-y-3">
          <h2>Tren</h2>
          <ul className="space-y-1.5 text-sm">
            {SUBTESTS.map((s) => {
              const t = trend(
                bySubtest[s].map((p) => p.value),
                settings.counts[s] * 5,
              );
              if (!t) return null;
              const step = Math.round(Math.abs(t.slope));
              return (
                <li key={s} className="flex flex-wrap items-baseline gap-x-2">
                  <SubtestBadge subtest={s} />
                  <span>
                    {t.n < 2 ? 'Baru 1 ujian.' : step < 1 ? 'Stabil.' : t.slope > 0 ? `Naik rata-rata ${step} poin per ujian.` : `Turun rata-rata ${step} poin per ujian.`}
                  </span>
                  <span className="muted">
                    {t.projection
                      ? `Perkiraan kasar ujian berikutnya: ${t.projection.low}–${t.projection.high} (ambang ${settings.passing[s]}, dari ${t.n} ujian).`
                      : `Perkiraan muncul setelah ${MIN_EXAMS_FOR_PROJECTION} ujian.`}
                  </span>
                </li>
              );
            })}
          </ul>
          {(improved.length > 0 || declined.length > 0) && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <TopicMoves title="Paling membaik" moves={improved} />
              <TopicMoves title="Paling menurun" moves={declined} />
            </div>
          )}
          <p className="muted text-xs">Perubahan topik: ujian terakhir dibanding rata-rata ujian sebelumnya yang memuat topik itu.</p>
        </section>
      )}

      {reasons && reasons.length > 0 && (
        <section className="card space-y-2">
          <h2>Alasan salah tersering</h2>
          <div className="flex flex-wrap gap-1.5">
            {reasons.slice(0, 6).map((r) => (
              <span key={r.subtest + r.tag} className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs dark:border-slate-700">
                <SubtestBadge subtest={r.subtest} /> {r.label} <b className="tabular-nums">{r.count}</b>
              </span>
            ))}
          </div>
          <p className="muted text-xs">Dari tag yang Anda pilih saat mengulang soal di Buku Kesalahan.</p>
        </section>
      )}

      <section className="card">
        <h2>Penguasaan topik</h2>
        <p className="muted mb-3 text-xs">Rata-rata tertimbang dari ujian dan latihan (yang terbaru lebih berbobot). Di bawah 60% ditandai lemah.</p>
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {topics.map((t) => (
            <div key={t.subtest + t.topic}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <SubtestBadge subtest={t.subtest} /> {t.topic}
                  {t.pct < 0.6 && <Badge tone="red">lemah</Badge>}
                </span>
                <span className="tabular-nums">
                  {Math.round(t.pct * 100)}% <span className="muted text-xs">({t.n} soal)</span>
                </span>
              </div>
              <ProgressBar value={t.pct} max={1} tone={t.pct < 0.6 ? 'red' : 'green'} />
            </div>
          ))}
        </div>
      </section>

      {/* One table per exam package: their sub-tests and scales differ. SKD first. */}
      {packages()
        .map((pkg) => ({ pkg, list: attempts.filter((a) => packageOf(a.result!.perSubtest[0]?.subtest ?? 'TWK').id === pkg.id) }))
        .filter((g) => g.list.length)
        .map(({ pkg, list }) => (
          <HistoryTable
            key={pkg.id}
            title={isBuiltIn(pkg) ? 'Riwayat skor' : `Riwayat skor ${pkg.name}`}
            attempts={list}
            subtests={isBuiltIn(pkg) ? SUBTESTS : pkg.subtests.map((x) => x.id)}
          />
        ))}
    </div>
  );
}

function HistoryTable({ title, attempts, subtests }: { title: string; attempts: Attempt[]; subtests: Subtest[] }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-2">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
            <th className="py-1 pr-3">Tanggal</th>
            <th className="pr-3">Set</th>
            {subtests.map((s) => (
              <th key={s} className="pr-3 text-right">
                {s}
              </th>
            ))}
            <th className="pr-3 text-right">Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...attempts].reverse().map((a) => (
            <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(a.startedAt).toLocaleDateString('id-ID')}</td>
              <td className="pr-3">
                <Link className="hover:underline" to={`/results/${a.id}`}>
                  {a.setName}
                </Link>{' '}
                {attemptMode(a) === 'practice' && <Badge tone="blue">latihan</Badge>}
              </td>
              {subtests.map((s) => {
                const r = a.result!.perSubtest.find((p) => p.subtest === s);
                return (
                  <td key={s} className={`pr-3 text-right tabular-nums ${r?.passed === false ? 'text-red-600 dark:text-red-400' : ''}`}>
                    {r ? `${r.score}/${r.max}` : '—'}
                  </td>
                );
              })}
              <td className="pr-3 text-right font-medium tabular-nums">{a.result!.total}</td>
              <td>{attemptMode(a) === 'exam' && a.result!.passedAll !== undefined && <Badge tone={a.result!.passedAll ? 'green' : 'red'}>{a.result!.passedAll ? 'lulus' : 'belum'}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TopicMoves({ title, moves }: { title: string; moves: ReturnType<typeof topicMovers> }) {
  if (!moves.length) return <div />;
  return (
    <div>
      <div className="mb-1 font-medium">{title}</div>
      <ul className="space-y-1">
        {moves.map((m) => (
          <li key={m.subtest + m.topic} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <SubtestBadge subtest={m.subtest} /> {m.topic}
            </span>
            <span className={`tabular-nums ${m.delta > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {Math.round(m.previousPct * 100)}% → {Math.round(m.latestPct * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
