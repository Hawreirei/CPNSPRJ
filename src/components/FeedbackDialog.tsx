import { useState } from 'react';
import { REPORT_REASONS } from '../domain/quality';
import type { Question, ReportReason } from '../domain/types';
import { saveFeedback } from '../engine/feedback';
import { RichText } from './RichText';
import { Modal } from './ui';

const REASONS = Object.entries(REPORT_REASONS) as [ReportReason, string][];

/** Rate a question and/or report a problem with it. Both are optional and can be taken back. */
export function FeedbackDialog({ q, onClose, onSaved }: { q: Question; onClose: () => void; onSaved?: (q: Question) => void }) {
  const [rating, setRating] = useState<number | undefined>(q.rating);
  const [reason, setReason] = useState<ReportReason | ''>(q.report?.reason ?? '');
  const [note, setNote] = useState(q.report?.note ?? '');

  async function save() {
    const unchanged = q.report && q.report.reason === reason && (q.report.note ?? '') === note.trim();
    const saved = await saveFeedback(q.id, { rating, report: reason ? (unchanged ? q.report : { reason, note, at: Date.now() }) : undefined });
    if (saved) onSaved?.(saved);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Nilai atau laporkan soal">
      {/* Keys typed here (a note, arrow keys) must not reach the exam and review shortcuts on the page behind. */}
      <div className="space-y-4" onKeyDown={(e) => e.stopPropagation()}>
        <p className="muted line-clamp-2 text-sm">
          <RichText text={q.stem} />
        </p>
        <fieldset>
          <legend className="label">Nilai soal ini (opsional)</legend>
          <div className="flex flex-wrap items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1 text-sm">
                <input type="radio" name="fb-rating" checked={rating === n} onChange={() => setRating(n)} aria-label={`${n} dari 5`} />
                <span aria-hidden="true" className="text-amber-600 dark:text-amber-400">
                  {'★'.repeat(n)}
                </span>
              </label>
            ))}
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="fb-rating" checked={rating === undefined} onChange={() => setRating(undefined)} />
              Tanpa nilai
            </label>
          </div>
          <p className="muted mt-1 text-xs">Soal bernilai 1–2 dipakai paling akhir saat menyusun set dari Bank Soal.</p>
        </fieldset>
        <fieldset>
          <legend className="label">Ada masalah dengan soal ini?</legend>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="fb-reason" checked={reason === ''} onChange={() => setReason('')} />
              {q.report ? 'Tidak ada lagi (cabut laporan)' : 'Tidak ada masalah'}
            </label>
            {REASONS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="fb-reason" checked={reason === value} onChange={() => setReason(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {reason && (
          <div>
            <label className="label" htmlFor="fb-note">
              Catatan (opsional)
            </label>
            <textarea
              id="fb-note"
              className="input min-h-20"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Misalnya: menurut UUD 1945 Pasal 7, jawabannya C."
            />
            <p className="muted mt-1 text-xs">
              Soal yang dilaporkan ditandai "perlu dicek" dan tidak dipakai saat menyusun set dari Bank Soal. Laporan tetap ada sampai Anda mencabutnya.
            </p>
          </div>
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
