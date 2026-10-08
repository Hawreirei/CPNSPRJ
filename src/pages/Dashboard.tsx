import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db';
import { Badge, Stat, fmtDate } from '../components/ui';

export default function Dashboard() {
  const data = useLiveQuery(async () => {
    const [sets, questions, keys, attempts] = await Promise.all([
      db.sets.orderBy('updatedAt').reverse().limit(5).toArray(),
      db.questions.count(),
      db.keys.count(),
      db.attempts.orderBy('startedAt').reverse().toArray(),
    ]);
    const setCount = await db.sets.count();
    const flagged = await db.questions.filter((q) => q.flags.some((f) => f.severity === 'warn')).count();
    return { sets, setCount, questions, keys, attempts, flagged };
  });
  if (!data) return null;
  const finished = data.attempts.filter((a) => a.result);
  const last = finished[0];
  const inProgress = data.attempts.find((a) => !a.finishedAt);

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
            <div className="font-semibold">Latihan ujian belum selesai</div>
            <div className="muted">{inProgress.setName}</div>
          </div>
          <Link className="btn btn-primary" to={`/cat/${inProgress.id}`}>
            Lanjutkan
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Set tersimpan" value={data.setCount} />
        <Stat label="Soal di bank" value={data.questions} hint={data.flagged ? `${data.flagged} perlu dicek` : undefined} />
        <Stat label="Latihan selesai" value={finished.length} />
        <Stat
          label="Skor terakhir"
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
