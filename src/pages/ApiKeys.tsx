import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import type { ApiKeyRecord, ProviderId } from '../domain/types';
import { addKey, deleteKey, providerConfig, refreshKeyModel, setDefaultKey } from '../engine/keys';
import { complete, groupModels, listModels, pickRecommendedModel, PROVIDERS } from '../providers';
import type { ProviderConfig } from '../providers';
import { Badge, fmtDate } from '../components/ui';

async function testConnection(cfg: ProviderConfig): Promise<string> {
  const t = Date.now();
  const res = await complete(cfg, { system: 'Balas hanya dengan JSON.', prompt: 'Balas tepat: {"ok": true}', maxTokens: 4000 });
  return `Berhasil dengan ${cfg.model} (${((Date.now() - t) / 1000).toFixed(1)} dtk, ${res.inputTokens + res.outputTokens} token).`;
}

function ModelPicker({ value, onChange, models, suggestions, disabled }: { value: string; onChange: (m: string) => void; models: string[]; suggestions: string[]; disabled?: boolean }) {
  const groups = groupModels(models);
  if (groups.length) {
    return (
      <select className="input font-mono" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {!models.includes(value) && value && <option value={value}>{value} (tidak ada di daftar akun)</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.ids.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }
  return (
    <>
      <input className="input font-mono" list="model-suggestions" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <datalist id="model-suggestions">
        {suggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}

export default function ApiKeys() {
  const keys = useLiveQuery(() => db.keys.orderBy('provider').toArray(), []);
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState(PROVIDERS.gemini.defaultModel);
  const [autoModel, setAutoModel] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const info = PROVIDERS[provider];
  const cfgFor = (m: string): ProviderConfig => ({ provider, apiKey: apiKey.trim(), model: m, baseUrl: baseUrl.trim() || undefined });
  const ready = !!apiKey.trim() && (!info.needsBaseUrl || !!baseUrl.trim());

  function changeProvider(p: ProviderId) {
    setProvider(p);
    setModel(PROVIDERS[p].defaultModel);
    setModels([]);
    setStatus(null);
  }

  /** Read the account's models and select the newest stable recommended one. */
  async function discover(): Promise<{ model: string; checked: boolean; note: string }> {
    try {
      const list = await listModels(cfgFor(model));
      setModels(list);
      const pick = pickRecommendedModel(list);
      if (pick) {
        setModel(pick);
        return { model: pick, checked: true, note: `${list.length} model ditemukan; dipilih model stabil terbaru: ${pick}.` };
      }
      return { model, checked: true, note: `${list.length} model ditemukan, tetapi tidak ada yang dikenali sebagai model teks stabil. Pilih manual.` };
    } catch (e) {
      return { model, checked: false, note: `Daftar model tidak bisa dibaca (${(e as Error).message}). Memakai ${model}.` };
    }
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
          <div className="sm:col-span-2 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={autoModel} onChange={(e) => setAutoModel(e.target.checked)} />
              <span>
                <b>Pilih model terbaru yang stabil secara otomatis</b> (disarankan). Aplikasi membaca daftar model akun Anda, memilih versi stabil terbaru, mengecek
                ulang tiap minggu, dan otomatis berpindah bila model dihentikan penyedia.
              </span>
            </label>
            <div>
              <label className="label">Model</label>
              <div className="flex gap-2">
                <ModelPicker value={model} onChange={setModel} models={models} suggestions={info.suggestedModels} />
                <button
                  className="btn shrink-0"
                  disabled={busy || !ready}
                  onClick={() =>
                    run(async () => {
                      const r = await discover();
                      setStatus({ ok: r.checked, msg: r.note });
                    })
                  }
                >
                  Muat model
                </button>
              </div>
              <p className="muted mt-1 text-xs">
                {autoModel
                  ? 'Model di atas akan diganti otomatis dengan model stabil terbaru saat key disimpan. Anda tetap bisa memilih manual dengan mematikan opsi otomatis.'
                  : 'Mode manual: model tetap seperti pilihan Anda. Model "preview" bisa berubah atau dihentikan tanpa pemberitahuan.'}
              </p>
            </div>
          </div>
        </div>
        {status && <p className={`text-sm ${status.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{status.msg}</p>}
        <div className="flex gap-2">
          <button
            className="btn"
            disabled={busy || !ready || !model}
            onClick={() =>
              run(async () => {
                const r = autoModel ? await discover() : { model, note: '' };
                setStatus({ ok: true, msg: `${r.note ? r.note + ' ' : ''}${await testConnection(cfgFor(r.model))}` });
              })
            }
          >
            Uji koneksi
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !ready || (!model && !autoModel)}
            onClick={() =>
              run(async () => {
                const r = autoModel ? await discover() : { model, checked: false, note: '' };
                if (!r.model) throw new Error('Pilih model terlebih dahulu.');
                await addKey({ provider, label: label || info.name, apiKey, model: r.model, baseUrl, autoModel, modelCheckedAt: r.checked ? Date.now() : undefined });
                setApiKey('');
                setLabel('');
                setStatus({ ok: true, msg: `Key disimpan (terenkripsi) dengan model ${r.model}.${r.note ? ' ' + r.note : ''}` });
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
        {keys?.map((k) => <KeyRow key={k.id} k={k} />)}
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

function KeyRow({ k }: { k: ApiKeyRecord }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const auto = k.autoModel !== false;

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(`Gagal: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">
            {k.label} {k.isDefault && <Badge tone="blue">default</Badge>}
          </div>
          <div className="muted text-xs">
            {PROVIDERS[k.provider].name} · ditambahkan {fmtDate(k.createdAt)}
            {k.baseUrl && ` · ${k.baseUrl}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {!k.isDefault && (
            <button className="btn btn-sm" onClick={() => setDefaultKey(k.id)}>
              Jadikan default
            </button>
          )}
          <button className="btn btn-sm" disabled={busy} onClick={() => act(async () => testConnection(await providerConfig(k.id)))}>
            Uji
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => confirm(`Hapus key "${k.label}"?`) && deleteKey(k.id)}>
            Hapus
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="muted text-xs">Model:</span>
        {auto ? (
          <span className="font-mono text-xs">{k.model}</span>
        ) : (
          <div className="w-72">
            <ModelPicker value={k.model} models={models} suggestions={PROVIDERS[k.provider].suggestedModels} onChange={(m) => m.trim() && db.keys.update(k.id, { model: m.trim() })} />
          </div>
        )}
        {auto && <Badge tone="green">otomatis</Badge>}
        {k.modelCheckedAt && <span className="muted text-xs">dicek {fmtDate(k.modelCheckedAt)}</span>}
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={() =>
            act(async () => {
              if (!auto) {
                const list = await listModels(await providerConfig(k.id));
                setModels(list);
                return `${list.length} model dimuat. Pilih dari daftar.`;
              }
              const r = await refreshKeyModel(k.id);
              return r.changed ? `Model diperbarui ke ${r.model}.` : `Sudah memakai model stabil terbaru (${r.model}).`;
            })
          }
        >
          {auto ? 'Perbarui model' : 'Muat daftar model'}
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs">
          <input type="checkbox" checked={auto} onChange={(e) => db.keys.update(k.id, { autoModel: e.target.checked })} />
          otomatis
        </label>
      </div>
      {msg && <div className="text-xs">{msg}</div>}
    </div>
  );
}
