import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, useSettings } from '../db';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import type { Subtest } from '../domain/types';
import { ScoreTrend } from '../components/ScoreTrend';
import { Badge, Empty, ProgressBar, SubtestBadge } from '../components/ui';

export default function Progress() {
  const settings = useSettings();
  const attempts = useLiveQuery(() => db.attempts.orderBy('startedAt').filter((a) => !!a.result).toArray(), []);
  if (!attempts) return null;
  if (!attempts.length) {
    return (
      <div className="space-y-4">
        <h1>Progres</h1>
        <Empty title="Belum ada simulasi selesai">
          <Link className="text-brand-600 underline" to="/simulation">
            Mulai simulasi
          </Link>{' '}
          untuk melihat riwayat skor dan penguasaan topik.
        </Empty>
      </div>
    );
  }

  // Only full-length sub-tests are comparable on the raw-score chart; partial ones are rescaled to the full maximum.
  const series = (s: Subtest) =>
    attempts.flatMap((a) => {
      const r = a.result!.perSubtest.find((p) => p.subtest === s);
      if (!r) return [];
      const fullMax = settings.counts[s] * 5;
      const value = r.max === fullMax ? r.score : Math.round((r.score / r.max) * fullMax);
      return [{ label: `${new Date(a.startedAt).toLocaleDateString('id-ID')} · ${a.setName}`, value, max: fullMax }];
    });

  // Topic mastery: recency-weighted share of max score across all attempts.
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
          {attempts.length} simulasi selesai. Skor set yang tidak penuh diskalakan ke skor maksimum standar agar sebanding.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {SUBTESTS.map((s) => (
          <ScoreTrend key={s} title={`${s} — ${SUBTEST_NAMES[s]}`} points={series(s)} passing={settings.passing[s]} max={settings.counts[s] * 5} />
        ))}
      </div>

      <section className="card">
        <h2>Penguasaan topik</h2>
        <p className="muted mb-3 text-xs">Rata-rata tertimbang (simulasi terbaru lebih berbobot). Di bawah 60% ditandai lemah.</p>
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

      <section className="card overflow-x-auto">
        <h2 className="mb-2">Riwayat skor</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3">Tanggal</th>
              <th className="pr-3">Set</th>
              {SUBTESTS.map((s) => (
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
                  </Link>
                </td>
                {SUBTESTS.map((s) => {
                  const r = a.result!.perSubtest.find((p) => p.subtest === s);
                  return (
                    <td key={s} className={`pr-3 text-right tabular-nums ${r && !r.passed ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {r ? `${r.score}/${r.max}` : '—'}
                    </td>
                  );
                })}
                <td className="pr-3 text-right font-medium tabular-nums">{a.result!.total}</td>
                <td>
                  <Badge tone={a.result!.passedAll ? 'green' : 'red'}>{a.result!.passedAll ? 'lulus' : 'belum'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
