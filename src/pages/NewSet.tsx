import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, useSettings } from '../db';
import { buildPreset, PRESETS, PROCEDURAL_TOPICS, SUBTEST_NAMES, TOPICS } from '../domain/blueprint';
import type { PresetId } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import type { Blueprint, DifficultyChoice, SectionSpec, Subtest } from '../domain/types';
import { startGeneration } from '../engine/generator';
import { estimateCrossCheck } from '../engine/crosscheck';
import { estimatePlan, planBatches } from '../engine/plan';
import { createAiSet, createBankSet, pickFromBank } from '../engine/sets';
import { refreshStaleKeyModels } from '../engine/keys';
import { keyUsage, limitsOf } from '../engine/quota';
import { ModelSelect } from '../components/ModelSelect';
import { fmtUsd, SubtestBadge } from '../components/ui';

const DIFFICULTIES: { id: DifficultyChoice; label: string; hint: string }[] = [
  { id: 'campuran', label: 'Campuran', hint: 'Mudah sampai sulit, seperti ujian asli (disarankan)' },
  { id: 'mudah', label: 'Mudah', hint: 'Konsep dasar, satu langkah' },
  { id: 'sedang', label: 'Sedang', hint: 'Setara rata-rata soal SKD' },
  { id: 'sulit', label: 'Sulit', hint: 'Banyak langkah, pengecoh kuat' },
];

const fmtReset = (t: number) => new Date(t).toLocaleString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

