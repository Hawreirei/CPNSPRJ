import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db';
import type { ApiKeyRecord, KeyLimits, ProviderId } from '../domain/types';
import { addKey, chooseKeyModel, deleteKey, hasSecret, loadKeyModels, providerConfig, refreshKeyModel, refreshStaleKeyModels, setDefaultKey, setSessionSecret, switchToAutoModel } from '../engine/keys';
import { ModelSelect } from '../components/ModelSelect';
import { clearQuotaBlock, defaultLimits, keyUsage, LIMIT_PRESETS, limitsOf, releaseRequest, reserveRequest } from '../engine/quota';
import { complete, isModelUnavailable, listModelInfo, pickRecommendedModel, ProviderError, PROVIDERS, suggestedReplacement } from '../providers';
import type { ProviderConfig } from '../providers';
import { Badge, ProgressBar } from '../components/ui';

const SHORT_NAME: Record<ProviderId, string> = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude', compat: 'Lainnya' };

async function testConnection(cfg: ProviderConfig): Promise<string> {
  const t = Date.now();
  await complete(cfg, { system: 'Balas hanya dengan JSON.', prompt: 'Balas tepat: {"ok": true}', maxTokens: 4000 });
  return `Koneksi berhasil (${cfg.model}, ${((Date.now() - t) / 1000).toFixed(1)} detik).`;
}

const fmtReset = (t: number) => new Date(t).toLocaleString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export default function ApiKeys() {
  const keys = useLiveQuery(async () => (await db.keys.toArray()).sort((a, b) => a.createdAt - b.createdAt), []);
  const [adding, setAdding] = useState(false);

  // Bring old keys (e.g. still on a retired model) up to date as soon as this page opens.
  useEffect(() => {
    void refreshStaleKeyModels();
  }, []);

  if (!keys) return null;
  const showForm = adding || keys.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1>API Keys</h1>
        <p className="muted mt-1">Pakai API key AI milik Anda sendiri. Key hanya disimpan di browser ini, terenkripsi, atau tidak disimpan sama sekali bila Anda memilih "hanya untuk sesi ini".</p>
      </div>

      <ExtensionWarning />

      {keys.map((k) => (
        <KeyCard key={k.id} k={k} single={keys.length === 1} />
      ))}

      {showForm ? (
        <AddKeyForm onDone={() => setAdding(false)} onCancel={keys.length ? () => setAdding(false) : undefined} />
      ) : (
        <button className="btn" onClick={() => setAdding(true)}>
          + Tambah key lain
        </button>
      )}

      <details className="text-sm">
        <summary className="muted cursor-pointer">Tentang keamanan key</summary>
        <ul className="muted mt-2 list-disc space-y-1 pl-5">
          <li>Key dienkripsi dengan kunci perangkat dan hanya tersimpan di browser ini; tidak ikut file cadangan.</li>
          <li>
            Kunci enkripsinya juga ada di perangkat ini, jadi siapa pun yang bisa membuka profil browser ini bisa memakai key yang disimpan. Di komputer
            bersama, pilih "Jangan simpan, hanya untuk sesi ini": key tidak ditulis ke penyimpanan browser dan hilang saat tab ditutup.
          </li>
          <li>Permintaan dikirim langsung dari browser Anda ke penyedia AI, tanpa server perantara.</li>
          <li>Gunakan browser tepercaya, dan pasang batas pengeluaran di dasbor penyedia.</li>
        </ul>
      </details>
    </div>
  );
}

/**
 * Always shown (#48): extensions that can read pages can read the key, saved or session-only, and the
 * app cannot detect them (browsers do not allow it). What helps is limiting what a key can do.
 */
