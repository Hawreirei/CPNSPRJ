import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, useSettings } from '../db';
import { TOPICS } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import type { Blueprint, Question, Subtest } from '../domain/types';
import { createBankSet } from '../engine/sets';
import { normalizeText } from '../lib/id';
import { QuestionCard, type CardMode } from '../components/QuestionCard';
import { QuestionEditor } from '../components/QuestionEditor';
import { Empty } from '../components/ui';

const PAGE = 30;

export default function QuestionBank() {
  const nav = useNavigate();
  const settings = useSettings();
  const all = useLiveQuery(() => db.questions.orderBy('createdAt').reverse().toArray(), []);
  const [q, setQ] = useState('');
  const [sub, setSub] = useState<Subtest | ''>('');
  const [topic, setTopic] = useState('');
  const [diff, setDiff] = useState('');
  const [only, setOnly] = useState<'' | 'starred' | 'flagged'>('');
  const [mode, setMode] = useState<CardMode>('soal');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Question | null>(null);

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
    const counts = Object.fromEntries(SUBTESTS.map((s) => [s, qs.filter((x) => x.subtest === s).length])) as Record<Subtest, number>;
    const total = qs.length;
    const blueprint: Blueprint = {
      sections: SUBTESTS.filter((s) => counts[s]).map((s) => ({
        subtest: s,
        count: counts[s],
        topics: [...new Set(qs.filter((x) => x.subtest === s).map((x) => x.topic))],
        difficulty: 'campuran',
      })),
      durationMinutes: Math.max(5, Math.round((settings.durationMinutes * total) / 110)),
      passing: { ...settings.passing },
    };
    const name = prompt('Nama set:', `Set dari bank · ${new Date().toLocaleDateString('id-ID')}`);
    if (!name) return;
    const set = await createBankSet(name, blueprint, qs);
    nav(`/sets/${set.id}`);
  }

  async function deleteSelected() {
    if (!confirm(`Hapus ${selected.size} soal dari bank? Soal juga dikeluarkan dari semua set.`)) return;
    const ids = [...selected];
    await db.transaction('rw', db.questions, db.sets, async () => {
      await db.questions.bulkDelete(ids);
      await db.sets.toCollection().modify((s) => {
        s.questionIds = s.questionIds.filter((id) => !selected.has(id));
      });
    });
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      <div>
        <h1>Bank Soal</h1>
        <p className="muted mt-1">
          {all.length} soal dari semua set. Susun set baru dari bank tanpa biaya AI: pilih soal di bawah, atau gunakan "Ambil dari bank soal" di Set Baru.
        </p>
      </div>

      <div className="card grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input className="input lg:col-span-2" placeholder="Cari teks soal…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="input"
          value={sub}
          onChange={(e) => {
            setSub(e.target.value as Subtest | '');
            setTopic('');
          }}
        >
          <option value="">Semua sub-tes</option>
          {SUBTESTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Semua topik</option>
          {(sub ? TOPICS[sub] : SUBTESTS.flatMap((s) => TOPICS[s])).map((t) => (
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
          <option value="">Semua</option>
          <option value="starred">Berbintang</option>
          <option value="flagged">Perlu dicek</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="muted">{filtered.length} cocok</span>
        <button className="btn btn-sm" onClick={() => setSelected(new Set(filtered.map((x) => x.id)))}>
          Pilih semua hasil
        </button>
        {selected.size > 0 && (
          <>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
              Batal pilih ({selected.size})
            </button>
            <button className="btn btn-primary btn-sm" onClick={buildFromSelection}>
              Buat set dari {selected.size} soal
            </button>
            <button className="btn btn-danger btn-sm" onClick={deleteSelected}>
              Hapus
            </button>
          </>
        )}
        <select className="input ml-auto w-auto" value={mode} onChange={(e) => setMode(e.target.value as CardMode)}>
          <option value="soal">Tampilkan soal</option>
          <option value="pembahasan">Tampilkan pembahasan</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty title="Tidak ada soal">Soal yang Anda buat akan otomatis masuk ke bank soal.</Empty>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, limit).map((x) => (
            <QuestionCard
              key={x.id}
              q={x}
              mode={mode}
              actions={
                <>
                  <label className="btn btn-ghost btn-sm">
                    <input type="checkbox" checked={selected.has(x.id)} onChange={() => toggle(x.id)} /> pilih
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={() => db.questions.update(x.id, { starred: !x.starred })}>
                    {x.starred ? '★' : '☆'}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={x.locked} onClick={() => setEditing(x)}>
                    Edit
                  </button>
                </>
              }
            />
          ))}
          {filtered.length > limit && (
            <button className="btn w-full" onClick={() => setLimit((l) => l + PAGE)}>
              Tampilkan lebih banyak
            </button>
          )}
        </div>
      )}
      {editing && <QuestionEditor q={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
