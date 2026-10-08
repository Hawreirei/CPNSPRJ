import { useRef, useState } from 'react';
import { db, saveSettings, useSettings } from '../db';
import { exportBackup, importBackup } from '../db/backup';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import { DEFAULT_PRICES } from '../providers/types';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { downloadBlob } from '../components/ui';

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
        <p className="muted mt-1">Semua angka bisa diubah agar aplikasi tetap relevan bila aturan SKD berubah.</p>
      </div>

      <section className="card space-y-3">
        <h2>Struktur SKD (preset)</h2>
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

      <section className="card space-y-3">
        <h2>Generasi AI</h2>
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

      <section className="card space-y-3">
        <h2>Ekspor & tampilan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Nama lembaga/bimbel di dokumen</label>
            <input className="input" value={s.brandName} onChange={(e) => saveSettings({ brandName: e.target.value })} />
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
        <h2>Cadangan & pemulihan</h2>
        <p className="muted text-sm">Pindahkan set, bank soal, riwayat simulasi, dan pengaturan antar perangkat. API key tidak ikut dicadangkan.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={async () => downloadBlob(await exportBackup(), `skd-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
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
                setMsg(`Dipulihkan: ${r.sets} set, ${r.questions} soal, ${r.attempts} simulasi.`);
              } catch (err) {
                setMsg(`Gagal: ${(err as Error).message}`);
              }
            }}
          />
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </section>

      <section className="card space-y-2 border-red-200 dark:border-red-900">
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
