import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db, getSetQuestions } from '../db';
import { attemptMode, attemptPath, filterQuestions } from '../domain/practice';
import { SUBTESTS } from '../domain/types';
import type { AttemptMode } from '../domain/types';
import { startAttempt } from '../engine/attempts';
import { Badge, Empty, fmtDate, SubtestBadge } from '../components/ui';
import { errorText } from '../engine/storage';

export default function SimulationHome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().filter((s) => s.questionIds.length > 0).toArray(), []);
  const attempts = useLiveQuery(() => db.attempts.orderBy('startedAt').reverse().limit(20).toArray(), []);
  const [setId, setSetId] = useState(params.get('set') ?? '');
  const [mode, setMode] = useState<AttemptMode>(params.get('mode') === 'practice' ? 'practice' : 'exam');
  const [shuffleQ, setShuffleQ] = useState(false);
  const [duration, setDuration] = useState<number | ''>('');
  const [practiceTimed, setPracticeTimed] = useState(false);
  const [catMode, setCatMode] = useState(false);
  const [lockedOrder, setLockedOrder] = useState(false);
  /** Topics picked for practice; `null` until the set's questions have loaded. */
  const [topics, setTopics] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  const set = sets?.find((s) => s.id === setId);
  // Tagged with its set id: right after switching sets the hook can still hold the previous set's result.
  const loaded = useLiveQuery(async () => (set ? { setId: set.id, questions: await getSetQuestions(set) } : undefined), [set]);
  const setQuestions = loaded?.setId === setId ? loaded.questions : undefined;
  useEffect(() => {
    if (!setId && sets?.length) setSetId(sets[0].id);
  }, [sets, setId]);
  // Keyed on the set id: a background generation refreshes the set object but must not reset the form.
  const durationMinutes = set?.blueprint.durationMinutes;
  useEffect(() => {
    if (durationMinutes) setDuration(durationMinutes);
  }, [setId, durationMinutes]);

  // Topics in the chosen set, in sub-test order. A `topics` link param (from a score report) preselects some.
  const setTopicsBySubtest = useMemo(
    () => SUBTESTS.map((s) => ({ subtest: s, topics: [...new Set((setQuestions ?? []).filter((q) => q.subtest === s).map((q) => q.topic))] })).filter((g) => g.topics.length),
    [setQuestions],
  );
  const topicsFor = useRef('');
  useEffect(() => {
    if (!setQuestions || topicsFor.current === setId) return;
    topicsFor.current = setId;
    const all = setTopicsBySubtest.flatMap((g) => g.topics);
    const wanted = params.get('topics')?.split('|').filter((t) => all.includes(t));
    setTopics(wanted?.length && setId === params.get('set') ? wanted : all);
  }, [setQuestions, setTopicsBySubtest, params, setId]);

  if (!sets || !attempts) return null;

  const practice = mode === 'practice';
  const matching = practice && setQuestions && topics ? filterQuestions(setQuestions, { topics }).length : (set?.questionIds.length ?? 0);
  const toggleTopic = (t: string) => setTopics((cur) => (cur?.includes(t) ? cur.filter((x) => x !== t) : [...(cur ?? []), t]));
  const toggleGroup = (group: string[], on: boolean) =>
    setTopics((cur) => (on ? [...new Set([...(cur ?? []), ...group])] : (cur ?? []).filter((t) => !group.includes(t))));

  async function start() {
    setError('');
    const cat = !practice && catMode;
    // Full screen needs the click itself, so it is asked for before anything is awaited.
    if (cat && document.fullscreenEnabled) void document.documentElement.requestFullscreen().catch(() => {});
    try {
      const a = await startAttempt(setId, {
        shuffleQuestions: shuffleQ,
        durationMinutes: practice && !practiceTimed ? 0 : Number(duration),
        mode,
        filter: practice ? { topics: topics ?? [] } : undefined,
        catMode: cat,
        lockedOrder: cat && lockedOrder,
      });
      nav(attemptPath(a));
    } catch (e) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      setError(errorText(e));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Latihan Ujian</h1>
        <p className="muted mt-1">
          Pilih <b>Ujian</b> untuk mengerjakan seperti CAT sungguhan, atau <b>Latihan</b> untuk langsung melihat kunci dan pembahasan setiap soal.
        </p>
      </div>
      {sets.length === 0 ? (
        <Empty title="Belum ada set berisi soal">
          <Link className="text-brand-600 dark:text-brand-300 underline" to="/new">
            Buat set dulu
          </Link>
        </Empty>
      ) : (
        <div className="card space-y-4">
          <div role="radiogroup" aria-label="Mode" className="grid gap-2 sm:grid-cols-2">
            <ModeOption active={!practice} onClick={() => setMode('exam')} title="Ujian (CAT)">
              Ada batas waktu, jawaban bisa diubah, nilai dan pembahasan keluar setelah selesai. Masuk grafik Progres.
            </ModeOption>
            <ModeOption active={practice} onClick={() => setMode('practice')} title="Latihan">
              Kunci dan pembahasan tampil langsung setelah menjawab. Tanpa batas waktu (opsional). Tidak masuk grafik skor ujian.
            </ModeOption>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label className="label" htmlFor="sim-set">
                Pilih set
              </label>
              <select id="sim-set" className="input" value={setId} onChange={(e) => setSetId(e.target.value)}>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.questionIds.length} soal)
                  </option>
                ))}
              </select>
            </div>
            {(!practice || practiceTimed) && (
              <div>
                <label className="label" htmlFor="sim-duration">
                  Durasi (menit)
                </label>
                <input id="sim-duration" type="number" min={1} className="input" value={duration} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')} />
              </div>
            )}
          </div>

          {set && !practice && (
            <div className="flex flex-wrap gap-2 text-sm">
              {SUBTESTS.map((s) => {
                const sec = set.blueprint.sections.find((x) => x.subtest === s);
                return sec ? (
                  <Badge key={s}>
                    {s}: ambang {set.blueprint.passing[s]}
                  </Badge>
                ) : null;
              })}
              {set.status !== 'ready' && <Badge tone="amber">set belum lengkap</Badge>}
            </div>
          )}

          {practice && topics && (
            <fieldset className="space-y-3">
              <legend className="label">Topik yang dilatih ({matching} soal)</legend>
              {setTopicsBySubtest.map((g) => {
                const allOn = g.topics.every((t) => topics.includes(t));
                return (
                  <div key={g.subtest} className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={allOn} onChange={(e) => toggleGroup(g.topics, e.target.checked)} />
                      <SubtestBadge subtest={g.subtest} /> semua topik {g.subtest}
                    </label>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {g.topics.map((t) => {
                        const on = topics.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleTopic(t)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 text-slate-500 dark:text-slate-400 dark:border-slate-700'}`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </fieldset>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} />
              Acak urutan soal di dalam tiap sub-tes
            </label>
            {practice && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={practiceTimed} onChange={(e) => setPracticeTimed(e.target.checked)} />
                Pakai batas waktu
              </label>
            )}
            {!practice && (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={catMode} onChange={(e) => setCatMode(e.target.checked)} aria-describedby="cat-mode-help" />
                  <span>
                    Mode CAT
                    <span id="cat-mode-help" className="muted block text-xs">
                      Layar penuh bila perangkat mendukung, dan setiap kali Anda meninggalkan tab ujian dicatat di Laporan Skor (tanpa pengurangan nilai).
                    </span>
                  </span>
                </label>
                {catMode && (
                  <label className="flex items-start gap-2 pl-6 text-sm">
                    <input type="checkbox" className="mt-1" checked={lockedOrder} onChange={(e) => setLockedOrder(e.target.checked)} aria-describedby="locked-order-help" />
                    <span>
                      Kunci urutan sub-tes (TWK → TIU → TKP, tanpa kembali)
                      <span id="locked-order-help" className="muted block text-xs">
                        Latihan pembagian waktu. Kami belum menemukan sumber resmi BKN bahwa ujian CAT sungguhan mengunci urutan sub-tes.
                      </span>
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
          <ul className="muted list-disc space-y-1 pl-5 text-xs">
            {practice ? (
              <li>Jawaban dikunci setelah dipilih karena pembahasan langsung tampil. Soal yang dilewati dihitung kosong.</li>
            ) : (
              <li>Waktu tetap berjalan walau tab ditutup, seperti ujian sungguhan. Jawaban tersimpan otomatis.</li>
            )}
            <li>Penilaian: TWK/TIU benar 5, salah/kosong 0; TKP 1–5 per opsi. Ambang batas disesuaikan proporsional untuk set yang tidak penuh.</li>
          </ul>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button className="btn btn-primary" disabled={!set || !matching || ((!practice || practiceTimed) && !duration)} onClick={start}>
            {practice ? 'Mulai latihan' : 'Mulai ujian'}
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-2">Riwayat</h2>
        {attempts.length === 0 ? (
          <p className="muted">Belum ada simulasi.</p>
        ) : (
          <div className="grid gap-2">
            {attempts.map((a) => (
              <Link key={a.id} to={attemptPath(a)} className="card flex items-center justify-between gap-3 hover:border-brand-500">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {a.setName} {attemptMode(a) === 'practice' && <Badge tone="blue">latihan</Badge>}
                  </div>
                  <div className="muted text-xs">
                    {fmtDate(a.startedAt)} · {a.questionIds.length} soal
                  </div>
                </div>
                {a.result ? (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {a.result.total}/{a.result.maxTotal}
                    </span>
                    {attemptMode(a) === 'exam' && a.result.passedAll !== undefined && <Badge tone={a.result.passedAll ? 'green' : 'red'}>{a.result.passedAll ? 'lulus' : 'belum lulus'}</Badge>}
                  </div>
                ) : (
                  <Badge tone="amber">lanjutkan</Badge>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ModeOption({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${active ? 'border-brand-500 bg-brand-50 dark:bg-slate-800' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'}`}
    >
      <div className="font-semibold">{title}</div>
      <div className="muted mt-1 text-xs">{children}</div>
    </button>
  );
}
