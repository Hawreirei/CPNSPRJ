import { useState } from 'react';
import { activeProfile, allProfiles, BUILTIN_ID, examNumbersOf, isBuiltinProfile } from '../domain/blueprint';
import { parseProfile, profileFile, textToTopics, topicsToText } from '../domain/kisi';
import { SUBTESTS } from '../domain/types';
import type { KisiProfile, Settings, Subtest } from '../domain/types';
import { activateProfile, deleteProfile, importProfile, saveProfile } from '../engine/kisi';
import { uid } from '../lib/id';
import { Modal } from './ui';
import { errorText } from '../engine/storage';
import { downloadBlob } from '../lib/download';

/** Pick, share and edit the syllabus profile that decides the topics offered for new questions. */
export function KisiProfiles({ settings }: { settings: Settings }) {
  const profiles = allProfiles(settings);
  const active = activeProfile(settings);
  const [editing, setEditing] = useState<KisiProfile | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function run(fn: () => Promise<string>) {
    setMsg(null);
    try {
      setMsg({ text: await fn() });
    } catch (e) {
      setMsg({ text: errorText(e), error: true });
    }
  }

  function choose(id: string) {
    const p = profiles.find((x) => x.id === id)!;
    if (p.exam && !confirm('Jumlah soal, durasi, dan ambang batas di Pengaturan akan diganti dengan nilai dari profil ini. Lanjutkan?')) return;
    void run(async () => {
      await activateProfile(id);
      return `Profil "${p.name}" dipakai untuk set baru.`;
    });
  }

  const duplicate = () =>
    setEditing({
      ...structuredClone(active),
      id: uid(),
      name: `${active.name} (salinan)`,
      source: active.id === BUILTIN_ID ? undefined : active.source,
      exam: examNumbersOf(settings),
    });

  return (
    <div className="space-y-3">
      <p className="muted text-sm">
        Profil menentukan topik yang ditawarkan saat membuat soal baru, dan bisa membawa jumlah soal, durasi, dan ambang batas. Bila kisi-kisi berubah, buat atau impor profil baru
        tanpa menunggu aplikasi diperbarui. Soal lama dengan topik di luar profil tetap tersimpan dan bisa dipakai.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="kisi-active">
            Profil yang dipakai
          </label>
          <select id="kisi-active" className="input" value={active.id} onChange={(e) => choose(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" onClick={duplicate}>
          Duplikat & ubah
        </button>
        {!isBuiltinProfile(active.id) && (
          <button className="btn" onClick={() => setEditing(structuredClone(active))}>
            Ubah
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
        <div className="font-medium">{active.name}</div>
        {/* Only a learner's own profile shows where it came from; the app's own sources stay in the code. */}
        {!isBuiltinProfile(active.id) && (active.source || active.date) && (
          <div className="muted text-xs">
            {[active.source, active.date && new Date(`${active.date}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
        {active.notes?.length ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            {active.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs">
            Topik: {SUBTESTS.map((s) => `${s} ${active.topics[s].length}`).join(' · ')}
            {active.exam && ` · ${active.exam.counts.TWK + active.exam.counts.TIU + active.exam.counts.TKP} soal, ${active.exam.durationMinutes} menit`}
          </summary>
          <dl className="mt-2 space-y-1 text-xs">
            {SUBTESTS.map((s) => (
              <div key={s}>
                <dt className="inline font-medium">{s}: </dt>
                <dd className="inline">{active.topics[s].map((t) => (t.weight && t.weight !== 1 ? `${t.name} (bobot ${t.weight})` : t.name)).join(', ')}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="btn btn-sm cursor-pointer">
          Impor profil (.json)
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file)
                void run(async () => {
                  const p = await importProfile(await file.text());
                  return `Profil "${p.name}" diimpor. Pilih di atas untuk memakainya.`;
                });
            }}
          />
        </label>
        <button className="btn btn-sm" onClick={() => downloadBlob(new Blob([profileFile(active)], { type: 'application/json' }), `kisi-kisi-${slug(active.name)}.json`)}>
          Ekspor profil ini
        </button>
        {!isBuiltinProfile(active.id) && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() =>
              confirm(`Hapus profil "${active.name}"? Topik kembali ke profil bawaan; jumlah soal dan ambang batas tidak berubah.`) &&
              void run(async () => {
                await deleteProfile(active.id);
                return 'Profil dihapus.';
              })
            }
          >
            Hapus profil ini
          </button>
        )}
      </div>
      {msg && (
        <p role={msg.error ? 'alert' : 'status'} className={`text-sm ${msg.error ? 'text-red-600 dark:text-red-400' : ''}`}>
          {msg.text}
        </p>
      )}
      {editing && (
        <ProfileEditor
          initial={editing}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={(p) => setMsg({ text: `Profil "${p.name}" disimpan.${p.id === active.id ? '' : ' Pilih di atas untuk memakainya.'}` })}
        />
      )}
    </div>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'profil';

type ExamChoice = 'keep' | 'current' | 'none';

function ProfileEditor({ initial, settings, onClose, onSaved }: { initial: KisiProfile; settings: Settings; onClose: () => void; onSaved: (p: KisiProfile) => void }) {
  const [name, setName] = useState(initial.name);
  const [source, setSource] = useState(initial.source ?? '');
  const [date, setDate] = useState(initial.date ?? '');
  const [topics, setTopics] = useState(() => Object.fromEntries(SUBTESTS.map((s) => [s, topicsToText(initial.topics[s])])) as Record<Subtest, string>);
  const [exam, setExam] = useState<ExamChoice>(initial.exam ? 'keep' : 'none');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      const p = parseProfile(
        {
          version: 1,
          name,
          source: source || undefined,
          date,
          topics: Object.fromEntries(SUBTESTS.map((s) => [s, textToTopics(topics[s])])),
          exam: exam === 'keep' ? initial.exam : exam === 'current' ? examNumbersOf(settings) : undefined,
          // Not editable here; a copy keeps the notes of the profile it came from.
          notes: initial.notes,
        },
        initial.id,
      );
      await saveProfile(p);
      onSaved(p);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Modal open onClose={onClose} title="Profil kisi-kisi" wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="kp-name">
              Nama profil
            </label>
            <input id="kp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="kp-date">
              Tanggal sumber (opsional)
            </label>
            <input id="kp-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="kp-source">
            Sumber (opsional)
          </label>
          <input id="kp-source" className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Misalnya nomor dan judul keputusan resmi" />
        </div>
        <p className="muted text-xs">Satu topik per baris. Bobot opsional setelah tanda |, misalnya "Pancasila | 2" berarti dua kali lebih banyak soal dari topik lain.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {SUBTESTS.map((s) => (
            <div key={s}>
              <label className="label" htmlFor={`kp-topics-${s}`}>
                Topik {s}
              </label>
              <textarea id={`kp-topics-${s}`} className="input min-h-48 font-mono text-xs" value={topics[s]} onChange={(e) => setTopics((t) => ({ ...t, [s]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="kp-exam">
            Jumlah soal, durasi, dan ambang batas
          </label>
          <select id="kp-exam" className="input" value={exam} onChange={(e) => setExam(e.target.value as ExamChoice)}>
            {initial.exam && <option value="keep">Pertahankan angka di profil ini</option>}
            <option value="current">Ambil dari Pengaturan saat ini</option>
            <option value="none">Tidak disertakan (hanya topik)</option>
          </select>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" onClick={() => void save()}>
            Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}
