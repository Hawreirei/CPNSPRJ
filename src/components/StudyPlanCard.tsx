import { Link } from 'react-router-dom';
import type { Attempt, ReviewItem, Settings } from '../domain/types';
import { dueQueue, reviewedToday } from '../engine/srs';
import { dailyPlan, daysUntil, FINAL_WEEK_DAYS, parseLocalDate, readiness, WEEKDAYS, type PlanItem } from '../engine/studyPlan';
import { SubtestBadge } from './ui';

const fmtDay = (t: number) => new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Countdown, today's targets and readiness. `now` comes from the caller's data query, not from render. */
export function StudyPlanCard({
  settings,
  attempts,
  reviews,
  weak,
  now,
}: {
  settings: Settings;
  attempts: Attempt[];
  reviews: ReviewItem[];
  weak?: { topics: string[]; setId: string };
  now: number;
}) {
  const plan = settings.studyPlan;
  const finished = attempts.filter((a) => a.result);
  if (!plan) {
    if (!finished.length) return null;
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">Buat rencana belajar</div>
          <div className="muted">Tentukan waktu belajar harian dan, bila sudah ada, tanggal ujian. Aplikasi menyusun target harian untuk Anda.</div>
        </div>
        <Link className="btn" to="/settings">
          Buat rencana
        </Link>
      </div>
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
  const ready = readiness(finished, plan, settings.passing, settings.counts);
  const budget = plan.minutesPerDay ?? 60;

  return (
    <section className="card space-y-4" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="plan-title">Rencana belajar</h2>
          {days === null ? (
            <p className="muted text-sm">Tanggal ujian belum diisi. Jadwal resmi bisa berubah; isi atau perbarui saat diumumkan di SSCASN.</p>
          ) : days > 0 ? (
            <p className="text-sm">
              <b className="text-lg">{days} hari lagi</b> menuju ujian ({fmtDay(exam!)}).
              {days <= FINAL_WEEK_DAYS && <span className="muted"> Minggu terakhir: utamakan ulangan dan simulasi, kurangi materi baru.</span>}
            </p>
          ) : days === 0 ? (
            <p className="text-sm font-semibold">Hari ini hari ujian. Semoga lancar!</p>
          ) : (
            <p className="text-sm text-amber-800 dark:text-amber-300">Tanggal ujian ({fmtDay(exam!)}) sudah lewat. Perbarui tanggalnya di rencana.</p>
          )}
        </div>
        <Link className="btn btn-sm" to="/settings">
          Ubah rencana
        </Link>
      </div>

      {days !== 0 && (
        <div>
          <div className="mb-1 text-sm font-medium">Target hari ini (± {budget} menit)</div>
          {items.length === 0 ? (
            <p className="muted text-sm">Tidak ada target khusus hari ini. Coba latihan topik yang menurut Anda paling sulit.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <PlanRow key={it.kind} item={it} simulationDay={plan.simulationDay ?? 6} />
              ))}
            </ul>
          )}
        </div>
      )}

      {ready.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium">Kesiapan menurut ujian terakhir</div>
          <ul className="space-y-1 text-sm">
            {ready.map((r) => (
              <li key={r.subtest} className="flex flex-wrap items-center gap-x-2">
                <SubtestBadge subtest={r.subtest} />
                <span>
                  rata-rata <b className="tabular-nums">{r.average}</b> dari {r.n} ujian terakhir · target {r.target}
                </span>
                <span className={r.average >= r.target ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {r.average >= r.target ? `${r.reached} dari ${r.n} mencapai target` : `kurang ${r.target - r.average} poin`}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted mt-1 text-xs">Dari skor ujian di aplikasi ini, bukan peluang kelulusan.</p>
        </div>
      )}
    </section>
  );
}

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
    <li className="flex items-center gap-2 text-sm">
      <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${item.done ? 'border-green-600 bg-green-600 text-white' : 'border-slate-400'}`}>
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
