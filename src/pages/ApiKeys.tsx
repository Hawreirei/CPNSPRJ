import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db';
import type { ApiKeyRecord, KeyLimits, ModelInfo, ProviderId } from '../domain/types';
import { addKey, chooseKeyModel, deleteKey, loadKeyModels, providerConfig, refreshKeyModel, refreshStaleKeyModels, setDefaultKey, useAutoModel } from '../engine/keys';
import { ModelSelect } from '../components/ModelSelect';
import { clearQuotaBlock, defaultLimits, keyUsage, LIMIT_PRESETS, limitsOf, releaseRequest, reserveRequest } from '../engine/quota';
import { complete, isModelUnavailable, listModelInfo, pickRecommendedModel, ProviderError, PROVIDERS, suggestedReplacement } from '../providers';
import type { ProviderConfig } from '../providers';
import { Badge, fmtDate } from '../components/ui';

async function testConnection(cfg: ProviderConfig): Promise<string> {
  const t = Date.now();
  const res = await complete(cfg, { system: 'Balas hanya dengan JSON.', prompt: 'Balas tepat: {"ok": true}', maxTokens: 4000 });
  return `Berhasil dengan ${cfg.model} (${((Date.now() - t) / 1000).toFixed(1)} dtk, ${res.inputTokens + res.outputTokens} token).`;
}

