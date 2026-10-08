import { useEffect, useState } from 'react';
import { COPYRIGHT_SHARE, encodeLinkData, LINK_PREFIX, MAX_LINK, MAX_QR_LINK } from '../domain/share';
import { sharedSetOf } from '../engine/share';
import { downloadBlob, Modal } from './ui';

/** Dark modules of a QR code as one SVG path (drawn here, so no library markup reaches the page). */
async function qrPath(text: string): Promise<{ d: string; size: number }> {
  const qrcode = (await import('qrcode-generator')).default;
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return { d, size: n + 8 };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'set';

/** Share a set as a file, a link, or a QR code of that link. Loaded only when opened. */
export default function ShareDialog({ setId, name, onClose }: { setId: string; name: string; onClose: () => void }) {
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeImported, setIncludeImported] = useState(false);
  const [imported, setImported] = useState(0);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<{ d: string; size: number } | null>(null);
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const { shared, imported } = await sharedSetOf(setId, { includeNotes, includeImported });
      if (!live) return;
      setImported(imported);
      setCount(shared.questions.length);
      if (!shared.questions.length) return setLink('');
      const url = `${location.origin}${location.pathname}${LINK_PREFIX}${await encodeLinkData(shared)}`;
      if (!live) return;
      setLink(url);
      setQr(url.length <= MAX_QR_LINK ? await qrPath(url) : null);
    })();
    return () => {
      live = false;
    };
  }, [setId, includeNotes, includeImported]);

  async function downloadFile() {
    const { shared } = await sharedSetOf(setId, { includeNotes, includeImported });
    downloadBlob(new Blob([JSON.stringify(shared)], { type: 'application/json' }), `${slug(name)}.cpnsset.json`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link!);
      setMsg('Tautan disalin.');
    } catch {
      setMsg('Tidak bisa menyalin otomatis. Pilih tautannya lalu salin.');
    }
  }

  const fits = !!link && link.length <= MAX_LINK;
  return (
    <Modal open onClose={onClose} title="Bagikan set">
      <div className="space-y-4">
        <p className="muted text-sm">
          Penerima bisa mengimpor set ini tanpa akun. Yang ikut: nama set, susunannya, dan soal beserta kunci dan pembahasannya. Yang tidak ikut: API key, riwayat ujian, Buku
          Kesalahan, nilai, dan laporan Anda.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
          Sertakan catatan saya pada soal
        </label>
        {imported > 0 && (
          <div className="space-y-1 rounded-lg border border-amber-300 p-3 text-sm dark:border-amber-800">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeImported} onChange={(e) => setIncludeImported(e.target.checked)} />
              Sertakan {imported} soal hasil impor dari foto/PDF
            </label>
            <p className="muted text-xs">{COPYRIGHT_SHARE}</p>
          </div>
        )}
        {link === '' ? (
          <p className="text-sm">Semua soal di set ini hasil impor dari foto/PDF. Centang pilihan di atas bila Anda berhak membagikannya.</p>
        ) : (
          <button className="btn btn-primary" onClick={() => void downloadFile()}>
            Unduh berkas (.cpnsset.json)
          </button>
        )}

        {link !== '' && (
          <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className="label">Tautan</div>
            {!link ? (
              <p className="muted text-sm">Menyiapkan tautan…</p>
            ) : fits ? (
              <>
                <div className="flex gap-2">
                  <input aria-label="Tautan set" className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
                  <button className="btn shrink-0" onClick={() => void copy()}>
                    Salin tautan
                  </button>
                </div>
                {msg && (
                  <p role="status" className="text-sm">
                    {msg}
                  </p>
                )}
                {qr ? (
                  <svg role="img" aria-label="Kode QR tautan set" viewBox={`0 0 ${qr.size} ${qr.size}`} className="h-56 w-56 bg-white" shapeRendering="crispEdges">
                    <path d={qr.d} fill="#000" />
                  </svg>
                ) : (
                  <p className="muted text-sm">Set ini terlalu besar untuk kode QR; bagikan tautan atau berkasnya.</p>
                )}
                <p className="muted text-xs">
                  Isi set ada di tautan setelah tanda #. Bagian itu tidak pernah dikirim ke server mana pun, hanya dibaca oleh aplikasi di browser penerima.
                </p>
              </>
            ) : (
              <p className="text-sm">Set ini ({count} soal) terlalu besar untuk tautan. Bagikan berkasnya.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
