import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../db';
import { SUBTESTS } from '../domain/types';
import { startAttempt } from '../engine/attempts';
import { Badge, Empty, fmtDate } from '../components/ui';

export default function SimulationHome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().filter((s) => s.questionIds.length > 0).toArray(), []);
  const attempts = useLiveQuery(() => db.attempts.orderBy('startedAt').reverse().limit(20).toArray(), []);
  const [setId, setSetId] = useState(params.get('set') ?? '');
  const [shuffleQ, setShuffleQ] = useState(false);
  const [duration, setDuration] = useState<number | ''>('');

  const set = sets?.find((s) => s.id === setId);
  useEffect(() => {
    if (!setId && sets?.length) setSetId(sets[0].id);
  }, [sets, setId]);
  useEffect(() => {
    if (set) setDuration(set.blueprint.durationMinutes);
  }, [set]);

  if (!sets || !attempts) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1>Latihan Ujian</h1>
        <p className="muted mt-1">Kerjakan soal seperti ujian CAT sungguhan: ada batas waktu, nomor soal, tanda ragu-ragu, dan nilai langsung keluar.</p>
      </div>
      {sets.length === 0 ? (
        <Empty title="Belum ada set berisi soal">
          <Link className="text-brand-600 underline" to="/new">
            Buat set dulu
          </Link>
        </Empty>
      ) : (
        <div className="card space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label className="label">Pilih set</label>
              <select className="input" value={setId} onChange={(e) => setSetId(e.target.value)}>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.questionIds.length} soal)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Durasi (menit)</label>
              <input type="number" min={1} className="input" value={duration} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')} />
            </div>
          </div>
          {set && (
            <div className="flex flex-wrap gap-2 text-sm">
              {SUBTESTS.map((s) => {
                const sec = set.blueprint.sections.find((x) => x.subtest === s);
                return sec ? (
                  <Badge key={s}>
                    {s}: ambang {set.blueprint.passing[s]}
                  </Badge>
                ) : null;
              })}
              {set.status !== 'ready' && <Badge tone="amber">set belum lengkap</Badge>}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} />
            Acak urutan soal di dalam tiap sub-tes
          </label>
          <ul className="muted list-disc space-y-1 pl-5 text-xs">
            <li>Waktu tetap berjalan walau tab ditutup, seperti ujian sungguhan. Jawaban tersimpan otomatis.</li>
            <li>Penilaian: TWK/TIU benar 5, salah/kosong 0; TKP 1–5 per opsi. Ambang batas disesuaikan proporsional untuk set yang tidak penuh.</li>
          </ul>
          <button
            className="btn btn-primary"
            disabled={!set || !duration}
            onClick={async () => {
              const a = await startAttempt(setId, { shuffleQuestions: shuffleQ, durationMinutes: Number(duration) });
              nav(`/cat/${a.id}`);
            }}
          >
            Mulai latihan
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-2">Riwayat</h2>
        {attempts.length === 0 ? (
          <p className="muted">Belum ada simulasi.</p>
        ) : (
          <div className="grid gap-2">
            {attempts.map((a) => (
              <Link key={a.id} to={a.result ? `/results/${a.id}` : `/cat/${a.id}`} className="card flex items-center justify-between gap-3 hover:border-brand-500">
                <div>
                  <div className="font-medium">{a.setName}</div>
                  <div className="muted text-xs">{fmtDate(a.startedAt)}</div>
                </div>
                {a.result ? (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {a.result.total}/{a.result.maxTotal}
                    </span>
                    <Badge tone={a.result.passedAll ? 'green' : 'red'}>{a.result.passedAll ? 'lulus' : 'belum lulus'}</Badge>
                  </div>
                ) : (
                  <Badge tone="amber">lanjutkan</Badge>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