function LimitsEditor({ value, onChange }: { value: KeyLimits; onChange: (l: KeyLimits) => void }) {
  const preset = LIMIT_PRESETS.find((p) => p.limits.rpm === value.rpm && p.limits.tpm === value.tpm && p.limits.rpd === value.rpd)?.id ?? 'custom';
  const field = (k: keyof KeyLimits, labelText: string) => (
    <label className="text-xs">
      <span className="label">{labelText}</span>
      <input
        type="number"
        min={0}
        className="input w-28"
        value={value[k]}
        onChange={(e) => onChange({ ...value, [k]: Math.max(0, Number(e.target.value) || 0) })}
      />
    </label>
  );
  return (
    <div className="space-y-2">
      <select
        className="input"
        value={preset}
        onChange={(e) => {
          const p = LIMIT_PRESETS.find((x) => x.id === e.target.value);
          if (p) onChange({ ...p.limits });
        }}
      >
        {LIMIT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="custom">Kustom</option>
      </select>
      <div className="flex flex-wrap gap-2">
        {field('rpm', 'Request / menit')}
        {field('tpm', 'Token input / menit')}
        {field('rpd', 'Request / hari')}
      </div>
      <p className="muted text-xs">Isi sesuai halaman batas kuota di dasbor penyedia (0 = tanpa batas). Aplikasi tidak akan mengirim lebih dari batas ini.</p>
    </div>
  );
}

export default function ApiKeys() {
  const keys = useLiveQuery(() => db.keys.orderBy('provider').toArray(), []);
  // Bring old keys (e.g. still on a retired model) up to date as soon as this page opens.
  useEffect(() => {
    void refreshStaleKeyModels();
  }, []);
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState(PROVIDERS.gemini.defaultModel);
  const [autoModel, setAutoModel] = useState(true);
  const [limits, setLimits] = useState<KeyLimits>(defaultLimits('gemini'));
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsAt, setModelsAt] = useState<number | undefined>();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const info = PROVIDERS[provider];
  const cfgFor = (m: string): ProviderConfig => ({ provider, apiKey: apiKey.trim(), model: m, baseUrl: baseUrl.trim() || undefined });
  const ready = !!apiKey.trim() && (!info.needsBaseUrl || !!baseUrl.trim());

  function changeProvider(p: ProviderId) {
    setProvider(p);
    setModel(PROVIDERS[p].defaultModel);
    setLimits(defaultLimits(p));
    setModels([]);
    setStatus(null);
  }

  /** Read the account's models; in automatic mode also select the newest stable recommended one. */
  async function discover(): Promise<{ model: string; checked: boolean; note: string }> {
    try {
      const list = await listModelInfo(cfgFor(model));
      setModels(list);
      setModelsAt(Date.now());
      if (!autoModel) return { model, checked: true, note: `${list.length} model ditemukan.` };
      const pick = pickRecommendedModel(list.map((m) => m.id));
      if (pick) {
        setModel(pick);
        return { model: pick, checked: true, note: `${list.length} model ditemukan; otomatis dipilih model stabil terbaru: ${pick}.` };
      }
      return { model, checked: true, note: `${list.length} model ditemukan, tetapi tidak ada yang dikenali sebagai model teks stabil. Pilih manual.` };
    } catch (e) {
      return { model, checked: false, note: `Daftar model tidak bisa dibaca (${(e as Error).message}). Memakai ${model}.` };
    }
  }

  // Load the model list as soon as a key is typed (listing costs no generation quota).
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      void discover().then((r) => !r.checked && setStatus({ ok: false, msg: r.note }));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, baseUrl, provider]);

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
            <label className="label">
              Model {models.length > 0 && <span className="muted">· {models.length} model tersedia di akun Anda</span>}
            </label>
            <div className="flex gap-2">
              <ModelSelect
                models={models}
                value={autoModel ? null : model}
                autoOption={`Otomatis — model stabil terbaru${models.length && model ? ` (sekarang: ${model})` : ''}`}
                onChange={(c) => {
                  if (c.kind === 'model') {
                    setAutoModel(false);
                    setModel(c.id);
                  } else {
                    setAutoModel(true);
                    const pick = pickRecommendedModel(models.map((m) => m.id));
                    if (pick) setModel(pick);
                  }
                }}
              />
              <button
                className="btn shrink-0"
                disabled={busy || !ready}
                title="Membaca daftar model tidak memakai kuota"
                onClick={() =>
                  run(async () => {
                    const r = await discover();
                    setStatus({ ok: r.checked, msg: r.note });
                  })
                }
              >
                Muat ulang daftar
              </button>
            </div>
            {!models.length && (
              <div>
                <input
                  className="input font-mono"
                  list="model-suggestions"
                  placeholder="atau ketik ID model, misal gemini-3.5-flash"
                  value={autoModel ? '' : model}
                  onChange={(e) => {
                    setAutoModel(!e.target.value);
                    setModel(e.target.value || PROVIDERS[provider].defaultModel);
                  }}
                />
                <datalist id="model-suggestions">
                  {info.suggestedModels.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            )}
            <p className="muted text-xs">
              {autoModel
                ? 'Otomatis: aplikasi memilih model stabil versi terbaru, mengecek ulang tiap minggu, dan berpindah bila model dihentikan penyedia.'
                : 'Manual: model ini dipakai apa adanya dan tidak akan diganti otomatis. Model "preview" bisa berubah atau dihentikan sewaktu-waktu.'}{' '}
              Model juga bisa dipilih per set di halaman Set Baru.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Batas kuota key ini</label>
            <LimitsEditor value={limits} onChange={setLimits} />
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
                try {
                  setStatus({ ok: true, msg: `${r.note ? r.note + ' ' : ''}${await testConnection(cfgFor(r.model))}` });
                } catch (e) {
                  const hint = e instanceof ProviderError && isModelUnavailable(e.status, e.message) ? suggestedReplacement(e.message) : undefined;
                  if (!hint || hint === r.model) throw e;
                  setModel(hint);
                  setStatus({ ok: true, msg: `${r.model} sudah tidak tersedia; diganti ke ${hint}. ${await testConnection(cfgFor(hint))}` });
                }
              })
            }
          >
            Uji koneksi (1 request)
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !ready || (!model && !autoModel)}
            onClick={() =>
              run(async () => {
                const r = autoModel ? await discover() : { model, checked: false, note: '' };
                if (!r.model) throw new Error('Pilih model terlebih dahulu.');
                // Manual choice is saved exactly as picked.
                const rec = await addKey({ provider, label: label || info.name, apiKey, model: r.model, baseUrl, autoModel, modelCheckedAt: r.checked ? Date.now() : undefined, limits });
                if (models.length) await db.keys.update(rec.id, { models, modelsFetchedAt: modelsAt });
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
  const [busy, setBusy] = useState(false);
  const [editLimits, setEditLimits] = useState(false);
  const auto = k.autoModel !== false;
  const usage = useLiveQuery(() => keyUsage(k), [k]);
  const limits = limitsOf(k);

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
          <button
            className="btn btn-sm"
            disabled={busy}
            title="Memakai 1 request dari kuota"
            onClick={() =>
              act(async () => {
                const slot = await reserveRequest(k, 200);
                try {
                  return await testConnection(await providerConfig(k.id));
                } catch (e) {
                  await releaseRequest(slot);
                  if (!(e instanceof ProviderError) || !isModelUnavailable(e.status, e.message)) throw e;
                  // The model was retired: switch (auto keys) or tell the user what to pick (manual keys).
                  const hint = suggestedReplacement(e.message);
                  if (!auto) throw new Error(`Model ${k.model} sudah tidak tersedia.${hint ? ` Penyedia menyarankan ${hint}.` : ''} Pilih model lain di daftar, atau pilih "Otomatis".`);
                  const r = await refreshKeyModel(k.id, { exclude: k.model, hint });
                  if (!r.changed) throw e;
                  const retry = await reserveRequest(k, 200);
                  try {
                    return `Model ${k.model} sudah tidak tersedia; otomatis diganti ke ${r.model}. ${await testConnection(await providerConfig(k.id))}`;
                  } catch (e2) {
                    await releaseRequest(retry);
                    throw e2;
                  }
                }
              })
            }
          >
            Uji
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => confirm(`Hapus key "${k.label}"?`) && deleteKey(k.id)}>
            Hapus
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="muted text-xs">Model:</span>
        <div className="min-w-0 flex-1 sm:max-w-md">
          <ModelSelect
            className="input text-xs"
            models={k.models ?? []}
            value={auto ? null : k.model}
            autoOption={`Otomatis — model stabil terbaru (sekarang: ${k.model})`}
            disabled={busy}
            onChange={(c) =>
              act(async () => {
                if (c.kind === 'model') {
                  await chooseKeyModel(k.id, c.id);
                  return `Model diatur ke ${c.id} (manual, tidak akan diganti otomatis).`;
                }
                const r = await useAutoModel(k.id);
                return `Mode otomatis aktif: ${r.model}.`;
              })
            }
          />
        </div>
        {auto ? <Badge tone="green">otomatis</Badge> : <Badge tone="blue">manual</Badge>}
        <button
          className="btn btn-sm"
          disabled={busy}
          title="Membaca daftar model tidak memakai kuota"
          onClick={() =>
            act(async () => {
              if (auto) {
                const r = await refreshKeyModel(k.id);
                return `${(await db.keys.get(k.id))?.models?.length ?? 0} model dimuat. ${r.changed ? `Model diperbarui ke ${r.model}.` : `Sudah memakai model stabil terbaru (${r.model}).`}`;
              }
              const list = await loadKeyModels(k.id);
              return `${list.length} model dimuat.`;
            })
          }
        >
          Muat ulang daftar
        </button>
        {k.modelsFetchedAt && <span className="muted text-xs">daftar {fmtDate(k.modelsFetchedAt)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="muted">Kuota:</span>
        {usage && limits.rpd ? (
          <Badge tone={usage.remainingToday === 0 || usage.blockedUntil ? 'red' : usage.remainingToday! <= 5 ? 'amber' : 'green'}>
            hari ini {usage.today}/{limits.rpd} request
          </Badge>
        ) : (
          <Badge>tanpa batas harian</Badge>
        )}
        {limits.rpm > 0 && <span className="muted">maks {limits.rpm}/menit</span>}
        {usage && limits.rpd > 0 && (
          <span className="muted">reset {new Date(usage.blockedUntil ?? usage.resetAt).toLocaleString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        )}
        {usage?.blockedUntil && (
          <button className="btn btn-sm" onClick={() => clearQuotaBlock(k.id)} title="Gunakan bila kuota sudah ditambah atau dicatat keliru">
            Buka blokir
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setEditLimits((v) => !v)}>
          {editLimits ? 'Tutup' : 'Ubah batas'}
        </button>
      </div>
      {editLimits && <LimitsEditor value={limits} onChange={(l) => db.keys.update(k.id, { limits: l })} />}
      {msg && <div className="text-xs">{msg}</div>}
    </div>
  );
}
