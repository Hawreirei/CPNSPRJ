import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db, getSetQuestions } from '../db';
import { SUBTESTS } from '../domain/types';
import type { QSet, Question, Subtest } from '../domain/types';
import { moreLikeThis, rewriteQuestion, startGeneration, stopGeneration, useGenProgress } from '../engine/generator';
import { moveInSet, removeFromSet } from '../engine/sets';
import { batchLabel } from '../engine/plan';
import { exportDocx, type PackKind } from '../lib/exportDocx';
import { QuestionCard, type CardMode } from '../components/QuestionCard';
import { QuestionEditor } from '../components/QuestionEditor';
import { Badge, downloadBlob, Empty, ProgressBar } from '../components/ui';
import { StatusBadge } from './Dashboard';

export default function SetDetail() {
  const { setId = '' } = useParams();
  const set = useLiveQuery(async () => (await db.sets.get(setId)) ?? null, [setId]);
  const questions = useLiveQuery(async () => (set ? getSetQuestions(set) : []), [set]);
  const [mode, setMode] = useState<CardMode>('soal');
  const [filter, setFilter] = useState<'all' | 'flagged' | 'starred'>('all');
  const [sub, setSub] = useState<Subtest | 'all'>('all');
  const [editing, setEditing] = useState<Question | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (set === undefined || !questions) return null;
  if (set === null) return <Empty title="Set tidak ditemukan" />;

  const flaggedCount = questions.filter((q) => q.flags.some((f) => f.severity === 'warn')).length;
  const shown = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => (sub === 'all' || q.subtest === sub) && (filter === 'all' || (filter === 'flagged' ? q.flags.some((f) => f.severity === 'warn') : q.starred)));

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <input
            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none focus:underline"
            defaultValue={set.name}
            onBlur={(e) => e.target.value.trim() && db.sets.update(set.id, { name: e.target.value.trim() })}
            aria-label="Nama set"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={set.status} />
            <span className="muted">
              {questions.length} soal
              {SUBTESTS.map((s) => {
                const n = questions.filter((q) => q.subtest === s).length;
                return n ? ` · ${s} ${n}` : '';
              })}
            </span>
            {set.usage.requests > 0 && (
              <span className="muted">
                · {set.usage.requests} permintaan, {Math.round((set.usage.inputTokens + set.usage.outputTokens) / 1000)}k token
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={`btn btn-primary ${questions.length ? '' : 'pointer-events-none opacity-50'}`} to={`/simulation?set=${set.id}`}>
            Simulasi CAT
          </Link>
          <ExportMenu set={set} questions={questions} />
        </div>
      </div>

      <GenerationPanel set={set} />

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        {(
          [
            ['soal', 'Soal'],
            ['kunci', 'Kunci & Skor'],
            ['pembahasan', 'Pembahasan'],
          ] as const
        ).map(([m, label]) => (
          <button key={m} className={`tab ${mode === m ? 'tab-active' : ''}`} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2 pb-2">
          <select className="input w-auto" value={sub} onChange={(e) => setSub(e.target.value as Subtest | 'all')}>
            <option value="all">Semua sub-tes</option>
            {SUBTESTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Semua soal</option>
            <option value="flagged">Perlu dicek ({flaggedCount})</option>
            <option value="starred">Berbintang</option>
          </select>
        </div>
      </div>

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
              actions={
                <QuestionActions
                  q={q}
                  busy={busyId === q.id}
                  onStar={() => db.questions.update(q.id, { starred: !q.starred })}
                  onLock={() => db.questions.update(q.id, { locked: !q.locked })}
                  onEdit={() => setEditing(q)}
                  onRewrite={() => {
                    const instr = prompt('Instruksi penulisan ulang (opsional), misal "buat lebih sulit", "ganti konteks ke desa":', '');
                    if (instr === null) return;
                    void act(q, () => rewriteQuestion(q, instr, set.keyId));
                  }}
                  onMore={() => {
                    const n = Number(prompt('Berapa soal serupa?', '3'));
                    if (!n || n < 1) return;
                    void act(q, () => moreLikeThis(set.id, q, Math.min(10, n), set.keyId));
                  }}
                  onUp={() => moveInSet(set.id, q.id, -1)}
                  onDown={() => moveInSet(set.id, q.id, 1)}
                  onRemove={() => confirm('Keluarkan soal dari set ini? (Soal tetap ada di bank soal)') && removeFromSet(set.id, q.id)}
                />
              }
            />
          ))}
        </div>
      )}
      {editing && <QuestionEditor q={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function QuestionActions(p: {
  q: Question;
  busy: boolean;
  onStar: () => void;
  onLock: () => void;
  onEdit: () => void;
  onRewrite: () => void;
  onMore: () => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const locked = p.q.locked;
  if (p.busy) return <Badge tone="blue">memproses…</Badge>;
  return (
    <>
      <button className="btn btn-ghost btn-sm" title="Bintangi" onClick={p.onStar}>
        {p.q.starred ? '★' : '☆'}
      </button>
      <button className="btn btn-ghost btn-sm" title={locked ? 'Buka kunci' : 'Kunci soal'} onClick={p.onLock}>
        {locked ? 'Buka' : 'Kunci'}
      </button>
      <button className="btn btn-ghost btn-sm" disabled={locked} onClick={p.onEdit}>
        Edit
      </button>
      <button className="btn btn-ghost btn-sm" disabled={locked || p.q.source === 'procedural'} onClick={p.onRewrite}>
        Tulis ulang
      </button>
      <button className="btn btn-ghost btn-sm" onClick={p.onMore}>
        Serupa+
      </button>
      <button className="btn btn-ghost btn-sm" disabled={locked} title="Naik" onClick={p.onUp}>
        ↑
      </button>
      <button className="btn btn-ghost btn-sm" disabled={locked} title="Turun" onClick={p.onDown}>
        ↓
      </button>
      <button className="btn btn-ghost btn-sm text-red-600" disabled={locked} title="Keluarkan dari set" onClick={p.onRemove}>
        ✕
      </button>
    </>
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

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">
          Pembuatan soal: {done}/{total}
        </div>
        <div className="flex gap-2">
          {running ? (
            <button className="btn btn-sm" onClick={() => stopGeneration(set.id)}>
              Hentikan
            </button>
          ) : (
            done < total && (
              <button className="btn btn-primary btn-sm" onClick={() => startGeneration(set.id)}>
                {failed.length ? 'Coba lagi yang gagal' : 'Lanjutkan'}
              </button>
            )
          )}
        </div>
      </div>
      <ProgressBar value={done} max={total} />
      {running && prog?.current.length ? <div className="muted text-xs">Sedang dibuat: {prog.current.join(' | ')}</div> : null}
      {running && prog?.waitUntil && <WaitCountdown until={prog.waitUntil} reason={prog.waitReason} />}
      {prog?.log.length ? (
        <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs">
          {prog.log.map((l, i) => (
            <li key={i} className={l.level === 'error' ? 'text-red-600 dark:text-red-400' : 'muted'}>
              {new Date(l.at).toLocaleTimeString('id-ID')} · {l.message}
            </li>
          ))}
        </ul>
      ) : failed.length && !running ? (
        <ul className="text-xs text-red-600">
          {failed.map((b) => (
            <li key={b.id}>
              {batchLabel(b)}: {b.error}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted text-xs">Soal tersimpan otomatis per batch. Anda boleh meninggalkan halaman ini; proses berjalan selama tab terbuka.</p>
    </div>
  );
}

function ExportMenu({ set, questions }: { set: QSet; questions: Question[] }) {
  const [busy, setBusy] = useState(false);
  const packs: [PackKind, string][] = [
    ['soal', 'Paket siswa (soal)'],
    ['kunci', 'Kunci & skor'],
    ['pembahasan', 'Pembahasan'],
    ['lengkap', 'Lengkap'],
  ];
  return (
    <details className="relative">
      <summary className="btn cursor-pointer list-none">{busy ? 'Mengekspor…' : 'Ekspor ▾'}</summary>
      <div className="absolute right-0 z-10 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="px-2 py-1 text-xs font-semibold text-slate-500">Word (.docx)</div>
        {packs.map(([k, label]) => (
          <button
            key={k}
            className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            disabled={busy || !questions.length}
            onClick={async () => {
              setBusy(true);
              try {
                const blob = await exportDocx(set, questions, k);
                downloadBlob(blob, `${set.name.replace(/[^\w\- ]+/g, '')} - ${k}.docx`);
              } finally {
                setBusy(false);
              }
            }}
          >
            {label}
          </button>
        ))}
        <div className="mt-1 px-2 py-1 text-xs font-semibold text-slate-500">PDF (cetak)</div>
        {packs.map(([k, label]) => (
          <a key={k} className="block rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" href={`#/print/${set.id}?pack=${k}`} target="_blank" rel="noreferrer">
            {label}
          </a>
        ))}
      </div>
    </details>
  );
}

function WaitCountdown({ until, reason }: { until: number; reason?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  if (!left) return null;
  return (
    <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      Menunggu {left} detik ({reason ?? 'batas kuota'}) supaya tidak melewati batas API key. Proses berlanjut otomatis.
    </div>
  );
}
