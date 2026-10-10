import { Link } from 'react-router-dom';
import type { Attempt, ReviewItem, Settings } from '../domain/types';
import { dueQueue, reviewedToday } from '../engine/srs';
import { dailyPlan, daysUntil, FINAL_WEEK_DAYS, parseLocalDate, readiness, WEEKDAYS, type PlanItem } from '../engine/studyPlan';
import { MAX_PER_QUESTION } from '../domain/scoring';
import { SubtestBadge } from './ui';

const fmtDay = (t: number) => new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Countdown and today's targets. `now` comes from the caller's data query, not from render. */
export function StudyPlanCard({
  settings,
  attempts,
  reviews,
  weak,
  now,
  className = '',
}: {
  settings: Settings;
  attempts: Attempt[];
  reviews: ReviewItem[];
  weak?: { topics: string[]; setId: string };
  now: number;
  className?: string;
}) {
  const plan = settings.studyPlan;
  const finished = attempts.filter((a) => a.result);
  if (!plan) {
    if (!finished.length) return null;
    return (
      <section className={`card card-focus flex flex-col gap-3 ${className}`} aria-labelledby="plan-title">
        <h2 id="plan-title" className="text-[15px]">
          Buat rencana belajar
        </h2>
        <p className="muted">Tentukan waktu belajar harian dan, bila sudah ada, tanggal ujian. Aplikasi menyusun target harian dan menghitung kesiapan Anda.</p>
        <div>
          <Link className="btn btn-primary" to="/settings">
            Buat rencana
          </Link>
        </div>
      </section>
    );
  }

  const exam = parseLocalDate(plan.examDate);
  const days = exam === null ? null : daysUntil(exam, now);
  const items = dailyPlan({
    plan,
    now,
    attempts: finished,
    reviewQueue: dueQueue(reviews, now, settings.reviewDailyLimit).length,
    reviewedToday: reviewedToday(reviews, now),
    weak,
    simulationMinutes: settings.durationMinutes,
  });
  const budget = plan.minutesPerDay ?? 60;
  const done = items.filter((it) => it.done).length;
  const met = !settings.streak?.off && items.length > 0 && done === items.length;

  return (
    <section className={`card card-focus flex flex-col ${className}`} aria-labelledby="plan-title">
      <div className="card-head">
        <h2 id="plan-title">Rencana belajar</h2>
        <Link className="card-link" to="/settings">
          Ubah rencana
        </Link>
      </div>
      {days === null ? (
        <p className="muted text-sm">Tanggal ujian belum diisi. Jadwal resmi bisa berubah; isi atau perbarui saat diumumkan di SSCASN.</p>
      ) : days > 0 ? (
        <p className="text-sm">
          <b className="text-lg text-brand-700 dark:text-brand-100">{days} hari lagi</b> menuju ujian ({fmtDay(exam!)}).
          {days <= FINAL_WEEK_DAYS && <span className="muted"> Minggu terakhir: utamakan ulangan dan simulasi, kurangi materi baru.</span>}
        </p>
      ) : days === 0 ? (
        <p className="text-sm font-semibold">Hari ini hari ujian. Semoga lancar!</p>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-300">Tanggal ujian ({fmtDay(exam!)}) sudah lewat. Perbarui tanggalnya di rencana.</p>
      )}

      {days !== 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
            {items.length > 0 && <Ring done={done} total={items.length} />}
            <span>Target hari ini (± {budget} menit)</span>
            {met && <span className="font-medium text-green-700 dark:text-green-400">✓ Target hari ini tercapai</span>}
          </div>
          {items.length === 0 ? (
            <p className="muted text-sm">Tidak ada target khusus hari ini. Coba latihan topik yang menurut Anda paling sulit.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it) => (
                <PlanRow key={it.kind} item={it} simulationDay={plan.simulationDay ?? 6} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Small progress ring for today's targets; the numbers are also in text for screen readers. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-9 w-9 items-center justify-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-brand-500" strokeDasharray={`${(done / total) * c} ${c}`} />
      </svg>
      <span className="text-[11px] font-bold tabular-nums">
        {done}/{total}
        <span className="sr-only"> target selesai</span>
      </span>
    </span>
  );
}

/** Recent exam scores against the plan's targets, one bar per sub-test. Nothing without a plan or exams. */
export function ReadinessCard({ settings, attempts, className = '' }: { settings: Settings; attempts: Attempt[]; className?: string }) {
  const plan = settings.studyPlan;
  if (!plan) return null;
  const ready = readiness(
    attempts.filter((a) => a.result),
    plan,
    settings.passing,
    settings.counts,
  );
  if (!ready.length) return null;
  return (
    <section className={`card flex flex-col ${className}`} aria-labelledby="ready-title">
      <div className="card-head">
        <h2 id="ready-title">Kesiapan menurut ujian terakhir</h2>
        <Link className="card-link" to="/progress">
          Progres →
        </Link>
      </div>
      <ul className="space-y-3 text-sm">
        {ready.map((r) => {
          const max = settings.counts[r.subtest] * MAX_PER_QUESTION;
          const ok = r.average >= r.target;
          return (
            <li key={r.subtest}>
              <div className="flex items-baseline gap-2">
                <SubtestBadge subtest={r.subtest} />
                <span>
                  rata-rata <b className="text-base tabular-nums">{r.average}</b> <span className="muted text-xs">· target {r.target}</span>
                </span>
                <span className={`ml-auto text-right text-xs font-semibold ${ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {ok ? `${r.reached} dari ${r.n} mencapai target` : `kurang ${r.target - r.average} poin`}
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
                <div className={`h-full rounded-full ${SUBTEST_BAR[r.subtest] ?? 'bg-brand-500'}`} style={{ width: `${Math.min(100, (r.average / max) * 100)}%` }} />
                <div className="absolute -top-1 h-4 w-0.5 rounded bg-slate-700 dark:bg-slate-200" style={{ left: `${Math.min(100, (r.target / max) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted mt-auto pt-3 text-xs">
        Rata-rata {ready.length && Math.max(...ready.map((r) => r.n))} ujian terakhir; garis tegak = target. Dari skor ujian di aplikasi ini, bukan peluang kelulusan.
      </p>
    </section>
  );
}

const SUBTEST_BAR: Partial<Record<string, string>> = { TWK: 'bg-rose-500', TIU: 'bg-sky-500', TKP: 'bg-emerald-500' };

function PlanRow({ item, simulationDay }: { item: PlanItem; simulationDay: number }) {
  const [text, to, action] = (() => {
    switch (item.kind) {
      case 'start':
        return ['Kerjakan satu set Latihan Singkat untuk mengukur kemampuan awal', '/new', 'Buat soal'];
      case 'review':
        return [item.done ? 'Ulangan Buku Kesalahan hari ini selesai' : `Ulangi ${item.count} soal di Buku Kesalahan`, '/review', 'Mulai'];
      case 'practice':
        return [
          `Latih ${item.topics.slice(0, 3).join(', ')}${item.topics.length > 3 ? ', dan lainnya' : ''}`,
          `/simulation?set=${item.setId}&mode=practice&topics=${encodeURIComponent(item.topics.join('|'))}`,
          'Latih',
        ];
      case 'simulation':
        return [`Simulasi SKD penuh (jadwal mingguan, hari ${WEEKDAYS[simulationDay]})`, '/simulation', 'Mulai'];
    }
  })();
  return (
    <li className="flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${item.done ? 'border-green-600 bg-green-600 text-white' : 'border-slate-400'}`}
      >
        {item.done ? '✓' : ''}
      </span>
      <span className={`flex-1 ${item.done ? 'muted line-through' : ''}`}>
        {item.done && <span className="sr-only">Selesai: </span>}
        {text}
        {!item.done && <span className="muted"> · ± {item.minutes} menit</span>}
      </span>
      {!item.done && (
        <Link className="btn btn-sm" to={to}>
          {action}
        </Link>
      )}
    </li>
  );
}
