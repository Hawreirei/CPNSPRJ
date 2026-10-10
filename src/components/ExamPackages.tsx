import { useState } from 'react';
import { isBuiltIn, isSkd, packages, type ExamPackage } from '../domain/examPackage';
import { packageFile } from '../domain/packageFile';
import type { Settings } from '../domain/types';
import { deletePackage, importPackage } from '../engine/examPackages';
import { errorText } from '../engine/storage';
import { downloadBlob } from '../lib/download';

const rule = (s: ExamPackage['subtests'][number]) => (s.scoring.kind === 'keyed' ? `benar ${s.scoring.correct}, salah 0` : `tiap opsi ${s.scoring.min}–${s.scoring.max}`);

/** Exam packages besides SKD CPNS, added from a file (#37). `settings` re-renders this when they change. */
export function ExamPackages({ settings }: { settings: Settings }) {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  // Built-in packages besides SKD (PPPK), then the learner's imported ones.
  const list = [...packages().filter((p) => isBuiltIn(p) && !isSkd(p)), ...(settings.examPackages ?? [])];
  // A package from a backup whose sub-test ids clash with another is kept but not usable.
  const active = new Set(
    packages()
      .filter((p) => !isBuiltIn(p))
      .map((p) => p.id),
  );

  async function run(fn: () => Promise<string>) {
    setMsg(null);
    try {
      setMsg({ text: await fn() });
    } catch (e) {
      setMsg({ text: errorText(e), error: true });
    }
  }

  return (
    <div className="space-y-3">
      <p className="muted text-sm">CPNS dan PPPK sudah bawaan. Ujian lain ditambahkan dari berkas paket: sub-tes, cara penilaian, jumlah soal, waktu, dan ambang batas.</p>

      {list.map((p) => (
        <div key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-medium">
                {p.name} {isBuiltIn(p) && <span className="muted text-xs font-normal">(bawaan)</span>}
              </div>
              <div className="muted text-xs">
                {p.subtests.length} sub-tes{p.durationMinutes ? ` · ${p.durationMinutes} menit` : ''}
              </div>
              {!isBuiltIn(p) && !active.has(p.id) && <div className="text-xs text-red-600 dark:text-red-400">Tidak aktif: id sub-tesnya sama dengan paket lain.</div>}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-sm" onClick={() => downloadBlob(new Blob([packageFile(p)], { type: 'application/json' }), `paket-${p.id}.json`)}>
                Ekspor
              </button>
              {!isBuiltIn(p) && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    confirm(`Hapus paket "${p.name}"?`) &&
                    void run(async () => {
                      await deletePackage(p.id);
                      return `Paket "${p.name}" dihapus.`;
                    })
                  }
                >
                  Hapus
                </button>
              )}
            </div>
          </div>
          <ul className="mt-2 space-y-0.5 text-xs">
            {p.subtests.map((s) => (
              <li key={s.id}>
                <b>{s.id}</b> {s.name}: {s.count} soal, {rule(s)}, {s.passing === undefined ? 'tanpa ambang batas' : `ambang ${s.passing}`}
                {s.fromJobTitle && ', topik dari nama jabatan'}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div>
        <label className="label" htmlFor="pkg-import">
          Impor paket ujian (.json)
        </label>
        <input
          id="pkg-import"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f)
              void run(async () => {
                const p = await importPackage(await f.text());
                return `Paket "${p.name}" ditambahkan. Pilih di halaman Buat Soal.`;
              });
          }}
        />
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.error ? 'text-red-600 dark:text-red-400' : ''}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