export default function NewSet() {
  const settings = useSettings();
  const nav = useNavigate();
  const keys = useLiveQuery(() => db.keys.toArray(), []);
  const [preset, setPreset] = useState<PresetId>('mini');
  const [difficulty, setDifficulty] = useState<DifficultyChoice>('campuran');
  const [bp, setBp] = useState<Blueprint>(() => buildPreset('mini', settings));
  const [name, setName] = useState('');
  const [keyId, setKeyId] = useState<string>('');
  /** Model for this set only; empty = follow the key's setting. */
  const [setModel, setSetModel] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Re-seed once real settings load from IndexedDB.
  useEffect(() => setBp(buildPreset(preset, settings, difficulty)), [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Make sure every key's model list is available for the per-set picker (no quota used).
  useEffect(() => {
    void refreshStaleKeyModels();
  }, []);

  useEffect(() => {
    if (!keyId && keys?.length) setKeyId((keys.find((k) => k.isDefault) ?? keys[0]).id);
  }, [keys, keyId]);

  const key = keys?.find((k) => k.id === keyId);
  const batches = useMemo(() => planBatches(bp, settings.questionsPerRequest), [bp, settings.questionsPerRequest]);
  const effectiveModel = setModel || key?.model || '';
  const est = useMemo(() => estimatePlan(batches, effectiveModel, settings, key ? limitsOf(key) : undefined), [batches, effectiveModel, key, settings]);
  const usage = useLiveQuery(async () => (key ? keyUsage(key) : undefined), [key]);
  const remaining = usage?.blockedUntil ? 0 : (usage?.remainingToday ?? null);
  const total = bp.sections.reduce((n, s) => n + s.count, 0);
  const needsKey = est.requests > 0 && !key;
  const crossCheck = settings.crossCheck?.enabled && est.requests > 0 ? estimateCrossCheck(batches) : null;
  const missingTopics = bp.sections.some((s) => !s.topics.length);

  function applyPreset(id: PresetId) {
    setPreset(id);
    setBp(buildPreset(id, settings, difficulty));
  }

  function applyDifficulty(d: DifficultyChoice) {
    setDifficulty(d);
    setBp((b) => ({ ...b, sections: b.sections.map((s) => ({ ...s, difficulty: d })) }));
  }

  function setSection(s: Subtest, patch: Partial<SectionSpec> | null) {
    setBp((b) => {
      const exists = b.sections.find((x) => x.subtest === s);
      let sections: SectionSpec[];
      if (patch === null) sections = b.sections.filter((x) => x.subtest !== s);
      else if (exists) sections = b.sections.map((x) => (x.subtest === s ? { ...x, ...patch } : x));
      else sections = [...b.sections, { subtest: s, count: 10, topics: [...TOPICS[s]], difficulty, ...patch }];
      sections.sort((a, c) => SUBTESTS.indexOf(a.subtest) - SUBTESTS.indexOf(c.subtest));
      return { ...b, sections };
    });
  }

  const defaultName = () => `${PRESETS.find((p) => p.id === preset)?.name ?? 'Set'} · ${new Date().toLocaleDateString('id-ID')}`;

  async function generate() {
    if (needsKey) {
      setMsg('Tambahkan API key dulu di halaman API Key.');
      return;
    }
    setBusy(true);
    const set = await createAiSet(name.trim() || defaultName(), bp, key?.id, setModel || undefined);
    void startGeneration(set.id);
    nav(`/sets/${set.id}`);
  }

  async function fromBank() {
    setBusy(true);
    const { picked, shortfall } = await pickFromBank(bp);
    if (!picked.length) {
      setMsg('Bank Soal belum punya soal yang cocok. Buat soal dengan AI dulu.');
      setBusy(false);
      return;
    }
    const set = await createBankSet(name.trim() || `${defaultName()} (dari bank)`, bp, picked);
    if (shortfall.length) {
      alert(`Soal di Bank Soal belum cukup (${shortfall.map((s) => `${s.subtest} kurang ${s.missing}`).join(', ')}). Set dibuat dengan ${picked.length} soal.`);
    }
    nav(`/sets/${set.id}`);
  }

  const quotaLine = (() => {
    if (!est.requests) return 'Tidak memakai kuota AI.';
    if (remaining === null) return `Memakai sekitar ${est.requests} permintaan AI.`;
    if (remaining >= est.requests) return `Memakai ${est.requests} dari ${remaining} sisa kuota gratis hari ini.`;
    if (remaining === 0) return `Kuota gratis hari ini sudah habis. Bisa dilanjutkan ${usage ? fmtReset(usage.blockedUntil ?? usage.resetAt) : 'besok'}.`;
    return `Butuh ${est.requests} permintaan, sisa kuota hari ini ${remaining}. Sebagian soal dibuat sekarang, sisanya bisa dilanjutkan ${usage ? fmtReset(usage.resetAt) : 'besok'}.`;
  })();

  const presetCard = (id: PresetId, big = false) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const b = buildPreset(id, settings);
    const n = b.sections.reduce((x, sec) => x + sec.count, 0);
    const on = preset === id;
    return (
      <button
        key={id}
        onClick={() => applyPreset(id)}
        aria-pressed={on}
        className={`relative flex h-full flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition dark:bg-slate-900 ${
          on ? 'border-brand-500 ring-2 ring-brand-100 dark:ring-brand-700' : 'border-slate-200 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600'
        }`}
      >
        <span
          className={`absolute top-4 right-4 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
            on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600'
          }`}
          aria-hidden
        >
          {on ? '✓' : ''}
        </span>
        <span className={`pr-7 font-semibold ${big ? 'text-lg' : ''}`}>{p.name}</span>
        <span className="muted mt-1 flex-1 text-sm">{p.description}</span>
        <span className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{n} soal</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{b.durationMinutes} menit</span>
        </span>
      </button>
    );
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1>Buat Soal Baru</h1>
        <p className="muted mt-1">Pilih paket soal dan tingkat kesulitan, lalu klik "Buat Soal".</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-7">
          <section className="space-y-3">
            <h2>
              <StepNo n={1} /> Pilih paket soal
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">{(['mini', 'full'] as const).map((id) => presetCard(id, true))}</div>
            <div className="muted pt-1 text-xs font-medium tracking-wide uppercase">Atau latihan satu bagian saja</div>
            <div className="grid gap-3 sm:grid-cols-3">{(['twk', 'tiu', 'tkp'] as const).map((id) => presetCard(id))}</div>
          </section>

          <section className="space-y-3">
            <h2>
              <StepNo n={2} /> Tingkat kesulitan
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DIFFICULTIES.map((d) => {
                const on = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => applyDifficulty(d.id)}
                    aria-pressed={on}
                    className={`rounded-xl border p-3 text-left transition ${
                      on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100 dark:bg-slate-800 dark:ring-brand-700' : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <span className={`block text-sm font-semibold ${on ? 'text-brand-700 dark:text-brand-100' : ''}`}>{d.label}</span>
                    <span className="muted mt-0.5 block text-xs">{d.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <details className="group rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <span className="flex-1">
                <span className="block font-medium">Sesuaikan lebih lanjut (opsional)</span>
                <span className="muted block text-xs">Nama set, waktu ujian, jumlah soal dan topik tiap bagian, nilai minimal lulus.</span>
              </span>
              <span className="muted text-sm transition group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <div className="space-y-6 border-t border-slate-200 p-4 dark:border-slate-800">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div>
                  <label className="label">Nama set</label>
                  <input className="input" placeholder={defaultName()} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Waktu ujian (menit)</label>
                  <input
                    type="number"
                    min={5}
                    className="input"
                    value={bp.durationMinutes}
                    onChange={(e) => setBp({ ...bp, durationMinutes: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="label">Jumlah soal dan topik</div>
                {SUBTESTS.map((s) => {
                  const sec = bp.sections.find((x) => x.subtest === s);
                  return (
                    <div key={s} className={`rounded-lg border border-slate-200 p-3 dark:border-slate-800 ${sec ? '' : 'opacity-60'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex min-w-0 items-center gap-2">
                          <input type="checkbox" checked={!!sec} onChange={(e) => setSection(s, e.target.checked ? {} : null)} />
                          <SubtestBadge subtest={s} />
                          <span className="hidden truncate text-sm font-medium sm:inline">{SUBTEST_NAMES[s]}</span>
                        </label>
                        {sec && (
                          <label className="flex shrink-0 items-center gap-2 text-sm">
                            <span className="muted">Jumlah</span>
                            <input
                              type="number"
                              min={1}
                              max={200}
                              className="input w-20"
                              value={sec.count}
                              onChange={(e) => setSection(s, { count: Math.max(1, Number(e.target.value) || 1) })}
                            />
                          </label>
                        )}
                      </div>
                      {sec && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {TOPICS[s].map((t) => {
                            const on = sec.topics.includes(t);
                            return (
                              <button
                                key={t}
                                onClick={() => setSection(s, { topics: on ? sec.topics.filter((x) => x !== t) : [...sec.topics, t] })}
                                className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}
                              >
                                {on ? '✓ ' : ''}
                                {t}
                                {PROCEDURAL_TOPICS.has(t) && ' (gratis)'}
                              </button>
                            );
                          })}
                          {!sec.topics.length && <p className="w-full text-xs text-red-600">Pilih minimal satu topik.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {bp.sections.length > 0 && (
                <div>
                  <div className="label">Nilai minimal lulus (ambang batas)</div>
                  <div className="grid grid-cols-3 gap-3 sm:max-w-md">
                    {bp.sections.map((sec) => (
                      <label key={sec.subtest} className="text-sm">
                        <span className="muted mb-1 block text-xs">{sec.subtest}</span>
                        <input
                          type="number"
                          className="input"
                          value={bp.passing[sec.subtest]}
                          onChange={(e) => setBp({ ...bp, passing: { ...bp.passing, [sec.subtest]: Number(e.target.value) || 0 } })}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="muted mt-1 text-xs">Untuk jumlah soal penuh; disesuaikan otomatis bila soalnya lebih sedikit.</p>
                </div>
              )}

              {keys && keys.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {keys.length > 1 && (
                    <div>
                      <label className="label">API key</label>
                      <select
                        className="input"
                        value={keyId}
                        onChange={(e) => {
                          setKeyId(e.target.value);
                          setSetModel('');
                        }}
                      >
                        {keys.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {key && (
                    <div>
                      <label className="label">Model AI</label>
                      <ModelSelect
                        models={key.models ?? []}
                        value={setModel || null}
                        inheritOption={`Sama seperti di API Key (${key.model})`}
                        onChange={(c) => setSetModel(c.kind === 'model' ? c.id : '')}
                      />
                    </div>
                  )}
                </div>
              )}
              {est.requests > 0 && <p className="muted text-xs">Perkiraan biaya jika memakai akun berbayar: {fmtUsd(est.costUsd[0])}–{fmtUsd(est.costUsd[1])}. Akun gratis tidak dikenai biaya.</p>}
            </div>
          </details>
        </div>

        <aside className="card space-y-4 lg:sticky lg:top-6">
          <h2>
            <StepNo n={3} /> Buat soal
          </h2>
          <div>
            <div className="text-3xl font-bold tracking-tight">
              {total} <span className="text-base font-medium">soal</span>
            </div>
            <div className="muted text-sm">
              {PRESETS.find((p) => p.id === preset)?.name} · {DIFFICULTIES.find((d) => d.id === difficulty)?.label}
            </div>
          </div>
          <dl className="space-y-1.5 text-sm">
            {bp.sections.map((sec) => (
              <div key={sec.subtest} className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-2">
                  <SubtestBadge subtest={sec.subtest} />
                  <span className="muted">{SUBTEST_NAMES[sec.subtest]}</span>
                </dt>
                <dd className="font-medium">{sec.count}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t border-slate-200 pt-1.5 dark:border-slate-800">
              <dt className="muted">Waktu ujian</dt>
              <dd className="font-medium">{bp.durationMinutes} menit</dd>
            </div>
            {est.requests > 0 && est.minutes[1] > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="muted">Lama pembuatan</dt>
                <dd className="font-medium">
                  ±{Math.max(1, Math.round(est.minutes[0]))}–{Math.max(2, Math.round(est.minutes[1]))} menit
                </dd>
              </div>
            )}
          </dl>
          {needsKey ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Untuk membuat soal dengan AI, tambahkan API key dulu.{' '}
              <Link className="font-medium underline" to="/keys">
                Tambah API key
              </Link>
            </p>
          ) : (
            <p className={`text-xs ${remaining !== null && remaining < est.requests ? 'text-amber-700 dark:text-amber-300' : 'muted'}`}>{quotaLine}</p>
          )}
          {crossCheck && crossCheck.requests > 0 && !needsKey && (
            <p className="muted text-xs">
              Pemeriksa silang aktif: tambahan sekitar {crossCheck.requests} permintaan AI untuk memeriksa {crossCheck.questions} soal (di luar angka di atas).{' '}
              <Link className="underline" to="/settings">
                Ubah
              </Link>
            </p>
          )}
          {msg && <p className="text-sm text-red-600 dark:text-red-400">{msg}</p>}
          <div className="space-y-2">
            <button className="btn btn-primary w-full py-2.5 text-base" disabled={busy || !total || missingTopics || needsKey} onClick={generate}>
              Buat Soal
            </button>
            <button className="btn w-full" disabled={busy || !total} onClick={fromBank} title="Memakai soal yang sudah pernah dibuat. Tidak memakai kuota AI.">
              Ambil dari Bank Soal (tanpa AI)
            </button>
          </div>
        </aside>
      </div>

      {/* Phones: keep the main action in reach while scrolling through the options. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:-mb-6 md:px-6 lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
        <div className="min-w-0 flex-1 text-sm">
          <b>{total} soal</b> · {bp.durationMinutes} menit
        </div>
        {needsKey ? (
          <Link className="btn btn-primary" to="/keys">
            Tambah API key
          </Link>
        ) : (
          <button className="btn btn-primary px-5" disabled={busy || !total || missingTopics} onClick={generate}>
            Buat Soal
          </button>
        )}
      </div>
    </div>
  );
}

function StepNo({ n }: { n: number }) {
  return (
    <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 align-[0.1em] text-xs font-bold text-white">{n}</span>
  );
}
