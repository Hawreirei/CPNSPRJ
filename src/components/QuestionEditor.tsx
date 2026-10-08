import { useState } from 'react';
import { db, useSettings } from '../db';
import { topicsFor } from '../domain/blueprint';
import { hashText } from '../lib/id';
import { loadMath, validateQuestion } from '../domain/validators';
import type { Difficulty, OptionLabel, Question } from '../domain/types';
import { Modal } from './ui';
import { errorText } from '../engine/storage';
import { clampGraded, isGraded, keyedScore } from '../domain/examPackage';

/** Edits a question in the bank, or, with `onSave`, a draft not saved yet (photo import) that is handed back instead. */
export function QuestionEditor({ q, onClose, onSave }: { q: Question; onClose: () => void; onSave?: (q: Question) => void }) {
  const settings = useSettings();
  const [draft, setDraft] = useState<Question>(() => structuredClone(q));
  const [error, setError] = useState('');
  const [withdrawReport, setWithdrawReport] = useState(false);
  const set = <K extends keyof Question>(k: K, v: Question[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    const options = draft.options.map((o) => ({
      ...o,
      score: isGraded(draft.subtest) ? clampGraded(draft.subtest, o.score) : keyedScore(draft.subtest, o.label === draft.answer),
    }));
    try {
      await loadMath();
      const report = withdrawReport ? undefined : draft.report;
      const passage = draft.passage ? { ...draft.passage, text: draft.passage.text.trim() } : undefined;
      const hash = hashText((passage?.text ?? '') + draft.stem);
      const next = validateQuestion({ ...draft, report, passage, options, hash, updatedAt: Date.now() });
      if (onSave) {
        onSave(next);
        return onClose();
      }
      await db.transaction('rw', db.questions, async () => {
        await db.questions.put(next);
        // The passage is shared: an edit to it applies to every question of the group.
        if (passage && passage.text !== q.passage?.text) {
          await db.questions.filter((x) => x.passage?.id === passage.id && x.id !== q.id).modify((x) => {
            x.passage = passage;
            x.hash = hashText(passage.text + x.stem);
          });
        }
      });
      onClose();
    } catch (e) {
      setError(`Gagal menyimpan: ${errorText(e)}`);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit soal" wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="qe-topic">
              Topik
            </label>
            <select id="qe-topic" className="input" value={draft.topic} onChange={(e) => set('topic', e.target.value)}>
              {[...new Set([draft.topic, ...topicsFor(settings, draft.subtest)])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qe-difficulty">
              Kesulitan
            </label>
            <select id="qe-difficulty" className="input" value={draft.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              <option value="mudah">mudah</option>
              <option value="sedang">sedang</option>
              <option value="sulit">sulit</option>
            </select>
          </div>
        </div>
        {draft.passage && (
          <div>
            <label className="label" htmlFor="qe-passage">
              Wacana (berlaku untuk semua soal dalam grupnya)
            </label>
            <textarea id="qe-passage" className="input min-h-40" value={draft.passage.text} onChange={(e) => set('passage', { ...draft.passage!, text: e.target.value })} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="qe-stem">
            Soal (gunakan $...$ untuk rumus)
          </label>
          <textarea id="qe-stem" className="input min-h-28" value={draft.stem} onChange={(e) => set('stem', e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="label">{isGraded(draft.subtest) ? 'Opsi dan skor (1–5)' : 'Opsi (pilih kunci jawaban)'}</div>
          {draft.options.map((o, i) => (
            <div key={o.label} className="flex items-center gap-2">
              {isGraded(draft.subtest) ? (
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="input w-16"
                  aria-label={`Skor opsi ${o.label}`}
                  value={o.score}
                  onChange={(e) => set('options', draft.options.map((x, j) => (j === i ? { ...x, score: Number(e.target.value) } : x)))}
                />
              ) : (
                <input type="radio" name="answer" aria-label={`Kunci jawaban ${o.label}`} checked={draft.answer === o.label} onChange={() => set('answer', o.label as OptionLabel)} />
              )}
              <span className="w-4 font-semibold">{o.label}</span>
              <input
                className="input"
                aria-label={`Teks opsi ${o.label}`}
                value={o.text}
                disabled={!!o.figure}
                onChange={(e) => set('options', draft.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
            </div>
          ))}
        </div>
        {draft.subtest === 'TIU' && (
          <div>
            <label className="label" htmlFor="qe-math">
              Ekspresi hitung (diverifikasi mathjs, opsional)
            </label>
            <input id="qe-math" className="input font-mono" value={draft.mathExpression ?? ''} onChange={(e) => set('mathExpression', e.target.value || undefined)} />
          </div>
        )}
        {draft.subtest === 'TWK' && (
          <div>
            <label className="label" htmlFor="qe-ref">
              Rujukan
            </label>
            <input id="qe-ref" className="input" value={draft.reference ?? ''} onChange={(e) => set('reference', e.target.value || undefined)} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="qe-explanation">
            Pembahasan
          </label>
          <textarea id="qe-explanation" className="input min-h-28" value={draft.explanation} onChange={(e) => set('explanation', e.target.value)} />
        </div>
        {!onSave && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.confidence !== 'low'} onChange={(e) => set('confidence', e.target.checked ? 'high' : 'low')} />
            Saya sudah memeriksa soal ini
          </label>
        )}
        {draft.report && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withdrawReport} onChange={(e) => setWithdrawReport(e.target.checked)} />
            Masalah yang Anda laporkan sudah diperbaiki: cabut laporan
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" onClick={save}>
            Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}
