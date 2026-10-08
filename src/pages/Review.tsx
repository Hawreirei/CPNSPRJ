import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db, useSettings } from '../db';
import { feedback } from '../domain/practice';
import { GRADES, REASON_TAGS, SUBTESTS } from '../domain/types';
import type { Grade, OptionLabel, Question, ReasonTag, ReviewItem, Subtest } from '../domain/types';
import { backfillFromHistory, gradeReview, removeReview, setReasonTags } from '../engine/review';
import { addDays, dueQueue, fmtDue, fmtInterval, isDue, nextInterval, reviewedToday } from '../engine/srs';
import { AnswerOptions, FeedbackBanner } from '../components/AnswerOptions';
import { StemMedia } from '../components/DataView';
import { PassageView } from '../components/PassageView';
import { Explanation } from '../components/QuestionCard';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { RichText } from '../components/RichText';
import { Badge, Empty, SubtestBadge } from '../components/ui';
import { inExamOrder } from '../domain/examPackage';

const GRADE_LABEL: Record<Grade, string> = { lupa: 'Lupa', sulit: 'Sulit', baik: 'Baik', mudah: 'Mudah' };
const TAG_LABEL = Object.fromEntries(REASON_TAGS.map((t) => [t.id, t.label])) as Record<ReasonTag, string>;

