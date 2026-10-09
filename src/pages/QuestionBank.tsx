import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { db, useSettings } from '../db';
import { fullExam, fullExamOf, topicsFor } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import type { Blueprint, Question, Subtest } from '../domain/types';
import { createBankSet } from '../engine/sets';
import { normalizeText } from '../lib/id';
import { QuestionCard, type CardMode } from '../components/QuestionCard';
import { QuestionEditor } from '../components/QuestionEditor';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { answerStats, isReported } from '../domain/quality';
import { Empty } from '../components/ui';
import { DownloadDialog } from '../components/DownloadDialog';
import { inExamOrder, inSubtestOrder, packageOf, subtestsIn } from '../domain/examPackage';

const PAGE = 30;

export default function QuestionBank() {
  const nav = useNavigate();
  // Set by the photo import after saving.
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const [today] = useState(() => new Date().toLocaleDateString('id-ID'));
  const settings = useSettings();
  const all = useLiveQuery(() => db.questions.orderBy('createdAt').reverse().toArray(), []);
  const [q, setQ] = useState('');
  const [sub, setSub] = useState<Subtest | ''>('');
  // SKD always, plus the sub-tests of other exam packages that have questions here.
  const bankSubtests = useMemo(() => inExamOrder([...SUBTESTS, ...(all ?? []).map((x) => x.subtest)]), [all]);
  const [topic, setTopic] = useState('');
  const [diff, setDiff] = useState('');
  const [only, setOnly] = useState<'' | 'starred' | 'flagged' | 'reported'>('');
  const [mode, setMode] = useState<CardMode>('soal');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Question | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Question | null>(null);
  const attempts = useLiveQuery(() => db.attempts.toArray(), []);
  const stats = useMemo(() => answerStats(attempts ?? [], all ?? []), [attempts, all]);
  const [downloading, setDownloading] = useState(false);

  // The profile's topics, plus any older ones questions in the bank still carry.
  const topicOptions = useMemo(() => {
    const subs = sub ? [sub] : bankSubtests;
    return [...new Set([...subs.flatMap((x) => topicsFor(settings, x)), ...(all ?? []).filter((x) => subs.includes(x.subtest)).map((x) => x.topic)])];
  }, [settings, sub, all, bankSubtests]);

  const filtered = useMemo(() => {
    if (!all) return [];
    const needle = normalizeText(q);
    return all.filter(
      (x) =>
        (!sub || x.subtest === sub) &&
        (!topic || x.topic === topic) &&
        (!diff || x.difficulty === diff) &&
        (only !== 'starred' || x.starred) &&
        (only !== 'flagged' || x.flags.some((f) => f.severity === 'warn')) &&
        (only !== 'reported' || isReported(x)) &&
        (!needle || normalizeText(`${x.stem} ${x.options.map((o) => o.text).join(' ')} ${x.topic}`).includes(needle)),
    );
  }, [all, q, sub, topic, diff, only]);

  if (!all) return null;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function buildFromSelection() {
    const qs = all!.filter((x) => selected.has(x.id));
    const subtests = subtestsIn(qs);
    const full = fullExamOf(packageOf(subtests[0] ?? 'TWK'), settings);
    const blueprint: Blueprint = {
      sections: subtests.map((s) => ({
        subtest: s,
        count: qs.filter((x) => x.subtest === s).length,
        topics: [...new Set(qs.filter((x) => x.subtest === s).map((x) => x.topic))],
        difficulty: 'campuran',
      })),
      durationMinutes: Math.max(5, Math.round((full.durationMinutes * qs.length) / (full.total || 110))),
      passing: Object.fromEntries(subtests.map((s) => [s, fullExam(s, settings).passing])),
    };
    const name = prompt('Beri nama set baru:', `Set dari bank · ${new Date().toLocaleDateString('id-ID')}`);
    if (!name) return;
    const set = await createBankSet(name, blueprint, qs);
    nav(`/sets/${set.id}`);
  }

  async function deleteSelected() {
    if (!confirm(`Hapus ${selected.size} soal dari bank? Soal juga dikeluarkan dari semua set.`)) return;
    const ids = [...selected];
    await db.transaction('rw', [db.questions, db.sets, db.reviews], async () => {
      await db.questions.bulkDelete(ids);
      await db.reviews.bulkDelete(ids);
      await db.sets.toCollection().modify((s) => {
        s.questionIds = s.questionIds.filter((id) => !selected.has(id));
      });
    });
    setSelected(new Set());
  }

  const selectedQs = all.filter((x) => selected.has(x.id));
  // Download the picked questions, or everything currently shown when nothing is picked.
  const toDownload = inSubtestOrder(selectedQs.length ? selectedQs : filtered);
  const moreFilters = !!(topic || diff || only);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Bank Soal</h1>
          <p className="muted mt-1">Semua soal yang pernah Anda buat ({all.length} soal). Centang soal untuk diunduh atau dijadikan set baru.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" to="/bank/import">
            📷 Impor dari foto/PDF
          </Link>
          <button className="btn btn-primary" disabled={!toDownload.length} onClick={() => setDownloading(true)}>
            ⬇ Unduh {selectedQs.length ? `${selectedQs.length} soal terpilih` : `${filtered.length} soal`}
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="card text-sm">
          {notice}
        </p>
      )}

      <div className="card space-y-3">
        <input className="input" placeholder="Cari soal…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap items-center gap-1.5">
          {['', ...bankSubtests].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => {
                setSub(s);
                setTopic('');
              }}
              className={`rounded-full border px-3 py-1 text-xs ${sub === s ? 'border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 dark:border-slate-700'}`}
            >
              {s || 'Semua'}
            </button>
          ))}
          <details className="ml-auto" open={moreFilters}>
            <summary className="muted cursor-pointer text-xs">Filter lainnya{moreFilters ? ' (aktif)' : ''}</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">Semua topik</option>
                {topicOptions.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <select className="input" value={diff} onChange={(e) => setDiff(e.target.value)}>
                <option value="">Semua kesulitan</option>
                <option>mudah</option>
                <option>sedang</option>
                <option>sulit</option>
              </select>
              <select className="input" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
                <option value="">Semua soal</option>
                <option value="starred">Berbintang saja</option>
                <option value="flagged">Perlu dicek saja</option>
                <option value="reported">Dilaporkan saja</option>
              </select>
            </div>
          </details>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="muted">{filtered.length} soal ditemukan</span>
        {filtered.length > 0 && (
          <button className="btn btn-sm" onClick={() => setSelected(new Set(filtered.map((x) => x.id)))}>
            Pilih semua
          </button>
        )}
        {selected.size > 0 && (
          <>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
              Batal pilih ({selected.size})
            </button>
            <button className="btn btn-sm" onClick={buildFromSelection}>
              Jadikan set baru
            </button>
            <button className="btn btn-danger btn-sm" onClick={deleteSelected}>
              Hapus
            </button>
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs">
          <input type="checkbox" checked={mode === 'pembahasan'} onChange={(e) => setMode(e.target.checked ? 'pembahasan' : 'soal')} />
          Tampilkan jawaban & pembahasan
        </label>
      </div>

      {filtered.length === 0 ? (
        <Empty title="Tidak ada soal">Soal yang Anda buat akan otomatis tersimpan di sini.</Empty>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, limit).map((x) => (
            <div key={x.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-5 h-4 w-4 shrink-0"
                checked={selected.has(x.id)}
                onChange={() => toggle(x.id)}
                aria-label="Pilih soal"
              />
              <div className="min-w-0 flex-1">
                <QuestionCard
                  q={x}
                  mode={mode}
                  stats={stats.get(x.id)}
                  onFeedback={() => setFeedbackFor(x)}
                  actions={
                    <>
                      <button className="btn btn-ghost btn-sm" title={x.starred ? 'Hapus bintang' : 'Beri bintang'} onClick={() => db.questions.update(x.id, { starred: !x.starred })}>
                        {x.starred ? '★' : '☆'}
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={x.locked} onClick={() => setEditing(x)}>
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setFeedbackFor(x)}>
                        {x.report ? 'Laporan' : 'Laporkan'}
                      </button>
                    </>
                  }
                />
              </div>
            </div>
          ))}
          {filtered.length > limit && (
            <button className="btn w-full" onClick={() => setLimit((l) => l + PAGE)}>
              Tampilkan lebih banyak
            </button>
          )}
        </div>
      )}
      {editing && <QuestionEditor q={editing} onClose={() => setEditing(null)} />}
      {feedbackFor && <FeedbackDialog q={feedbackFor} onClose={() => setFeedbackFor(null)} />}
      {downloading && (
        <DownloadDialog
          open
          onClose={() => setDownloading(false)}
          meta={{ name: `Soal pilihan ${today}`, durationMinutes: Math.max(5, Math.round((settings.durationMinutes * toDownload.length) / 110)) }}
          questions={toDownload}
        />
      )}
    </div>
  );
}
