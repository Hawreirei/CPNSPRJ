import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { decodeLinkData, parseShared, type SharedSet } from '../domain/share';
import { importShared, previewImport } from '../engine/share';
import { errorText } from '../engine/storage';
import { logError } from '../lib/errorLog';

type Preview = Awaited<ReturnType<typeof previewImport>>;
type Loaded = { shared: SharedSet; preview: Preview } | { error: string };

/** Read and check a shared set; nothing is stored. */
async function read(raw: () => Promise<unknown>): Promise<Loaded> {
  try {
    const shared = parseShared(await raw());
    return { shared, preview: await previewImport(shared) };
  } catch (e) {
    void logError('import', e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Import a set someone shared: from a link (#/import?d=…) or a file. Nothing is stored before "Impor". */
export default function ImportSet() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const d = params.get('d');
  const [shared, setShared] = useState<SharedSet | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function show(r: Loaded) {
    setError('error' in r ? r.error : '');
    setShared('shared' in r ? r.shared : null);
    setPreview('preview' in r ? r.preview : null);
  }

  useEffect(() => {
    if (!d) return;
    let live = true;
    void read(() => decodeLinkData(d)).then((r) => live && show(r));
    return () => {
      live = false;
    };
  }, [d]);

  async function confirm() {
    if (!shared) return;
    setBusy(true);
    try {
      const set = await importShared(shared);
      nav(`/sets/${set.id}`, { replace: true });
    } catch (e) {
      void logError('import', e);
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1>Impor set</h1>
      {!d && (
        <div className="card space-y-2">
          <label className="label" htmlFor="import-file">
            Pilih berkas set (.cpnsset.json)
          </label>
          <input
            id="import-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f)
                void read(async () => {
                  try {
                    return JSON.parse(await f.text());
                  } catch {
                    throw new Error('Berkas bukan JSON yang valid.');
                  }
                }).then(show);
            }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {preview && (
        <section className="card space-y-3">
          <h2>{preview.name}</h2>
          <p className="text-sm">
            {preview.total} soal:{' '}
            {Object.entries(preview.perSubtest)
              .filter(([, n]) => n)
              .map(([s, n]) => `${s} ${n}`)
              .join(', ')}
            .{preview.known > 0 && ` ${preview.known} soal sudah ada di Bank Soal Anda dan dipakai ulang, bukan disalin.`}
          </p>
          {preview.newPackages.map((p) => (
            <p key={p.name} className="text-sm">
              Paket ujian <b>{p.name}</b> ikut ditambahkan ke Pengaturan → Paket ujian{p.official ? '' : ' (bukan data resmi)'}, agar soalnya dinilai dengan aturannya.
            </p>
          ))}
          <p className="muted text-sm">
            Soal dari orang lain belum tentu benar. Setelah diimpor, setiap soal diperiksa ulang oleh aplikasi dan ditandai "dari berkas bersama"; periksa dulu yang bertanda "perlu
            dicek".
          </p>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>
              Impor set
            </button>
            <button className="btn" onClick={() => nav('/sets')}>
              Batal
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
