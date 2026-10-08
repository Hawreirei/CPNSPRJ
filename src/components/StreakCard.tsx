import { useEffect, useState } from 'react';
import { db, getSettings, saveSettings } from '../db';
import type { Attempt, ReviewItem, Settings } from '../domain/types';
import { activityDays, badgeLabel, earnedBadges, endPause, isStudyDay, startPause, streak } from '../engine/streak';

/** Store badges not yet earned and return them; read fresh inside one transaction so each is announced once. */
async function award(ids: string[], now: number): Promise<string[]> {
  return db.transaction('rw', db.meta, async () => {
    const s = await getSettings();
    if (s.streak?.off) return [];
    const have = new Set(s.streak?.earned?.map((e) => e.id));
    const fresh = ids.filter((id) => !have.has(id));
    if (fresh.length) await saveSettings({ streak: { ...s.streak, earned: [...(s.streak?.earned ?? []), ...fresh.map((id) => ({ id, at: now }))] } });
    return fresh;
  });
}

const setPauses = async (update: typeof startPause) => {
  const s = await getSettings();
  await saveSettings({ streak: { ...s.streak, pauses: update(s.streak?.pauses, Date.now()) } });
};

/** Days in a row with study, a pause for sick days or holidays, and badges. Nothing when switched off. */
export function StreakCard({
  settings,
  attempts,
  reviews,
  reviewDays,
  now,
}: {
  settings: Settings;
  attempts: Attempt[];
  reviews: ReviewItem[];
  reviewDays: string[];
  now: number;
}) {
  const [news, setNews] = useState<string[]>([]);
  const off = !!settings.streak?.off;
  const days = activityDays(attempts, reviews, reviewDays);
  const s = streak(days, settings.studyPlan, settings.streak?.pauses, now);
  const ids = earnedBadges({ streakDays: s.days, attempts, counts: settings.counts });
  const earned = settings.streak?.earned ?? [];
  const pending = ids.filter((id) => !earned.some((e) => e.id === id)).join(',');

  useEffect(() => {
    if (off || !pending) return;
    // Not cancelled on unmount: the badges are stored either way, so they must be announced.
    void award(pending.split(','), now).then((fresh) => {
      if (fresh.length) setNews((n) => [...n, ...fresh]);
    });
  }, [off, pending, now]);

  if (off || (!days.size && !earned.length)) return null;

  const status = s.paused
    ? 'Streak sedang dijeda. Hari selama jeda tidak memutus streak.'
    : s.activeToday
      ? 'Hari ini sudah tercatat.'
      : !isStudyDay(now, settings.studyPlan)
        ? 'Hari ini bukan hari belajar dalam rencana Anda; streak tetap aman.'
        : s.days > 0
          ? 'Satu latihan, ujian, atau ulangan hari ini menambah streak.'
          : 'Mulai kapan saja: satu latihan, ujian, atau ulangan sudah dihitung.';

  return (
    <section className="card space-y-3" aria-labelledby="streak-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="streak-title">Konsistensi belajar</h2>
          <p className="text-sm">
            <b className="text-lg tabular-nums">{s.days}</b> hari beruntun
          </p>
          <p className="muted text-sm">{status}</p>
        </div>
        <button className="btn btn-sm" onClick={() => void setPauses(s.paused ? endPause : startPause)}>
          {s.paused ? 'Lanjutkan streak' : 'Jeda streak'}
        </button>
      </div>

      {/* Always rendered, so screen readers hear new badges; no animation. */}
      <div role="status" aria-live="polite">
        {news.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-600 p-2 text-sm">
            <span>Lencana baru: {news.map(badgeLabel).join(', ')}.</span>
            <button className="btn btn-sm" onClick={() => setNews([])}>
              Tutup
            </button>
          </div>
        )}
      </div>

      {earned.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium">Lencana</div>
          <ul className="flex flex-wrap gap-1.5">
            {earned.map((e) => (
              <li key={e.id} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs dark:border-slate-600">
                {badgeLabel(e.id)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
