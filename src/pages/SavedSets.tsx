import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { createVariantSet, deleteSet } from '../engine/sets';
import { startGeneration } from '../engine/generator';
import { Empty } from '../components/ui';
import { StatusBadge } from './Dashboard';
import { subtestsIn } from '../domain/examPackage';
import { fmtDate } from '../lib/format';

const SOURCE_LABEL = { ai: 'AI', bank: 'dari bank', variant: 'varian', remedial: 'topik lemah' } as const;

export default function SavedSets() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().toArray(), []);
  if (!sets) return null;
  const shown = sets.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Set Saya</h1>
          <p className="muted mt-1">Semua set soal yang pernah Anda buat. Tersimpan otomatis di browser ini.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" to="/import">
            Impor set dari berkas
          </Link>
          <Link className="btn btn-primary" to="/new">
            + Buat soal baru
          </Link>
        </div>
      </div>
      <input className="input max-w-sm" placeholder="Cari nama set…" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? (
        <Empty title="Belum ada set">Buat set pertama Anda di halaman Buat Soal.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((s) => {
            const counts = subtestsIn(s.blueprint.sections)
              .map((st) => [st, s.blueprint.sections.find((x) => x.subtest === st)?.count ?? 0] as const)
              .filter(([, n]) => n);
            return (
              <div key={s.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/sets/${s.id}`} className="font-semibold hover:underline">
                    {s.name}
                  </Link>
                  <StatusBadge status={s.status} />
                </div>
                <div className="muted text-xs">
                  {s.questionIds.length} soal ({counts.map(([st, n]) => `${st} ${n}`).join(' · ')}) · {SOURCE_LABEL[s.source]} · {fmtDate(s.updatedAt)}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link className="btn btn-sm" to={`/sets/${s.id}`}>
                    Buka
                  </Link>
                  <Link className={`btn btn-sm ${s.questionIds.length ? '' : 'pointer-events-none opacity-50'}`} to={`/simulation?set=${s.id}`}>
                    Latihan ujian
                  </Link>
                  <button
                    className="btn btn-sm"
                    disabled={!s.questionIds.length}
                    onClick={async () => {
                      const v = await createVariantSet(s);
                      void startGeneration(v.id);
                      nav(`/sets/${v.id}`);
                    }}
                  >
                    Buat set serupa
                  </button>
                  <button
                    className="btn btn-sm btn-danger ml-auto"
                    onClick={async () => {
                      if (!confirm(`Hapus set "${s.name}"?`)) return;
                      const alsoQ = confirm('Hapus juga soalnya dari bank soal? (Batal = simpan soal di bank)');
                      await deleteSet(s.id, alsoQ);
                    }}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
