import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, saveSettings, useSettings } from '../db';
import { getBackupState, importBackup } from '../db/backup';
import { fmtAgo } from '../domain/backupReminder';
import { CrossCheckEditor } from '../components/CrossCheckEditor';
import { StudyPlanEditor } from '../components/StudyPlanEditor';
import { autoBackupNow, chooseBackupFile, downloadBackup, isAutoBackupSupported, stopAutoBackup } from '../lib/autoBackup';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import { DEFAULT_PRICES } from '../providers/types';
import { getTheme, setTheme, type Theme } from '../lib/theme';

export default function SettingsPage() {
  const s = useSettings();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);
  const prices = { ...DEFAULT_PRICES, ...s.priceOverrides };

  return (
    <div className="space-y-6">
      <div>
        <h1>Pengaturan</h1>
      </div>

      <section className="card space-y-3">
        <h2>Tampilan & kop dokumen</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="brand-name">
              Nama lembaga/bimbel (tampil di file unduhan)
            </label>
            <input id="brand-name" className="input" value={s.brandName} onChange={(e) => saveSettings({ brandName: e.target.value })} />
          </div>
          <div>
            <label className="label">Logo (PNG/JPG, maks 300 KB)</label>
            <div className="flex items-center gap-2">
              {s.brandLogo && <img src={s.brandLogo} alt="Logo" className="h-8" />}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 300_000) return setMsg('Logo terlalu besar (maks 300 KB).');
                  const r = new FileReader();
                  r.onload = () => saveSettings({ brandLogo: String(r.result) });
                  r.readAsDataURL(f);
                }}
              />
              {s.brandLogo && (
                <button className="btn btn-sm" onClick={() => saveSettings({ brandLogo: undefined })}>
                  Hapus
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="label">Tema</label>
            <select
              className="input"
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as Theme);
                setThemeState(e.target.value as Theme);
              }}
            >
              <option value="system">Ikuti sistem</option>
              <option value="light">Terang</option>
              <option value="dark">Gelap</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2>Rencana belajar</h2>
        <StudyPlanEditor settings={s} />
      </section>

      <section className="card space-y-3">
        <h2>Pemeriksa silang (opsional)</h2>
        <CrossCheckEditor settings={s} />
      </section>

      <section className="card space-y-3">
        <h2>Cadangan data</h2>
        <p className="muted text-sm">Simpan semua set, bank soal, riwayat latihan, dan Buku Kesalahan ke satu file, lalu pulihkan di perangkat lain. API key tidak ikut tersimpan.</p>
        <LastBackup />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void downloadBackup()}>
            Unduh cadangan
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Pulihkan dari file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = await importBackup(f);
                setMsg(`Dipulihkan: ${r.sets} set, ${r.questions} soal, ${r.attempts} simulasi, ${r.reviews} catatan Buku Kesalahan.`);
              } catch (err) {
                setMsg(`Gagal: ${(err as Error).message}`);
              }
            }}
          />
        </div>
        {msg && <p className="text-sm">{msg}</p>}
        <AutoBackupPanel />
        <p className="muted text-xs">Berkas cadangan tidak dienkripsi dan berisi riwayat belajar Anda. Simpan di tempat yang aman.</p>
      </section>

      <details className="card">
        <summary className="cursor-pointer font-medium">Pengaturan lanjutan</summary>
        <p className="muted mt-1 text-xs">Biasanya tidak perlu diubah.</p>
        <div className="mt-4 space-y-6">
        <section className="space-y-3">
          <h2>Jumlah soal & nilai minimal lulus</h2>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pr-4">Sub-tes</th>
                  <th className="pr-4">Jumlah soal</th>
                  <th className="pr-4">Skor maks.</th>
                  <th>Ambang batas</th>
                </tr>
              </thead>
              <tbody>
                {SUBTESTS.map((st) => (
                  <tr key={st}>
                    <td className="py-1 pr-4 font-medium">{st}</td>
                    <td className="pr-4">
                      <input type="number" className="input w-24" value={s.counts[st]} onChange={(e) => saveSettings({ counts: { ...s.counts, [st]: num(e.target.value, 1) } })} />
                    </td>
                    <td className="pr-4 tabular-nums">{s.counts[st] * 5}</td>
                    <td>
                      <input type="number" className="input w-24" value={s.passing[st]} onChange={(e) => saveSettings({ passing: { ...s.passing, [st]: num(e.target.value) } })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Durasi SKD penuh (menit)</label>
              <input type="number" className="input w-28" value={s.durationMinutes} onChange={(e) => saveSettings({ durationMinutes: num(e.target.value, 1) })} />
            </div>
            <button
              className="btn"
              onClick={() => saveSettings({ counts: DEFAULT_SETTINGS.counts, passing: DEFAULT_SETTINGS.passing, durationMinutes: DEFAULT_SETTINGS.durationMinutes })}
            >
              Kembalikan default
            </button>
          </div>
          <p className="muted text-xs">
            Ambang batas berbeda per tahun dan formasi. Cocokkan dengan pengumuman resmi KemenPANRB/BKN terbaru. Perubahan berlaku untuk set baru.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Buku Kesalahan</h2>
          <div>
            <label className="label" htmlFor="review-limit">
              Batas ulangan per hari
            </label>
            <input
              id="review-limit"
              type="number"
              min={1}
              max={200}
              className="input w-28"
              value={s.reviewDailyLimit}
              onChange={(e) => saveSettings({ reviewDailyLimit: Math.min(200, num(e.target.value, 1)) })}
            />
          </div>
          <p className="muted text-xs">Jumlah soal yang ditawarkan untuk diulang setiap hari. Sisa soal yang jatuh tempo menunggu hari berikutnya.</p>
        </section>

        <section className="space-y-3">
          <h2>Pembuatan soal oleh AI</h2>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="label">Soal per request</label>
              <input
                type="number"
                min={3}
                max={25}
                className="input w-28"
                value={s.questionsPerRequest}
                onChange={(e) => saveSettings({ questionsPerRequest: Math.min(25, num(e.target.value, 3)) })}
              />
            </div>
            <div>
              <label className="label">Permintaan paralel</label>
              <input type="number" min={1} max={4} className="input w-28" value={s.concurrency} onChange={(e) => saveSettings({ concurrency: Math.min(4, num(e.target.value, 1)) })} />
            </div>
          </div>
          <p className="muted text-xs">
            Makin banyak soal per request, makin sedikit request yang dipakai. Ini penting untuk free tier: dengan 20 soal per request, SKD lengkap butuh sekitar 7
            request. Bila respons sering terpotong, turunkan ke 10–15. Untuk key dengan batas per menit, permintaan selalu dijalankan satu per satu.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Harga model untuk perkiraan biaya (USD per 1 juta token)</summary>
            <table className="mt-2 text-sm">
              <tbody>
                {Object.entries(prices).map(([m, p]) => (
                  <tr key={m}>
                    <td className="pr-3 font-mono text-xs">{m}</td>
                    {(['input', 'output'] as const).map((k) => (
                      <td key={k} className="py-0.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          className="input w-24"
                          value={p[k]}
                          aria-label={`${m} ${k}`}
                          onChange={(e) => saveSettings({ priceOverrides: { ...s.priceOverrides, [m]: { ...p, [k]: num(e.target.value) } } })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <AddPrice onAdd={(m) => saveSettings({ priceOverrides: { ...s.priceOverrides, [m]: { input: 1, output: 4 } } })} />
          </details>
        </section>

        <section className="space-y-2 rounded-lg border border-red-200 p-3 dark:border-red-900">
          <h2>Hapus semua data</h2>
          <p className="muted text-sm">Menghapus set, bank soal, riwayat, pengaturan, dan API key dari browser ini. Tidak bisa dibatalkan.</p>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm('Hapus SEMUA data? Unduh cadangan dulu bila perlu.')) return;
              await db.delete();
              location.reload();
            }}
          >
            Hapus semua data
          </button>
        </section>
        </div>
      </details>
    </div>
  );
}

function AddPrice({ onAdd }: { onAdd: (model: string) => void }) {
  const [m, setM] = useState('');
  return (
    <div className="mt-2 flex gap-2">
      <input className="input w-60 font-mono text-xs" placeholder="id model lain" value={m} onChange={(e) => setM(e.target.value)} />
      <button
        className="btn btn-sm"
        disabled={!m.trim()}
        onClick={() => {
          onAdd(m.trim());
          setM('');
        }}
      >
        Tambah
      </button>
    </div>
  );
}

function useBackupInfo() {
  // `now` comes with the data so relative times refresh on every change without Date.now() during render.
  return useLiveQuery(async () => ({ state: await getBackupState(), now: Date.now() }), []);
}

function LastBackup() {
  const info = useBackupInfo();
  if (!info) return null;
  const { state, now } = info;
  return (
    <p className="text-sm">
      {state.lastBackupAt ? (
        <>
          Terakhir dicadangkan: <b>{fmtAgo(state.lastBackupAt, now)}</b> ({state.lastBackupKind === 'auto' ? 'otomatis' : 'unduh manual'})
        </>
      ) : (
        'Belum pernah dicadangkan.'
      )}
    </p>
  );
}

/** Automatic saving to one file the user picks (File System Access API, Chromium desktop only). */
function AutoBackupPanel() {
  const info = useBackupInfo();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!info) return null;
  const { state, now } = info;
  const auto = state.auto;

  const act = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(`Gagal: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="text-sm font-semibold">Simpan otomatis ke berkas</h3>
      {!isAutoBackupSupported() ? (
        <p className="muted text-sm">
          Hanya tersedia di Chrome atau Edge versi desktop. Di browser ini, unduh cadangan secara berkala; aplikasi akan mengingatkan di Beranda.
        </p>
      ) : !auto ? (
        <>
          <p className="muted text-sm">
            Pilih satu berkas sekali saja. Setelah itu setiap perubahan (set baru, hasil ujian, catatan Buku Kesalahan, pengaturan) ditulis ke berkas itu
            beberapa detik kemudian, tanpa klik lagi.
          </p>
          <button className="btn" disabled={busy} onClick={act(chooseBackupFile)}>
            Pilih berkas…
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">
            Aktif: menulis ke <b>{auto.fileName}</b>
            {auto.lastWriteAt ? <> · terakhir {fmtAgo(auto.lastWriteAt, now)}</> : null}
          </p>
          {auto.error && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{auto.error.message}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {auto.error?.kind === 'missing' ? (
              <button className="btn btn-primary" disabled={busy} onClick={act(chooseBackupFile)}>
                Pilih berkas lagi
              </button>
            ) : (
              <button className={`btn ${auto.error ? 'btn-primary' : ''}`} disabled={busy} onClick={act(() => autoBackupNow({ request: true }))}>
                {auto.error?.kind === 'permission' ? 'Izinkan lagi' : 'Simpan sekarang'}
              </button>
            )}
            {auto.error?.kind !== 'missing' && (
              <button className="btn" disabled={busy} onClick={act(chooseBackupFile)}>
                Ganti berkas
              </button>
            )}
            <button className="btn btn-ghost" disabled={busy} onClick={act(stopAutoBackup)}>
              Matikan
            </button>
          </div>
          <p className="muted text-xs">
            Browser bisa meminta izin lagi setelah aplikasi ditutup. Bila muncul pilihan untuk selalu mengizinkan situs ini, pilih itu agar tidak perlu klik
            ulang.
          </p>
        </>
      )}
      {msg && <p className="text-sm text-red-600 dark:text-red-400">{msg}</p>}
    </div>
  );
}
