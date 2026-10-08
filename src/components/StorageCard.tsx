import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cleanupPreview, cleanupStorage, fmtBytes, getStorageInfo, STALE_ATTEMPT_DAYS, type Cleanup } from '../engine/storage';
import { downloadBackup } from '../lib/autoBackup';
import { ProgressBar } from './ui';

type Info = Awaited<ReturnType<typeof getStorageInfo>>;

/** Settings: how full storage is, whether the browser keeps it, and a safe clean-up. */
export function StorageCard() {
  const [info, setInfo] = useState<Info | null>(null);
  const [preview, setPreview] = useState<Cleanup | null>(null);
  const [msg, setMsg] = useState('');

  const refresh = () => void getStorageInfo().then(setInfo);
  useEffect(refresh, []);

  async function clean() {
    const r = await cleanupStorage();
    setPreview(null);
    setMsg(`Dibersihkan: ${r.requests} log permintaan dan ${r.attempts} percobaan belum selesai (± ${fmtBytes(r.bytes)}).`);
    refresh();
  }

  const s = info?.status;
  return (
    <div className="space-y-3">
      {!info ? null : s ? (
        <div className="space-y-1">
          <p className="text-sm">
            Terpakai <b>{fmtBytes(s.usage)}</b> dari {fmtBytes(s.quota)} ({Math.round(s.ratio * 100)}%)
          </p>
          <ProgressBar value={s.usage} max={s.quota} tone={s.warn ? 'red' : 'brand'} />
        </div>
      ) : (
        <p className="muted text-sm">Browser ini tidak memberi tahu sisa ruang penyimpanan.</p>
      )}
      {info && info.persisted !== null && (
        <p className="muted text-sm">
          {info.persisted
            ? 'Penyimpanan persisten: browser tidak akan menghapus data ini sendiri saat ruang disk menipis.'
            : 'Penyimpanan belum persisten: bila ruang disk menipis, browser boleh menghapus data aplikasi ini. Unduh cadangan secara berkala.'}
        </p>
      )}

      {!preview ? (
        <button className="btn" onClick={() => void cleanupPreview().then(setPreview)}>
          Periksa data lama
        </button>
      ) : preview.requests + preview.attempts === 0 ? (
        <p className="text-sm">Tidak ada data lama yang bisa dibersihkan.</p>
      ) : (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <p>
            Bisa dihapus: {preview.requests} log permintaan AI yang sudah lebih dari 2 hari dan {preview.attempts} percobaan yang belum selesai lebih dari{' '}
            {STALE_ATTEMPT_DAYS} hari, sekitar {fmtBytes(preview.bytes)}. Set, soal, riwayat ujian yang selesai, dan Buku Kesalahan tidak disentuh.
          </p>
          <p className="muted">Sebaiknya unduh cadangan dulu.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => void downloadBackup()}>
              Unduh cadangan
            </button>
            <button className="btn btn-primary" onClick={() => void clean()}>
              Bersihkan (± {fmtBytes(preview.bytes)})
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>
              Batal
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}

/** Dashboard: a warning only when storage is nearly full. */
export function StorageWarningCard() {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => void getStorageInfo().then(setInfo), []);
  const s = info?.status;
  if (!s?.warn) return null;
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-500">
      <div className="text-sm">
        <div className="font-semibold">Penyimpanan hampir penuh ({Math.round(s.ratio * 100)}%)</div>
        <div className="muted">Bila penuh, soal dan jawaban baru tidak bisa disimpan. Unduh cadangan, lalu bersihkan data lama.</div>
      </div>
      <Link className="btn" to="/settings">
        Buka Penyimpanan
      </Link>
    </div>
  );
}
