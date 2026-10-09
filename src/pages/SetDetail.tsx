import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db, getSetQuestions, useSettings } from '../db';
import type { QSet, Question, Subtest } from '../domain/types';
import { moreLikeThis, needsRepair, repairQuestion, rewriteQuestion, startGeneration, stopGeneration, useGenProgress } from '../engine/generator';
import { crossCheckQuestions, isCrossCheckable, needsCrossCheck, type CrossCheckResult } from '../engine/crosscheck';
import { moveInSet, removeFromSet } from '../engine/sets';
import { QuestionCard, type CardMode } from '../components/QuestionCard';
import { QuestionEditor } from '../components/QuestionEditor';
import { FeedbackDialog } from '../components/FeedbackDialog';

// Sharing (and its QR code library) loads only when someone shares.
const ShareDialog = lazy(() => import('../components/ShareDialog'));
import { answerStats } from '../domain/quality';
import { opensGroup, passageLabel } from '../domain/groups';
import { DownloadDialog } from '../components/DownloadDialog';
import { Badge, Empty, ProgressBar } from '../components/ui';
import { subtestsIn } from '../domain/examPackage';

const STATUS_TEXT: Record<string, string> = { ready: 'Siap dipakai', generating: 'Sedang dibuat', paused: 'Belum selesai', draft: 'Draf' };