function ExtensionWarning() {
  return (
    <section className="card space-y-2 border-amber-300 text-sm dark:border-amber-800" aria-labelledby="extension-warning">
      <h2 id="extension-warning" className="text-base">
        Ekstensi browser bisa membaca key Anda
      </h2>
      <p>
        Ekstensi yang diizinkan membaca halaman bisa melihat API key di aplikasi ini, baik yang disimpan maupun yang hanya untuk sesi. Aplikasi tidak bisa
        mendeteksi ekstensi seperti itu. Jadi:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Pakai profil browser tanpa ekstensi yang tidak Anda percayai, atau mode "hanya untuk sesi ini" di perangkat bersama.</li>
        <li>
          Batasi apa yang bisa dilakukan key bila sampai bocor:
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
              <li key={p}>
                {SHORT_NAME[p]}: {PROVIDERS[p].limitHelp.text} (
                <a className="text-brand-600 dark:text-brand-300 underline" href={PROVIDERS[p].limitHelp.url} target="_blank" rel="noreferrer">
                  panduan {p === 'compat' ? 'OpenRouter' : SHORT_NAME[p]}
                </a>
                ).
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function AddKeyForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [sessionOnly, setSessionOnly] = useState(false);
  const [limits, setLimits] = useState<KeyLimits>(defaultLimits('gemini'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = PROVIDERS[provider];
  const ready = !!apiKey.trim() && (!info.needsBaseUrl || !!baseUrl.trim());

  function pickProvider(p: ProviderId) {
    setProvider(p);
    setLimits(defaultLimits(p));
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const cfg: ProviderConfig = { provider, apiKey: apiKey.trim(), model: info.defaultModel, baseUrl: baseUrl.trim() || undefined };
      // Reading the model list also checks that the key works, without using any quota.
      let models;
      try {
        models = await listModelInfo(cfg);
      } catch (e) {
        if (e instanceof ProviderError && (e.status === 401 || e.status === 403 || e.status === 400)) throw new Error('API key tidak valid. Periksa lagi key yang Anda tempel.');
        models = undefined;
      }
      const model = (models && pickRecommendedModel(models.map((m) => m.id))) || info.defaultModel;
      if (!model) throw new Error('Tidak ada model yang bisa dipakai. Pilih model secara manual setelah menyimpan.');
      const rec = await addKey({ provider, label: label.trim() || info.name, apiKey, model, baseUrl, autoModel: true, modelCheckedAt: models ? Date.now() : undefined, limits, sessionOnly });
      if (models) await db.keys.update(rec.id, { models, modelsFetchedAt: Date.now() });
      setApiKey('');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2>Tambah API key</h2>

      <div>
        <div className="label">1. Pilih penyedia</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
            <button
              key={p}
              onClick={() => pickProvider(p)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${p === provider ? 'border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 dark:border-slate-700'}`}
            >
              {SHORT_NAME[p]}
            </button>
          ))}
        </div>
        {provider === 'gemini' && <p className="muted mt-1 text-xs">Gemini punya kuota gratis. Cocok untuk mulai.</p>}
      </div>

      <div>
        <div className="label">
          2. Tempel API key ·{' '}
          <a className="text-brand-600 dark:text-brand-300 underline" href={info.keyUrl} target="_blank" rel="noreferrer">
            buat key di sini
          </a>
        </div>
        <p className="muted mb-1 text-xs">
          Setelah membuat key, {info.limitHelp.text} (
          <a className="text-brand-600 dark:text-brand-300 underline" href={info.limitHelp.url} target="_blank" rel="noreferrer">
            caranya
          </a>
          ).
        </p>
        <input
          className="input font-mono"
          aria-label="API key"
          type="password"
          autoComplete="off"
          placeholder={info.keyHint}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ready && !busy && void save()}
        />
      </div>

      {info.needsBaseUrl && (
        <div>
          <label className="label" htmlFor="key-base-url">
            Alamat endpoint (berakhiran /v1)
          </label>
          <input id="key-base-url" className="input font-mono" placeholder="https://openrouter.ai/api/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={sessionOnly} onChange={(e) => setSessionOnly(e.target.checked)} aria-describedby="session-only-help" />
        <span>
          Jangan simpan, hanya untuk sesi ini
          <span id="session-only-help" className="muted block text-xs">
            Key tidak ditulis ke penyimpanan browser dan hilang saat tab ditutup; setelah itu masukkan lagi. Cocok untuk komputer bersama. Ekstensi browser
            yang bisa membaca halaman tetap bisa melihatnya.
          </span>
        </span>
      </label>

      <details>
        <summary className="muted cursor-pointer text-sm">Pengaturan lanjutan (opsional)</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="key-label">
              Nama key
            </label>
            <input id="key-label" className="input" placeholder={info.name} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <div className="label">Batas kuota</div>
            <LimitsEditor value={limits} onChange={setLimits} />
          </div>
        </div>
      </details>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={!ready || busy} onClick={save}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            Batal
          </button>
        )}
      </div>
      <p className="muted text-xs">Model terbaik dipilih otomatis. Anda bisa menggantinya setelah key disimpan.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function KeyCard({ k, single }: { k: ApiKeyRecord; single: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const auto = k.autoModel !== false;
  const usage = useLiveQuery(() => keyUsage(k), [k]);
  const limits = limitsOf(k);
  const [present, setPresent] = useState(() => hasSecret(k));

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const test = () =>
    act(async () => {
      const slot = await reserveRequest(k, 200);
      try {
        return await testConnection(await providerConfig(k.id));
      } catch (e) {
        await releaseRequest(slot);
        if (!(e instanceof ProviderError) || !isModelUnavailable(e.status, e.message)) throw e;
        // The model was retired: switch (automatic mode) or say what to pick (manual choice).
        const hint = suggestedReplacement(e.message);
        if (!auto) throw new Error(`Model ${k.model} sudah tidak tersedia.${hint ? ` Coba ${hint}.` : ''} Pilih model lain di atas.`);
        const r = await refreshKeyModel(k.id, { exclude: k.model, hint });
        if (!r.changed) throw e;
        const retry = await reserveRequest(k, 200);
        try {
          return `Model lama sudah tidak tersedia, diganti ke ${r.model}. ${await testConnection(await providerConfig(k.id))}`;
        } catch (e2) {
          await releaseRequest(retry);
          throw e2;
        }
      }
    });

  const blocked = !!usage?.blockedUntil;
  const used = usage?.today ?? 0;
  const nearlyOut = blocked || used >= limits.rpd * 0.75;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2">
          {k.label}
          {k.isDefault && !single && <Badge tone="blue">utama</Badge>}
          {k.sessionOnly && <Badge tone="amber">hanya sesi</Badge>}
        </h2>
        <button className="btn btn-sm" disabled={busy} onClick={test} title="Memakai 1 request dari kuota">
          {busy ? 'Memproses…' : 'Uji koneksi'}
        </button>
      </div>

      {!present && <ReenterKey k={k} onDone={() => setPresent(true)} />}

      <div>
        <label className="label" htmlFor={`model-${k.id}`}>
          Model
        </label>
        <ModelSelect
          id={`model-${k.id}`}
          models={k.models ?? []}
          value={auto ? null : k.model}
          autoOption={`Otomatis (disarankan) — ${k.model}`}
          disabled={busy}
          onChange={(c) =>
            act(async () => {
              if (c.kind === 'model') {
                await chooseKeyModel(k.id, c.id);
                return `Memakai ${c.id}.`;
              }
              const r = await switchToAutoModel(k.id);
              return `Otomatis: ${r.model}.`;
            })
          }
        />
      </div>

      {limits.rpd > 0 && usage && (
        <div>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-400">Kuota hari ini</span>
            <span className={nearlyOut ? 'text-red-600 dark:text-red-400' : 'muted'}>
              {blocked ? 'habis' : `${used} / ${limits.rpd} request`} · reset {fmtReset(usage.blockedUntil ?? usage.resetAt)}
            </span>
          </div>
          <ProgressBar value={blocked ? limits.rpd : used} max={limits.rpd} tone={nearlyOut ? 'red' : 'green'} />
        </div>
      )}

      {msg && <p className={`text-sm ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}

      <details>
        <summary className="muted cursor-pointer text-sm">Lainnya</summary>
        <div className="mt-3 space-y-4">
          <div>
            <div className="label">Batas kuota</div>
            <LimitsEditor value={limits} onChange={(l) => db.keys.update(k.id, { limits: l })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-sm"
              disabled={busy}
              onClick={() => act(async () => `${(await loadKeyModels(k.id)).length} model dimuat.`)}
              title="Tidak memakai kuota"
            >
              Muat ulang daftar model
            </button>
            {blocked && (
              <button className="btn btn-sm" onClick={() => clearQuotaBlock(k.id)}>
                Buka blokir kuota
              </button>
            )}
            {!k.isDefault && (
              <button className="btn btn-sm" onClick={() => setDefaultKey(k.id)}>
                Jadikan key utama
              </button>
            )}
            <button className="btn btn-sm btn-danger" onClick={() => confirm(`Hapus key "${k.label}"?`) && deleteKey(k.id)}>
              Hapus key
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LimitsEditor({ value, onChange }: { value: KeyLimits; onChange: (l: KeyLimits) => void }) {
  const matched = LIMIT_PRESETS.find((p) => p.limits.rpm === value.rpm && p.limits.tpm === value.tpm && p.limits.rpd === value.rpd)?.id;
  const [custom, setCustom] = useState(!matched);
  const field = (k: keyof KeyLimits, labelText: string) => (
    <label className="text-xs">
      <span className="label">{labelText}</span>
      <input type="number" min={0} className="input w-28" value={value[k]} onChange={(e) => onChange({ ...value, [k]: Math.max(0, Number(e.target.value) || 0) })} />
    </label>
  );
  return (
    <div className="space-y-2">
      <select
        className="input"
        aria-label="Batas kuota"
        value={custom ? 'custom' : matched}
        onChange={(e) => {
          const p = LIMIT_PRESETS.find((x) => x.id === e.target.value);
          setCustom(!p);
          if (p) onChange({ ...p.limits });
        }}
      >
        {LIMIT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="custom">Atur sendiri</option>
      </select>
      {custom && (
        <div className="flex flex-wrap gap-2">
          {field('rpm', 'Request / menit')}
          {field('tpm', 'Token input / menit')}
          {field('rpd', 'Request / hari')}
        </div>
      )}
      <p className="muted text-xs">Sesuaikan dengan batas di dasbor penyedia. Aplikasi tidak akan mengirim melebihi batas ini (0 = tanpa batas).</p>
    </div>
  );
}

/** A session-only key whose tab was closed: type it again to use it in this tab. */
function ReenterKey({ k, onDone }: { k: ApiKeyRecord; onDone: () => void }) {
  const [value, setValue] = useState('');
  const save = () => {
    if (!value.trim()) return;
    setSessionSecret(k.id, value);
    setValue('');
    onDone();
  };
  return (
    <div className="space-y-2 rounded-lg border border-amber-500 p-3 text-sm">
      <p>Key ini hanya untuk sesi dan sudah hilang karena tab atau browser ditutup. Masukkan lagi untuk memakainya di tab ini.</p>
      <div className="flex gap-2">
        <input
          className="input font-mono"
          type="password"
          autoComplete="off"
          aria-label={`Masukkan lagi key ${k.label}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="btn btn-primary shrink-0" disabled={!value.trim()} onClick={save}>
          Pakai key
        </button>
      </div>
    </div>
  );
}
