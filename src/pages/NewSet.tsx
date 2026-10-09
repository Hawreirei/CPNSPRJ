import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, useSettings } from '../db';
import { activeProfile, buildPackagePreset, buildPreset, PRESETS, PROCEDURAL_TOPICS, topicsFor, weightsFor } from '../domain/blueprint';
import type { PresetId } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import { examRank, isSkd, packages, SKD_CPNS, specOf, type ExamPackage } from '../domain/examPackage';
import type { Blueprint, DifficultyChoice, SectionSpec, Subtest } from '../domain/types';
import { startGeneration } from '../engine/generator';
import { estimateCrossCheck } from '../engine/crosscheck';
import { estimatePlan, planBatches } from '../engine/plan';
import { createAiSet, createBankSet, pickFromBank } from '../engine/sets';
import { refreshStaleKeyModels } from '../engine/keys';
import { keyUsage, limitsOf } from '../engine/quota';
import { ModelSelect } from '../components/ModelSelect';
import { SubtestBadge } from '../components/ui';
import { fmtUsd } from '../lib/format';

const DIFFICULTIES: { id: DifficultyChoice; label: string; hint: string }[] = [
  { id: 'campuran', label: 'Campuran', hint: 'Mudah sampai sulit, seperti ujian asli (disarankan)' },
  { id: 'mudah', label: 'Mudah', hint: 'Konsep dasar, satu langkah' },
  { id: 'sedang', label: 'Sedang', hint: 'Setara rata-rata soal SKD' },
  { id: 'sulit', label: 'Sulit', hint: 'Banyak langkah, pengecoh kuat' },
];

const fmtReset = (t: number) => new Date(t).toLocaleString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

/** Today's date for a set's default name, read when the set is created. */
const today = () => new Date().toLocaleDateString('id-ID');