export default function SetDetail() {
  const { setId = '' } = useParams();
  const set = useLiveQuery(async () => (await db.sets.get(setId)) ?? null, [setId]);
  const questions = useLiveQuery(async () => (set ? getSetQuestions(set) : []), [set]);
  const [mode, setMode] = useState<CardMode>('soal');
  const [filter, setFilter] = useState<'all' | 'flagged' | 'starred'>('all');
  const [sub, setSub] = useState<Subtest | 'all'>('all');
  const [editing, setEditing] = useState<Question | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Question | null>(null);
  const attempts = useLiveQuery(() => db.attempts.toArray(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const settings = useSettings();
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  if (set === undefined || !questions) return null;
  if (set === null) return <Empty title="Set tidak ditemukan" />;

  const flaggedCount = questions.filter((q) => q.flags.some((f) => f.severity === 'warn')).length;
  const starredCount = questions.filter((q) => q.starred).length;
  const stats = answerStats(attempts ?? [], questions);
  const shown = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => (sub === 'all' || q.subtest === sub) && (filter === 'all' || (filter === 'flagged' ? q.flags.some((f) => f.severity === 'warn') : q.starred)));

  const shownQuestions = shown.map((x) => x.q);
  const unchecked = questions.filter(needsCrossCheck);
  const describe = (r: CrossCheckResult) =>
    `${r.checked} soal diperiksa silang, ${r.mismatched} berbeda jawaban${r.mismatched ? ' (ditandai "perlu dicek")' : ''}.` +
    (r.pending ? ` ${r.pending} soal belum diperiksa karena kuota habis.` : '');
  async function crossCheckAll() {
    setChecking(true);
    setCheckMsg(null);
    setError(null);
    try {
      setCheckMsg(describe(await crossCheckQuestions(unchecked, set!.keyId)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function act(q: Question, fn: () => Promise<unknown>) {
    setBusyId(q.id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* The visible name is an editable field; the page still needs a heading. */}
          <h1 className="sr-only">{set.name}</h1>
          <input
            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none focus:underline"
            defaultValue={set.name}
            onBlur={(e) => e.target.value.trim() && db.sets.update(set.id, { name: e.target.value.trim() })}
            aria-label="Nama set (klik untuk mengganti)"
            title="Klik untuk mengganti nama"
          />
          <div className="muted mt-1 text-sm">
            {STATUS_TEXT[set.status] ?? set.status} · {questions.length} soal
            {subtestsIn(questions).map((s) => ` · ${s} ${questions.filter((q) => q.subtest === s).length}`)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!questions.length} onClick={() => setDownloading(true)}>
            ⬇ Unduh PDF / Word
          </button>
          <button className="btn" disabled={!questions.length || set.status === 'generating'} onClick={() => setSharing(true)}>
            Bagikan
          </button>
          <Link className={`btn ${questions.length ? '' : 'pointer-events-none opacity-50'}`} to={`/simulation?set=${set.id}`}>
            Mulai latihan ujian
          </Link>
          {settings.crossCheck?.enabled && unchecked.length > 0 && set.status !== 'generating' && (
            <button className="btn" disabled={checking} onClick={crossCheckAll} title="Minta model lain menjawab soal tanpa melihat kunci. Memakai kuota AI.">
              {checking ? 'Memeriksa silang…' : `Periksa silang (${unchecked.length} soal)`}
            </button>
          )}
        </div>
      </div>
      {checkMsg && <div className="rounded-lg bg-brand-50 p-3 text-sm dark:bg-slate-800">{checkMsg}</div>}

      <GenerationPanel set={set} />

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {questions.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800">
            {(
              [
                ['soal', 'Soal'],
                ['kunci', 'Kunci Jawaban'],
                ['pembahasan', 'Pembahasan'],
              ] as const
            ).map(([m, label]) => (
              <button key={m} className={`tab ${mode === m ? 'tab-active' : ''}`} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {['all', ...subtestsIn(questions)].map((s) => (
              <Chip key={s} on={sub === s} onClick={() => setSub(s)}>
                {s === 'all' ? 'Semua' : s}
              </Chip>
            ))}
            <span className="mx-1 text-slate-300">|</span>
            {flaggedCount > 0 && (
              <Chip on={filter === 'flagged'} onClick={() => setFilter(filter === 'flagged' ? 'all' : 'flagged')}>
                Perlu dicek ({flaggedCount})
              </Chip>
            )}
            {starredCount > 0 && (
              <Chip on={filter === 'starred'} onClick={() => setFilter(filter === 'starred' ? 'all' : 'starred')}>
                ★ Berbintang ({starredCount})
              </Chip>
            )}
          </div>
        </div>
      )}

      {questions.length === 0 ? (
        <Empty title="Belum ada soal">Soal akan muncul di sini saat dibuat.</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map(({ q, i }) => (
            <QuestionCard
              key={q.id}
              q={q}
              index={i}
              mode={mode}
              // The passage in full above the first shown question of its group, folded on the rest.
              passage={opensGroup(shownQuestions, q) ? 'open' : 'closed'}
              passageLabel={passageLabel(questions, q)}
              stats={stats.get(q.id)}
              onFeedback={() => setFeedbackFor(q)}
              actions={
                busyId === q.id ? (
                  <Badge tone="blue">memproses…</Badge>
                ) : (
                  <>
                    {needsRepair(q) && (
                      <button className="btn btn-sm" title="Minta AI mencocokkan ulang kunci jawaban dan pembahasan" onClick={() => void act(q, () => repairQuestion(q, set.keyId))}>
                        🔧 Perbaiki
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" title={q.starred ? 'Hapus bintang' : 'Beri bintang'} onClick={() => db.questions.update(q.id, { starred: !q.starred })}>
                      {q.starred ? '★' : '☆'}
                    </button>
                    <ActionMenu
                      items={[
                        { label: 'Edit soal', disabled: q.locked, onClick: () => setEditing(q) },
                        { label: q.report ? 'Ubah laporan atau nilai' : 'Laporkan atau nilai soal', onClick: () => setFeedbackFor(q) },
                        {
                          label: 'Tulis ulang dengan AI',
                          disabled: q.locked || q.source === 'procedural',
                          onClick: () => {
                            const instr = prompt('Mau diubah seperti apa? (boleh dikosongkan)\nContoh: "buat lebih sulit", "ganti konteks ke desa"', '');
                            if (instr === null) return;
                            void act(q, () => rewriteQuestion(q, instr, set.keyId));
                          },
                        },
                        {
                          label: 'Periksa silang dengan model lain',
                          disabled: !isCrossCheckable(q),
                          onClick: () =>
                            void act(q, async () => {
                              const r = await crossCheckQuestions([q], set.keyId);
                              if (!r.checked) throw new Error(r.pending ? 'Kuota AI hari ini habis; soal belum diperiksa silang.' : 'Pemeriksa tidak memberi jawaban untuk soal ini. Coba lagi.');
                            }),
                        },
                        {
                          label: 'Buat soal serupa',
                          onClick: () => {
                            const n = Number(prompt('Berapa soal serupa yang ingin dibuat?', '3'));
                            if (!n || n < 1) return;
                            void act(q, () => moreLikeThis(set.id, q, Math.min(10, n), set.keyId));
                          },
                        },
                        { label: 'Pindah ke atas', disabled: q.locked || i === 0, onClick: () => void moveInSet(set.id, q.id, -1) },
                        { label: 'Pindah ke bawah', disabled: q.locked || i === questions.length - 1, onClick: () => void moveInSet(set.id, q.id, 1) },
                        { label: q.locked ? 'Buka kunci soal' : 'Kunci soal (cegah perubahan)', onClick: () => void db.questions.update(q.id, { locked: !q.locked }) },
                        {
                          label: 'Hapus dari set',
                          danger: true,
                          disabled: q.locked,
                          onClick: () => confirm('Hapus soal ini dari set? (Soal tetap tersimpan di Bank Soal)') && void removeFromSet(set.id, q.id),
                        },
                      ]}
                    />
                  </>
                )
              }
            />
          ))}
        </div>
      )}
      {editing && <QuestionEditor q={editing} onClose={() => setEditing(null)} />}
      {feedbackFor && <FeedbackDialog q={feedbackFor} onClose={() => setFeedbackFor(null)} />}
      {sharing && (
        <Suspense fallback={null}>
          <ShareDialog setId={set.id} name={set.name} onClose={() => setSharing(false)} />
        </Suspense>
      )}
      {downloading && (
        <DownloadDialog open onClose={() => setDownloading(false)} meta={{ name: set.name, durationMinutes: set.blueprint.durationMinutes }} questions={questions} />
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
    >
      {children}
    </button>
  );
}

/** Compact "⋯" menu so each question shows one button instead of eight. */
function ActionMenu({ items }: { items: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="relative">
      <summary className="btn btn-ghost btn-sm cursor-pointer list-none" title="Aksi lainnya">
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {items.map((it) => (
          <button
            key={it.label}
            disabled={it.disabled}
            className={`block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800 ${it.danger ? 'text-red-600 dark:text-red-400' : ''}`}
            onClick={() => {
              ref.current?.removeAttribute('open');
              it.onClick();
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function GenerationPanel({ set }: { set: QSet }) {
  const prog = useGenProgress(set.id);
  if (!set.batches.length) return null;
  const total = set.batches.reduce((n, b) => n + b.count, 0);
  const done = set.batches.filter((b) => b.status === 'done').reduce((n, b) => n + b.count, 0);
  const failed = set.batches.filter((b) => b.status === 'failed');
  const running = prog?.running ?? false;
  if (done === total && !running && !prog?.log.length) return null;
  const lastError = [...(prog?.log ?? [])].reverse().find((l) => l.level === 'error')?.message ?? failed[0]?.error;
  const finished = done === total && !running;

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">
          {running ? 'Sedang membuat soal…' : finished ? 'Semua soal selesai dibuat' : 'Pembuatan soal belum selesai'}{' '}
          <span className="muted font-normal">
            ({done} dari {total} soal)
          </span>
        </div>
        {running ? (
          <button className="btn btn-sm" onClick={() => stopGeneration(set.id)}>
            Hentikan
          </button>
        ) : (
          !finished && (
            <button className="btn btn-primary btn-sm" onClick={() => startGeneration(set.id)}>
              Lanjutkan membuat soal
            </button>
          )
        )}
      </div>
      <ProgressBar value={done} max={total} />
      {running && prog?.waitUntil && <WaitCountdown until={prog.waitUntil} />}
      {!running && !finished && lastError && (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{lastError}</p>
      )}
      {running && <p className="muted text-xs">Soal tersimpan otomatis. Anda boleh membuka halaman lain selama tab ini tetap terbuka.</p>}
      {prog?.log.length ? (
        <details>
          <summary className="muted cursor-pointer text-xs">Lihat detail proses</summary>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs">
            {prog.log.map((l, i) => (
              <li key={i} className={l.level === 'error' ? 'text-red-600 dark:text-red-400' : 'muted'}>
                {new Date(l.at).toLocaleTimeString('id-ID')} · {l.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function WaitCountdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  if (!left) return null;
  return (
    <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      Jeda sebentar ({left} detik) agar tidak melewati batas kuota gratis. Proses berlanjut otomatis.
    </div>
  );
}
