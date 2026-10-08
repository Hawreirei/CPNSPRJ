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
import { PROVIDERS } from '../providers/types';
import { fmtUsd, SubtestBadge } from '../components/ui';

export default function NewSet() {
  const settings = useSettings();
  const nav = useNavigate();
  const keys = useLiveQuery(() => db.keys.toArray(), []);
  const [preset, setPreset] = useState<PresetId>('mini');
  const [bp, setBp] = useState<Blueprint>(() => buildPreset('mini', settings));
  const [name, setName] = useState('');
  const [keyId, setKeyId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Re-seed once real settings load from IndexedDB.
  useEffect(() => setBp(buildPreset(preset, settings)), [settings]);

  useEffect(() => {
    if (!keyId && keys?.length) setKeyId((keys.find((k) => k.isDefault) ?? keys[0]).id);
  }, [keys, keyId]);

  const key = keys?.find((k) => k.id === keyId);
  const batches = useMemo(() => planBatches(bp, settings.batchSize), [bp, settings.batchSize]);
  const est = useMemo(() => estimatePlan(batches, key?.model ?? '', settings), [batches, key, settings]);
  const total = bp.sections.reduce((n, s) => n + s.count, 0);

  function applyPreset(id: PresetId) {
    setPreset(id);
    setBp(buildPreset(id, settings));
  }

  function setSection(s: Subtest, patch: Partial<SectionSpec> | null) {
    setBp((b) => {
      const exists = b.sections.find((x) => x.subtest === s);
      let sections: SectionSpec[];
      if (patch === null) sections = b.sections.filter((x) => x.subtest !== s);
      else if (exists) sections = b.sections.map((x) => (x.subtest === s ? { ...x, ...patch } : x));
      else sections = [...b.sections, { subtest: s, count: 10, topics: [...TOPICS[s]], difficulty: 'campuran' as DifficultyChoice, ...patch }];
      sections.sort((a, c) => SUBTESTS.indexOf(a.subtest) - SUBTESTS.indexOf(c.subtest));
      return { ...b, sections };
    });
  }

  const defaultName = () => `${PRESETS.find((p) => p.id === preset)?.name ?? 'Set'} · ${new Date().toLocaleDateString('id-ID')}`;

  async function generate() {
    if (est.requests > 0 && !key) {
      setMsg('Tambahkan API key dulu, atau pilih hanya topik figural yang dibuat otomatis.');
      return;
    }
    setBusy(true);
    const set = await createAiSet(name.trim() || defaultName(), bp, key?.id);
    void startGeneration(set.id);
    nav(`/sets/${set.id}`);
  }

  async function fromBank() {
    setBusy(true);
    const { picked, shortfall } = await pickFromBank(bp);
    if (!picked.length) {
      setMsg('Bank soal belum memiliki soal yang cocok dengan pilihan ini.');
      setBusy(false);
      return;
    }
    const set = await createBankSet(name.trim() || `${defaultName()} (bank)`, bp, picked);
    if (shortfall.length) {
      alert(`Bank kurang: ${shortfall.map((s) => `${s.subtest} ${s.missing} soal`).join(', ')}. Set dibuat dengan ${picked.length} soal.`);
    }
    nav(`/sets/${set.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Set Baru</h1>
        <p className="muted mt-1">Pilih preset, atur sub-tes dan topik, lalu periksa rencana sebelum menghabiskan kuota API.</p>
      </div>

      <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`card text-left transition ${preset === p.id ? 'border-brand-500 ring-2 ring-brand-100 dark:ring-brand-700' : 'hover:border-slate-400'}`}
          >
            <div className="font-semibold">{p.name}</div>
            <div className="muted mt-1 text-xs">{p.description}</div>
          </button>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {SUBTESTS.map((s) => {
            const sec = bp.sections.find((x) => x.subtest === s);
            return (
              <div key={s} className={`card ${sec ? '' : 'opacity-70'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!!sec} onChange={(e) => setSection(s, e.target.checked ? {} : null)} />
                    <SubtestBadge subtest={s} />
                    <span className="font-semibold">{SUBTEST_NAMES[s]}</span>
                  </label>
                  {sec && (
                    <div className="ml-auto flex items-center gap-2">
                      <label className="text-xs">Jumlah</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="input w-20"
                        value={sec.count}
                        onChange={(e) => setSection(s, { count: Math.max(1, Number(e.target.value) || 1) })}
                      />
                      <select className="input w-32" value={sec.difficulty} onChange={(e) => setSection(s, { difficulty: e.target.value as DifficultyChoice })}>
                        <option value="campuran">campuran</option>
                        <option value="mudah">mudah</option>
                        <option value="sedang">sedang</option>
                        <option value="sulit">sulit</option>
                      </select>
                    </div>
                  )}
                </div>
                {sec && (
                  <div className="mt-3">
                    <div className="mb-1 flex gap-3 text-xs">
                      <button className="text-brand-600 underline" onClick={() => setSection(s, { topics: [...TOPICS[s]] })}>
                        semua
                      </button>
                      <button className="text-brand-600 underline" onClick={() => setSection(s, { topics: [] })}>
                        kosongkan
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TOPICS[s].map((t) => {
                        const on = sec.topics.includes(t);
                        return (
                          <button
                            key={t}
                            onClick={() => setSection(s, { topics: on ? sec.topics.filter((x) => x !== t) : [...sec.topics, t] })}
                            className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}
                          >
                            {t}
                            {PROCEDURAL_TOPICS.has(t) && ' · gratis'}
                          </button>
                        );
                      })}
                    </div>
                    {!sec.topics.length && <p className="mt-2 text-xs text-red-600">Pilih minimal satu topik.</p>}
                  </div>
                )}
              </div>
            );
          })}

          <div className="card grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nama set</label>
              <input className="input" placeholder={defaultName()} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Durasi simulasi (menit)</label>
              <input
                type="number"
                min={5}
                className="input"
                value={bp.durationMinutes}
                onChange={(e) => setBp({ ...bp, durationMinutes: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            {bp.sections.map((sec) => (
              <div key={sec.subtest}>
                <label className="label">Ambang batas {sec.subtest} (untuk set penuh)</label>
                <input
                  type="number"
                  className="input"
                  value={bp.passing[sec.subtest]}
                  onChange={(e) => setBp({ ...bp, passing: { ...bp.passing, [sec.subtest]: Number(e.target.value) || 0 } })}
                />
              </div>
            ))}
            <p className="muted text-xs sm:col-span-2">
              Ambang batas otomatis disesuaikan proporsional bila jumlah soal berbeda dari standar. Nilai default dapat diubah di Pengaturan.
            </p>
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="card space-y-3">
            <h2>Rencana</h2>
            <div>
              <label className="label">API key</label>
              {keys?.length ? (
                <select className="input" value={keyId} onChange={(e) => setKeyId(e.target.value)}>
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} · {PROVIDERS[k.provider].name} · {k.model}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm">
                  Belum ada. <Link className="text-brand-600 underline" to="/keys">Tambah API key</Link>
                </p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="muted">Total soal</dt>
              <dd className="text-right font-medium">{total}</dd>
              <dt className="muted">Soal oleh AI</dt>
              <dd className="text-right">{est.aiQuestions}</dd>
              <dt className="muted">Figural gratis</dt>
              <dd className="text-right">{est.freeQuestions}</dd>
              <dt className="muted">Permintaan API</dt>
              <dd className="text-right">{est.requests}</dd>
              <dt className="muted">Token (perkiraan)</dt>
              <dd className="text-right">~{Math.round((est.inputTokens + est.outputTokens) / 1000)}k</dd>
              <dt className="muted">Biaya</dt>
              <dd className="text-right">
                {est.requests ? `${fmtUsd(est.costUsd[0])}–${fmtUsd(est.costUsd[1])}` : '$0'}
              </dd>
              <dt className="muted">Waktu</dt>
              <dd className="text-right">{est.requests ? `${Math.max(1, Math.round(est.minutes[0]))}–${Math.max(1, Math.round(est.minutes[1]))} menit` : 'instan'}</dd>
            </dl>
            <p className="muted text-xs">
              Perkiraan kasar. Model dengan "thinking" bisa memakai token lebih banyak. Harga dapat diubah di Pengaturan. Banyak penyedia punya kuota gratis.
            </p>
            {msg && <p className="text-sm text-red-600">{msg}</p>}
            <button className="btn btn-primary w-full" disabled={busy || !total || bp.sections.some((s) => !s.topics.length)} onClick={generate}>
              Buat dengan AI
            </button>
            <button className="btn w-full" disabled={busy || !total} onClick={fromBank}>
              Ambil dari bank soal (gratis)
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