export default function NewSet() {
  const settings = useSettings();
  const nav = useNavigate();
  const keys = useLiveQuery(() => db.keys.toArray(), []);
  const [preset, setPreset] = useState<PresetId>('mini');
  /** Exam package of the new set; SKD CPNS unless the learner imported others. */
  const [pkgId, setPkgId] = useState(SKD_CPNS.id);
  const [jobTitle, setJobTitle] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyChoice>('campuran');
  const [bp, setBp] = useState<Blueprint>(() => buildPreset('mini', settings));
  const [name, setName] = useState('');
  const [pickedKeyId, setKeyId] = useState<string>('');
  /** Model for this set only; empty = follow the key's setting. */
  const [setModel, setSetModel] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [includeReported, setIncludeReported] = useState(false);
  const reportedCount = useLiveQuery(() => db.questions.filter((q) => !!q.report).count(), []);
  const [msg, setMsg] = useState<string | null>(null);

  // Packages are registered when Settings are read, so this list follows them.
  const pkgList = useMemo(() => [...packages()], [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const pkg: ExamPackage = pkgList.find((p) => p.id === pkgId) ?? SKD_CPNS;
  const skd = isSkd(pkg);
  const presetFor = (id: PresetId, d: DifficultyChoice = difficulty, job = jobTitle) =>
    skd ? buildPreset(id, settings, d) : buildPackagePreset(pkg, id === 'full' ? 'full' : 'mini', d, job);

  // Re-seed once real settings load from IndexedDB (adjusting state while rendering, not in an effect).
  const [seededFor, setSeededFor] = useState(settings);
  if (seededFor !== settings) {
    setSeededFor(settings);
    setBp(presetFor(preset));
  }

  // Make sure every key's model list is available for the per-set picker (no quota used).
  useEffect(() => {
    void refreshStaleKeyModels();
  }, []);

  // Until the learner picks one, the default key.
  const keyId = pickedKeyId || (keys?.find((k) => k.isDefault) ?? keys?.[0])?.id || '';

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
    setBp(presetFor(id));
  }

  function pickPackage(id: string) {
    const next = pkgList.find((p) => p.id === id) ?? SKD_CPNS;
    setPkgId(next.id);
    setPreset('mini');
    setBp(isSkd(next) ? buildPreset('mini', settings, difficulty) : buildPackagePreset(next, 'mini', difficulty, jobTitle));
  }

  /** The job title is the topic of every sub-test about the learner's job. */
  function changeJobTitle(title: string) {
    setJobTitle(title);
    const job = title.trim();
    setBp((b) => ({ ...b, sections: b.sections.map((x) => (specOf(x.subtest).fromJobTitle ? { ...x, topics: job ? [job] : [] } : x)) }));
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
      else {
        const weights = weightsFor(settings, s);
        const topics = specOf(s).fromJobTitle ? (jobTitle.trim() ? [jobTitle.trim()] : []) : topicsFor(settings, s);
        sections = [...b.sections, { subtest: s, count: 10, topics, difficulty, ...(weights ? { weights } : {}), ...patch }];
      }
      sections.sort((a, c) => examRank(a.subtest) - examRank(c.subtest));
      return { ...b, sections };
    });
  }

  const defaultName = () => {
    const date = today();
    return skd ? `${PRESETS.find((p) => p.id === preset)?.name ?? 'Set'} · ${date}` : `${pkg.name}${jobTitle.trim() ? ` · ${jobTitle.trim()}` : ''} · ${date}`;
  };
  const needsJob = !skd && pkg.subtests.some((x) => x.fromJobTitle) && bp.sections.some((x) => specOf(x.subtest).fromJobTitle);
  const editableSubtests = skd ? SUBTESTS : pkg.subtests.map((x) => x.id);

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
    const { picked, shortfall } = await pickFromBank(bp, { includeReported });
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
    const p = skd
      ? PRESETS.find((x) => x.id === id)!
      : id === 'full'
        ? { name: `${pkg.name} lengkap`, description: 'Jumlah soal dan waktu seperti di berkas paket.' }
        : { name: 'Latihan Singkat', description: 'Paling banyak 10 soal tiap bagian. Cocok untuk mencoba.' };
    const b = presetFor(id);
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
          {pkgList.length > 1 && (
            <section className="space-y-2">
              <h2>Ujian</h2>
              <div role="radiogroup" aria-label="Ujian" className="flex flex-wrap gap-2">
                {pkgList.map((p) => (
                  <button
                    key={p.id}
                    role="radio"
                    aria-checked={p.id === pkg.id}
                    onClick={() => pickPackage(p.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${p.id === pkg.id ? 'border-brand-500 bg-brand-50 font-medium dark:bg-slate-800' : 'border-slate-300 dark:border-slate-700'}`}
                  >
                    {p.name}
                    {!isSkd(p) && !p.official && <span className="muted block text-xs font-normal">bukan data resmi</span>}
                  </button>
                ))}
              </div>
              {!skd && (
                <div className="muted space-y-1 text-xs">
                  <p>Sumber angka: {pkg.official ? `${pkg.official.title} (${pkg.official.date})` : `${pkg.source}. Bukan data resmi; cek ketentuan di dokumen resmi.`}</p>
                  {!!pkg.notes?.length && (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {pkg.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {needsJob && (
            <section className="space-y-1">
              <label className="label" htmlFor="ns-job">
                Nama jabatan yang dilamar
              </label>
              <input id="ns-job" className="input" placeholder="misalnya Pranata Komputer Ahli Pertama" value={jobTitle} onChange={(e) => changeJobTitle(e.target.value)} />
              <p className="muted text-xs">Soal kompetensi teknis dibuat AI dari nama jabatan ini. Topiknya bukan kisi-kisi resmi; cocokkan dengan standar kompetensi jabatan Anda.</p>
            </section>
          )}

          <section className="space-y-3">
            <h2>
              <StepNo n={1} /> Pilih paket soal
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">{(['mini', 'full'] as const).map((id) => presetCard(id, true))}</div>
            {skd && (
              <>
                <div className="muted pt-1 text-xs font-medium tracking-wide uppercase">Atau latihan satu bagian saja</div>
                <div className="grid gap-3 sm:grid-cols-3">{(['twk', 'tiu', 'tkp'] as const).map((id) => presetCard(id))}</div>
              </>
            )}
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
                  <label className="label" htmlFor="ns-name">
                    Nama set
                  </label>
                  <input id="ns-name" className="input" placeholder={defaultName()} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="ns-duration">
                    Waktu ujian (menit)
                  </label>
                  <input
                    id="ns-duration"
                    type="number"
                    min={5}
                    className="input"
                    value={bp.durationMinutes}
                    onChange={(e) => setBp({ ...bp, durationMinutes: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="label">Jumlah soal dan topik</div>
                  {skd ? (
                    <p className="muted text-xs">
                      Topik dari profil kisi-kisi "{activeProfile(settings).name}".{' '}
                      <Link className="text-brand-600 underline dark:text-brand-300" to="/settings">
                        Ganti profil
                      </Link>
                    </p>
                  ) : (
                    <p className="muted text-xs">Topik dari paket "{pkg.name}".</p>
                  )}
                </div>
                {editableSubtests.map((s) => {
                  const sec = bp.sections.find((x) => x.subtest === s);
                  return (
                    <div key={s} className={`rounded-lg border border-slate-200 p-3 dark:border-slate-800 ${sec ? '' : 'opacity-60'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex min-w-0 items-center gap-2">
                          <input type="checkbox" checked={!!sec} onChange={(e) => setSection(s, e.target.checked ? {} : null)} />
                          <SubtestBadge subtest={s} />
                          <span className="hidden truncate text-sm font-medium sm:inline">{specOf(s).name}</span>
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
                      {sec && specOf(s).fromJobTitle && (
                        <p className="mt-2 text-xs">{jobTitle.trim() ? `Kompetensi teknis jabatan "${jobTitle.trim()}".` : 'Isi nama jabatan di atas.'}</p>
                      )}
                      {sec && !specOf(s).fromJobTitle && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {topicsFor(settings, s).map((t) => {
                            const on = sec.topics.includes(t);
                            return (
                              <button
                                key={t}
                                aria-pressed={on}
                                onClick={() => setSection(s, { topics: on ? sec.topics.filter((x) => x !== t) : [...sec.topics, t] })}
                                className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 text-slate-500 dark:text-slate-400 dark:border-slate-700'}`}
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
                          value={bp.passing[sec.subtest] ?? ''}
                          placeholder="tidak ada"
                          onChange={(e) => {
                            const passing = { ...bp.passing };
                            if (e.target.value === '') delete passing[sec.subtest];
                            else passing[sec.subtest] = Number(e.target.value) || 0;
                            setBp({ ...bp, passing });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="muted mt-1 text-xs">Untuk jumlah soal penuh; disesuaikan otomatis bila soalnya lebih sedikit. Kosongkan bila ujiannya tidak memakai ambang batas.</p>
                </div>
              )}

              {keys && keys.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {keys.length > 1 && (
                    <div>
                      <label className="label" htmlFor="ns-key">
                        API key
                      </label>
                      <select
                        id="ns-key"
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
                      <label className="label" htmlFor="ns-model">
                        Model AI
                      </label>
                      <ModelSelect
                        id="ns-model"
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
                  <span className="muted">{specOf(sec.subtest).name}</span>
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
          {needsJob && !jobTitle.trim() && <p className="text-sm text-amber-800 dark:text-amber-300">Isi nama jabatan dulu.</p>}
          <div className="space-y-2">
            <button className="btn btn-primary w-full py-2.5 text-base" disabled={busy || !total || missingTopics || needsKey} onClick={generate}>
              Buat Soal
            </button>
            <button className="btn w-full" disabled={busy || !total} onClick={fromBank} title="Memakai soal yang sudah pernah dibuat. Tidak memakai kuota AI.">
              Ambil dari Bank Soal (tanpa AI)
            </button>
            {!!reportedCount && (
              <label className="muted flex items-center gap-2 text-xs">
                <input type="checkbox" checked={includeReported} onChange={(e) => setIncludeReported(e.target.checked)} />
                Pakai juga {reportedCount} soal yang Anda laporkan
              </label>
            )}
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
