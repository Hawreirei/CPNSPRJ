import { useState } from 'react';
import type { QSet } from '../domain/types';
import { bundleOf } from '../engine/share';
import { errorText } from '../engine/storage';
import { downloadBlob, safeFileName } from '../lib/download';
import { Modal } from './ui';

/** Put several sets in one file (.cpnsbundle.json), e.g. a pack to sell: the buyer imports it in one go. */
export default function BundleDialog({ sets, onClose }: { sets: QSet[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(sets.filter((s) => s.questionIds.length).map((s) => s.id)));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  }

  async function download() {
    setBusy(true);
    setMsg('');
    try {
      const title = name.trim() || 'Bundel soal';
      const { bundle, skipped } = await bundleOf(
        sets.filter((s) => picked.has(s.id)).map((s) => s.id),
        title,
      );
      downloadBlob(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), `${safeFileName(title)}.cpnsbundle.json`);
      setMsg(`${bundle.sets.length} set diunduh.${skipped.length ? ` Dilewati karena tidak ada soal yang boleh dibagikan: ${skipped.join(', ')}.` : ''}`);
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy(false);
  }

  return (
    <Modal open onClose={onClose} title="Ekspor bundel">
      <div className="space-y-4">
        <p className="muted text-sm">
          Gabungkan beberapa set jadi satu berkas. Penerima memilihnya di Impor set, lalu semua set masuk ke Set Saya dan soalnya ke Bank Soal. Yang ikut sama seperti Bagikan set:
          tanpa API key, riwayat ujian, nilai, dan laporan. Soal hasil impor foto/PDF tidak ikut.
        </p>
        <div>
          <label className="label" htmlFor="bundle-name">
            Nama bundel
          </label>
          <input id="bundle-name" className="input" maxLength={120} placeholder="Bundel Latihan SKD 2026" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <fieldset className="space-y-1">
          <legend className="label">Set yang disertakan ({picked.size})</legend>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {sets.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.has(s.id)} disabled={!s.questionIds.length} onChange={() => toggle(s.id)} />
                {s.name} <span className="muted text-xs">({s.questionIds.length} soal)</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary" disabled={busy || picked.size === 0} onClick={() => void download()}>
          Unduh bundel (.cpnsbundle.json)
        </button>
        {msg && (
          <p role="status" className="text-sm">
            {msg}
          </p>
        )}
      </div>
    </Modal>
  );
}
