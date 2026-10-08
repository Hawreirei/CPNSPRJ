import { useState } from 'react';
import { db } from '../db';
import { TOPICS } from '../domain/blueprint';
import { hashText } from '../lib/id';
import { validateQuestion } from '../domain/validators';
import type { Difficulty, OptionLabel, Question } from '../domain/types';
import { Modal } from './ui';

export function QuestionEditor({ q, onClose }: { q: Question; onClose: () => void }) {
  const [draft, setDraft] = useState<Question>(() => structuredClone(q));
  const set = <K extends keyof Question>(k: K, v: Question[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    const options = draft.options.map((o) => ({
      ...o,
      score: draft.subtest === 'TKP' ? Math.max(1, Math.min(5, Math.round(o.score))) : o.label === draft.answer ? 5 : 0,
    }));
    const next = validateQuestion({ ...draft, options, hash: hashText(draft.stem), updatedAt: Date.now() });
    await db.questions.put(next);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Edit soal" wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Topik</label>
            <select className="input" value={draft.topic} onChange={(e) => set('topic', e.target.value)}>
              {[...new Set([draft.topic, ...TOPICS[draft.subtest]])].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Kesulitan</label>
            <select className="input" value={draft.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              <option value="mudah">mudah</option>
              <option value="sedang">sedang</option>
              <option value="sulit">sulit</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Soal (gunakan $...$ untuk rumus)</label>
          <textarea className="input min-h-28" value={draft.stem} onChange={(e) => set('stem', e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="label">{draft.subtest === 'TKP' ? 'Opsi dan skor (1–5)' : 'Opsi (pilih kunci jawaban)'}</label>
          {draft.options.map((o, i) => (
            <div key={o.label} className="flex items-center gap-2">
              {draft.subtest === 'TKP' ? (
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="input w-16"
                  value={o.score}
                  onChange={(e) => set('options', draft.options.map((x, j) => (j === i ? { ...x, score: Number(e.target.value) } : x)))}
                />
              ) : (
                <input type="radio" name="answer" checked={draft.answer === o.label} onChange={() => set('answer', o.label as OptionLabel)} />
              )}
              <span className="w-4 font-semibold">{o.label}</span>
              <input
                className="input"
                value={o.text}
                disabled={!!o.figure}
                onChange={(e) => set('options', draft.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
            </div>
          ))}
        </div>
        {draft.subtest === 'TIU' && (
          <div>
            <label className="label">Ekspresi hitung (diverifikasi mathjs, opsional)</label>
            <input className="input font-mono" value={draft.mathExpression ?? ''} onChange={(e) => set('mathExpression', e.target.value || undefined)} />
          </div>
        )}
        {draft.subtest === 'TWK' && (
          <div>
            <label className="label">Rujukan</label>
            <input className="input" value={draft.reference ?? ''} onChange={(e) => set('reference', e.target.value || undefined)} />
          </div>
        )}
        <div>
          <label className="label">Pembahasan</label>
          <textarea className="input min-h-28" value={draft.explanation} onChange={(e) => set('explanation', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.confidence !== 'low'} onChange={(e) => set('confidence', e.target.checked ? 'high' : 'low')} />
          Saya sudah memeriksa soal ini
        </label>
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
