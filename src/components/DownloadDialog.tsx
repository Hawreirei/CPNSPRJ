import { useState } from 'react';
import type { Question } from '../domain/types';
import { exportDocx, type ExportMeta, type PackKind } from '../lib/exportDocx';
import { Modal } from './ui';
import { downloadBlob, safeFileName } from '../lib/download';

const CONTENTS: { id: PackKind; title: string; hint: string }[] = [
  { id: 'soal', title: 'Soal saja', hint: 'Untuk dibagikan ke peserta, tanpa jawaban.' },
  { id: 'soal-kunci', title: 'Soal + kunci jawaban', hint: 'Kunci jawaban di halaman terakhir.' },
  { id: 'lengkap', title: 'Lengkap', hint: 'Soal, kunci jawaban, dan pembahasan.' },
  { id: 'kunci', title: 'Kunci jawaban saja', hint: 'Daftar jawaban dan skor.' },
];

const FILE_SUFFIX: Record<PackKind, string> = {
  soal: 'Soal',
  'soal-kunci': 'Soal dan Kunci',
  lengkap: 'Lengkap',
  kunci: 'Kunci Jawaban',
  pembahasan: 'Pembahasan',
};

/** One simple dialog for downloading questions as PDF or Word. */
export function DownloadDialog({ open, onClose, meta, questions }: { open: boolean; onClose: () => void; meta: ExportMeta; questions: Question[] }) {
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
  const [pack, setPack] = useState<PackKind>('soal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const blob = format === 'pdf' ? await (await import('../lib/exportPdf')).exportPdf(meta, questions, pack) : await exportDocx(meta, questions, pack);
      downloadBlob(blob, `${safeFileName(`${meta.name} - ${FILE_SUFFIX[pack]}`)}.${format}`);
      onClose();
    } catch (e) {
      setError(`Gagal membuat file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Unduh soal">
      <div className="space-y-4">
        <p className="muted text-sm">
          {meta.name} · {questions.length} soal
        </p>

        <div>
          <div className="label">Format file</div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['pdf', 'PDF', 'Siap cetak / dibagikan'],
                ['docx', 'Word', 'Bisa diedit lagi'],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                onClick={() => setFormat(id)}
                className={`rounded-lg border p-3 text-left ${format === id ? 'border-brand-500 bg-brand-50 dark:bg-slate-800' : 'border-slate-300 dark:border-slate-700'}`}
              >
                <div className="font-semibold">{label}</div>
                <div className="muted text-xs">{hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Isi dokumen</div>
          <div className="space-y-1.5">
            {CONTENTS.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 ${pack === c.id ? 'border-brand-500 bg-brand-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <input type="radio" name="pack" className="mt-1" checked={pack === c.id} onChange={() => setPack(c.id)} />
                <span>
                  <span className="block text-sm font-medium">{c.title}</span>
                  <span className="muted block text-xs">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" disabled={busy || !questions.length} onClick={download}>
            {busy ? 'Membuat file…' : `Unduh ${format === 'pdf' ? 'PDF' : 'Word'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
