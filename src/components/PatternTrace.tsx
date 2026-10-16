import { useState } from 'react';
import type { Pic, Question } from '../domain/types';
import { CellView } from './FigureView';

/**
 * "Telusuri pola": each rule of a figural question, step by step (docs/rancangan-figural-v2.md §7).
 * The learner moves through the steps; the "?" opens at its own step, with the answer's picture.
 */
export function PatternTrace({ q }: { q: Question }) {
  const tracks = q.figureMeta?.tracks ?? [];
  const n = Math.max(0, ...tracks.map((t) => t.values.length));
  const [step, setStep] = useState(0);
  if (!tracks.length || n < 2) return null;
  const isGap = (v: string | undefined) => !!v?.startsWith('? = ');
  const gap = tracks[0].values.findIndex(isGap);
  // The picture at this step: a stem cell of a series, or the answer at the "?".
  const series = q.figure?.layout === 'series' && q.figure.cells.length === n;
  const key = q.options.find((o) => o.label === q.answer)?.figure;
  const pic: Pic | null | undefined = series ? (q.figure!.cells[step] ?? (step === gap ? key : undefined)) : step === gap ? key : undefined;
  return (
    <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2 print:hidden dark:border-slate-700">
      <summary className="cursor-pointer text-sm font-semibold">Telusuri pola</summary>
      <p className="muted mt-1 text-xs">Ikuti setiap aturan langkah demi langkah. Tanda tanya terbuka di langkahnya sendiri.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ← Sebelumnya
        </button>
        <span className="text-sm" aria-live="polite">
          Langkah {step + 1} dari {n}
          {step === gap ? ' (tanda tanya)' : ''}
        </span>
        <button className="btn btn-sm" onClick={() => setStep((s) => Math.min(n - 1, s + 1))} disabled={step === n - 1}>
          Berikutnya →
        </button>
      </div>
      {pic && (
        <div className="mt-2">
          <CellView cell={pic} />
        </div>
      )}
      <div className="mt-2 max-w-full overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="pr-3 text-left font-semibold">Aturan</th>
              {Array.from({ length: n }, (_, i) => (
                <th key={i} className={`px-2 text-left font-semibold ${i === step ? 'text-brand-700 dark:text-brand-300' : ''}`}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tracks.map((t) => (
              <tr key={t.label} className="align-top">
                <td className="pr-3 font-medium">{t.label}</td>
                {Array.from({ length: n }, (_, i) => {
                  const v = t.values[i] ?? '';
                  const shown = i <= step;
                  return (
                    <td
                      key={i}
                      className={`px-2 py-0.5 ${i === step ? 'rounded bg-brand-50 dark:bg-slate-800' : ''} ${isGap(v) && shown ? 'font-semibold text-green-700 dark:text-green-400' : ''}`}
                    >
                      {shown ? (isGap(v) ? v.slice(4) : v) : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
