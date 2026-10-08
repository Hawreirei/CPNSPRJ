import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, useSettings } from '../db';
import { buildPreset, PRESETS, PROCEDURAL_TOPICS, SUBTEST_NAMES, TOPICS } from '../domain/blueprint';
import type { PresetId } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import type { Blueprint, DifficultyChoice, SectionSpec, Subtest } from '../domain/types';
import { startGeneration } from '../engine/generator';
import { estimatePlan, planBatches } from '../engine/plan';
import { createAiSet, createBankSet, pickFromBank } from '../engine/sets';
import { refreshStaleKeyModels } from '../engine/keys';
import { keyUsage, limitsOf } from '../engine/quota';
import { ModelSelect } from '../components/ModelSelect';
import { fmtUsd, SubtestBadge } from '../components/ui';

const DIFFICULTIES: { id: DifficultyChoice; label: string }[] = [
  { id: 'campuran', label: 'Campuran (disarankan)' },
  { id: 'mudah', label: 'Mudah' },
  { id: 'sedang', label: 'Sedang' },
  { id: 'sulit', label: 'Sulit' },
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

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1>Buat Soal Baru</h1>
        <p className="muted mt-1">Pilih paket soal dan tingkat kesulitan, lalu klik "Buat Soal".</p>
      </div>

      <section className="space-y-2">
        <h2>1. Pilih paket soal</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => {
            const b = buildPreset(p.id, settings);
            const n = b.sections.reduce((x, s) => x + s.count, 0);
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`card text-left transition ${preset === p.id ? 'border-brand-500 ring-2 ring-brand-100 dark:ring-brand-700' : 'hover:border-slate-400'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className="muted text-xs">
                    {n} soal · {b.durationMinutes} menit
                  </span>
                </div>
                <div className="muted mt-1 text-xs">{p.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2>2. Tingkat kesulitan</h2>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => applyDifficulty(d.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${difficulty === d.id ? 'border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 dark:border-slate-700'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h2>3. Buat soal</h2>
        <p className="text-sm">
          <b>{total} soal</b> · waktu ujian {bp.durationMinutes} menit
          {est.requests > 0 && est.minutes[1] > 0 && <> · selesai dibuat sekitar {Math.max(1, Math.round(est.minutes[0]))}–{Math.max(2, Math.round(est.minutes[1]))} menit</>}
        </p>
        {needsKey ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Untuk membuat soal dengan AI, tambahkan API key dulu.{' '}
            <Link className="font-medium underline" to="/keys">
              Tambah API key
            </Link>
          </p>
        ) : (
          <p className={`text-sm ${remaining !== null && remaining < est.requests ? 'text-amber-700 dark:text-amber-300' : 'muted'}`}>{quotaLine}</p>
        )}
        {msg && <p className="text-sm text-red-600 dark:text-red-400">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary px-5 py-2 text-base" disabled={busy || !total || missingTopics || needsKey} onClick={generate}>
            Buat Soal
          </button>
          <button className="btn" disabled={busy || !total} onClick={fromBank} title="Memakai soal yang sudah pernah dibuat. Tidak memakai kuota AI.">
            Ambil dari Bank Soal (tanpa AI)
          </button>
        </div>
      </section>

      <details className="card">
        <summary className="cursor-pointer font-medium">Sesuaikan lebih lanjut (opsional)</summary>
        <div className="mt-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
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
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!sec} onChange={(e) => setSection(s, e.target.checked ? {} : null)} />
                      <SubtestBadge subtest={s} />
                      <span className="text-sm font-medium">{SUBTEST_NAMES[s]}</span>
                    </label>
                    {sec && (
                      <label className="ml-auto flex items-center gap-2 text-sm">
                        Jumlah
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
                    <div className="mt-2 flex flex-wrap gap-1.5">
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

          <div>
            <div className="label">Nilai minimal lulus (ambang batas)</div>
            <div className="flex flex-wrap gap-3">
              {bp.sections.map((sec) => (
                <label key={sec.subtest} className="text-sm">
                  {sec.subtest}{' '}
                  <input
                    type="number"
                    className="input inline-block w-20"
                    value={bp.passing[sec.subtest]}
                    onChange={(e) => setBp({ ...bp, passing: { ...bp.passing, [sec.subtest]: Number(e.target.value) || 0 } })}
                  />
                </label>
              ))}
            </div>
            <p className="muted mt-1 text-xs">Untuk jumlah soal penuh; disesuaikan otomatis bila soalnya lebih sedikit.</p>
          </div>

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
  );
}