export default function Review() {
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'semua' ? 'semua' : 'ulang';
  // `now` is read with the data so it refreshes on every change without calling Date.now() during render.
  const data = useLiveQuery(async () => ({ items: await db.reviews.toArray(), now: Date.now() }), []);
  const finishedAttempts = useLiveQuery(() => db.attempts.filter((a) => !!a.result).count(), []);
  const [msg, setMsg] = useState('');

  if (!data || finishedAttempts === undefined) return null;
  const { items, now } = data;
  const dueCount = items.filter((r) => isDue(r, now)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1>Buku Kesalahan</h1>
        <p className="muted mt-1">
          Soal yang salah, kosong, atau ditandai ragu-ragu masuk ke sini otomatis setelah ujian atau latihan selesai, lalu dijadwalkan ulang: makin sering
          Anda ingat, makin jarang soal itu muncul.
        </p>
      </div>

      {items.length === 0 ? (
        <Empty title="Belum ada catatan">
          <p>Selesaikan ujian atau latihan; soal yang perlu diulang akan muncul di sini.</p>
          {finishedAttempts > 0 && (
            <button
              className="btn btn-primary mt-3"
              onClick={async () => {
                const n = await backfillFromHistory();
                setMsg(n ? `${n} soal dari riwayat ditambahkan.` : 'Semua jawaban di riwayat sudah benar. Tidak ada yang perlu diulang.');
              }}
            >
              Ambil dari {finishedAttempts} simulasi sebelumnya
            </button>
          )}
          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </Empty>
      ) : (
        <>
          <div role="tablist" className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
            {(
              [
                ['ulang', `Ulangan hari ini (${dueCount})`],
                ['semua', `Semua catatan (${items.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setParams(id === 'ulang' ? {} : { tab: id }, { replace: true })}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-brand-500 text-brand-700 dark:text-brand-100' : 'border-transparent text-slate-500 dark:text-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'ulang' ? <Session items={items} now={now} limit={settings.reviewDailyLimit} /> : <Notebook items={items} now={now} />}
        </>
      )}
    </div>
  );
}

/** Today's review run. The queue is fixed when the session starts so grading never reshuffles it. */
function Session({ items, now, limit }: { items: ReviewItem[]; now: number; limit: number }) {
  const [extra, setExtra] = useState(0);
  const [queue, setQueue] = useState(() => dueQueue(items, now, limit).map((r) => r.questionId));
  const [pos, setPos] = useState(0);
  const [graded, setGraded] = useState(0);
  const questions = useLiveQuery(async () => {
    const rows = await db.questions.bulkGet(queue);
    return new Map(rows.filter((q): q is Question => !!q).map((q) => [q.id, q]));
  }, [queue]);

  const done = reviewedToday(items, now);
  const dueLeft = items.filter((r) => isDue(r, now)).length;
  const header = (
    <div className="muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span>
        Diulang hari ini: <b className="text-slate-800 dark:text-slate-100">{done}</b> / {limit + extra}
      </span>
      <span>Masih jatuh tempo: {dueLeft}</span>
      <Link className="underline" to="/settings">
        ubah batas harian
      </Link>
    </div>
  );

  if (pos >= queue.length) {
    const tomorrow = addDays(now, 1);
    const inWeek = addDays(now, 7);
    const nextDay = items.filter((r) => r.due >= tomorrow && r.due < addDays(now, 2)).length;
    const week = items.filter((r) => r.due >= tomorrow && r.due < inWeek).length;
    return (
      <div className="space-y-3">
        {header}
        <div className="card space-y-2">
          <h2>{graded > 0 ? 'Ulangan hari ini selesai' : dueLeft > 0 ? 'Batas harian tercapai' : 'Tidak ada ulangan hari ini'}</h2>
          {graded > 0 && <p className="text-sm">{graded} soal diulang di sesi ini.</p>}
          <p className="muted text-sm">
            Besok: {nextDay} soal · 7 hari ke depan: {week} soal.
          </p>
          {dueLeft > 0 && (
            <button
              className="btn"
              onClick={() => {
                const more = extra + 10;
                setExtra(more);
                setQueue(dueQueue(items, Date.now(), limit + more).map((r) => r.questionId));
                setPos(0);
              }}
            >
              Ulangi 10 soal lagi ({dueLeft} masih jatuh tempo)
            </button>
          )}
        </div>
      </div>
    );
  }

  const id = queue[pos];
  const item = items.find((r) => r.questionId === id);
  const q = questions?.get(id);
  const next = () => setPos((p) => p + 1);

  return (
    <div className="space-y-3">
      {header}
      <div className="muted text-xs">
        Soal {pos + 1} dari {queue.length}
      </div>
      {!questions ? null : !q || !item ? (
        <div className="card space-y-2">
          <p className="text-sm">Soal ini sudah tidak ada di bank soal.</p>
          <button
            className="btn"
            onClick={async () => {
              await removeReview(id);
              next();
            }}
          >
            Hapus dari catatan & lanjut
          </button>
        </div>
      ) : (
        <ReviewCard
          key={id}
          q={q}
          item={item}
          onGrade={async (g) => {
            await gradeReview(id, g);
            setGraded((n) => n + 1);
            next();
          }}
        />
      )}
    </div>
  );
}

function ReviewCard({ q, item, onGrade }: { q: Question; item: ReviewItem; onGrade: (g: Grade) => void }) {
  const [chosen, setChosen] = useState<OptionLabel | undefined>();
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const fb = chosen ? feedback(q, chosen) : null;
  const best = feedback(q, 'A').best.join(', ');
  const suggested: Grade = fb?.correct ? 'baik' : 'lupa';

  function answer(label: OptionLabel) {
    if (revealed) return;
    setChosen(label);
    setRevealed(true);
  }
  function grade(g: Grade) {
    if (!revealed || busy) return;
    setBusy(true);
    onGrade(g);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (!revealed && ['A', 'B', 'C', 'D', 'E'].includes(k)) answer(k as OptionLabel);
      else if (!revealed && (e.key === ' ' || (e.key === 'Enter' && tag !== 'BUTTON'))) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) grade(GRADES[Number(e.key) - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <article className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SubtestBadge subtest={q.subtest} />
        <Badge>{q.topic}</Badge>
        {item.lapses > 0 && <Badge tone="amber">terlupa {item.lapses}×</Badge>}
        {item.reps > 0 && <Badge>ulangan ke-{item.reps + 1}</Badge>}
      </div>
      {q.passage && <PassageView passage={q.passage} />}
      <div className="text-[15px] leading-relaxed">
        <RichText text={q.stem} />
      </div>
      <StemMedia q={q} />
      <AnswerOptions q={q} chosen={chosen} revealed={revealed} onAnswer={answer} />

      {!revealed ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn" onClick={() => setRevealed(true)}>
            Tampilkan jawaban
          </button>
          <span className="muted text-xs">Coba jawab dulu (A–E) sebelum melihat pembahasan. Spasi untuk langsung melihat jawaban.</span>
        </div>
      ) : (
        <div aria-live="polite">
          <FeedbackBanner q={q} answer={chosen} />
          {q.subtest === 'TKP' && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Fokus TKP: pahami <b>mengapa opsi {best}</b> paling sesuai dengan nilai pelayanan publik dan profesionalisme, lalu bandingkan dengan pilihan Anda.
            </p>
          )}
          <Explanation q={q} userAnswer={chosen} onFeedback={() => setFeedbackOpen(true)} />
          {feedbackOpen && <FeedbackDialog q={q} onClose={() => setFeedbackOpen(false)} />}
          <ReasonTags item={item} />

          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className="mb-2 text-sm font-medium">Seberapa ingat Anda?</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g, i) => (
                <button key={g} className={`btn flex-col gap-0 py-2 ${g === suggested ? 'btn-primary' : ''}`} disabled={busy} onClick={() => grade(g)}>
                  <span>
                    {i + 1}. {GRADE_LABEL[g]}
                  </span>
                  <span className="text-xs font-normal opacity-80">{fmtInterval(nextInterval(item, g).interval)}</span>
                </button>
              ))}
            </div>
            <p className="muted mt-2 text-xs">Angka di bawah tombol: kapan soal ini muncul lagi. Pintasan: tombol 1–4.</p>
          </div>
        </div>
      )}
    </article>
  );
}

/** Optional one-tap tags saying why the question went wrong. Saved immediately. */
function ReasonTags({ item }: { item: ReviewItem }) {
  const [tags, setTags] = useState<ReasonTag[]>(item.reasonTags);
  const toggle = (t: ReasonTag) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setTags(next);
    void setReasonTags(item.questionId, next);
  };
  return (
    <div className="mt-3">
      <div className="muted mb-1 text-xs">Kenapa salah? (opsional)</div>
      <div className="flex flex-wrap gap-1.5">
        {REASON_TAGS.map((t) => {
          const on = tags.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t.id)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'border-slate-300 text-slate-500 dark:text-slate-400 dark:border-slate-700'}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Every notebook entry, with filters, its schedule, and the explanation on demand. */
function Notebook({ items, now }: { items: ReviewItem[]; now: number }) {
  const [subtest, setSubtest] = useState<Subtest | ''>('');
  const [tag, setTag] = useState<ReasonTag | ''>('');
  const [feedbackFor, setFeedbackFor] = useState<Question | null>(null);
  const questions = useLiveQuery(async () => {
    const rows = await db.questions.bulkGet(items.map((r) => r.questionId));
    return new Map(rows.filter((q): q is Question => !!q).map((q) => [q.id, q]));
  }, [items]);
  if (!questions) return null;
  const rows = items
    .map((r) => ({ r, q: questions.get(r.questionId) }))
    .filter((x): x is { r: ReviewItem; q: Question } => !!x.q)
    .filter(({ r, q }) => (!subtest || q.subtest === subtest) && (!tag || r.reasonTags.includes(tag)))
    .sort((a, b) => a.r.due - b.r.due);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={subtest} onChange={(e) => setSubtest(e.target.value as Subtest | '')} aria-label="Sub-tes">
          <option value="">Semua sub-tes</option>
          {inExamOrder([...SUBTESTS, ...[...questions.values()].map((q) => q.subtest)]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value as ReasonTag | '')} aria-label="Alasan salah">
          <option value="">Semua alasan</option>
          {REASON_TAGS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="muted self-center text-sm">{rows.length} soal</span>
      </div>
      {rows.length === 0 && <p className="muted">Tidak ada catatan yang cocok.</p>}
      {rows.map(({ r, q }) => (
        <article key={r.questionId} className="card space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <SubtestBadge subtest={q.subtest} />
            <Badge>{q.topic}</Badge>
            <Badge tone={isDue(r, now) ? 'amber' : 'slate'}>ulang {fmtDue(r.due, now)}</Badge>
            {r.lapses > 0 && <Badge tone="red">terlupa {r.lapses}×</Badge>}
            {r.reasonTags.map((t) => (
              <Badge key={t} tone="amber">
                {TAG_LABEL[t]}
              </Badge>
            ))}
            {/* Outside the <summary>: a button inside it would be a control nested in a control. */}
            <button
              className="btn btn-ghost btn-sm ml-auto"
              onClick={async () => {
                if (confirm('Hapus soal ini dari Buku Kesalahan? Soal tetap ada di bank soal.')) await removeReview(r.questionId);
              }}
            >
              Sudah paham, hapus
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-sm leading-relaxed">
              <span className="line-clamp-2 inline">
                <RichText text={q.stem} />
              </span>
            </summary>
            {q.passage && <PassageView passage={q.passage} mode="closed" />}
            <StemMedia q={q} />
            <AnswerOptions q={q} revealed onAnswer={() => {}} />
            <Explanation q={q} onFeedback={() => setFeedbackFor(q)} />
          </details>
        </article>
      ))}
      {feedbackFor && <FeedbackDialog q={feedbackFor} onClose={() => setFeedbackFor(null)} />}
    </div>
  );
}
