import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, useSettings } from '../db';
import { attemptMode, attemptPath, examAttempts } from '../domain/practice';
import { weakTopics } from '../domain/scoring';
import { recommendations } from '../engine/analytics';
import { attemptQuestions } from '../engine/attempts';
import { dueQueue, isDue } from '../engine/srs';
import { BackupReminderCard } from '../components/BackupReminder';
import { StudyPlanCard } from '../components/StudyPlanCard';
import { Badge, Stat, fmtDate } from '../components/ui';

export default function Dashboard() {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const [sets, questions, keys, attempts, reviews] = await Promise.all([
      db.sets.orderBy('updatedAt').reverse().limit(5).toArray(),
      db.questions.count(),
      db.keys.count(),
      db.attempts.orderBy('startedAt').reverse().toArray(),
      db.reviews.toArray(),
    ]);
    const setCount = await db.sets.count();
    const flagged = await db.questions.filter((q) => q.flags.some((f) => f.severity === 'warn')).count();
    // Topics to practise today: the latest attempt's weak-topic advice, else its weakest topics.
    let weak: { topics: string[]; setId: string } | undefined;
    const latest = attempts.find((a) => a.result);
    if (latest && (await db.sets.get(latest.setId))) {
      const advice = recommendations(latest, await attemptQuestions(latest)).find((r) => r.kind === 'weak-topic')?.practiceTopics;
      const topics = advice ?? weakTopics(latest.result!.topics).slice(0, 3).map((t) => t.topic);
      if (topics.length) weak = { topics, setId: latest.setId };
    }
    return { sets, setCount, questions, keys, attempts, flagged, reviews, weak, now: Date.now() };
  });
  if (!data) return null;
  const finished = data.attempts.filter((a) => a.result);
  const last = examAttempts(finished)[0];
  const inProgress = data.attempts.find((a) => !a.finishedAt);
  const reviewToday = dueQueue(data.reviews, data.now, settings.reviewDailyLimit).length;
  const reviewDue = data.reviews.filter((r) => isDue(r, data.now)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1>Beranda</h1>
        <p className="muted mt-1">Buat soal latihan SKD dengan AI, unduh sebagai PDF/Word, atau latihan langsung seperti ujian CAT.</p>
      </div>

      {data.keys === 0 && (
        <div className="card border-brand-500">
          <h2>Mulai dalam 3 langkah</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>
              Buat API key gratis di Google AI Studio, lalu tempel di halaman <Link className="text-brand-600 underline" to="/keys">API Key</Link>.
            </li>
            <li>
              Buka <Link className="text-brand-600 underline" to="/new">Buat Soal</Link>, pilih <b>Latihan Singkat</b>, lalu klik Buat Soal.
            </li>
            <li>Unduh soalnya sebagai PDF/Word, atau langsung kerjakan di Latihan Ujian.</li>
          </ol>
          <p className="muted mt-2">Soal TIU bergambar bisa dibuat tanpa API key.</p>
        </div>
      )}

      {inProgress && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{attemptMode(inProgress) === 'practice' ? 'Latihan belum selesai' : 'Latihan ujian belum selesai'}</div>
            <div className="muted">{inProgress.setName}</div>
          </div>
          <Link className="btn btn-primary" to={attemptPath(inProgress)}>
            Lanjutkan
          </Link>
        </div>
      )}

      <StudyPlanCard settings={settings} attempts={data.attempts} reviews={data.reviews} weak={data.weak} now={data.now} />

      <BackupReminderCard />

      {/* With a plan, today's reviews are one of its targets; no separate card. */}
      {data.reviews.length > 0 && !settings.studyPlan && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Ulangan hari ini: {reviewToday} soal</div>
            <div className="muted text-sm">
              {reviewToday > 0
                ? `Dari Buku Kesalahan${reviewDue > reviewToday ? ` (${reviewDue} jatuh tempo, batas harian ${settings.reviewDailyLimit})` : ''}.`
                : 'Selesai untuk hari ini. Soal berikutnya muncul sesuai jadwal.'}
            </div>
          </div>
          <Link className={`btn ${reviewToday > 0 ? 'btn-primary' : ''}`} to={reviewToday > 0 ? '/review' : '/review?tab=semua'}>
            {reviewToday > 0 ? 'Mulai ulangan' : 'Lihat Buku Kesalahan'}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Set tersimpan" value={data.setCount} />
        <Stat label="Soal di bank" value={data.questions} hint={data.flagged ? `${data.flagged} perlu dicek` : undefined} />
        <Stat label="Latihan selesai" value={finished.length} />
        <Stat
          label="Skor ujian terakhir"
          value={last?.result ? `${last.result.total}/${last.result.maxTotal}` : '—'}
          hint={last?.result ? (last.result.passedAll ? 'Lulus ambang batas' : 'Belum lulus ambang batas') : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary" to="/new">
          + Buat soal
        </Link>
        <Link className="btn" to="/simulation">
          Latihan ujian
        </Link>
        <Link className="btn" to="/bank">
          Bank soal
        </Link>
      </div>

      <section>
        <h2 className="mb-2">Set terbaru</h2>
        {data.sets.length === 0 ? (
          <p className="muted">Belum ada set.</p>
        ) : (
          <div className="grid gap-2">
            {data.sets.map((s) => (
              <Link key={s.id} to={`/sets/${s.id}`} className="card flex items-center justify-between gap-3 hover:border-brand-500">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="muted text-xs">
                    {s.questionIds.length} soal · {fmtDate(s.updatedAt)}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
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
