import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import type { ProviderId } from '../domain/types';
import { addKey, deleteKey, providerConfig, setDefaultKey } from '../engine/keys';
import { complete, listModels, pickEfficientModel, PROVIDERS } from '../providers';
import type { ProviderConfig } from '../providers';
import { Badge, fmtDate } from '../components/ui';

async function testConnection(cfg: ProviderConfig): Promise<string> {
  const t = Date.now();
  const res = await complete(cfg, { system: 'Balas hanya dengan JSON.', prompt: 'Balas tepat: {"ok": true}', maxTokens: 2000 });
  return `Berhasil (${((Date.now() - t) / 1000).toFixed(1)} dtk, ${res.inputTokens + res.outputTokens} token).`;
}

export default function ApiKeys() {
  const keys = useLiveQuery(() => db.keys.orderBy('provider').toArray(), []);
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState(PROVIDERS.gemini.defaultModel);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowStatus, setRowStatus] = useState<Record<string, string>>({});
  const info = PROVIDERS[provider];
  const cfg: ProviderConfig = { provider, apiKey: apiKey.trim(), model, baseUrl: baseUrl.trim() || undefined };

  function changeProvider(p: ProviderId) {
    setProvider(p);
    setModel(PROVIDERS[p].defaultModel);
    setModels([]);
    setStatus(null);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>API Keys</h1>
        <p className="muted mt-1">
          Bawa API key Anda sendiri. Permintaan dikirim langsung dari browser Anda ke penyedia AI; tidak ada server perantara dan pengembang tidak menanggung atau
          melihat biaya Anda.
        </p>
      </div>

      <div className="card space-y-3">
        <h2>Tambah key</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Penyedia</label>
            <select className="input" value={provider} onChange={(e) => changeProvider(e.target.value as ProviderId)}>
              {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Nama (opsional)</label>
            <input className="input" placeholder={`${info.name} pribadi`} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">
              API key ·{' '}
              <a className="text-brand-600 underline" href={info.keyUrl} target="_blank" rel="noreferrer">
                dapatkan key
              </a>
            </label>
            <input className="input font-mono" type="password" autoComplete="off" placeholder={info.keyHint} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          {info.needsBaseUrl && (
            <div className="sm:col-span-2">
              <label className="label">Base URL (endpoint yang berakhiran /v1)</label>
              <input className="input font-mono" placeholder="https://openrouter.ai/api/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="label">Model</label>
            <div className="flex gap-2">
              <input className="input font-mono" list="model-list" value={model} onChange={(e) => setModel(e.target.value)} />
              <datalist id="model-list">
                {[...new Set([...info.suggestedModels, ...models])].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                className="btn shrink-0"
                disabled={busy || !apiKey || (info.needsBaseUrl && !baseUrl)}
                onClick={() =>
                  run(async () => {
                    const list = await listModels(cfg);
                    setModels(list);
                    const pick = pickEfficientModel(info, list);
                    if (pick) setModel(pick);
                    setStatus({ ok: true, msg: `${list.length} model ditemukan.${pick ? ` Dipilih model hemat: ${pick}.` : ''}` });
                  })
                }
              >
                Muat model
              </button>
            </div>
            <p className="muted mt-1 text-xs">Default memakai model yang hemat biaya. Klik "Muat model" untuk memilih otomatis dari daftar model akun Anda.</p>
          </div>
        </div>
        {status && <p className={`text-sm ${status.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{status.msg}</p>}
        <div className="flex gap-2">
          <button className="btn" disabled={busy || !apiKey || !model} onClick={() => run(async () => setStatus({ ok: true, msg: await testConnection(cfg) }))}>
            Uji koneksi
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !apiKey || !model || (info.needsBaseUrl && !baseUrl)}
            onClick={() =>
              run(async () => {
                await addKey({ provider, label: label || info.name, apiKey, model, baseUrl });
                setApiKey('');
                setLabel('');
                setStatus({ ok: true, msg: 'Key disimpan (terenkripsi).' });
              })
            }
          >
            Simpan key
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <h2>Key tersimpan</h2>
        {!keys?.length && <p className="muted">Belum ada key.</p>}
        {keys?.map((k) => (
          <div key={k.id} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {k.label} {k.isDefault && <Badge tone="blue">default</Badge>}
              </div>
              <div className="muted text-xs">
                {PROVIDERS[k.provider].name} · ditambahkan {fmtDate(k.createdAt)}
                {k.baseUrl && ` · ${k.baseUrl}`}
              </div>
              {rowStatus[k.id] && <div className="mt-1 text-xs">{rowStatus[k.id]}</div>}
            </div>
            <input
              className="input w-52 font-mono text-xs"
              list={`models-${k.id}`}
              defaultValue={k.model}
              onBlur={(e) => e.target.value.trim() && db.keys.update(k.id, { model: e.target.value.trim() })}
              aria-label="Model"
            />
            <datalist id={`models-${k.id}`}>
              {PROVIDERS[k.provider].suggestedModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="flex gap-1">
              {!k.isDefault && (
                <button className="btn btn-sm" onClick={() => setDefaultKey(k.id)}>
                  Jadikan default
                </button>
              )}
              <button
                className="btn btn-sm"
                onClick={async () => {
                  setRowStatus((s) => ({ ...s, [k.id]: 'Menguji…' }));
                  try {
                    const msg = await testConnection(await providerConfig(k.id));
                    setRowStatus((s) => ({ ...s, [k.id]: msg }));
                  } catch (e) {
                    setRowStatus((s) => ({ ...s, [k.id]: `Gagal: ${(e as Error).message}` }));
                  }
                }}
              >
                Uji
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => confirm(`Hapus key "${k.label}"?`) && deleteKey(k.id)}>
                Hapus
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="card text-sm">
        <h2 className="mb-2">Keamanan key</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
          <li>Key dienkripsi AES-GCM dengan kunci perangkat yang tidak dapat diekspor, dan hanya tersimpan di browser ini.</li>
          <li>Key tidak ikut dalam file cadangan. Di perangkat lain, tambahkan key lagi.</li>
          <li>Enkripsi melindungi dari pembacaan data tersimpan, bukan dari ekstensi browser berbahaya. Gunakan browser tepercaya.</li>
          <li>Sebaiknya buat key khusus untuk aplikasi ini dan pasang batas pengeluaran di dasbor penyedia.</li>
        </ul>
      </section>
    </div>
  );
}
