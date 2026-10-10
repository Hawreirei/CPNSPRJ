import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { createVariantSet, deleteSet } from '../engine/sets';
import { startGeneration } from '../engine/generator';
import BundleDialog from '../components/BundleDialog';
import { Empty, PageHeader } from '../components/ui';
import { StatusBadge } from './Dashboard';
import { subtestsIn } from '../domain/examPackage';
import { fmtDate } from '../lib/format';

const SOURCE_LABEL = { ai: 'AI', bank: 'dari bank', variant: 'varian', remedial: 'topik lemah' } as const;

export default function SavedSets() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'semua' | 'ready' | 'unfinished'>('semua');
  const [bundling, setBundling] = useState(false);
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().toArray(), []);
  if (!sets) return null;
  const shown = sets.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) && (status === 'semua' || (status === 'ready' ? s.status === 'ready' : s.status !== 'ready')));
  const unfinished = sets.filter((s) => s.status !== 'ready').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Set Saya"
        description={`${sets.length} set soal, tersimpan otomatis di browser ini.`}
        actions={
          <>
            <Link className="btn" to="/import">
              Impor set dari berkas
            </Link>
            <button className="btn" disabled={!sets.some((x) => x.questionIds.length)} onClick={() => setBundling(true)}>
              Ekspor bundel
            </button>
            <Link className="btn btn-primary" to="/new">
              + Buat soal baru
            </Link>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-sm" placeholder="Cari nama set…" aria-label="Cari nama set" value={q} onChange={(e) => setQ(e.target.value)} />
        {unfinished > 0 && (
          <div className="seg" role="group" aria-label="Saring status">
            {(
              [
                ['semua', `Semua (${sets.length})`],
                ['ready', `Siap (${sets.length - unfinished})`],
                ['unfinished', `Belum selesai (${unfinished})`],
              ] as const
            ).map(([id, label]) => (
              <button key={id} aria-pressed={status === id} onClick={() => setStatus(id)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        sets.length ? (
          <Empty title="Tidak ada set yang cocok">Ubah kata pencarian atau saringan status.</Empty>
        ) : (
          <Empty title="Belum ada set">
            Buat set pertama Anda di halaman Buat Soal, atau{' '}
            <Link to="/import" className="underline">
              impor bundel soal
            </Link>{' '}
            yang sudah Anda miliki.
          </Empty>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((s) => {
            const counts = subtestsIn(s.blueprint.sections)
              .map((st) => [st, s.blueprint.sections.find((x) => x.subtest === st)?.count ?? 0] as const)
              .filter(([, n]) => n);
            return (
              <div key={s.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/sets/${s.id}`} className="min-w-0 font-semibold hover:underline">
                    {s.name}
                  </Link>
                  <StatusBadge status={s.status} />
                </div>
                <div className="muted text-xs">
                  {s.questionIds.length} soal ({counts.map(([st, n]) => `${st} ${n}`).join(' · ')}) · {SOURCE_LABEL[s.source]} · {fmtDate(s.updatedAt)}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
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
      {bundling && <BundleDialog sets={sets} onClose={() => setBundling(false)} />}
    </div>
  );
}
