import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { db, useSettings } from '../db';
import { attemptMode, attemptPath, examAttempts } from '../domain/practice';
import { getReviewDays } from '../engine/review';
import { weakFocus } from '../engine/today';
import { dueQueue, isDue } from '../engine/srs';
import { BackupReminderCard } from '../components/BackupReminder';
import { StorageWarningCard } from '../components/StorageCard';
import { StreakCard } from '../components/StreakCard';
import { ReadinessCard, StudyPlanCard } from '../components/StudyPlanCard';
import { WhatsNewCard } from '../components/WhatsNewCard';
import { Badge, PageHeader, Stat } from '../components/ui';
import { fmtDate } from '../lib/format';

export default function Dashboard() {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const [sets, questions, keys, attempts, reviews, reviewDays] = await Promise.all([
      db.sets.orderBy('updatedAt').reverse().limit(4).toArray(),
      db.questions.count(),
      db.keys.count(),
      db.attempts.orderBy('startedAt').reverse().toArray(),
      db.reviews.toArray(),
      getReviewDays(),
    ]);
    const setCount = await db.sets.count();
    const flagged = await db.questions.filter((q) => q.flags.some((f) => f.severity === 'warn')).count();
    const weak = await weakFocus(attempts);
    return { sets, setCount, questions, keys, attempts, flagged, reviews, reviewDays, weak, now: Date.now() };
  });
  if (!data) return null;
  const finished = data.attempts.filter((a) => a.result);
  const last = examAttempts(finished)[0];
  const inProgress = data.attempts.find((a) => !a.finishedAt);
  const reviewToday = dueQueue(data.reviews, data.now, settings.reviewDailyLimit).length;
  const reviewDue = data.reviews.filter((r) => isDue(r, data.now)).length;

  const lastHint = last?.result?.passedAll === undefined ? undefined : last.result.passedAll ? 'Lulus ambang batas' : 'Belum lulus ambang batas';
  // Without a plan, today's reviews get their own block; with one they are one of its targets.
  const showReview = data.reviews.length > 0 && !settings.studyPlan;

  const kpis: { label: string; value: ReactNode; hint?: string; tone?: 'green' | 'amber' | 'red'; chip?: string; short: string }[] = [
    { label: 'Set tersimpan', short: 'Set', value: data.setCount },
    {
      label: 'Soal di bank',
      short: 'Soal',
      value: data.questions,
      hint: data.flagged ? `⚠ ${data.flagged} perlu dicek` : undefined,
      tone: 'amber',
      chip: data.flagged ? `⚠ ${data.flagged}` : undefined,
    },
    { label: 'Latihan selesai', short: 'Selesai', value: finished.length },
    {
      label: 'Skor ujian terakhir',
      short: 'Skor terakhir',
      value: last?.result ? `${last.result.total}/${last.result.maxTotal}` : '—',
      hint: lastHint,
      tone: last?.result?.passedAll ? 'green' : 'red',
    },
  ];

  // Top row on wide screens: the cards that render share the width in these proportions.
  return (
    <div className="space-y-4 short:space-y-3">
      <PageHeader
        title="Beranda"
        description={`${greeting(data.now)} · ${new Date(data.now).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={
          <>
            {/* Short windows: the numbers move up here instead of taking a row. */}
            <ul className="hidden gap-2 short:flex" aria-label="Ringkasan">
              {kpis.map((k) => (
                <li
                  key={k.label}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  title={k.hint ? `${k.label}: ${k.hint}` : k.label}
                >
                  <span className="muted text-xs">{k.short}</span> <b className="tabular-nums">{k.value}</b>
                  {k.chip && <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300">{k.chip}</span>}
                </li>
              ))}
            </ul>
            <Link className="btn" to="/simulation">
              Latihan ujian
            </Link>
            <Link className="btn btn-primary" to="/new">
              + Buat soal
            </Link>
          </>
        }
      />

      <WhatsNewCard />
      <BackupReminderCard />
      <StorageWarningCard />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {data.keys === 0 && (
          <section className="card card-focus lg:flex-[5]" aria-labelledby="start-title">
            <h2 id="start-title" className="text-[15px]">
              Mulai dalam 3 langkah
            </h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>
                Buat API key gratis di Google AI Studio, lalu tempel di halaman{' '}
                <Link className="text-brand-600 underline dark:text-brand-300" to="/keys">
                  API Key
                </Link>
                .
              </li>
              <li>
                Buka{' '}
                <Link className="text-brand-600 underline dark:text-brand-300" to="/new">
                  Buat Soal
                </Link>
                , pilih <b>Latihan Singkat</b>, lalu klik Buat Soal.
              </li>
              <li>Unduh soalnya sebagai PDF/Word, atau langsung kerjakan di Latihan Ujian.</li>
            </ol>
            <p className="muted mt-2">Soal TIU bergambar bisa dibuat tanpa API key.</p>
          </section>
        )}
        {data.keys > 0 && !finished.length && !settings.studyPlan && (
          <section className="card card-focus lg:flex-[5]" aria-labelledby="next-title">
            <h2 id="next-title" className="text-[15px]">
              Langkah berikutnya
            </h2>
            <p className="muted mt-1">Kerjakan satu set di Latihan Ujian. Setelah itu Beranda menampilkan kesiapan, target harian, dan topik yang perlu dilatih.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn btn-primary" to={data.sets.length ? '/simulation' : '/new'}>
                {data.sets.length ? 'Mulai latihan ujian' : 'Buat set pertama'}
              </Link>
              <Link className="btn" to="/import">
                Impor bundel soal
              </Link>
            </div>
          </section>
        )}
        <StudyPlanCard className="lg:flex-[4]" settings={settings} attempts={data.attempts} reviews={data.reviews} weak={data.weak} now={data.now} />
        <ReadinessCard className="lg:flex-[5]" settings={settings} attempts={finished} />
        <StreakCard className="lg:flex-[3]" settings={settings} attempts={finished} reviews={data.reviews} reviewDays={data.reviewDays} now={data.now} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 short:hidden">
        {kpis.map((k) => (
          <Stat key={k.label} label={k.label} value={k.value} hint={k.hint} tone={k.tone} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <section className="card lg:flex-[7]" aria-labelledby="sets-title">
          <div className="card-head">
            <h2 id="sets-title">Set terbaru</h2>
            {data.setCount > 0 && (
              <Link className="card-link" to="/sets">
                Semua set →
              </Link>
            )}
          </div>
          {inProgress && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-brand-50 px-3 py-2 dark:bg-slate-800">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{attemptMode(inProgress) === 'practice' ? 'Latihan belum selesai' : 'Latihan ujian belum selesai'}</span>
                <span className="muted"> · {inProgress.setName}</span>
              </div>
              <Link className="btn btn-primary btn-sm" to={attemptPath(inProgress)}>
                Lanjutkan
              </Link>
            </div>
          )}
          {data.sets.length === 0 ? (
            <p className="muted">
              Belum ada set. Punya bundel soal?{' '}
              <Link to="/import" className="underline">
                Impor di sini
              </Link>
              ; soalnya langsung masuk ke Set Saya dan Bank Soal.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.sets.map((s) => (
                <li key={s.id}>
                  <Link to={`/sets/${s.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                    <span className="muted shrink-0 text-xs">
                      {s.questionIds.length} soal · {fmtDate(s.updatedAt)}
                    </span>
                    <StatusBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-3 lg:flex-[5]" aria-labelledby="today-title">
          {showReview ? (
            <>
              <div className="card-head mb-0">
                <h2 id="today-title">Ulangan hari ini: {reviewToday} soal</h2>
                <Link className="card-link" to="/review?tab=semua">
                  Buku Kesalahan →
                </Link>
              </div>
              <p className="muted -mt-2 text-sm">
                {reviewToday > 0
                  ? `Dari Buku Kesalahan${reviewDue > reviewToday ? ` (${reviewDue} jatuh tempo, batas harian ${settings.reviewDailyLimit})` : ''}.`
                  : 'Selesai untuk hari ini. Soal berikutnya muncul sesuai jadwal.'}
              </p>
              <div>
                <Link className={`btn ${reviewToday > 0 ? 'btn-primary' : ''}`} to={reviewToday > 0 ? '/review' : '/review?tab=semua'}>
                  {reviewToday > 0 ? 'Mulai ulangan' : 'Lihat Buku Kesalahan'}
                </Link>
              </div>
            </>
          ) : (
            <h2 id="today-title" className="text-[15px]">
              Pintasan
            </h2>
          )}
          <div className={`grid grid-cols-2 gap-2 ${showReview ? 'mt-auto border-t border-slate-100 pt-3 dark:border-slate-800' : ''}`}>
            {SHORTCUTS.map(([to, label]) => (
              <Link key={to} className="btn justify-start" to={to}>
                {label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const SHORTCUTS = [
  ['/bank', 'Bank soal'],
  ['/review?tab=semua', 'Buku Kesalahan'],
  ['/kartu', 'Kartu hafalan'],
  ['/kamus', 'Kamus rumus'],
] as const;

function greeting(t: number): string {
  const h = new Date(t).getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, 'green' | 'amber' | 'blue' | 'slate']> = {
    ready: ['siap', 'green'],
    generating: ['membuat…', 'blue'],
    paused: ['dijeda', 'amber'],
    draft: ['draf', 'slate'],
  };
  const [label, tone] = map[status] ?? [status, 'slate'];
  return <Badge tone={tone}>{label}</Badge>;
}
