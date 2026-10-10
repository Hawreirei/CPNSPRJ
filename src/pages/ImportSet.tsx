import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { decodeLinkData, parseSharedFile, type SharedSet } from '../domain/share';
import { importMany, previewImport } from '../engine/share';
import { errorText } from '../engine/storage';
import { logError } from '../lib/errorLog';

type Preview = Awaited<ReturnType<typeof previewImport>>;
type Loaded = { sets: SharedSet[]; previews: Preview[]; bundleName?: string } | { error: string };

/** Read and check shared sets (one file, a bundle, or several files); nothing is stored. */
async function read(raws: (() => Promise<unknown>)[]): Promise<Loaded> {
  try {
    const sets: SharedSet[] = [];
    let bundleName: string | undefined;
    for (const raw of raws) {
      const f = parseSharedFile(await raw());
      sets.push(...f.sets);
      bundleName ??= f.bundleName;
    }
    const previews: Preview[] = [];
    for (const s of sets) previews.push(await previewImport(s));
    return { sets, previews, bundleName };
  } catch (e) {
    void logError('import', e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const readFile = (f: File) => async () => {
  try {
    return JSON.parse(await f.text());
  } catch {
    throw new Error(`Berkas "${f.name}" bukan JSON yang valid.`);
  }
};

/** Import sets someone shared: from a link (#/import?d=…), a file, or a bundle of sets. Nothing is stored before "Impor". */
export default function ImportSet() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const d = params.get('d');
  const [sets, setSets] = useState<SharedSet[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [bundleName, setBundleName] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function show(r: Loaded) {
    setError('error' in r ? r.error : '');
    setSets('sets' in r ? r.sets : []);
    setPreviews('previews' in r ? r.previews : []);
    setBundleName('bundleName' in r ? r.bundleName : undefined);
  }

  useEffect(() => {
    if (!d) return;
    let live = true;
    void read([() => decodeLinkData(d)]).then((r) => live && show(r));
    return () => {
      live = false;
    };
  }, [d]);

  async function confirm() {
    if (!sets.length) return;
    setBusy(true);
    try {
      const done = await importMany(sets);
      nav(done.length === 1 ? `/sets/${done[0].id}` : '/sets', { replace: true });
    } catch (e) {
      void logError('import', e);
      setError(errorText(e));
      setBusy(false);
    }
  }

  const many = previews.length > 1 || !!bundleName;
  const total = previews.reduce((n, p) => n + p.total, 0);
  const known = previews.reduce((n, p) => n + p.known, 0);
  const newPackages = [...new Map(previews.flatMap((p) => p.newPackages).map((p) => [p.name, p])).values()];

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
            multiple
            accept=".json,application/json"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) void read(files.map(readFile)).then(show);
            }}
          />
          <p className="muted text-xs">Bundel soal (.cpnsbundle.json) juga bisa dipilih di sini. Semua set di dalamnya diimpor sekaligus, dan soalnya masuk ke Bank Soal.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {previews.length > 0 && (
        <section className="card space-y-3">
          <h2>{many ? (bundleName ?? `${previews.length} set`) : previews[0].name}</h2>
          {many ? (
            <>
              <p className="text-sm">
                {previews.length} set, {total} soal.
                {known > 0 && ` ${known} soal sudah ada di Bank Soal Anda dan dipakai ulang, bukan disalin.`}
              </p>
              <ul className="space-y-1 text-sm">
                {previews.map((p, i) => (
                  <li key={i}>
                    <b>{p.name}</b>: {p.total} soal (
                    {Object.entries(p.perSubtest)
                      .filter(([, n]) => n)
                      .map(([s, n]) => `${s} ${n}`)
                      .join(', ')}
                    )
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm">
              {previews[0].total} soal:{' '}
              {Object.entries(previews[0].perSubtest)
                .filter(([, n]) => n)
                .map(([s, n]) => `${s} ${n}`)
                .join(', ')}
              .{previews[0].known > 0 && ` ${previews[0].known} soal sudah ada di Bank Soal Anda dan dipakai ulang, bukan disalin.`}
            </p>
          )}
          {newPackages.map((p) => (
            <p key={p.name} className="text-sm">
              Paket ujian <b>{p.name}</b> ikut ditambahkan ke Pengaturan → Paket ujian, agar soalnya dinilai dengan aturannya.
            </p>
          ))}
          <p className="muted text-sm">
            Soal dari orang lain belum tentu benar. Setelah diimpor, setiap soal diperiksa ulang oleh aplikasi dan ditandai "dari berkas bersama"; periksa dulu yang bertanda "perlu
            dicek".
          </p>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>
              {many ? `Impor semua (${previews.length} set)` : 'Impor set'}
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
